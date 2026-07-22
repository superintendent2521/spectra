use serde::Serialize;
use portable_pty::{native_pty_system, CommandBuilder, MasterPty, PtySize};
use std::{fs, io::{Read, Write}, net::IpAddr, path::PathBuf, sync::Mutex, thread};
use sysinfo::System;
use tauri::{Emitter, State};

#[derive(Serialize)]
struct SystemProfile {
    hostname: String,
    os: String,
    architecture: String,
    cpu_count: usize,
    total_memory_mib: u64,
    used_memory_mib: u64,
}

struct SshSession {
    child: Box<dyn portable_pty::Child + Send + Sync>,
    _master: Box<dyn MasterPty + Send>,
    stdin: Box<dyn Write + Send>,
}

struct SshState(Mutex<Option<SshSession>>);

#[derive(Serialize)]
struct FileEntry { name: String, path: String, is_dir: bool, size: u64 }

#[derive(Serialize)]
struct IpInfo { ip: String, city: String, region: String, country: String, organization: String, timezone: String }

#[tauri::command]
fn system_profile() -> SystemProfile {
    let mut system = System::new_all();
    system.refresh_all();
    SystemProfile {
        hostname: System::host_name().unwrap_or_else(|| "Unknown host".into()),
        os: System::long_os_version().unwrap_or_else(|| std::env::consts::OS.into()),
        architecture: std::env::consts::ARCH.into(),
        cpu_count: system.cpus().len(),
        total_memory_mib: system.total_memory() / 1024 / 1024,
        used_memory_mib: system.used_memory() / 1024 / 1024,
    }
}

#[tauri::command]
fn start_ssh(app: tauri::AppHandle, state: State<'_, SshState>, host: String, port: u16) -> Result<(), String> {
    validate_target(&host)?;
    let mut command = CommandBuilder::new("ssh");
    command.args(["-tt", "-p", &port.to_string(), &host]);
    start_pty_session(app, state, command, "OpenSSH client was not found. Install the Windows OpenSSH Client optional feature.")
}

#[tauri::command]
fn start_local_shell(app: tauri::AppHandle, state: State<'_, SshState>) -> Result<(), String> {
    let home = std::env::var("USERPROFILE").unwrap_or_else(|_| String::from("C:\\"));
    let mut command = CommandBuilder::new("cmd.exe");
    command.args(["/Q", "/K"]);
    command.cwd(home);
    start_pty_session(app, state, command, "Windows Command Prompt could not be started.")
}

#[tauri::command]
fn write_ssh(state: State<'_, SshState>, data: String) -> Result<(), String> {
    let mut state = state.0.lock().map_err(|_| String::from("SSH session state is unavailable."))?;
    let session = state.as_mut().ok_or_else(|| String::from("No active SSH session."))?;
    session.stdin.write_all(data.as_bytes()).and_then(|_| session.stdin.flush())
        .map_err(|_| String::from("SSH session input is unavailable."))?;
    Ok(())
}

#[tauri::command]
fn stop_ssh(state: State<'_, SshState>) -> Result<(), String> {
    let mut state = state.0.lock().map_err(|_| String::from("SSH session state is unavailable."))?;
    if let Some(mut session) = state.take() { let _ = session.child.kill(); }
    Ok(())
}

#[tauri::command]
fn list_directory(path: Option<String>) -> Result<Vec<FileEntry>, String> {
    let directory = path.map(PathBuf::from).unwrap_or_else(|| PathBuf::from(std::env::var("USERPROFILE").unwrap_or_else(|_| String::from("C:\\"))));
    let mut entries = fs::read_dir(&directory).map_err(|_| format!("Cannot read {}", directory.display()))?
        .filter_map(Result::ok)
        .filter_map(|entry| {
            let metadata = entry.metadata().ok()?;
            Some(FileEntry { name: entry.file_name().to_string_lossy().to_string(), path: entry.path().to_string_lossy().to_string(), is_dir: metadata.is_dir(), size: if metadata.is_file() { metadata.len() } else { 0 } })
        }).collect::<Vec<_>>();
    entries.sort_by(|a, b| b.is_dir.cmp(&a.is_dir).then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase())));
    Ok(entries)
}

#[tauri::command]
fn read_text_file(path: String) -> Result<String, String> {
    let metadata = fs::metadata(&path).map_err(|_| String::from("File is unavailable."))?;
    if !metadata.is_file() { return Err(String::from("Select a file, not a directory.")); }
    if metadata.len() > 524_288 { return Err(String::from("Files larger than 512 KB are not opened in the built-in editor.")); }
    fs::read_to_string(path).map_err(|_| String::from("This file is not valid UTF-8 text or cannot be read."))
}

#[tauri::command]
fn write_text_file(path: String, content: String) -> Result<(), String> {
    if content.len() > 524_288 { return Err(String::from("The built-in editor is limited to 512 KB.")); }
    let metadata = fs::metadata(&path).map_err(|_| String::from("File is unavailable."))?;
    if !metadata.is_file() { return Err(String::from("Select a file, not a directory.")); }
    fs::write(path, content).map_err(|_| String::from("Unable to save this file."))
}

#[tauri::command]
fn ip_lookup(ip: String) -> Result<IpInfo, String> {
    let ip: IpAddr = ip.parse().map_err(|_| String::from("Enter a literal IPv4 or IPv6 address."))?;
    let url = format!("https://ipwho.is/{ip}");
    let value: serde_json::Value = reqwest::blocking::Client::builder().timeout(std::time::Duration::from_secs(8)).build()
        .map_err(|_| String::from("Unable to initialize the IP lookup client."))?
        .get(url).send().and_then(|response| response.error_for_status()).map_err(|_| String::from("IP intelligence service did not respond."))?
        .json().map_err(|_| String::from("IP intelligence service returned an invalid response."))?;
    if value["success"].as_bool() != Some(true) { return Err(String::from("IP intelligence service could not resolve that address.")); }
    Ok(IpInfo { ip: value["ip"].as_str().unwrap_or_default().into(), city: value["city"].as_str().unwrap_or("Unknown").into(), region: value["region"].as_str().unwrap_or("Unknown").into(), country: value["country"].as_str().unwrap_or("Unknown").into(), organization: value["connection"]["org"].as_str().unwrap_or("Unknown").into(), timezone: value["timezone"]["id"].as_str().unwrap_or("Unknown").into() })
}

fn forward_ssh_output<R: Read + Send + 'static>(mut stream: R, app: tauri::AppHandle) {
    thread::spawn(move || {
        let mut buffer = [0; 4096];
        while let Ok(read) = stream.read(&mut buffer) {
            if read == 0 { break; }
            let _ = app.emit("ssh-output", String::from_utf8_lossy(&buffer[..read]).to_string());
        }
    });
}

fn start_pty_session(app: tauri::AppHandle, state: State<'_, SshState>, command: CommandBuilder, launch_error: &str) -> Result<(), String> {
    let mut state = state.0.lock().map_err(|_| String::from("Terminal session state is unavailable."))?;
    if let Some(mut existing) = state.take() { let _ = existing.child.kill(); }
    let pty = native_pty_system();
    let pair = pty.openpty(PtySize { rows: 36, cols: 110, pixel_width: 0, pixel_height: 0 })
        .map_err(|_| String::from("A native terminal could not be created."))?;
    let reader = pair.master.try_clone_reader().map_err(|_| String::from("Unable to open terminal output stream."))?;
    let writer = pair.master.take_writer().map_err(|_| String::from("Unable to open terminal input stream."))?;
    let child = pair.slave.spawn_command(command).map_err(|_| String::from(launch_error))?;
    forward_ssh_output(reader, app);
    *state = Some(SshSession { child, _master: pair.master, stdin: writer });
    Ok(())
}

fn validate_target(host: &str) -> Result<(), String> {
    if host.is_empty() || host.len() > 253 || !host.chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '-' | '_' | '@')) {
        return Err("Use a valid host, optionally prefixed with user@.".into());
    }
    Ok(())
}

pub fn run() {
    tauri::Builder::default()
        .manage(SshState(Mutex::new(None)))
        .invoke_handler(tauri::generate_handler![system_profile, start_ssh, start_local_shell, write_ssh, stop_ssh, list_directory, read_text_file, write_text_file, ip_lookup])
        .run(tauri::generate_context!())
        .expect("error while running Spectra");
}

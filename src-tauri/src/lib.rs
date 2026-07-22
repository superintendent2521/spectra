use serde::Serialize;
use std::process::Command;
use sysinfo::System;

#[derive(Serialize)]
struct SystemProfile {
    hostname: String,
    os: String,
    architecture: String,
    cpu_count: usize,
    total_memory_mib: u64,
    used_memory_mib: u64,
}

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
fn open_ssh(host: String, port: u16) -> Result<(), String> {
    validate_target(&host)?;
    #[cfg(target_os = "windows")]
    Command::new("cmd").args(["/C", "start", "", "ssh", "-p", &port.to_string(), &host]).spawn()
        .map_err(|_| String::from("OpenSSH client was not found. Install the Windows OpenSSH Client optional feature."))?;
    #[cfg(not(target_os = "windows"))]
    Command::new("ssh").args(["-p", &port.to_string(), &host]).spawn()
        .map_err(|_| "The OpenSSH client was not found.".into())?;
    Ok(())
}

#[tauri::command]
fn open_putty(host: String, port: u16) -> Result<(), String> {
    validate_target(&host)?;
    Command::new("putty.exe").args(["-ssh", &host, "-P", &port.to_string()]).spawn()
        .map_err(|_| String::from("PuTTY was not found. Install it or use the OpenSSH option."))?;
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
        .invoke_handler(tauri::generate_handler![system_profile, open_ssh, open_putty])
        .run(tauri::generate_context!())
        .expect("error while running Spectra");
}

import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import "./styles.css";

type SystemProfile = {
  hostname: string;
  os: string;
  architecture: string;
  cpu_count: number;
  total_memory_mib: number;
  used_memory_mib: number;
};

type FileEntry = { name: string; path: string; is_dir: boolean; size: number };
type IpInfo = { ip: string; city: string; region: string; country: string; organization: string; timezone: string };

const app = document.querySelector<HTMLDivElement>("#app")!;

app.innerHTML = `
  <main class="console-shell">
    <header class="topbar">
      <div class="wordmark"><span class="hex">S</span><span>SPECTRA</span><small>// TACTICAL SYSTEMS INTERFACE</small></div>
      <div class="top-readout"><span>NODE: <b id="top-node">ACQUIRING</b></span><span>UPLINK: <b id="session-state">STANDBY</b></span><span id="clock">--:--:--</span></div>
    </header>
    <section class="deck">
      <aside class="left-stack">
        <article class="hud-card node-card"><p class="kicker">01 // LOCAL NODE</p><h2 id="hostname">ACQUIRING...</h2><dl id="system-profile"><div><dt>PLATFORM</dt><dd>SCANNING</dd></div></dl><div class="fingerprint">ID // SPECTRA-LOCAL<br/>TRUST // OPERATOR</div></article>
        <article class="hud-card telemetry"><p class="kicker">02 // RESOURCE LOAD</p><div class="radar"><div class="radar-ring r1"></div><div class="radar-ring r2"></div><div class="sweep"></div><strong id="memory-percent">--</strong><span>MEMORY</span></div><div class="loadline"><span id="memory-detail">AWAITING TELEMETRY</span><i><b id="memory-meter"></b></i></div></article>
        <article class="hud-card nav-card"><p class="kicker">03 // NAVIGATION</p><nav><a class="selected" href="#overview">OVERVIEW <b>01</b></a><a href="#systems">SYSTEMS <b>02</b></a><a href="#sessions">SESSIONS <b>03</b></a><a href="#signals">SIGNALS <b>04</b></a></nav></article>
      </aside>
      <section class="main-stack">
        <div class="workspace-tabs"><button class="active" data-workspace="console">01 / CONSOLE</button><button data-workspace="files">02 / FILES</button><button data-workspace="network">03 / IP INTEL</button></div>
        <article class="hud-card command-window workspace active" data-panel="console">
          <div class="window-title"><span class="window-dot"></span> COMMAND CONSOLE <em id="terminal-mode">LOCAL CMD / LIVE</em></div>
          <div class="terminal-copy"><div id="terminal" aria-label="Embedded terminal"></div></div>
          <div class="scope"><div class="scope-grid"></div><div class="scope-line"></div><b>LOCAL<br/>SPACE</b><span class="blip b1"></span><span class="blip b2"></span><span class="blip b3"></span></div>
          <button class="utility-button" id="local-shell-button">RESET LOCAL SHELL</button>
        </article>
        <article class="hud-card workspace file-window" data-panel="files">
          <div class="window-title"><span class="window-dot"></span> FILE EXPLORER <em>LOCAL STORAGE</em></div>
          <div class="file-toolbar"><button id="file-up">UP</button><input id="file-path" aria-label="Directory path" /><button id="file-go">OPEN</button></div>
          <div class="file-columns"><span>NAME</span><span>TYPE</span><span>SIZE</span></div><div id="file-list" class="file-list"></div><div class="editor-title"><span id="editor-path">SELECT A TEXT FILE TO EDIT</span><button id="file-save" disabled>SAVE FILE</button></div><textarea id="file-editor" class="file-editor" spellcheck="false" placeholder="Select a text file from the explorer to open it here." disabled></textarea>
        </article>
        <article class="hud-card workspace intel-window" data-panel="network">
          <div class="window-title"><span class="window-dot"></span> IP INTELLIGENCE <em>PUBLIC DATA LOOKUP</em></div>
          <form id="ip-form" class="ip-form"><input id="ip-input" placeholder="8.8.8.8 or 2606:4700:4700::1111" required /><button>QUERY</button></form>
          <p class="intel-note">Queries ipapi.co only after you submit a literal IP address. Do not use this for tracking people.</p><dl id="ip-result" class="intel-result"><div><dt>STATUS</dt><dd>AWAITING QUERY</dd></div></dl>
        </article>
        <article class="hud-card activity"><div class="window-title"><span class="window-dot"></span> EVENT STREAM <em>LAST 32 EVENTS</em></div><ol id="activity-log"><li><time>NOW</time><span>Awaiting local system profile...</span></li></ol></article>
      </section>
      <aside class="right-stack">
        <article class="hud-card status-card"><p class="kicker">04 // MISSION STATUS</p><div class="mission"><span class="pulse"></span><strong>OPERATIONAL</strong><small>LOCAL DEFENSE POSTURE</small></div><div class="bars"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div></article>
        <article class="hud-card ssh"><p class="kicker">05 // REMOTE ACCESS</p><h2>SSH UPLINK</h2><form id="ssh-form"><label>TARGET<input id="host" placeholder="user@host" required autocomplete="off" /></label><label>PORT<input id="port" type="number" min="1" max="65535" value="22" required /></label><button>CONNECT SESSION <span>></span></button><button type="button" id="disconnect-button">TERMINATE SESSION <span>X</span></button></form><p class="helper">Interactive terminal stays in Spectra. Uses your SSH config and agent; credentials are never retained.</p></article>
        <article class="hud-card spectrum"><p class="kicker">06 // SPECTRUM</p><div class="spectrum-bars"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div><div class="spectrum-label"><span>0.0</span><span>MONITOR</span><span>6.4 GHz</span></div></article>
      </aside>
    </section>
    <footer><span>AUTHORIZED OPERATOR INTERFACE</span><span>NO ACTIVE REMOTE SESSIONS</span><span class="online">SYSTEMS NOMINAL</span></footer>
  </main>`;

const log = (message: string) => {
  const entry = document.createElement("li");
  entry.innerHTML = `<time>${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })}</time><span>${message}</span>`;
  document.querySelector("#activity-log")?.prepend(entry);
};

const terminal = new Terminal({
  cursorBlink: true,
  cursorStyle: "block",
  fontFamily: "DM Mono, Consolas, monospace",
  fontSize: 13,
  lineHeight: 1.35,
  theme: { background: "#041318", foreground: "#b6e9e1", cursor: "#67ffe1", green: "#67ffe1", cyan: "#67ffe1" },
});
const fitAddon = new FitAddon();
terminal.loadAddon(fitAddon);
terminal.open(document.querySelector<HTMLDivElement>("#terminal")!);
fitAddon.fit();
terminal.element?.addEventListener("mousedown", () => terminal.focus());
terminal.focus();
terminal.writeln("\x1b[36m[SPECTRA] Embedded SSH terminal initialized.\x1b[0m");
terminal.writeln("Starting local command shell...\r\n");
new ResizeObserver(() => fitAddon.fit()).observe(document.querySelector(".terminal-copy")!);
terminal.onData((data) => invoke("write_ssh", { data }).catch(() => undefined));
listen<string>("ssh-output", (event) => terminal.write(event.payload));

const showWorkspace = (name: string) => {
  document.querySelectorAll<HTMLElement>("[data-panel]").forEach((panel) => panel.classList.toggle("active", panel.dataset.panel === name));
  document.querySelectorAll<HTMLButtonElement>("[data-workspace]").forEach((button) => button.classList.toggle("active", button.dataset.workspace === name));
  if (name === "console") setTimeout(() => { fitAddon.fit(); terminal.focus(); }, 0);
};
document.querySelectorAll<HTMLButtonElement>("[data-workspace]").forEach((button) => button.addEventListener("click", () => showWorkspace(button.dataset.workspace!)));

async function startLocalShell() {
  try { await invoke("start_local_shell"); document.querySelector("#terminal-mode")!.textContent = "LOCAL CMD / LIVE"; terminal.writeln("\r\n\x1b[36m[SPECTRA] Local CMD session active.\x1b[0m"); terminal.focus(); log("Local command shell started."); }
  catch (error) { log(`Local command shell unavailable: ${String(error)}`); }
}
document.querySelector<HTMLButtonElement>("#local-shell-button")!.addEventListener("click", startLocalShell);

const formatSize = (bytes: number) => bytes === 0 ? "--" : bytes < 1024 ? `${bytes} B` : `${Math.ceil(bytes / 1024)} KB`;
let activeFilePath: string | undefined;
async function openTextFile(path: string) {
  try {
    const content = await invoke<string>("read_text_file", { path });
    activeFilePath = path;
    document.querySelector<HTMLTextAreaElement>("#file-editor")!.value = content;
    document.querySelector<HTMLTextAreaElement>("#file-editor")!.disabled = false;
    document.querySelector<HTMLButtonElement>("#file-save")!.disabled = false;
    document.querySelector("#editor-path")!.textContent = path;
    log(`Opened text file ${path}.`);
  } catch (error) { log(`Editor: ${String(error)}`); }
}
async function loadDirectory(path?: string) {
  try {
    const entries = await invoke<FileEntry[]>("list_directory", { path: path || null });
    const pathInput = document.querySelector<HTMLInputElement>("#file-path")!;
    if (path) pathInput.value = path;
    const list = document.querySelector<HTMLDivElement>("#file-list")!; list.replaceChildren();
    for (const entry of entries) {
      const row = document.createElement("button"); row.className = "file-row";
      const name = document.createElement("span"); name.textContent = `${entry.is_dir ? "[DIR]" : "[FILE]"} ${entry.name}`;
      const kind = document.createElement("span"); kind.textContent = entry.is_dir ? "DIRECTORY" : "FILE";
      const size = document.createElement("span"); size.textContent = formatSize(entry.size);
      row.append(name, kind, size); if (entry.is_dir) row.addEventListener("click", () => loadDirectory(entry.path)); else row.addEventListener("click", () => openTextFile(entry.path)); list.append(row);
    }
  } catch (error) { log(`File explorer: ${String(error)}`); }
}
document.querySelector<HTMLButtonElement>("#file-go")!.addEventListener("click", () => loadDirectory(document.querySelector<HTMLInputElement>("#file-path")!.value));
document.querySelector<HTMLButtonElement>("#file-up")!.addEventListener("click", () => { const current = document.querySelector<HTMLInputElement>("#file-path")!.value; const parent = current.replace(/[\\/][^\\/]+[\\/]?$/, ""); if (parent) loadDirectory(parent); });
document.querySelector<HTMLButtonElement>("#file-save")!.addEventListener("click", async () => {
  if (!activeFilePath) return;
  try { await invoke("write_text_file", { path: activeFilePath, content: document.querySelector<HTMLTextAreaElement>("#file-editor")!.value }); log(`Saved ${activeFilePath}.`); }
  catch (error) { log(`Save failed: ${String(error)}`); }
});

document.querySelector<HTMLFormElement>("#ip-form")!.addEventListener("submit", async (event) => {
  event.preventDefault(); const ip = document.querySelector<HTMLInputElement>("#ip-input")!.value.trim();
  try { const info = await invoke<IpInfo>("ip_lookup", { ip }); const result = document.querySelector<HTMLDListElement>("#ip-result")!; result.replaceChildren(); for (const [label, value] of Object.entries({ "IP ADDRESS": info.ip, "LOCATION": `${info.city}, ${info.region}, ${info.country}`, "NETWORK": info.organization, "TIME ZONE": info.timezone })) { const row = document.createElement("div"), dt = document.createElement("dt"), dd = document.createElement("dd"); dt.textContent = label; dd.textContent = value; row.append(dt, dd); result.append(row); } log(`Public IP intelligence queried for ${ip}.`); }
  catch (error) { log(`IP lookup rejected: ${String(error)}`); }
});

async function loadSystemProfile() {
  try {
    const profile = await invoke<SystemProfile>("system_profile");
    document.querySelector("#hostname")!.textContent = profile.hostname;
    document.querySelector("#top-node")!.textContent = profile.hostname.toUpperCase();
    document.querySelector("#system-profile")!.innerHTML = `<div><dt>Platform</dt><dd>${profile.os} · ${profile.architecture}</dd></div><div><dt>Processors</dt><dd>${profile.cpu_count} logical cores</dd></div>`;
    const percent = Math.round((profile.used_memory_mib / profile.total_memory_mib) * 100);
    document.querySelector("#memory-percent")!.textContent = `${percent}%`;
    (document.querySelector("#memory-meter") as HTMLElement).style.width = `${percent}%`;
    document.querySelector("#memory-detail")!.textContent = `${profile.used_memory_mib.toLocaleString()} / ${profile.total_memory_mib.toLocaleString()} MiB in use`;
    log(`Local profile loaded for ${profile.hostname}.`);
  } catch (error) { log(`Unable to read system profile: ${String(error)}`); }
}

document.querySelector<HTMLFormElement>("#ssh-form")!.addEventListener("submit", async (event) => {
  event.preventDefault();
  const host = (document.querySelector<HTMLInputElement>("#host")!).value.trim();
  const port = Number((document.querySelector<HTMLInputElement>("#port")!).value);
  try {
    await invoke("start_ssh", { host, port });
    showWorkspace("console");
    document.querySelector("#session-state")!.textContent = "ACTIVE";
    document.querySelector("#session-state")!.classList.add("online");
    terminal.writeln(`\r\n\x1b[36m[SPECTRA] Connecting to ${host}:${port}...\x1b[0m`);
    document.querySelector("#terminal-mode")!.textContent = `SSH / ${host.toUpperCase()}`;
    log(`Embedded SSH session requested for ${host}:${port}.`);
  } catch (error) { log(`SSH session refused: ${String(error)}`); }
});

document.querySelector<HTMLButtonElement>("#disconnect-button")!.addEventListener("click", async () => {
  try {
    await invoke("stop_ssh");
    document.querySelector("#session-state")!.textContent = "STANDBY";
    document.querySelector("#session-state")!.classList.remove("online");
    terminal.writeln("\r\n\x1b[33m[SPECTRA] Session terminated.\x1b[0m");
    log("Embedded SSH session terminated.");
  } catch (error) { log(`Unable to terminate session: ${String(error)}`); }
});

loadSystemProfile();
loadDirectory();
startLocalShell();

setInterval(() => { document.querySelector("#clock")!.textContent = new Date().toLocaleTimeString("en-US", { hour12: false }); }, 1000);

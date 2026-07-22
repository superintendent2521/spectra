import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { FitAddon } from "@xterm/addon-fit";
import { ClipboardAddon } from "@xterm/addon-clipboard";
import { SearchAddon } from "@xterm/addon-search";
import { SerializeAddon } from "@xterm/addon-serialize";
import { WebLinksAddon } from "@xterm/addon-web-links";
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
  cpu_usage_percent: number;
  core_usage_percent: number[];
  storage_total_gib: number;
  storage_used_gib: number;
};

type FileEntry = { name: string; path: string; is_dir: boolean; size: number };
type IpInfo = { ip: string; city: string; region: string; country: string; country_code: string; continent: string; postal: string; capital: string; organization: string; isp: string; domain: string; asn: string; timezone: string; latitude: number; longitude: number };
type NetworkTraffic = { received: number; transmitted: number };
type WifiNetwork = { ssid: string; bssid: string; signal: string; radio_type: string; channel: string };
type BluetoothDevice = { name: string; status: string };
type VisibleApp = { name: string; pid: number; memory_mib: number };

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
        <article class="hud-card telemetry"><p class="kicker">02 // RESOURCE LOAD</p><div class="radar" aria-label="Memory usage radar"><div class="radar-ring r1"></div><div class="radar-ring r2"></div><div class="sweep"></div><div id="radar-apps"></div><strong id="memory-percent">--</strong><span>MEMORY</span></div><div class="loadline primary-load"><span id="memory-detail">AWAITING TELEMETRY</span><i><b id="memory-meter"></b></i></div><div class="resource-metrics" aria-label="System resource telemetry"><section class="resource-section cpu-section"><div class="resource-section-head"><span>CPU CORES</span><b id="cpu-detail">AWAITING TELEMETRY</b></div><div id="cpu-core-grid" class="cpu-core-grid" aria-label="Per-core CPU utilization history"></div></section><section class="resource-section"><div class="resource-section-head"><span>STORAGE</span><b id="storage-detail">AWAITING TELEMETRY</b></div><i class="resource-meter"><b id="storage-meter"></b></i></section><section class="resource-section network-section"><div class="resource-section-head"><span>NETWORK I/O</span><b id="network-detail">AWAITING TELEMETRY</b></div><canvas id="network-graph" aria-label="Network upload and download history"></canvas><div class="network-legend"><span class="outbound">OUTBOUND</span><span class="inbound">INBOUND</span><em>60 SEC HISTORY</em></div></section></div><p id="radar-detail" class="radar-detail">SCANNING VISIBLE APPLICATIONS...</p></article>
        <article class="hud-card nav-card"><p class="kicker">03 // NAVIGATION</p><nav><a class="selected" href="#overview">OVERVIEW <b>01</b></a><a href="#systems">SYSTEMS <b>02</b></a><a href="#sessions">SESSIONS <b>03</b></a><a href="#signals">SIGNALS <b>04</b></a></nav></article>
      </aside>
      <section class="main-stack">
        <div class="workspace-tabs"><button class="active" data-workspace="console">F1 / CONSOLE</button><button id="filesystem-mode">F2 / FILES</button><button data-workspace="network">F3 / IP INTEL</button><button data-workspace="radios">F4 / RADIOS</button></div>
        <article class="hud-card command-window workspace active" data-panel="console">
          <div class="window-title"><span class="window-dot"></span> COMMAND CONSOLE <em id="terminal-mode">LOCAL CMD / LIVE</em></div>
          <div class="terminal-tools" aria-label="Terminal tools">
            <button id="terminal-search-toggle" title="Search terminal (Ctrl+F)">FIND</button>
            <div id="terminal-search" class="terminal-search" hidden><input id="terminal-search-input" aria-label="Search terminal" placeholder="SEARCH SCROLLBACK" /><button id="terminal-search-prev" title="Previous match">↑</button><button id="terminal-search-next" title="Next match">↓</button><button id="terminal-search-close" title="Close search">×</button><span id="terminal-search-count"></span></div>
            <span class="terminal-tool-spacer"></span><button id="terminal-copy" title="Copy terminal selection">COPY</button><button id="terminal-paste" title="Paste to active session">PASTE</button><button id="terminal-export" title="Export terminal scrollback">EXPORT</button><button id="terminal-font-down" title="Reduce font size">A−</button><span id="terminal-font-size">13PX</span><button id="terminal-font-up" title="Increase font size">A+</button>
          </div>
          <div class="terminal-copy"><div id="terminal" aria-label="Embedded terminal"></div></div>
          <div class="scope"><div class="scope-grid"></div><div class="scope-line"></div><b>LOCAL<br/>SPACE</b><span class="blip b1"></span><span class="blip b2"></span><span class="blip b3"></span></div>
          <button class="utility-button" id="local-shell-button">RESET LOCAL SHELL</button>
        </article>
        <article class="hud-card workspace intel-window" data-panel="network">
          <div class="window-title"><span class="window-dot"></span> IP INTELLIGENCE <em>PUBLIC DATA LOOKUP</em></div>
          <form id="ip-form" class="ip-form"><input id="ip-input" placeholder="8.8.8.8 or 2606:4700:4700::1111" required /><button>QUERY</button></form>
          <p class="intel-note">Queries ipapi.co only after you submit a literal IP address. Do not use this for tracking people.</p><dl id="ip-result" class="intel-result"><div><dt>STATUS</dt><dd>AWAITING QUERY</dd></div></dl>
        </article>
        <article class="hud-card workspace radio-window" data-panel="radios">
          <div class="window-title"><span class="window-dot"></span> RADIO MONITOR <em>PASSIVE LOCAL TELEMETRY</em></div>
          <div class="radio-actions"><button id="wifi-scan">SCAN WI-FI ENVIRONMENT</button><button id="bluetooth-inventory">REFRESH BLUETOOTH INVENTORY</button></div>
          <p class="intel-note">Displays nearby Wi-Fi advertisements and local Bluetooth inventory. It does not connect, transmit, capture packets, or interfere with devices.</p>
          <section class="radio-section"><h3>WI-FI ENVIRONMENT <span id="wifi-count">0 NETWORKS</span></h3><div class="radio-grid wifi-grid"><span>SSID / BSSID</span><span>SIGNAL</span><span>RADIO</span><span>CHANNEL</span></div><div id="wifi-list" class="radio-list"><p>SELECT SCAN WI-FI ENVIRONMENT TO READ LOCAL RADIO ADVERTISEMENTS.</p></div></section>
          <section class="radio-section"><h3>BLUETOOTH INVENTORY <span id="bluetooth-count">0 DEVICES</span></h3><div id="bluetooth-list" class="radio-list"><p>SELECT REFRESH BLUETOOTH INVENTORY TO READ LOCAL ADAPTER DEVICES.</p></div></section>
        </article>
        <article class="hud-card activity"><div class="window-title"><span class="window-dot"></span> EVENT STREAM <em>LAST 32 EVENTS</em></div><ol id="activity-log"><li><time>NOW</time><span>Awaiting local system profile...</span></li></ol></article>
      </section>
      <aside class="right-stack">
        <article class="hud-card status-card"><p class="kicker">04 // MISSION STATUS</p><div class="mission"><span class="pulse"></span><strong>OPERATIONAL</strong><small>LOCAL DEFENSE POSTURE</small></div><div class="bars"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div></article>
        <article class="hud-card ssh"><p class="kicker">05 // REMOTE ACCESS</p><h2>SSH UPLINK</h2><form id="ssh-form"><label>TARGET<input id="host" placeholder="user@host" required autocomplete="off" /></label><label>PORT<input id="port" type="number" min="1" max="65535" value="22" required /></label><button>CONNECT SESSION <span>></span></button><button type="button" id="disconnect-button">TERMINATE SESSION <span>X</span></button></form><p class="helper">Interactive terminal stays in Spectra. Uses your SSH config and agent; credentials are never retained.</p></article>
        <article class="hud-card world-view"><div class="world-head"><p class="kicker">06 // WORLD VIEW</p><span>GLOBAL NETWORK MAP</span></div><div class="world-location">ENDPOINT LAT/LON <b id="world-coordinates">AWAITING IP LOOKUP</b></div><canvas id="world-globe" aria-label="Network traffic globe"></canvas><div class="world-footer"><span>NETWORK TRAFFIC</span><b id="traffic-readout">UP / DOWN 0 B / 0 B</b></div></article>
      </aside>
    </section>
    <article class="hud-card bottom-dock">
      <div class="window-title"><span class="window-dot"></span> FILESYSTEM / LOCAL STORAGE <em>F2 TO FOCUS</em></div>
      <div class="bottom-file-grid"><div><div class="file-toolbar"><button id="file-up">UP</button><input id="file-path" aria-label="Directory path" /><button id="file-go">OPEN</button></div><div class="file-columns"><span>NAME</span><span>TYPE</span><span>SIZE</span></div><div id="file-list" class="file-list"></div></div><div class="bottom-editor"><div class="editor-title"><span id="editor-path">SELECT A TEXT FILE TO EDIT</span><button id="file-save" disabled>SAVE FILE</button></div><textarea id="file-editor" class="file-editor" spellcheck="false" placeholder="Select a text file from the explorer to open it here." disabled></textarea></div></div>
    </article>
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
  scrollback: 10_000,
});
const fitAddon = new FitAddon();
const searchAddon = new SearchAddon();
const serializeAddon = new SerializeAddon();
terminal.loadAddon(fitAddon);
terminal.loadAddon(new ClipboardAddon());
terminal.loadAddon(searchAddon);
terminal.loadAddon(serializeAddon);
terminal.loadAddon(new WebLinksAddon((_event, uri) => window.open(uri, "_blank", "noopener,noreferrer")));
const scrollbackStorageKey = "spectra.terminal.scrollback.v1";
const savedScrollback = localStorage.getItem(scrollbackStorageKey);
if (savedScrollback) terminal.write(savedScrollback);
terminal.open(document.querySelector<HTMLDivElement>("#terminal")!);
fitAddon.fit();
terminal.element?.addEventListener("mousedown", () => terminal.focus());
terminal.focus();
new ResizeObserver(() => fitAddon.fit()).observe(document.querySelector(".terminal-copy")!);
let persistTimer: number | undefined;
const persistScrollback = () => {
  window.clearTimeout(persistTimer);
  persistTimer = window.setTimeout(() => localStorage.setItem(scrollbackStorageKey, serializeAddon.serialize({ scrollback: 10_000 })), 750);
};
let activeWorldLocation = { latitude: 0, longitude: 0 };
let trafficRate = { received: 0, transmitted: 0 };
let trafficTotals: NetworkTraffic | undefined;
const cpuHistory: number[][] = [];
const networkHistory: Array<{ received: number; transmitted: number }> = [];

const formatTraffic = (bytes: number) => bytes < 1024 ? `${bytes} B/S` : bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB/S` : `${(bytes / 1024 / 1024).toFixed(1)} MB/S`;
const setResourceMeter = (id: string, percent: number) => {
  const meter = document.querySelector<HTMLElement>(`#${id}`);
  if (meter) meter.style.width = `${Math.max(0, Math.min(100, percent))}%`;
};
function updateNetworkResource() {
  const totalRate = trafficRate.received + trafficRate.transmitted;
  document.querySelector("#network-detail")!.textContent = `UP ${formatTraffic(trafficRate.transmitted)} / DOWN ${formatTraffic(trafficRate.received)}`;
  networkHistory.push({ ...trafficRate });
  if (networkHistory.length > 60) networkHistory.shift();
  renderNetworkGraph();
}
function renderNetworkGraph() {
  const canvas = document.querySelector<HTMLCanvasElement>("#network-graph");
  if (!canvas) return;
  const bounds = canvas.getBoundingClientRect(), scale = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.floor(bounds.width * scale)); canvas.height = Math.max(1, Math.floor(bounds.height * scale));
  const ctx = canvas.getContext("2d")!; ctx.scale(scale, scale);
  const { width, height } = bounds; ctx.clearRect(0, 0, width, height);
  ctx.strokeStyle = "rgba(91, 137, 139, .28)"; ctx.lineWidth = 1;
  for (let row = 1; row < 4; row++) { const y = Math.round(height * row / 4) + .5; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke(); }
  for (let column = 1; column < 6; column++) { const x = Math.round(width * column / 6) + .5; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke(); }
  const peak = Math.max(1024, ...networkHistory.flatMap((sample) => [sample.received, sample.transmitted]));
  const draw = (key: "received" | "transmitted", color: string) => {
    if (!networkHistory.length) return;
    ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.beginPath();
    networkHistory.forEach((sample, index) => { const x = networkHistory.length === 1 ? width : index / 59 * width; const y = height - Math.log1p(sample[key]) / Math.log1p(peak) * (height - 5) - 2; if (index) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
    ctx.stroke();
  };
  draw("transmitted", "#d5f1ef"); draw("received", "#6f9b9d");
}
function renderCpuHeatmap(coreUsage: number[]) {
  const grid = document.querySelector<HTMLDivElement>("#cpu-core-grid");
  if (!grid) return;
  if (!cpuHistory.length || cpuHistory.length !== coreUsage.length) {
    cpuHistory.length = 0;
    for (let core = 0; core < coreUsage.length; core++) cpuHistory.push([]);
  }
  coreUsage.forEach((usage, index) => { cpuHistory[index].push(usage); if (cpuHistory[index].length > 32) cpuHistory[index].shift(); });
  grid.replaceChildren();
  for (let core = 0; core < cpuHistory.length; core++) {
    const row = document.createElement("div"); row.className = "cpu-core-row";
    const label = document.createElement("span"); label.textContent = `C${String(core + 1).padStart(2, "0")}`; row.append(label);
    const cells = document.createElement("div"); cells.className = "cpu-core-cells";
    for (const usage of cpuHistory[core]) { const cell = document.createElement("i"); cell.style.setProperty("--level", `${13 + Math.round(Math.min(100, usage) * .72)}%`); cell.title = `Core ${core + 1}: ${usage.toFixed(1)}%`; cells.append(cell); }
    row.append(cells); grid.append(row);
  }
}
function updateWorldView() {
  const canvas = document.querySelector<HTMLCanvasElement>("#world-globe");
  if (!canvas) return;
  const bounds = canvas.getBoundingClientRect(), scale = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.floor(bounds.width * scale)); canvas.height = Math.max(1, Math.floor(bounds.height * scale));
  const ctx = canvas.getContext("2d")!; ctx.scale(scale, scale);
  const width = bounds.width, height = bounds.height, radius = Math.min(width, height) * 0.37, cx = width * 0.5, cy = height * 0.54;
  ctx.clearRect(0, 0, width, height); ctx.strokeStyle = "#236c6b"; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(cx, cy, radius, 0, Math.PI * 2); ctx.stroke();
  const rotation = Date.now() / 13000;
  const project = (latitude: number, longitude: number) => { const lat = latitude * Math.PI / 180, lon = longitude * Math.PI / 180 + rotation, z = Math.cos(lat) * Math.cos(lon); return { x: cx + radius * Math.cos(lat) * Math.sin(lon), y: cy - radius * Math.sin(lat), z }; };
  for (let i = 0; i < 720; i++) { const point = project(((i * 47) % 170) - 85, ((i * 137) % 360) - 180); if (point.z > 0) { ctx.fillStyle = `rgba(117,255,230,${0.18 + point.z * 0.42})`; ctx.fillRect(point.x, point.y, 1.3, 1.3); } }
  const server = project(activeWorldLocation.latitude, activeWorldLocation.longitude);
  if (server.z > 0) { const load = Math.min(1, Math.log10(trafficRate.received + trafficRate.transmitted + 1) / 6), pillar = 15 + load * radius * 0.86, topX = server.x + pillar * 0.23, topY = server.y - pillar; const gradient = ctx.createLinearGradient(server.x, server.y, topX, topY); gradient.addColorStop(0, "#20b9b0"); gradient.addColorStop(1, "#b8fff1"); ctx.strokeStyle = gradient; ctx.lineWidth = 2 + load * 3; ctx.shadowColor = "#66ffe5"; ctx.shadowBlur = 11; ctx.beginPath(); ctx.moveTo(server.x, server.y); ctx.lineTo(topX, topY); ctx.stroke(); ctx.shadowBlur = 0; ctx.fillStyle = "#c7fff4"; ctx.beginPath(); ctx.arc(server.x, server.y, 3.5, 0, Math.PI * 2); ctx.fill(); }
  document.querySelector("#traffic-readout")!.textContent = `UP / DOWN ${formatTraffic(trafficRate.transmitted)} / ${formatTraffic(trafficRate.received)}`;
  updateNetworkResource();
}
setInterval(async () => {
  try { const totals = await invoke<NetworkTraffic>("network_traffic"); if (trafficTotals) trafficRate = { received: Math.max(0, totals.received - trafficTotals.received), transmitted: Math.max(0, totals.transmitted - trafficTotals.transmitted) }; trafficTotals = totals; updateWorldView(); }
  catch { /* telemetry is non-critical */ }
}, 1000);
window.addEventListener("resize", updateWorldView);
window.addEventListener("resize", renderNetworkGraph);
let radarApps: Array<VisibleApp & { angle: number; distance: number }> = [];
function appPosition(app: VisibleApp) {
  const seed = (app.pid * 9301 + 49297) % 233280;
  return { angle: seed % 360, distance: 0.22 + ((seed * 17) % 52) / 100 };
}
function renderRadarApps() {
  const field = document.querySelector<HTMLDivElement>("#radar-apps")!; field.replaceChildren();
  for (const app of radarApps) { const blip = document.createElement("button"); blip.className = "app-blip"; blip.dataset.pid = String(app.pid); const radians = app.angle * Math.PI / 180; blip.style.left = `${50 + Math.cos(radians) * app.distance * 50}%`; blip.style.top = `${50 + Math.sin(radians) * app.distance * 50}%`; blip.title = `${app.name} — ${app.memory_mib} MiB`; blip.addEventListener("mouseenter", () => document.querySelector("#radar-detail")!.textContent = `${app.name.toUpperCase()} / ${app.memory_mib} MiB RAM`); field.append(blip); }
}
async function refreshVisibleApps() {
  try { const apps = await invoke<VisibleApp[]>("visible_apps"); radarApps = apps.map((app) => ({ ...app, ...appPosition(app) })); renderRadarApps(); document.querySelector("#radar-detail")!.textContent = `${apps.length} VISIBLE APPLICATIONS TRACKED`; }
  catch (error) { document.querySelector("#radar-detail")!.textContent = `APPLICATION SCAN UNAVAILABLE: ${String(error)}`; }
}
setInterval(() => {
  const sweepAngle = (Date.now() % 4000) / 4000 * 360;
  for (const app of radarApps) { const delta = Math.abs(((sweepAngle - app.angle + 540) % 360) - 180); const blip = document.querySelector<HTMLElement>(`.app-blip[data-pid="${app.pid}"]`); blip?.classList.toggle("swept", delta < 7); if (delta < 3) document.querySelector("#radar-detail")!.textContent = `${app.name.toUpperCase()} / ${app.memory_mib} MiB RAM`; }
}, 75);
setInterval(refreshVisibleApps, 10_000);
let outboundBytes = 0, inboundBytes = 0;
terminal.onData((data) => { outboundBytes += new TextEncoder().encode(data).byteLength; updateWorldView(); invoke("write_ssh", { data }).catch(() => undefined); });
listen<string>("ssh-output", (event) => { inboundBytes += new TextEncoder().encode(event.payload).byteLength; terminal.write(event.payload); persistScrollback(); updateWorldView(); });
window.addEventListener("beforeunload", () => localStorage.setItem(scrollbackStorageKey, serializeAddon.serialize({ scrollback: 10_000 })));

const searchPanel = document.querySelector<HTMLDivElement>("#terminal-search")!;
const searchInput = document.querySelector<HTMLInputElement>("#terminal-search-input")!;
const searchCount = document.querySelector<HTMLSpanElement>("#terminal-search-count")!;
const showTerminalSearch = () => { searchPanel.hidden = false; searchInput.focus(); searchInput.select(); };
const runTerminalSearch = (forward: boolean) => {
  const term = searchInput.value;
  if (!term) { searchCount.textContent = ""; searchAddon.clearDecorations(); return; }
  (forward ? searchAddon.findNext(term, { decorations: { matchBackground: "#176168", matchBorder: "#6affde", matchOverviewRuler: "#176168", activeMatchBackground: "#4bddcf", activeMatchBorder: "#d2fff7", activeMatchColorOverviewRuler: "#4bddcf" } }) : searchAddon.findPrevious(term));
};
searchAddon.onDidChangeResults(({ resultIndex, resultCount }) => searchCount.textContent = resultCount ? `${resultIndex + 1}/${resultCount}` : "NO MATCH");
document.querySelector("#terminal-search-toggle")!.addEventListener("click", showTerminalSearch);
document.querySelector("#terminal-search-close")!.addEventListener("click", () => { searchPanel.hidden = true; searchAddon.clearDecorations(); terminal.focus(); });
document.querySelector("#terminal-search-next")!.addEventListener("click", () => runTerminalSearch(true));
document.querySelector("#terminal-search-prev")!.addEventListener("click", () => runTerminalSearch(false));
searchInput.addEventListener("input", () => runTerminalSearch(true));
searchInput.addEventListener("keydown", (event) => { if (event.key === "Enter") { event.preventDefault(); runTerminalSearch(!event.shiftKey); } if (event.key === "Escape") (document.querySelector<HTMLButtonElement>("#terminal-search-close")!).click(); });
window.addEventListener("keydown", (event) => { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "f" && document.activeElement !== searchInput) { event.preventDefault(); showTerminalSearch(); } });
window.addEventListener("keydown", (event) => {
  const modes: Record<string, string> = { F1: "console", F3: "network", F4: "radios" };
  if (event.key === "F2" && document.activeElement?.tagName !== "INPUT" && document.activeElement?.tagName !== "TEXTAREA") { event.preventDefault(); showWorkspace("console"); document.querySelector<HTMLInputElement>("#file-path")!.focus(); }
  else if (modes[event.key] && document.activeElement?.tagName !== "INPUT" && document.activeElement?.tagName !== "TEXTAREA") { event.preventDefault(); showWorkspace(modes[event.key]); }
});

document.querySelector(".terminal-copy")!.addEventListener("click", async () => {
  const selected = terminal.getSelection();
  if (!selected) { log("Select terminal text before copying."); return; }
  try { await navigator.clipboard.writeText(selected); log("Terminal selection copied."); } catch { log("Clipboard access was denied."); }
});
document.querySelector("#terminal-paste")!.addEventListener("click", async () => {
  try { const text = await navigator.clipboard.readText(); if (text) await invoke("write_ssh", { data: text.replace(/\r?\n/g, "\r") }); terminal.focus(); log("Clipboard pasted to active terminal session."); } catch { log("Clipboard access was denied."); }
});
document.querySelector("#terminal-export")!.addEventListener("click", () => {
  const output = serializeAddon.serialize({ scrollback: 10_000 });
  const url = URL.createObjectURL(new Blob([output], { type: "text/plain;charset=utf-8" }));
  const link = Object.assign(document.createElement("a"), { href: url, download: `spectra-terminal-${new Date().toISOString().replace(/[:.]/g, "-")}.ansi` }); link.click(); URL.revokeObjectURL(url); log("Terminal scrollback exported.");
});
let terminalFontSize = 13;
const updateTerminalFontSize = () => { terminal.options.fontSize = terminalFontSize; document.querySelector("#terminal-font-size")!.textContent = `${terminalFontSize}PX`; localStorage.setItem("spectra.terminal.font-size", String(terminalFontSize)); fitAddon.fit(); };
terminalFontSize = Math.min(22, Math.max(9, Number(localStorage.getItem("spectra.terminal.font-size")) || terminalFontSize));
document.querySelector("#terminal-font-down")!.addEventListener("click", () => { terminalFontSize = Math.max(9, terminalFontSize - 1); updateTerminalFontSize(); });
document.querySelector("#terminal-font-up")!.addEventListener("click", () => { terminalFontSize = Math.min(22, terminalFontSize + 1); updateTerminalFontSize(); });
updateTerminalFontSize();

const showWorkspace = (name: string) => {
  document.querySelectorAll<HTMLElement>("[data-panel]").forEach((panel) => panel.classList.toggle("active", panel.dataset.panel === name));
  document.querySelectorAll<HTMLButtonElement>("[data-workspace]").forEach((button) => button.classList.toggle("active", button.dataset.workspace === name));
  if (name === "console") setTimeout(() => { fitAddon.fit(); terminal.focus(); }, 0);
};
document.querySelectorAll<HTMLButtonElement>("[data-workspace]").forEach((button) => button.addEventListener("click", () => showWorkspace(button.dataset.workspace!)));
document.querySelector<HTMLButtonElement>("#filesystem-mode")!.addEventListener("click", () => { showWorkspace("console"); document.querySelector<HTMLInputElement>("#file-path")!.focus(); });

let localShellStarted = false;
async function startLocalShell() {
  try {
    await invoke("start_local_shell"); document.querySelector("#terminal-mode")!.textContent = "LOCAL CMD / LIVE";
    terminal.writeln(localShellStarted ? "\r\n\x1b[36m[SPECTRA] LOCAL SESSION RESET\x1b[0m\r\n" : "\x1b[36mSPECTRA LOCAL SESSION\x1b[0m\r\nHOST      LOCAL NODE\r\nSHELL     WINDOWS CMD\r\nPROFILE   DEFAULT\r\nSTATUS    READY\r\n");
    localShellStarted = true; persistScrollback(); terminal.focus(); log("Local command shell started.");
  } catch (error) { log(`Local command shell unavailable: ${String(error)}`); }
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
  try { const info = await invoke<IpInfo>("ip_lookup", { ip }); activeWorldLocation = { latitude: info.latitude, longitude: info.longitude }; document.querySelector("#world-coordinates")!.textContent = `${info.latitude.toFixed(2)}, ${info.longitude.toFixed(2)}`; updateWorldView(); const result = document.querySelector<HTMLDListElement>("#ip-result")!; result.replaceChildren(); for (const [label, value] of Object.entries({ "IP ADDRESS": info.ip, "LOCATION": `${info.city}, ${info.region}, ${info.country} (${info.country_code})`, "CONTINENT": info.continent, "COORDINATES": `${info.latitude.toFixed(4)}, ${info.longitude.toFixed(4)}`, "POSTAL / CAPITAL": `${info.postal} / ${info.capital}`, "ASN": info.asn, "ORGANIZATION": info.organization, "ISP": info.isp, "DOMAIN": info.domain, "TIME ZONE": info.timezone })) { const row = document.createElement("div"), dt = document.createElement("dt"), dd = document.createElement("dd"); dt.textContent = label; dd.textContent = value; row.append(dt, dd); result.append(row); } log(`Public IP intelligence queried for ${ip}.`); }
  catch (error) { log(`IP lookup rejected: ${String(error)}`); }
});

document.querySelector<HTMLButtonElement>("#wifi-scan")!.addEventListener("click", async () => {
  try {
    const networks = await invoke<WifiNetwork[]>("wifi_scan");
    const list = document.querySelector<HTMLDivElement>("#wifi-list")!; list.replaceChildren();
    document.querySelector("#wifi-count")!.textContent = `${networks.length} NETWORKS`;
    for (const network of networks) { const row = document.createElement("div"); row.className = "radio-row wifi-grid"; for (const value of [`${network.ssid}\n${network.bssid}`, network.signal, network.radio_type, network.channel]) { const cell = document.createElement("span"); cell.textContent = value; row.append(cell); } list.append(row); }
    if (!networks.length) list.textContent = "NO WI-FI ADVERTISEMENTS WERE REPORTED BY THE ACTIVE ADAPTER.";
    log(`Wi-Fi environment scan completed: ${networks.length} access points.`);
  } catch (error) { log(`Wi-Fi scan unavailable: ${String(error)}`); }
});

document.querySelector<HTMLButtonElement>("#bluetooth-inventory")!.addEventListener("click", async () => {
  try {
    const devices = await invoke<BluetoothDevice[]>("bluetooth_inventory");
    const list = document.querySelector<HTMLDivElement>("#bluetooth-list")!; list.replaceChildren();
    document.querySelector("#bluetooth-count")!.textContent = `${devices.length} DEVICES`;
    for (const device of devices) { const row = document.createElement("div"), name = document.createElement("span"), status = document.createElement("span"); row.className = "radio-row bluetooth-row"; name.textContent = device.name; status.textContent = device.status; row.append(name, status); list.append(row); }
    if (!devices.length) list.textContent = "NO BLUETOOTH DEVICES WERE REPORTED BY WINDOWS.";
    log(`Bluetooth inventory refreshed: ${devices.length} devices.`);
  } catch (error) { log(`Bluetooth inventory unavailable: ${String(error)}`); }
});

async function loadSystemProfile() {
  try {
    const profile = await invoke<SystemProfile>("system_profile");
    document.querySelector("#hostname")!.textContent = profile.hostname;
    document.querySelector("#top-node")!.textContent = profile.hostname.toUpperCase();
    document.querySelector("#system-profile")!.innerHTML = `<div><dt>Platform</dt><dd>${profile.os} · ${profile.architecture}</dd></div><div><dt>Processors</dt><dd>${profile.cpu_count} logical cores</dd></div>`;
    const percent = Math.round((profile.used_memory_mib / profile.total_memory_mib) * 100);
    document.querySelector("#memory-percent")!.textContent = `${percent}%`;
    setResourceMeter("memory-meter", percent);
    document.querySelector("#memory-detail")!.textContent = `${profile.used_memory_mib.toLocaleString()} / ${profile.total_memory_mib.toLocaleString()} MiB in use`;
    document.querySelector("#cpu-detail")!.textContent = `${profile.cpu_usage_percent.toFixed(1)}% / ${profile.cpu_count} CORES`;
    renderCpuHeatmap(profile.core_usage_percent);
    const storagePercent = profile.storage_total_gib ? profile.storage_used_gib / profile.storage_total_gib * 100 : 0;
    document.querySelector("#storage-detail")!.textContent = `${profile.storage_used_gib.toFixed(1)} / ${profile.storage_total_gib.toFixed(1)} GiB used`;
    setResourceMeter("storage-meter", storagePercent);
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
    persistScrollback();
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
    persistScrollback();
    log("Embedded SSH session terminated.");
  } catch (error) { log(`Unable to terminate session: ${String(error)}`); }
});

loadSystemProfile();
setInterval(loadSystemProfile, 10_000);
loadDirectory();
startLocalShell();
refreshVisibleApps();

setInterval(() => { document.querySelector("#clock")!.textContent = new Date().toLocaleTimeString("en-US", { hour12: false }); }, 1000);

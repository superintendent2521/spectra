import { invoke } from "@tauri-apps/api/core";
import "./styles.css";

type SystemProfile = {
  hostname: string;
  os: string;
  architecture: string;
  cpu_count: number;
  total_memory_mib: number;
  used_memory_mib: number;
};

const app = document.querySelector<HTMLDivElement>("#app")!;

app.innerHTML = `
  <main class="shell">
    <aside class="rail">
      <div class="brand"><span class="brand-mark">S</span><span>SPECTRA</span></div>
      <nav aria-label="Primary navigation">
        <a class="active" href="#overview">Overview</a>
        <a href="#systems">Systems</a>
        <a href="#sessions">SSH Sessions</a>
        <a href="#signals">Signals <small>soon</small></a>
      </nav>
      <p class="rail-note">LOCAL-FIRST<br/>AUTHORIZED USE ONLY</p>
    </aside>
    <section class="content">
      <header><div><p class="eyebrow">OPERATIONS CONSOLE</p><h1>System overview</h1></div><span class="status"><i></i> LOCAL NODE ONLINE</span></header>
      <section class="grid">
        <article class="panel profile"><p class="label">LOCAL SYSTEM</p><h2 id="hostname">Loading node…</h2><dl id="system-profile"></dl></article>
        <article class="panel gauge"><p class="label">MEMORY</p><strong id="memory-percent">—</strong><span>utilization</span><div class="meter"><span id="memory-meter"></span></div><p id="memory-detail">Reading local state…</p></article>
        <article class="panel ssh"><p class="label">QUICK CONNECT</p><h2>Open SSH session</h2><form id="ssh-form"><label>Host<input id="host" placeholder="admin@host.example" required autocomplete="off" /></label><label>Port<input id="port" type="number" min="1" max="65535" value="22" required /></label><button>Launch OpenSSH <span>↗</span></button><button type="button" id="putty-button">Launch PuTTY <span>↗</span></button></form><p class="helper">Uses your existing SSH configuration and agent. Credentials are never stored by Spectra.</p></article>
      </section>
      <section class="panel activity"><div><p class="label">ACTIVITY</p><h2>Session log</h2></div><ol id="activity-log"><li><time>NOW</time><span>Awaiting local system profile…</span></li></ol></section>
    </section>
  </main>`;

const log = (message: string) => {
  const entry = document.createElement("li");
  entry.innerHTML = `<time>${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time><span>${message}</span>`;
  document.querySelector("#activity-log")?.prepend(entry);
};

async function loadSystemProfile() {
  try {
    const profile = await invoke<SystemProfile>("system_profile");
    document.querySelector("#hostname")!.textContent = profile.hostname;
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
  try { await invoke("open_ssh", { host, port }); log(`SSH client launched for ${host}:${port}.`); }
  catch (error) { log(`SSH launch refused: ${String(error)}`); }
});

document.querySelector<HTMLButtonElement>("#putty-button")!.addEventListener("click", async () => {
  const host = (document.querySelector<HTMLInputElement>("#host")!).value.trim();
  const port = Number((document.querySelector<HTMLInputElement>("#port")!).value);
  try { await invoke("open_putty", { host, port }); log(`PuTTY launched for ${host}:${port}.`); }
  catch (error) { log(`PuTTY launch refused: ${String(error)}`); }
});

loadSystemProfile();

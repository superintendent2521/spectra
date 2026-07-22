# Spectra - The best way to larp


Spectra is a local-first desktop operations console for authorized SIGINT-lab and cybersecurity workflows. It is intentionally an administration and observation surface—not an exploitation tool.

## Stack

- **Tauri 2 + Rust**: native desktop shell, system integration, small attack surface.
- **Vanilla TypeScript/CSS** for the first interface iteration; replace with React or Svelte later only if the UI complexity earns it.
- **OpenSSH + embedded xterm.js console** for SSH connectivity. Spectra keeps the session interface in-app while using the user's existing SSH config and agent instead of collecting or persisting passwords/keys.

## Prerequisites (Windows)

Install the current LTS [Node.js](https://nodejs.org/), [Rust](https://www.rust-lang.org/tools/install), and Microsoft C++ Build Tools. Enable the Windows OpenSSH client (Settings > Optional features) for SSH actions.

Then run:

```powershell
npm install
npm run tauri dev
```

## Current foundations

- Cyber-operations inspired dashboard shell
- Safe local system profile (OS, architecture, CPU count, hostname, memory)
- Embedded SSH terminal with validated targets, session input/output, and disconnect controls
- No credential storage, scanning, packet capture, or remote persistence

## Next sensible milestones

1. Add a searchable host inventory with tags, environment grouping, and connection history.
2. Add encrypted OS credential-storage integration for connection metadata only.
3. Add audited, read-only telemetry adapters for equipment you own or are authorized to monitor.

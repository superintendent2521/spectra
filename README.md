# Spectra - The best way to larp


Spectra is a local-first desktop operations console for authorized SIGINT-lab and cybersecurity workflows. It is intentionally an administration and observation surface—not an exploitation tool.

## Stack

- **Tauri 2 + Rust**: native desktop shell, system integration, small attack surface.
- **Vanilla TypeScript/CSS** for the first interface iteration; replace with React or Svelte later only if the UI complexity earns it.
- **OpenSSH** for SSH connectivity at first. It uses the user's existing SSH config and agent instead of collecting or persisting passwords/keys.

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
- SSH target validation and launch via the installed OpenSSH client
- No credential storage, command execution console, scanning, packet capture, or remote persistence

## Next sensible milestones

1. Add a host inventory backed by encrypted OS credential storage.
2. Embed a terminal widget and attach it only to user-approved SSH sessions.
3. Add audited, read-only telemetry adapters for equipment you own or are authorized to monitor.

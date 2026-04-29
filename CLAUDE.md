# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Environment

```
CLAUDE_STREAM_IDLE_TIMEOUT_MS=1800000
```

## Stream Timeout Prevention

1. Do each numbered task ONE AT A TIME. Complete one task fully,
   confirm it worked, then move to the next.
2. Never write a file longer than ~150 lines in a single tool call.
   If a file will be longer, write it in multiple append/edit passes.
3. Start a fresh session if the conversation gets long (20+ tool calls).
   The error gets worse as the session grows.
4. Keep individual grep/search outputs short. Use flags like
   `--include` and `-l` (list files only) to limit output size.
5. If you do hit the timeout, retry the same step in a shorter form.
   Don't repeat the entire task from scratch.

## Commands

```bash
# Development (auto-restart on server.js changes)
npm run dev

# Production
npm start

# Build: compile src/index.html → public/index.html
node build.js

# Quick dev copy (when src/index.html already uses React.createElement)
cp src/index.html public/index.html

# Validate JS syntax after edits
node -e "
const fs = require('fs'), vm = require('vm');
const html = fs.readFileSync('public/index.html', 'utf8');
const m = html.match(/<script>([\s\S]*?)<\/script>/g);
m && m.forEach((s,i) => { try { new vm.Script(s.replace(/<\/?script>/g,'')); } catch(e) { console.error('Block',i,e.message); process.exit(1); } });
console.log('OK');
"

# Docker
docker compose up -d --build
```

## Architecture

```
Browser ──HTTP──▶ Express (server.js) ──SSH──▶ Remote Linux Host
        ◀──WS─── WebSocket             ◀─────  (stdout stream)
```

**`server.js`** — Express + WebSocket server. Handles two WS message types:
- `deploy` — uploads a bash script via SFTP, executes it over SSH with a PTY, streams stdout/stderr back as `stdout`/`stderr`/`done` messages. Handles sudo prompts automatically.
- `import` — SSHes into a host, runs a detection script (`command -v` checks), emits `importResults` with a map of installed packages.

**`src/index.html`** — The entire React 18 frontend in one file. Structure:
- CSS (variables, layout, media queries) in a `<style>` block
- A `<script type="text/babel">` block containing all React components and app logic written as `React.createElement(...)` calls (already pre-compiled from JSX — **do not run build.js on the current source**)
- No external JS dependencies beyond React/ReactDOM UMD loaded from CDN

After editing `src/index.html`, copy it to `public/`:
```bash
cp src/index.html public/index.html
```
Always commit both files together.

## Key Patterns in src/index.html

**State lives in the `App` function** — `sw` (software toggles), `cfg` (bashrc/ssh config), `sec` (security), `infra` (cron/apt/stacks), `distro`, `hostname`, `profiles`, `settings`, etc.

**`generateScript({sw, cfg, sec, infra, custom, hostname, distro, dryRun})`** — produces the bash provisioning script. Simple packages go through the `simplePkgs` object; complex ones (Docker, Git, Neofetch, Wazuh…) have individual `if` blocks.

**`SwItem`** — reusable component for each software row (toggle + optional expandable config). Icon is passed as a React element via the `icon` prop.

**WebSocket flow (frontend)** — `importFromHost(creds)` and the deploy handler both open a fresh `new WebSocket(...)`, send a typed message, and stream results back via `onmessage`.

**CSS theming** — uses CSS custom properties (`--bg`, `--card`, `--teal`, `--bdr`, etc.) toggled by a `.dark`/`.light` class on `<html>`.

**Mobile layout** — controlled entirely by `@media(max-width:900px)` overrides. The header uses `position:absolute` for `.hdr-links` to keep them on row 1 while `.hdr-brand` takes `width:100%`.

**Settings persistence** — stored in `localStorage` via a `settings` state object, serialised on every change with `useEffect`.

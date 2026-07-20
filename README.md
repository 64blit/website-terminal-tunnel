# web-terminal

Windows web terminal: [ttyd](https://github.com/tsl0922/ttyd) serving a persistent
[psmux](https://github.com/psmux/psmux) session, with a custom mobile-friendly client
page. Bound to `127.0.0.1` only; internet access is gated by Cloudflare Access at the
tunnel edge (no app-level password).

## How it works

```
browser ── Cloudflare Access ── cloudflared tunnel ── ttyd :7681 ── psmux session "main"
                                                        │
                                                        └─ serves ttyd-index.html (-I flag)
```

- `start_web_terminal.ps1` — launcher + keep-alive loop for ttyd. Every browser
  connection runs `psmux new-session -A -s main`, so all clients attach to the
  same persistent session (refresh-safe). Strips inherited `CLAUDE*`/`PSMUX*`/`TMUX*`
  env vars so nested launches don't break transcripts or attaching.
- `watchdog_web_terminal.ps1` — run by the `web-terminal-keepalive` scheduled task
  (logon + every 5 min): health-checks ttyd over HTTP, kills it if hung, recreates
  a zombie psmux session, restarts the keep-alive loop if dead.
- `run-launcher-hidden.vbs` / `run-watchdog-hidden.vbs` — wrappers so scheduled
  tasks never flash a console window.

## Mobile client page (`ttyd-index.html`)

Custom ttyd index (served via `ttyd -I`): a self-contained xterm.js client that
speaks ttyd's websocket protocol directly, with a button toolbar fixed at the
bottom of the screen for phone use:

- **psmux row** — prev/next session, session chooser, rename session, command
  prompt, new/prev/next window, copy-scroll mode, font size
- **keys row** — Esc, Tab, sticky Ctrl (tap Ctrl, then any key on the mobile
  keyboard), ^C, ^A, arrows (DECCKM-aware), Enter, clipboard Copy/Paste,
  show-keyboard

Buttons send raw byte sequences (e.g. `\x02(` for prefix + prev-session) down the
terminal websocket — no extra server, no key simulation.

### Rebuilding

Sources live in `ttyd-ui/`:

- `client.js` — websocket protocol + toolbar definitions (edit `ROWS` to change buttons)
- `template.html` — page layout and CSS
- `vendor/` — pinned xterm.js 5.5.0 + fit addon

```powershell
powershell -File ttyd-ui\build.ps1   # regenerates ttyd-index.html
```

ttyd reads the file per-request, so a rebuild is picked up on the next page load
(no restart needed). If `ttyd-index.html` is missing, the launcher falls back to
ttyd's stock page (ttyd exits at startup on a missing `-I` file, so the launcher
only passes the flag when the file exists).

## H: flashdrive (BitLocker To Go)

Claude Code config/credentials live on an encrypted flashdrive (`H:\claude-ttyd`),
never on `C:`. Helper scripts:

- `unlock-h.ps1` / `lock-h.ps1` — day-to-day unlock/lock
- `lock_flashdrive.ps1` — one-time initial encryption setup
- `switch-to-h.ps1` — one-shot migration of the Claude config from C: to H:

`.ttyd_credential`, recovery keys, and logs are gitignored.

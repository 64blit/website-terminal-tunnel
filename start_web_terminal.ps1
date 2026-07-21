# start_web_terminal.ps1 — ttyd (web terminal) -> psmux 'main' persistent PowerShell session.
# Binds ttyd to 127.0.0.1 ONLY. Internet exposure is gated by Cloudflare Access on
# the tunnel hostname (email allowlist) — no app-level password; unauthenticated
# requests are stopped at Cloudflare's edge before they reach ttyd.
# Runs ttyd in a keep-alive loop. Auto-started + auto-recovered by the
# 'web-terminal-keepalive' scheduled task (at logon + every 5 min); the guard
# below makes extra launches exit immediately, so the task can fire freely.
$ErrorActionPreference = 'Stop'

# Guard: if another copy of this script is already running (keep-alive loop
# alive), exit — the 5-minute watchdog task only needs to act when it's dead.
$already = Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" |
    Where-Object { $_.CommandLine -match 'start_web_terminal' -and $_.ProcessId -ne $PID }
if ($already) { exit 0 }

# scoop shims (ttyd.exe, psmux.exe) on PATH regardless of how we're launched.
$env:PATH = "C:\Users\admin\scoop\shims;$env:PATH"

# Claude Code config lives DIRECTLY on the BitLocker USB (H:) - credentials and
# session history stay on the encrypted stick, nothing on C:. If H: is locked or
# unplugged, claude in the web terminal is logged out / has no history until you
# unlock it (run unlock-h from inside this terminal) and restart claude.
# H: must NEVER block the terminal itself: a locked BitLocker volume can pass
# Test-Path yet refuse writes, and with ErrorActionPreference=Stop that would
# kill this launcher before ttyd starts. Swallow any H: error and carry on.
$env:CLAUDE_CONFIG_DIR = 'H:\claude-ttyd'
try {
    if (Test-Path 'H:\') { New-Item -ItemType Directory -Force $env:CLAUDE_CONFIG_DIR -ErrorAction Stop | Out-Null }
} catch {}

# If this script is ever (re)started from INSIDE a Claude session, psmux inherits
# that session's CLAUDE*/CLAUDECODE env vars and every claude launched in a pane
# below thinks it's nested — and silently stops saving transcripts (they vanish
# from /resume; this lost the 2026-07-09 morning sessions). Strip everything
# CLAUDE* except CLAUDE_CONFIG_DIR before psmux/ttyd start.
Get-ChildItem Env: | Where-Object { $_.Name -like 'CLAUDE*' -and $_.Name -ne 'CLAUDE_CONFIG_DIR' } |
    ForEach-Object { Remove-Item "Env:\$($_.Name)" -ErrorAction SilentlyContinue }

# Same problem, different variable: if this script is (re)started from inside a
# psmux pane, ttyd inherits PSMUX_SESSION — then every browser connection's
# 'psmux new-session -A -s main' thinks it's nested and refuses to attach
# ("sessions should be nested with care"), leaving a black screen. Strip all
# psmux/tmux client vars (this happened 2026-07-20).
Get-ChildItem Env: | Where-Object { $_.Name -like 'PSMUX*' -or $_.Name -like 'TMUX*' } |
    ForEach-Object { Remove-Item "Env:\$($_.Name)" -ErrorAction SilentlyContinue }

# Ensure the persistent psmux session exists (detached).
psmux has-session -t main 2>$null
if ($LASTEXITCODE -ne 0) { psmux new-session -d -s main }

# Custom client page (mobile psmux key toolbar), rebuilt from ttyd-ui\ via
# build.ps1. ttyd EXITS at startup if the -I file is missing ("Can not stat
# index.html"), which would turn the keep-alive loop into a busy spin — so only
# pass -I when the file actually exists; otherwise serve ttyd's built-in page.
$indexArgs = @()
if (Test-Path 'C:\Users\admin\web-terminal\ttyd-index.html') {
    $indexArgs = @('-I', 'C:\Users\admin\web-terminal\ttyd-index.html')
}

# Keep-alive: relaunch ttyd if it ever exits. Each browser connection runs
# attach-web.ps1, which attaches to the session that client last used (the
# page sends it via ?arg=, allowed by -a) and falls back to 'main'.
while ($true) {
    ttyd -p 7681 -i 127.0.0.1 -W -a -t fontSize=15 -t cursorBlink=true `
         -t 'disableLeaveAlert=true' -t 'scrollback=20000' `
         @indexArgs `
         powershell -NoProfile -ExecutionPolicy Bypass -File C:\Users\admin\web-terminal\attach-web.ps1
    Start-Sleep -Seconds 2
}

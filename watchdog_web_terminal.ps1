# watchdog_web_terminal.ps1 - run by the 'web-terminal-keepalive' scheduled task
# (at logon + every 5 min). Short-lived: health-checks ttyd and exits.
#
# Handles BOTH failure modes:
#   1. ttyd hung  - process alive but not answering HTTP (seen 2026-07-09 ~5 PM):
#      kill it; the launcher's keep-alive loop relaunches it within 2 s.
#   2. loop dead  - start_web_terminal.ps1 not running (e.g. after reboot):
#      start it hidden.
$ErrorActionPreference = 'Continue'

$healthy = $false
try {
    $r = Invoke-WebRequest -Uri 'http://127.0.0.1:7681' -UseBasicParsing -TimeoutSec 10
    $healthy = ($r.StatusCode -eq 200)
} catch {}

if (-not $healthy) {
    $ttyd = Get-Process ttyd -ErrorAction SilentlyContinue
    if ($ttyd) {
        Add-Content "$PSScriptRoot\watchdog.log" "$(Get-Date -Format s) ttyd unresponsive - killing PID(s) $($ttyd.Id -join ',')"
        $ttyd | Stop-Process -Force
    }
}

# psmux session health: 'main' can survive as a ZOMBIE with zero windows (seen
# 2026-07-16 after the 2:50 AM reboot) - ttyd still answers HTTP 200, but every
# browser attach shows a blank screen with a bare cursor and accepts no input.
# Detect: session exists but has no windows -> kill psmux outright and recreate
# a fresh detached session, so a live shell is always waiting for the browser.
$psmux = 'C:\Users\admin\scoop\shims\psmux.exe'
& $psmux has-session -t main 2>$null
if ($LASTEXITCODE -eq 0) {
    $windows = & $psmux list-windows -t main 2>$null
    if (-not $windows) {
        Add-Content "$PSScriptRoot\watchdog.log" "$(Get-Date -Format s) psmux session 'main' has no windows (zombie) - recreating"
        Get-Process psmux -ErrorAction SilentlyContinue | Stop-Process -Force
        Start-Sleep -Seconds 1
    }
}
& $psmux has-session -t main 2>$null
if ($LASTEXITCODE -ne 0) {
    # Panes inherit env from whoever spawns the psmux server - make sure claude
    # in the recreated session still finds its config on H:.
    $env:CLAUDE_CONFIG_DIR = 'H:\claude-ttyd'
    & $psmux new-session -d -s main
    Add-Content "$PSScriptRoot\watchdog.log" "$(Get-Date -Format s) recreated psmux session 'main'"
}

# Ensure the keep-alive loop itself is running (it relaunches ttyd after a kill
# and after any ttyd exit). If missing (fresh boot, loop crashed), start it.
$loop = Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" |
    Where-Object { $_.CommandLine -match 'start_web_terminal' }
if (-not $loop) {
    Add-Content "$PSScriptRoot\watchdog.log" "$(Get-Date -Format s) keep-alive loop not running - starting it"
    # via VBS so no console window ever flashes at the desktop
    Start-Process wscript.exe -ArgumentList '//B',"`"$PSScriptRoot\run-launcher-hidden.vbs`""
}

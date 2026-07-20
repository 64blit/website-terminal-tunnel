# switch-to-h.ps1 - one-shot: move web-terminal Claude fully onto H: and remove the C: copy.
# Runs detached (scheduled task) because it kills the terminal it was ordered from.
$ErrorActionPreference = 'Continue'
Start-Transcript C:\Users\admin\web-terminal\switchover.log -Force
$env:PATH = "C:\Users\admin\scoop\shims;$env:PATH"

if (-not (Test-Path 'H:\claude-ttyd\.credentials.json')) {
    Write-Host 'H: not unlocked or not populated - ABORTING, nothing touched.'
    Stop-Transcript; return
}

# 1. Stop the stack: keep-alive loop, ttyd, psmux (kills claude running inside).
Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" |
    Where-Object { $_.CommandLine -match 'start_web_terminal' -and $_.ProcessId -ne $PID } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
psmux kill-server 2>$null
Get-Process ttyd, psmux -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Seconds 5

# 2. Final delta sync (catches transcript lines written since the big copy).
robocopy 'C:\Users\admin\web-terminal\.claude-ttyd' 'H:\claude-ttyd' /E /XO /NFL /NDL /NJH /NP

# 3. Remove the redundant C: copy.
Remove-Item 'C:\Users\admin\web-terminal\.claude-ttyd' -Recurse -Force
if (Test-Path 'C:\Users\admin\web-terminal\.claude-ttyd') {
    Write-Host 'WARNING: C: copy not fully removed (locked files?) - delete manually.'
} else {
    Write-Host 'C: copy removed.'
}

# 4. Relaunch the web terminal (start script now points CLAUDE_CONFIG_DIR at H:).
Start-Process powershell -WindowStyle Hidden -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-File','C:\Users\admin\web-terminal\start_web_terminal.ps1'

schtasks /Delete /TN claude-h-switchover /F 2>$null
Stop-Transcript

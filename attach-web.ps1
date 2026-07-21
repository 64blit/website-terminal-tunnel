# attach-web.ps1 — run by ttyd for every browser connection. Attaches to the
# session psmux considers current (the one the last-active client was using —
# psmux keeps that pointer even after the client detaches), so a page refresh
# lands where you left off instead of always in 'main'.
# Optional override: open the page as /?arg=<session> (ttyd -a forwards it here)
# to force a specific session.
param([string]$Session = '')

$env:PATH = "C:\Users\admin\scoop\shims;$env:PATH"

# Session names may contain spaces ('auto scheduler'); anything stranger than
# word chars, dashes and spaces is rejected. Only attach to sessions that are
# actually alive.
function Test-Name([string]$n) { return ($n -match '^[\w\- ]{1,64}$') }
function Test-Alive([string]$n) {
    psmux has-session -t $n 2>$null
    return ($LASTEXITCODE -eq 0)
}

if (-not (Test-Name $Session) -or -not (Test-Alive $Session)) { $Session = '' }

if (-not $Session) {
    $cur = (psmux display-message -p '#S' 2>$null | Out-String).Trim()
    if ((Test-Name $cur) -and (Test-Alive $cur)) { $Session = $cur }
}

if (-not $Session) { $Session = 'main' }

psmux new-session -A -s $Session

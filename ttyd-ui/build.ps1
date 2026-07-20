# build.ps1 — assemble ttyd-index.html from template.html + client.js + vendored xterm.js.
# Output is a single self-contained file served by ttyd via its -I flag (ttyd serves
# ONLY that one file, so everything must be inlined — no external css/js requests).
# Run after editing template.html or client.js:  powershell -File build.ps1
$ErrorActionPreference = 'Stop'
$dir = Split-Path -Parent $MyInvocation.MyCommand.Path

$html = [IO.File]::ReadAllText("$dir\template.html")
# Ordinal .Replace (not -replace) — the minified JS is full of regex metacharacters.
$html = $html.Replace('@@XTERM_CSS@@', [IO.File]::ReadAllText("$dir\vendor\xterm.min.css"))
$html = $html.Replace('@@XTERM_JS@@',  [IO.File]::ReadAllText("$dir\vendor\xterm.min.js"))
$html = $html.Replace('@@FIT_JS@@',    [IO.File]::ReadAllText("$dir\vendor\addon-fit.min.js"))
$html = $html.Replace('@@CLIENT_JS@@', [IO.File]::ReadAllText("$dir\client.js"))

$out = Join-Path (Split-Path -Parent $dir) 'ttyd-index.html'
[IO.File]::WriteAllText($out, $html, (New-Object System.Text.UTF8Encoding($false)))
Write-Host "Built $out ($([math]::Round((Get-Item $out).Length / 1KB)) KB)"

# copybuf.ps1 — bridge psmux's yank buffer to the browser clipboard.
# Win10 ConPTY destroys OSC52 clipboard escapes (it eats the header and spills
# the payload as text), so instead this prints the buffer base64-wrapped in
# plain-text markers; the web client watches the output stream for them,
# decodes, and writes the device clipboard. Invoked by the toolbar's
# 'Copy buf' button in a throwaway psmux window.
$env:PATH = "C:\Users\admin\scoop\shims;$env:PATH"

$t = (psmux show-buffer 2>$null | Out-String)
if (-not $t -or $t.Trim().Length -eq 0) {
    Write-Host "psmux buffer is empty - yank something first (Scroll -> Space -> move -> y)."
    exit 1
}
$t = $t -replace "`r`n", "`n"
if ($t.EndsWith("`n")) { $t = $t.Substring(0, $t.Length - 1) }

$b64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($t))
[Console]::Write("##CB64[" + $b64 + "]CB64##")
Write-Host ""
Write-Host ("Sent " + $t.Length + " chars to the browser clipboard.")

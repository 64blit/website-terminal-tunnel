# unlock-h.ps1 - unlock the BitLocker To Go flashdrive (H:) by password prompt.
# Run from the web terminal (or any PowerShell) after plugging in / rebooting,
# to get access to the SSH key, the isolated Claude login, etc. on H:.
$mp = 'H:'
$b = Get-BitLockerVolume -MountPoint $mp -ErrorAction SilentlyContinue
if (-not $b) { Write-Host "H: not found - is the flashdrive plugged in?" -ForegroundColor Red; return }
if ($b.LockStatus -eq 'Unlocked') { Write-Host "H: is already unlocked." -ForegroundColor Green; return }

$pw = $null
try { $pw = Read-Host -AsSecureString "BitLocker password to unlock H: (Enter to skip)" } catch {}
if ($null -eq $pw) {
    # Secure prompt unavailable (can happen inside the web terminal) - fall back
    # to a plain prompt. The password WILL be visible on screen as you type.
    $plain = Read-Host "Secure prompt unavailable, password will be VISIBLE. BitLocker password for H: (Enter to skip)"
    if (-not $plain) { Write-Host "Skipped - H: stays locked (run unlock-h later)." -ForegroundColor DarkGray; return }
    $pw = ConvertTo-SecureString $plain -AsPlainText -Force
} elseif ($pw.Length -eq 0) {
    Write-Host "Skipped - H: stays locked (run unlock-h later)." -ForegroundColor DarkGray; return
}

try {
    Unlock-BitLocker -MountPoint $mp -Password $pw -ErrorAction Stop | Out-Null
    Write-Host "H: unlocked." -ForegroundColor Green
} catch {
    $msg = $_.Exception.Message
    Write-Host "Unlock failed: $msg" -ForegroundColor Red
    if ($msg -match 'denied|elevat|administrat') {
        Write-Host "Try again in an elevated PowerShell, or:  manage-bde -unlock H: -Password" -ForegroundColor Yellow
    }
}

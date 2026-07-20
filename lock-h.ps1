# lock-h.ps1 - lock the BitLocker To Go flashdrive (H:) without unplugging it.
# Counterpart to unlock-h.ps1. Force-dismounts, so anything with files open on
# H: gets cut off. After locking, H: needs the password again before any access.
$mp = 'H:'
$b = Get-BitLockerVolume -MountPoint $mp -ErrorAction SilentlyContinue
if (-not $b) { Write-Host "H: not found - is the flashdrive plugged in?" -ForegroundColor Red; return }
if ($b.LockStatus -eq 'Locked') { Write-Host "H: is already locked." -ForegroundColor Green; return }

# No Lock-BitLocker cmdlet exists - manage-bde is the real lock path (needs admin).
& manage-bde -lock $mp -ForceDismount
if ($LASTEXITCODE -eq 0) {
    Write-Host "H: locked." -ForegroundColor Green
} else {
    Write-Host "Lock failed (exit $LASTEXITCODE) - run from an elevated PowerShell." -ForegroundColor Red
}

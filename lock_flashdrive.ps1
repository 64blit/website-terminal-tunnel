# lock_flashdrive.ps1 - BitLocker To Go on the H: flashdrive (SLV_64GB).
# ONE-TIME SETUP script: encrypts a not-yet-encrypted drive. Already done for H:.
# For day-to-day locking use lock-h.ps1 / unlock-h.ps1 instead.
# YOU set the password (prompted below); nothing is generated for you.
# A 48-digit RECOVERY key is saved OFF the drive first - keep it safe; it's the
# only way back in if you forget the password.
#
# Run in an ELEVATED PowerShell (the web terminal runs as admin):
#     powershell -ExecutionPolicy Bypass -File C:\Users\admin\web-terminal\lock_flashdrive.ps1
#
# After this, H: is LOCKED on every plug-in until you unlock it with your password:
#     Unlock-BitLocker -MountPoint H: -Password (Read-Host -AsSecureString)
# (This means the portable git / SSH key on H: needs H: unlocked before a push.)

$ErrorActionPreference = 'Stop'
$mp = 'H:'

if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltinRole]::Administrator)) {
    Write-Host "Must run elevated (as Administrator)." -ForegroundColor Red; exit 1
}
$vol = Get-Volume -DriveLetter H -ErrorAction SilentlyContinue
if (-not $vol -or $vol.DriveType -ne 'Removable') { Write-Host "H: is not a removable drive - aborting." -ForegroundColor Red; exit 1 }
$bl = Get-BitLockerVolume -MountPoint $mp
if ($bl.VolumeStatus -ne 'FullyDecrypted') { Write-Host "H: is already (partly) encrypted (status: $($bl.VolumeStatus)). Aborting." -ForegroundColor Yellow; exit 1 }

Write-Host "About to BitLocker-encrypt $mp ($($vol.FileSystemLabel), $([math]::Round($vol.Size/1GB,1)) GB)." -ForegroundColor Cyan
Write-Host "Close anything using H: first (git, explorer windows, editors)." -ForegroundColor Yellow
if ((Read-Host "Type YES to continue") -ne 'YES') { Write-Host "Cancelled."; exit 0 }

# --- YOU set the password (entered twice, never displayed) ---
$p1 = Read-Host -AsSecureString "Set a BitLocker password for H:"
$p2 = Read-Host -AsSecureString "Confirm the password"
$b1 = [Runtime.InteropServices.Marshal]::PtrToStringUni([Runtime.InteropServices.Marshal]::SecureStringToBSTR($p1))
$b2 = [Runtime.InteropServices.Marshal]::PtrToStringUni([Runtime.InteropServices.Marshal]::SecureStringToBSTR($p2))
if ($b1 -ne $b2) { Write-Host "Passwords do not match - aborting." -ForegroundColor Red; exit 1 }
if ($b1.Length -lt 8) { Write-Host "Use at least 8 characters - aborting." -ForegroundColor Red; exit 1 }
$b1 = $b2 = $null

# --- Save a recovery key OFF the drive BEFORE encrypting ---
$recDir = 'C:\Users\admin\web-terminal'
Add-BitLockerKeyProtector -MountPoint $mp -RecoveryPasswordProtector | Out-Null
$rec = (Get-BitLockerVolume -MountPoint $mp).KeyProtector | Where-Object { $_.KeyProtectorType -eq 'RecoveryPassword' } | Select-Object -First 1
$recFile = Join-Path $recDir "H_bitlocker_recovery_$(Get-Date -Format yyyyMMdd_HHmmss).txt"
"$mp BitLocker recovery key (SLV_64GB)`nRecoveryPassword: $($rec.RecoveryPassword)`nProtectorId: $($rec.KeyProtectorId)" | Set-Content -Path $recFile -Encoding ascii
icacls $recFile /inheritance:r /grant:r "$($env:USERNAME):F" | Out-Null
Write-Host "Recovery key saved to: $recFile  (BACK THIS UP somewhere off this machine)" -ForegroundColor Green

# --- Encrypt with YOUR password protector (used-space-only = fast for a mostly-empty drive) ---
Enable-BitLocker -MountPoint $mp -PasswordProtector -Password $p1 -UsedSpaceOnly -SkipHardwareTest | Out-Null
Write-Host "Encryption started. Progress:" -ForegroundColor Cyan
do { Start-Sleep 3; $s = Get-BitLockerVolume -MountPoint $mp; Write-Host ("  {0}%  {1}" -f $s.EncryptionPercentage, $s.VolumeStatus) } while ($s.VolumeStatus -eq 'EncryptionInProgress')
Write-Host "Done. H: is now BitLocker-protected. It will be LOCKED on next plug-in until you unlock it with your password." -ForegroundColor Green

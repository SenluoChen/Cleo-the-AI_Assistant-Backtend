param(
  [string]$InstallerPath = "${PSScriptRoot}\..\release\Cleo Setup 1.0.0.exe",
  [string]$InstalledExePath = "$env:LOCALAPPDATA\Programs\smart-assistant-desktop\Cleo.exe"
)

$ErrorActionPreference = 'Stop'

Write-Host "InstallerPath: $InstallerPath"
Write-Host "InstalledExePath: $InstalledExePath"

if (!(Test-Path -LiteralPath $InstallerPath)) {
  throw "Installer not found: $InstallerPath"
}

if (Test-Path -LiteralPath $InstalledExePath) {
  Write-Host "Starting Cleo to simulate 'app running'..."
  Start-Process -FilePath $InstalledExePath | Out-Null
  Start-Sleep -Seconds 2
} else {
  Write-Host "Installed exe not found; skipping app-start simulation."
}

Write-Host "Running installer (/S) ..."
$p = Start-Process -FilePath $InstallerPath -ArgumentList '/S' -Wait -PassThru
Write-Host "Installer exit code: $($p.ExitCode)"

Start-Sleep -Seconds 1
$cleos = Get-Process -Name 'Cleo' -ErrorAction SilentlyContinue
if ($null -ne $cleos) {
  Write-Host "Cleo processes after installer:"
  $cleos | Select-Object Id,ProcessName | Format-Table -AutoSize | Out-String | Write-Host
} else {
  Write-Host "No Cleo processes after installer."
}

exit 0

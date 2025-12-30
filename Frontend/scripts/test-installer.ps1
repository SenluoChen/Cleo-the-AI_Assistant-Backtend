param(
  [string]$InstallerPath = "",
  [string]$InstalledExePath = "",
  [switch]$SimulateRunningApp = $false,
  [switch]$Silent = $true,
  [string]$LogPath = ""
)

$ErrorActionPreference = 'Stop'

Write-Host "InstallerPath: $InstallerPath"
Write-Host "InstalledExePath: $InstalledExePath"
Write-Host "SimulateRunningApp: $SimulateRunningApp"
Write-Host "Silent: $Silent"

if ([string]::IsNullOrWhiteSpace($LogPath)) {
  $LogPath = Join-Path $env:TEMP "cleo-installer-test.log"
}
Write-Host "LogPath: $LogPath"

# Ensure log directory exists
try {
  $logDir = Split-Path -Parent $LogPath
  if (-not [string]::IsNullOrWhiteSpace($logDir)) {
    New-Item -ItemType Directory -Path $logDir -Force | Out-Null
  }
} catch {
  # ignore
}

function New-LogsDir {
  $repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..\")).Path
  $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
  $dir = Join-Path $repoRoot ("installed-logs\" + $stamp)
  New-Item -ItemType Directory -Path $dir -Force | Out-Null
  return $dir
}

function Copy-IfExists {
  param(
    [string]$Source,
    [string]$Dest
  )
  try {
    if (Test-Path -LiteralPath $Source) {
      Copy-Item -LiteralPath $Source -Destination $Dest -Force -ErrorAction SilentlyContinue
    }
  } catch {
    # ignore
  }
}

function Collect-Logs {
  param(
    [string]$InstalledExePath,
    [string]$LogsDir
  )

  if ([string]::IsNullOrWhiteSpace($LogsDir)) { return }

  # Script log
  Copy-IfExists -Source $LogPath -Dest (Join-Path $LogsDir "test-installer.log")

  # Chromium/Electron log (if started with --enable-logging)
  if (-not [string]::IsNullOrWhiteSpace($InstalledExePath) -and (Test-Path -LiteralPath $InstalledExePath)) {
    $installDir = Split-Path -Parent $InstalledExePath
    Copy-IfExists -Source (Join-Path $installDir "chrome_debug.log") -Dest (Join-Path $LogsDir "chrome_debug.log")
  }

  # userData dir listing (helps locate crash dumps)
  try {
    $userData = Join-Path $env:LOCALAPPDATA "SmartAssistantDesktop"
    if (Test-Path -LiteralPath $userData) {
      "userData=$userData" | Out-File -LiteralPath (Join-Path $LogsDir "userdata-path.txt") -Encoding UTF8
      Get-ChildItem -LiteralPath $userData -Force -ErrorAction SilentlyContinue |
        Select-Object Name,Mode,Length,LastWriteTime |
        Format-Table -AutoSize | Out-String |
        Out-File -LiteralPath (Join-Path $LogsDir "userdata-dir.txt") -Encoding UTF8
    }
  } catch {
    # ignore
  }

  # Port diagnostic
  try {
    $listen = Get-NetTCPConnection -LocalPort 8787 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($null -ne $listen) {
      ("LISTEN pid=" + $listen.OwningProcess) | Out-File -LiteralPath (Join-Path $LogsDir "port-8787.txt") -Encoding UTF8
    } else {
      "LISTEN none" | Out-File -LiteralPath (Join-Path $LogsDir "port-8787.txt") -Encoding UTF8
    }
  } catch {
    # ignore
  }
}

function Test-IsAdmin {
  $currentIdentity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = New-Object Security.Principal.WindowsPrincipal($currentIdentity)
  return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Resolve-LatestInstallerPath {
  $releaseDir = Join-Path $PSScriptRoot "..\release"
  if (!(Test-Path -LiteralPath $releaseDir)) {
    throw "Release directory not found: $releaseDir"
  }

  $candidates = Get-ChildItem -LiteralPath $releaseDir -Filter "*.exe" -File -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -match '^Cleo Setup .*\.exe$' } |
    Sort-Object LastWriteTime -Descending

  if ($null -eq $candidates -or $candidates.Count -eq 0) {
    throw "No installer found in: $releaseDir (expected 'Cleo Setup *.exe')"
  }

  return $candidates[0].FullName
}

function Resolve-InstalledExePath {
  $known = @(
    (Join-Path $env:LOCALAPPDATA "Programs\Cleo\Cleo.exe"),
    (Join-Path $env:LOCALAPPDATA "Programs\smart-assistant-desktop\Cleo.exe")
  )

  foreach ($p in $known) {
    if (Test-Path -LiteralPath $p) { return $p }
  }

  $root = Join-Path $env:LOCALAPPDATA "Programs"
  if (Test-Path -LiteralPath $root) {
    $found = Get-ChildItem -LiteralPath $root -Filter "Cleo.exe" -Recurse -File -ErrorAction SilentlyContinue |
      Sort-Object FullName |
      Select-Object -First 1
    if ($null -ne $found) { return $found.FullName }
  }

  return ""
}

if ([string]::IsNullOrWhiteSpace($InstallerPath)) {
  $InstallerPath = Resolve-LatestInstallerPath
}

if ([string]::IsNullOrWhiteSpace($InstalledExePath)) {
  $InstalledExePath = Resolve-InstalledExePath
}

Write-Host "Resolved InstallerPath: $InstallerPath"
Write-Host "Resolved InstalledExePath: $InstalledExePath"

function Wait-ForHealth {
  param(
    [string]$Url = "http://127.0.0.1:8787/health",
    [int]$TimeoutSeconds = 20
  )

  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    try {
      $resp = Invoke-RestMethod -Uri $Url -Method Get -TimeoutSec 3
      if ($null -ne $resp -and $resp.ok -eq $true) {
        return $true
      }
    } catch {
      # ignore until timeout
    }
    Start-Sleep -Milliseconds 500
  }
  return $false
}

if (!(Test-Path -LiteralPath $InstallerPath)) {
  throw "Installer not found: $InstallerPath"
}

$isAdmin = Test-IsAdmin
Write-Host ("IsAdmin: " + $isAdmin)

"=== Cleo installer test (elevated) ===" | Out-File -LiteralPath $LogPath -Encoding UTF8
"IsAdmin: $isAdmin" | Out-File -LiteralPath $LogPath -Append -Encoding UTF8
"InstallerPath: $InstallerPath" | Out-File -LiteralPath $LogPath -Append -Encoding UTF8
"InstalledExePath (pre): $InstalledExePath" | Out-File -LiteralPath $LogPath -Append -Encoding UTF8
"SimulateRunningApp: $SimulateRunningApp" | Out-File -LiteralPath $LogPath -Append -Encoding UTF8
"Silent: $Silent" | Out-File -LiteralPath $LogPath -Append -Encoding UTF8

$logsDir = New-LogsDir
"LogsDir: $logsDir" | Out-File -LiteralPath $LogPath -Append -Encoding UTF8

if ($SimulateRunningApp) {
  if (-not [string]::IsNullOrWhiteSpace($InstalledExePath) -and (Test-Path -LiteralPath $InstalledExePath)) {
    Write-Host "Starting Cleo to simulate 'app running'..."
    "Starting Cleo to simulate 'app running'..." | Out-File -LiteralPath $LogPath -Append -Encoding UTF8
    Start-Process -FilePath $InstalledExePath | Out-Null
    Start-Sleep -Seconds 2
  } else {
    Write-Host "Installed exe not found; skipping app-start simulation."
    "Installed exe not found; skipping app-start simulation." | Out-File -LiteralPath $LogPath -Append -Encoding UTF8
  }
}

if ($Silent) {
  Write-Host "Running installer (/S) ..."
  "Running installer (/S) ..." | Out-File -LiteralPath $LogPath -Append -Encoding UTF8
  $p = Start-Process -FilePath $InstallerPath -ArgumentList '/S' -Wait -PassThru
} else {
  Write-Host "Running installer (interactive UI) ..."
  "Running installer (interactive UI) ..." | Out-File -LiteralPath $LogPath -Append -Encoding UTF8
  $p = Start-Process -FilePath $InstallerPath -Wait -PassThru
}
Write-Host "Installer exit code: $($p.ExitCode)"
"Installer exit code: $($p.ExitCode)" | Out-File -LiteralPath $LogPath -Append -Encoding UTF8

if ($p.ExitCode -ne 0) {
  throw "Installer failed with exit code: $($p.ExitCode)"
}

# After install, resolve installed path again in case it changed.
$InstalledExePath = Resolve-InstalledExePath
Write-Host "Post-install InstalledExePath: $InstalledExePath"
"Post-install InstalledExePath: $InstalledExePath" | Out-File -LiteralPath $LogPath -Append -Encoding UTF8

Start-Sleep -Seconds 1
$cleos = Get-Process -Name 'Cleo' -ErrorAction SilentlyContinue
if ($null -ne $cleos) {
  Write-Host "Cleo processes after installer:"
  $cleos | Select-Object Id,ProcessName | Format-Table -AutoSize | Out-String | Write-Host
  ($cleos | Select-Object Id,ProcessName | Format-Table -AutoSize | Out-String) | Out-File -LiteralPath $LogPath -Append -Encoding UTF8
} else {
  Write-Host "No Cleo processes after installer."
  "No Cleo processes after installer." | Out-File -LiteralPath $LogPath -Append -Encoding UTF8
}

if (-not [string]::IsNullOrWhiteSpace($InstalledExePath) -and (Test-Path -LiteralPath $InstalledExePath)) {
  Write-Host "Launching Cleo to validate backend health..."
  "Launching Cleo to validate backend health..." | Out-File -LiteralPath $LogPath -Append -Encoding UTF8
  $installDir = Split-Path -Parent $InstalledExePath
  Start-Process -FilePath $InstalledExePath -WorkingDirectory $installDir -ArgumentList @('--enable-logging','--v=1') | Out-Null
} else {
  "Installed Cleo.exe not found after install; cannot validate runtime health." | Out-File -LiteralPath $LogPath -Append -Encoding UTF8
  Collect-Logs -InstalledExePath $InstalledExePath -LogsDir $logsDir
  throw "Installed Cleo.exe not found after install; cannot validate runtime health."
}

Write-Host "Waiting for backend /health ..."
"Waiting for backend /health ..." | Out-File -LiteralPath $LogPath -Append -Encoding UTF8
if (Wait-ForHealth) {
  Write-Host "HEALTH_OK: http://127.0.0.1:8787/health"
  "HEALTH_OK: http://127.0.0.1:8787/health" | Out-File -LiteralPath $LogPath -Append -Encoding UTF8
  Collect-Logs -InstalledExePath $InstalledExePath -LogsDir $logsDir
} else {
  "HEALTH_FAILED: http://127.0.0.1:8787/health" | Out-File -LiteralPath $LogPath -Append -Encoding UTF8
  Collect-Logs -InstalledExePath $InstalledExePath -LogsDir $logsDir
  throw "HEALTH_FAILED: http://127.0.0.1:8787/health did not return ok=true within timeout"
}

exit 0

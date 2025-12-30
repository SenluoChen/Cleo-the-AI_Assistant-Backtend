$ErrorActionPreference = 'SilentlyContinue'

$health = $null
$status = $null

try {
  $health = (Invoke-WebRequest -UseBasicParsing http://127.0.0.1:8787/health).Content
} catch {
  $health = $null
}

try {
  $status = (Invoke-WebRequest -UseBasicParsing http://localhost:5173/).StatusCode
} catch {
  $status = $null
}

$healthText = if ($null -ne $health -and $health.Length -gt 0) { $health } else { 'fail' }
$statusText = if ($null -ne $status) { $status } else { 'fail' }

Write-Output ("health=" + $healthText)
Write-Output ("viteStatus=" + $statusText)

if ($healthText -ne 'fail' -and $status -eq 200) {
  exit 0
}

exit 1

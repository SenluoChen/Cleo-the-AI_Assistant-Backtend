Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

Set-Location 'C:\Users\Louis\Visual Studio\smart-assistant Backend\Frontend'

Write-Host 'Running tsc (tsconfig.node.json)...'
$log = Join-Path (Get-Location) 'tsc.log'
Remove-Item -Force -ErrorAction SilentlyContinue $log

# Compile main-process TypeScript -> Frontend/dist
node node_modules\typescript\bin\tsc -p tsconfig.node.json --pretty false --listEmittedFiles 2>&1 | Tee-Object -FilePath $log

Write-Host ('tsc exit code=' + $LASTEXITCODE)
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

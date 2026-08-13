$env:PORT = '4520'
$env:NODE_ENV = 'development'
$env:DEMO = 'true'
$env:PERSISTENCE_DRIVER = 'json'
$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..\..\..')
$env:DATA_FILE = Join-Path $PSScriptRoot 'demo-data.json'
$env:APP_ORIGIN = 'http://localhost:5180'
Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue
Remove-Item Env:LAZY_GLOBAL_STATE -ErrorAction SilentlyContinue
Set-Location (Join-Path $repoRoot 'v1')
node server/index.js

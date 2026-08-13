$env:VITE_API_TARGET = 'http://localhost:4520'
$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..\..\..')
Set-Location (Join-Path $repoRoot 'v1')
npx vite client --port 5180 --host 127.0.0.1

param([switch]$NoBrowser)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $projectRoot
$node = (Get-Command node -ErrorAction Stop).Source
if (-not (Test-Path -LiteralPath (Join-Path $projectRoot 'dist/index.html'))) {
  throw '请先在项目目录运行 npm install 和 npm run build。'
}
$port = 4317
$url = "http://127.0.0.1:$port"
try { $health = Invoke-RestMethod "$url/api/health" -TimeoutSec 2 } catch { $health = $null }
if ($health -and $health.app -ne 'personal-ai-planner') { throw '端口被其他应用占用。' }
if (-not $health) {
  $appDir = Join-Path $env:LOCALAPPDATA 'PersonalAIPlanner'
  New-Item -ItemType Directory -Path $appDir -Force | Out-Null
  Start-Process -FilePath $node -ArgumentList @('--import','tsx','server/index.ts') -WorkingDirectory $projectRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $appDir 'server.log') -RedirectStandardError (Join-Path $appDir 'server-error.log')
  for ($attempt=0; $attempt -lt 30; $attempt++) {
    Start-Sleep -Milliseconds 300
    try { $health = Invoke-RestMethod "$url/api/health" -TimeoutSec 1; if($health.app -eq 'personal-ai-planner') {break} } catch {}
  }
  if (-not $health) { throw "启动失败，请查看 $appDir/server-error.log" }
}
if (-not $NoBrowser) { Start-Process $url }

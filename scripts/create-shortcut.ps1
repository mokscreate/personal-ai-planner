$ErrorActionPreference = 'Stop'
$launcher = Join-Path $PSScriptRoot 'start.ps1'
$shell = New-Object -ComObject WScript.Shell
$desktop = [Environment]::GetFolderPath('Desktop')
$shortcut = $shell.CreateShortcut((Join-Path $desktop '间序 - AI日程.lnk'))
$shortcut.TargetPath = (Get-Command powershell.exe).Source
$shortcut.Arguments = '-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "' + $launcher + '"'
$shortcut.WorkingDirectory = Split-Path -Parent $PSScriptRoot
$shortcut.Description = '打开本地AI日程工作台'
$shortcut.WindowStyle = 7
$shortcut.Save()
Write-Output (Join-Path $desktop '间序 - AI日程.lnk')

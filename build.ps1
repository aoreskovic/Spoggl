$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot

Write-Host "Building index.html..." -ForegroundColor Cyan
node "$root\spoggl\build.js"

$zipPath = "$root\spoggl.zip"
if (Test-Path $zipPath) { Remove-Item $zipPath -Force }

Add-Type -AssemblyName System.IO.Compression.FileSystem
[System.IO.Compression.ZipFile]::CreateFromDirectory("$root\spoggl", $zipPath)

$size = [math]::Round((Get-Item $zipPath).Length / 1KB, 1)
Write-Host "Zipped → spoggl.zip ($size KB)" -ForegroundColor Green

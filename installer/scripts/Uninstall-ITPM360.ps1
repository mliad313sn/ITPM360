<#
.SYNOPSIS
  Removes ITPM360 services and files. Does NOT uninstall Node.js or PostgreSQL,
  and does NOT drop the database (your data is preserved). Pass -DropDatabase
  and -DbPassword to also remove the database.
#>
[CmdletBinding()]
param(
  [string]$InstallDir = "$env:ProgramFiles\ITPM360",
  [switch]$DropDatabase,
  [string]$DbPassword = $env:ITPM_DB_PASSWORD,
  [int]$DbPort = 5432
)
$ErrorActionPreference = 'SilentlyContinue'
Write-Host "Stopping and removing ITPM360 services…" -ForegroundColor Cyan
$nssm = Join-Path $InstallDir 'nssm\nssm.exe'
foreach ($svc in 'ITPM360-Web', 'ITPM360-API') {
  if (Test-Path $nssm) { & $nssm stop $svc; & $nssm remove $svc confirm }
  else { sc.exe stop $svc | Out-Null; sc.exe delete $svc | Out-Null }
}
Remove-NetFirewallRule -DisplayName 'ITPM360 Web' -ErrorAction SilentlyContinue
Remove-NetFirewallRule -DisplayName 'ITPM360 API' -ErrorAction SilentlyContinue

if ($DropDatabase -and $DbPassword) {
  Write-Host "Dropping the itpm360 database…" -ForegroundColor Yellow
  $env:PGPASSWORD = $DbPassword
  $psql = Get-ChildItem 'C:\Program Files\PostgreSQL\*\bin\dropdb.exe' | Select-Object -First 1
  if ($psql) { & $psql.FullName -U postgres -h localhost -p $DbPort itpm360 }
  $env:PGPASSWORD = $null
}

Write-Host "Removing files at $InstallDir…" -ForegroundColor Cyan
Remove-Item -Recurse -Force $InstallDir -ErrorAction SilentlyContinue
Write-Host "ITPM360 uninstalled." -ForegroundColor Green

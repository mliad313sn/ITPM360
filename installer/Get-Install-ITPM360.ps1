<#
.SYNOPSIS
  Download-and-install ITPM360 into a dedicated folder on this Windows machine.
  Clones the repository, then runs the full in-place install (Node.js +
  PostgreSQL + database + build + auto-starting services).

.EXAMPLE
  # Elevated PowerShell:
  .\Get-Install-ITPM360.ps1 -DbPassword 'your-postgres-password'

.NOTES
  Run in an ELEVATED (Administrator) PowerShell. First run downloads runtimes
  and dependencies, so it takes several minutes. Requires internet access.
#>
[CmdletBinding()]
param(
  [string]$TargetDir = 'C:\Users\Mohamed\Dev_Environment\Projects',
  [string]$RepoUrl   = 'https://github.com/mliad313sn/itpm360.git',
  [string]$Branch    = 'claude/multi-country-it-project-app-icc119',
  [string]$DbPassword = $env:ITPM_DB_PASSWORD,
  [int]$ApiPort = 4000,
  [int]$WebPort = 8080
)
$ErrorActionPreference = 'Stop'

function Info($m){ Write-Host "==> $m" -ForegroundColor Cyan }
function Ok($m){   Write-Host "  OK $m" -ForegroundColor Green }

# --- elevation check -------------------------------------------------------
$admin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()
         ).IsInRole([Security.Principal.WindowsBuiltinRole]::Administrator)
if (-not $admin) { throw "Please run this script from an elevated (Administrator) PowerShell." }

# --- password --------------------------------------------------------------
if (-not $DbPassword) {
  $sec = Read-Host -AsSecureString "Enter the PostgreSQL superuser password to use"
  $DbPassword = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
    [Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec))
}
if (-not $DbPassword) { throw "A PostgreSQL password is required." }

# --- git -------------------------------------------------------------------
Info "Checking Git…"
if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
  Info "Installing Git via winget…"
  winget install -e --id Git.Git --accept-source-agreements --accept-package-agreements --silent
  $env:Path = [Environment]::GetEnvironmentVariable('Path','Machine') + ';' +
              [Environment]::GetEnvironmentVariable('Path','User')
}
if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
  throw "Git is required. Install Git for Windows (https://git-scm.com/download/win) and re-run."
}
Ok "Git present"

# --- create the target folder & clone --------------------------------------
Info "Preparing $TargetDir …"
New-Item -ItemType Directory -Force -Path $TargetDir | Out-Null
$Repo = Join-Path $TargetDir 'ITPM360'

if (Test-Path (Join-Path $Repo '.git')) {
  Info "Repository already present — updating…"
  git -C $Repo fetch origin $Branch
  git -C $Repo checkout $Branch
  git -C $Repo pull --ff-only origin $Branch
} else {
  Info "Cloning $RepoUrl (branch $Branch)…"
  git clone --branch $Branch --single-branch $RepoUrl $Repo
}
Ok "Repository ready at $Repo"

# --- run the in-place installer --------------------------------------------
Info "Running the ITPM360 installer (Node.js, PostgreSQL, build, services)…"
$env:ITPM_DB_PASSWORD = $DbPassword
& powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $Repo 'installer\scripts\Install-ITPM360.ps1') `
    -InPlace -AppSource $Repo -InstallDir $Repo -DbPassword $DbPassword -ApiPort $ApiPort -WebPort $WebPort
$env:ITPM_DB_PASSWORD = $null

Write-Host ""
Ok "ITPM360 installed at $Repo"
Ok "Open http://localhost:$WebPort  (admin@itpm360.dev / Password123! — change it)"

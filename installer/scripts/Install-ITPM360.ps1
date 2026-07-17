<#
.SYNOPSIS
  ITPM360 turnkey installer. Installs Node.js and PostgreSQL if missing,
  provisions the database, configures the app, builds it, and registers two
  auto-starting Windows services (API + web).

.NOTES
  Run elevated (the NSIS wrapper requests admin). Idempotent: re-running skips
  work that is already done. All actions are logged to <InstallDir>\install.log.
#>
[CmdletBinding()]
param(
  [string]$InstallDir  = "$env:ProgramFiles\ITPM360",
  [string]$AppSource   = $PSScriptRoot,          # where app files were extracted (…\app)
  [string]$DbPassword  = $env:ITPM_DB_PASSWORD,  # PostgreSQL superuser password
  [int]$DbPort         = 5432,
  [int]$ApiPort        = 4000,
  [int]$WebPort        = 3000,
  [switch]$NoServices,                            # skip Windows service registration
  [switch]$NoSeed                                 # skip demo data
)

$ErrorActionPreference = 'Stop'
$ProgressPreference    = 'SilentlyContinue'       # faster Invoke-WebRequest downloads

# --- logging ---------------------------------------------------------------
$null = New-Item -ItemType Directory -Force -Path $InstallDir
$LogFile = Join-Path $InstallDir 'install.log'
function Log($msg, $level = 'INFO') {
  $line = "{0}  [{1}]  {2}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $level, $msg
  Add-Content -Path $LogFile -Value $line
  $color = @{ INFO = 'Gray'; STEP = 'Cyan'; OK = 'Green'; WARN = 'Yellow'; ERROR = 'Red' }[$level]
  Write-Host $line -ForegroundColor $color
}
function Fail($msg) { Log $msg 'ERROR'; throw $msg }

Log "==== ITPM360 installation started ====" 'STEP'
Log "InstallDir=$InstallDir  DbPort=$DbPort  ApiPort=$ApiPort  WebPort=$WebPort"

if (-not $DbPassword) {
  $sec = Read-Host -AsSecureString "Enter the PostgreSQL superuser password to use"
  $DbPassword = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
    [Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec))
}
if (-not $DbPassword) { Fail "A PostgreSQL password is required." }

# --- helpers ---------------------------------------------------------------
function Have($cmd) { [bool](Get-Command $cmd -ErrorAction SilentlyContinue) }
function Refresh-Path {
  $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' +
              [Environment]::GetEnvironmentVariable('Path', 'User')
}
function Download($url, $dest) {
  Log "Downloading $url"
  Invoke-WebRequest -Uri $url -OutFile $dest -UseBasicParsing
}
function Winget-Install($id) {
  if (-not (Have 'winget')) { return $false }
  Log "winget install $id"
  & winget install -e --id $id --accept-source-agreements --accept-package-agreements --silent 2>&1 | Out-Null
  return ($LASTEXITCODE -eq 0)
}

# ===========================================================================
# 1. Node.js  (>= 20)
# ===========================================================================
Log "Checking Node.js…" 'STEP'
Refresh-Path
$nodeOk = $false
if (Have 'node') {
  $v = (& node -v) -replace 'v', ''
  if ([version]$v -ge [version]'20.0.0') { $nodeOk = $true; Log "Node.js $v present" 'OK' }
}
if (-not $nodeOk) {
  if (-not (Winget-Install 'OpenJS.NodeJS.LTS')) {
    Log "winget unavailable — downloading Node.js MSI" 'WARN'
    $msi = Join-Path $env:TEMP 'node-lts-x64.msi'
    Download 'https://nodejs.org/dist/v22.11.0/node-v22.11.0-x64.msi' $msi
    Log "Installing Node.js (silent)…"
    Start-Process msiexec.exe -ArgumentList "/i `"$msi`" /qn /norestart" -Wait
  }
  Refresh-Path
  if (-not (Have 'node')) { Fail "Node.js installation failed. Install Node 22 LTS manually and re-run." }
  Log "Node.js $((& node -v)) installed" 'OK'
}

# ===========================================================================
# 2. PostgreSQL (>= 15)
# ===========================================================================
Log "Checking PostgreSQL…" 'STEP'
Refresh-Path
$psql = Get-Command 'psql.exe' -ErrorAction SilentlyContinue
if (-not $psql) {
  $found = Get-ChildItem 'C:\Program Files\PostgreSQL\*\bin\psql.exe' -ErrorAction SilentlyContinue |
           Sort-Object FullName -Descending | Select-Object -First 1
  if ($found) { $psql = $found; $env:Path += ";$(Split-Path $found.FullName)" }
}
if ($psql) {
  if ($psql.Source) { $psqlPath = $psql.Source } else { $psqlPath = $psql.FullName }
  Log "PostgreSQL present at $psqlPath" 'OK'
} else {
  Log "Installing PostgreSQL 16 (EnterpriseDB unattended)…" 'STEP'
  $edb = Join-Path $env:TEMP 'postgresql-16-x64.exe'
  Download 'https://get.enterprisedb.com/postgresql/postgresql-16.4-1-windows-x64.exe' $edb
  $pgBase = 'C:\Program Files\PostgreSQL\16'
  $args = @(
    '--mode', 'unattended', '--unattendedmodeui', 'minimal',
    '--superpassword', $DbPassword, '--serverport', "$DbPort",
    '--prefix', $pgBase, '--datadir', "$pgBase\data",
    '--enable-components', 'server,commandlinetools'
  )
  Start-Process $edb -ArgumentList $args -Wait
  $psql = Get-ChildItem "$pgBase\bin\psql.exe" -ErrorAction SilentlyContinue
  if (-not $psql) { Fail "PostgreSQL installation failed. Install PostgreSQL 16 manually and re-run." }
  $env:Path += ";$pgBase\bin"
  Log "PostgreSQL 16 installed" 'OK'
}
if ($psql.Source) { $psqlExe = $psql.Source } else { $psqlExe = $psql.FullName }
$pgBin   = Split-Path $psqlExe

# ===========================================================================
# 3. Create the database
# ===========================================================================
Log "Provisioning the 'itpm360' database…" 'STEP'
$env:PGPASSWORD = $DbPassword
$exists = & $psqlExe -U postgres -h localhost -p $DbPort -tAc "SELECT 1 FROM pg_database WHERE datname='itpm360'" 2>$null
if ($exists -ne '1') {
  & "$pgBin\createdb.exe" -U postgres -h localhost -p $DbPort itpm360 2>&1 | Out-Null
  if ($LASTEXITCODE -ne 0) { Fail "Could not create the database (check the PostgreSQL password)." }
  Log "Database 'itpm360' created" 'OK'
} else {
  Log "Database 'itpm360' already exists" 'OK'
}

# ===========================================================================
# 4. Deploy app files + write config
# ===========================================================================
Log "Deploying application files…" 'STEP'
foreach ($d in 'server', 'web', 'docs') {
  if (Test-Path (Join-Path $AppSource $d)) {
    Copy-Item (Join-Path $AppSource $d) $InstallDir -Recurse -Force
  }
}
$serverDir = Join-Path $InstallDir 'server'
$webDir    = Join-Path $InstallDir 'web'

# URL-encode the password (it may contain # ! etc.) for the connection string
Add-Type -AssemblyName System.Web
$encPw   = [System.Uri]::EscapeDataString($DbPassword)
$jwt     = -join ((48..57) + (65..90) + (97..122) | Get-Random -Count 48 | ForEach-Object { [char]$_ })
$dbUrl   = "postgres://postgres:$encPw@localhost:$DbPort/itpm360"

@"
DATABASE_URL=$dbUrl
PORT=$ApiPort
JWT_SECRET=$jwt
CORS_ORIGIN=http://localhost:$WebPort
NODE_ENV=production
"@ | Set-Content -Path (Join-Path $serverDir '.env') -Encoding UTF8
Log "Wrote server\.env" 'OK'

# ===========================================================================
# 5. Install dependencies, migrate, seed, build
# ===========================================================================
function Npm($dir, [string]$cmd) {
  Log "npm $cmd  ($dir)"
  Push-Location $dir
  try {
    $npmCmd = (Get-Command npm.cmd -ErrorAction SilentlyContinue).Source
    if (-not $npmCmd) { $npmCmd = 'npm' }
    & $npmCmd $cmd.Split(' ') 2>&1 | Tee-Object -FilePath $LogFile -Append | Out-Null
    if ($LASTEXITCODE -ne 0) { Fail "npm $cmd failed in $dir (see install.log)." }
  } finally { Pop-Location }
}

Log "Installing backend dependencies…" 'STEP'
Npm $serverDir 'install --omit=dev --no-audit --no-fund'
Log "Applying database migrations…" 'STEP'
Push-Location $serverDir; & node 'src/migrate.js' 2>&1 | Tee-Object -FilePath $LogFile -Append | Out-Null; Pop-Location
if (-not $NoSeed) {
  Log "Seeding demo data…" 'STEP'
  Push-Location $serverDir; & node 'src/seed.js' 2>&1 | Tee-Object -FilePath $LogFile -Append | Out-Null; Pop-Location
}

Log "Installing & building frontend…" 'STEP'
Npm $webDir 'install --no-audit --no-fund'
$env:API_URL = "http://localhost:$ApiPort"
Npm $webDir 'run build'

# ===========================================================================
# 6. Windows services (auto-start, auto-restart) via NSSM
# ===========================================================================
if ($NoServices) {
  Log "Skipping service registration (-NoServices)." 'WARN'
} else {
  Log "Registering Windows services…" 'STEP'
  $nssmDir = Join-Path $InstallDir 'nssm'
  $nssm    = Join-Path $nssmDir 'nssm.exe'
  if (-not (Test-Path $nssm)) {
    $zip = Join-Path $env:TEMP 'nssm.zip'
    Download 'https://nssm.cc/release/nssm-2.24.zip' $zip
    Expand-Archive -Path $zip -DestinationPath $env:TEMP -Force
    $arch = if ([Environment]::Is64BitOperatingSystem) { 'win64' } else { 'win32' }
    New-Item -ItemType Directory -Force -Path $nssmDir | Out-Null
    Copy-Item (Join-Path $env:TEMP "nssm-2.24\$arch\nssm.exe") $nssm -Force
  }
  $node = (Get-Command node).Source

  function Register-Service($name, $workdir, $scriptArgs, $envPairs) {
    & $nssm stop $name 2>$null | Out-Null
    & $nssm remove $name confirm 2>$null | Out-Null
    & $nssm install $name $node $scriptArgs | Out-Null
    & $nssm set $name AppDirectory $workdir | Out-Null
    & $nssm set $name AppStdout (Join-Path $InstallDir "$name.log") | Out-Null
    & $nssm set $name AppStderr (Join-Path $InstallDir "$name.log") | Out-Null
    & $nssm set $name Start SERVICE_AUTO_START | Out-Null
    & $nssm set $name AppEnvironmentExtra $envPairs | Out-Null
    & $nssm start $name | Out-Null
    Log "Service '$name' registered and started" 'OK'
  }

  Register-Service 'ITPM360-API' $serverDir 'src/index.js' @(
    "NODE_ENV=production", "PORT=$ApiPort")
  # next start binary lives in web\node_modules\.bin\next
  $nextCli = Join-Path $webDir 'node_modules\next\dist\bin\next'
  Register-Service 'ITPM360-Web' $webDir "`"$nextCli`" start -p $WebPort" @(
    "NODE_ENV=production", "API_URL=http://localhost:$ApiPort")

  # Firewall (local access only by default; open if you need LAN access)
  try {
    New-NetFirewallRule -DisplayName 'ITPM360 Web'  -Direction Inbound -Action Allow -Protocol TCP -LocalPort $WebPort -ErrorAction SilentlyContinue | Out-Null
    New-NetFirewallRule -DisplayName 'ITPM360 API'  -Direction Inbound -Action Allow -Protocol TCP -LocalPort $ApiPort -ErrorAction SilentlyContinue | Out-Null
  } catch { Log "Firewall rule creation skipped: $($_.Exception.Message)" 'WARN' }
}

Log "==== ITPM360 installation complete ====" 'STEP'
Log "Web UI:  http://localhost:$WebPort" 'OK'
Log "API:     http://localhost:$ApiPort/api/health" 'OK'
Log "Sign in: admin@itpm360.dev / Password123!  (change immediately)" 'OK'
$env:PGPASSWORD = $null
exit 0

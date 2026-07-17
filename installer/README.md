# ITPM360 Windows Installer

`ITPM360-Setup.exe` is a self-contained Windows installer that stands the whole
system up on a fresh machine with no prerequisites:

1. Installs **Node.js 22 LTS** (via winget, or a silent MSI download fallback).
2. Installs **PostgreSQL 16** (EnterpriseDB unattended) if not already present,
   configured with the superuser password you provide.
3. Creates the **`itpm360`** database.
4. Deploys the app, writes `server\.env` (with a generated JWT secret and the
   DB connection string), installs npm dependencies, runs **migrations** and
   **seed data**, and **builds** the frontend.
5. Registers two auto-starting, auto-restarting **Windows services** (via NSSM):
   `ITPM360-API` (port 4000) and `ITPM360-Web` (port 3000), and opens the
   firewall for them.
6. Adds Start-menu / desktop shortcuts and an entry in *Add or remove programs*.

When it finishes, open **http://localhost:3000** and sign in with
`admin@itpm360.dev` / `Password123!` — change this immediately.

## Running it

Double-click `ITPM360-Setup.exe` and accept the UAC (admin) prompt. The setup
wizard asks for the PostgreSQL superuser password (pre-filled if the installer
was built with one). First run takes several minutes while runtimes and
dependencies download; progress is written to
`C:\Program Files\ITPM360\install.log`.

Requirements: Windows 10/11 or Server 2019+ (x64), an internet connection for
the first install, and administrator rights.

## Building the installer

Requires **NSIS** (`makensis`). Runs on Linux or Windows.

```bash
cd installer
# Pre-fill the DB password field in the installer (optional; kept out of git):
ITPM_DB_PASSWORD='your-postgres-password' ./build.sh
# → produces installer/ITPM360-Setup.exe
```

The production password is **never committed**. `build.sh` reads it from the
`ITPM_DB_PASSWORD` env var or a git-ignored `installer/build.env`
(`DB_PASSWORD=…`) and injects it only as the default value of the installer's
password field. Built without one, the field simply starts empty and the
operator types the password during setup.

### Security note

Embedding a password as the field default makes the `.exe` turnkey but means
anyone who obtains that specific `.exe` can read the default. For wide
distribution, build **without** a password (operators type it at install time).
For a controlled internal rollout, the pre-filled build is convenient — treat
the `.exe` as a secret in that case.

## What it does NOT do

- It does not uninstall Node.js/PostgreSQL on removal, and `Uninstall` keeps
  your database by default (pass `-DropDatabase -DbPassword …` to remove it).
- It does not configure TLS/HTTPS or a public reverse proxy — for internet-
  facing deployments, front the web service with IIS/nginx + a certificate and
  restrict the API port to localhost.

## Silent / scripted install

The PowerShell engine can be run directly for automation:

```powershell
# from the extracted app\ folder, elevated
powershell -ExecutionPolicy Bypass -File scripts\Install-ITPM360.ps1 `
  -DbPassword 'your-password' -InstallDir 'C:\Program Files\ITPM360'
```

Useful flags: `-NoSeed` (skip demo data), `-NoServices` (configure only),
`-ApiPort`, `-WebPort`, `-DbPort`.

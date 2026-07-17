; ITPM360 Windows installer (NSIS). Compiles on Linux via makensis.
; Bundles the app source + PowerShell bootstrapper into a single Setup .exe
; that installs Node.js + PostgreSQL, provisions the DB, builds the app, and
; registers auto-starting services.

Unicode true
!include "MUI2.nsh"
!include "nsDialogs.nsh"
!include "LogicLib.nsh"

; --- build-time inputs (injected by build.sh) ------------------------------
!ifndef APP_VERSION
  !define APP_VERSION "1.0.0"
!endif
!ifndef STAGE_DIR
  !define STAGE_DIR "stage"      ; folder holding app\ payload, relative to this script
!endif
!ifndef DB_PASSWORD_DEFAULT
  !define DB_PASSWORD_DEFAULT ""  ; committed source ships NO secret; build injects it
!endif

Name "ITPM360 ${APP_VERSION}"
OutFile "ITPM360-Setup.exe"
InstallDir "$PROGRAMFILES64\ITPM360"
RequestExecutionLevel admin
ShowInstDetails show
BrandingText "ITPM360 — Enterprise IT Project Management"

Var DbPass
Var DbPassCtl

!define MUI_ABORTWARNING
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
Page custom DbPasswordPage DbPasswordPageLeave
!insertmacro MUI_PAGE_INSTFILES
!define MUI_FINISHPAGE_TEXT "ITPM360 is installed and running.$\r$\n$\r$\nOpen http://localhost:3000 and sign in with admin@itpm360.dev / Password123! (change it immediately)."
!define MUI_FINISHPAGE_RUN "$SYSDIR\cmd.exe"
!define MUI_FINISHPAGE_RUN_PARAMETERS "/c start http://localhost:3000"
!define MUI_FINISHPAGE_RUN_TEXT "Open ITPM360 in the browser"
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_LANGUAGE "English"

; --- custom page: PostgreSQL password --------------------------------------
Function DbPasswordPage
  !insertmacro MUI_HEADER_TEXT "Database configuration" "Set the PostgreSQL superuser password ITPM360 will use."
  nsDialogs::Create 1018
  Pop $0
  ${NSD_CreateLabel} 0 0 100% 36u "Enter the PostgreSQL 'postgres' superuser password. If PostgreSQL is not yet installed, it will be installed and configured with this password."
  Pop $0
  ${NSD_CreateLabel} 0 44u 30% 12u "Password:"
  Pop $0
  ${NSD_CreatePassword} 32% 42u 66% 12u "${DB_PASSWORD_DEFAULT}"
  Pop $DbPassCtl
  nsDialogs::Show
FunctionEnd

Function DbPasswordPageLeave
  ${NSD_GetText} $DbPassCtl $DbPass
  ${If} $DbPass == ""
    MessageBox MB_ICONEXCLAMATION "A PostgreSQL password is required."
    Abort
  ${EndIf}
FunctionEnd

; --- install ---------------------------------------------------------------
Section "ITPM360" SecMain
  SetOutPath "$INSTDIR\app"
  File /r "${STAGE_DIR}\app\*.*"

  ; Pass the password to PowerShell via the environment (never on a command line)
  System::Call 'kernel32::SetEnvironmentVariable(t "ITPM_DB_PASSWORD", t "$DbPass")i.r0'

  DetailPrint "Running the ITPM360 bootstrapper (installs Node.js, PostgreSQL, builds the app)…"
  DetailPrint "This can take several minutes on first run. Progress is logged to $INSTDIR\install.log."
  nsExec::ExecToLog 'powershell -NoProfile -ExecutionPolicy Bypass -File "$INSTDIR\app\scripts\Install-ITPM360.ps1" -InstallDir "$INSTDIR" -AppSource "$INSTDIR\app"'
  Pop $0
  ${If} $0 != 0
    MessageBox MB_ICONSTOP "Setup encountered an error (exit $0). See $INSTDIR\install.log for details."
    Abort
  ${EndIf}

  ; Clear the password from the environment
  System::Call 'kernel32::SetEnvironmentVariable(t "ITPM_DB_PASSWORD", i 0)i.r0'

  ; Shortcuts
  CreateDirectory "$SMPROGRAMS\ITPM360"
  CreateShortcut "$SMPROGRAMS\ITPM360\Open ITPM360.lnk" "$SYSDIR\cmd.exe" "/c start http://localhost:3000" "$SYSDIR\shell32.dll" 14
  CreateShortcut "$SMPROGRAMS\ITPM360\Uninstall ITPM360.lnk" "$INSTDIR\Uninstall.exe"
  CreateShortcut "$DESKTOP\ITPM360.lnk" "$SYSDIR\cmd.exe" "/c start http://localhost:3000" "$SYSDIR\shell32.dll" 14

  ; Registry (Add/Remove Programs) + uninstaller
  WriteUninstaller "$INSTDIR\Uninstall.exe"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\ITPM360" "DisplayName" "ITPM360 — Enterprise IT Project Management"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\ITPM360" "DisplayVersion" "${APP_VERSION}"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\ITPM360" "UninstallString" '"$INSTDIR\Uninstall.exe"'
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\ITPM360" "InstallLocation" "$INSTDIR"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\ITPM360" "Publisher" "ITPM360"
SectionEnd

; --- uninstall -------------------------------------------------------------
Section "Uninstall"
  nsExec::ExecToLog 'powershell -NoProfile -ExecutionPolicy Bypass -File "$INSTDIR\app\scripts\Uninstall-ITPM360.ps1" -InstallDir "$INSTDIR"'
  Delete "$SMPROGRAMS\ITPM360\*.*"
  RMDir  "$SMPROGRAMS\ITPM360"
  Delete "$DESKTOP\ITPM360.lnk"
  DeleteRegKey HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\ITPM360"
  RMDir /r "$INSTDIR"
SectionEnd

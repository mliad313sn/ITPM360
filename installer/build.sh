#!/usr/bin/env bash
# Build ITPM360-Setup.exe with NSIS (runs on Linux or Windows with makensis).
#
# The production DB password is NOT stored in the repo. Provide it at build time
# so it becomes the pre-filled default in the installer's password field:
#
#   ITPM_DB_PASSWORD='your-password' ./build.sh
#
# or drop it into a git-ignored installer/build.env as:  DB_PASSWORD=your-password
#
# Without a password, the installer still builds; its password field just starts
# empty and the operator types it during setup.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"
STAGE="$HERE/stage"
APP="$STAGE/app"
VERSION="${APP_VERSION:-1.0.0}"

# Load a local build.env if present (git-ignored)
if [[ -f "$HERE/build.env" ]]; then set -a; . "$HERE/build.env"; set +a; fi
DB_PW="${ITPM_DB_PASSWORD:-${DB_PASSWORD:-}}"

echo "==> Staging application payload (excluding node_modules/.next/.git)…"
rm -rf "$STAGE"
mkdir -p "$APP/server" "$APP/web" "$APP/docs" "$APP/scripts"

# Backend: source + migrations + manifests only
cp -r "$ROOT/server/src"         "$APP/server/"
cp -r "$ROOT/server/migrations"  "$APP/server/"
cp    "$ROOT/server/package.json" "$ROOT/server/package-lock.json" "$APP/server/"

# Frontend: source + config + manifests (no node_modules, no .next)
for item in app components lib public next.config.ts tsconfig.json postcss.config.mjs package.json package-lock.json; do
  [[ -e "$ROOT/web/$item" ]] && cp -r "$ROOT/web/$item" "$APP/web/"
done

cp -r "$ROOT/docs/." "$APP/docs/" 2>/dev/null || true
cp "$HERE/scripts/"*.ps1 "$APP/scripts/"

echo "==> Compiling installer with makensis (version $VERSION)…"
NSIS_ARGS=(-DAPP_VERSION="$VERSION" -DSTAGE_DIR="stage")
if [[ -n "$DB_PW" ]]; then
  NSIS_ARGS+=(-DDB_PASSWORD_DEFAULT="$DB_PW")
  echo "    (password default injected into the installer field)"
else
  echo "    (no password provided — installer field starts empty)"
fi

cd "$HERE"
makensis "${NSIS_ARGS[@]}" itpm360.nsi

echo "==> Done: $HERE/ITPM360-Setup.exe"
ls -lh "$HERE/ITPM360-Setup.exe"

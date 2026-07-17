#!/usr/bin/env bash
# ITPM360 Linux installer — the counterpart to the Windows .exe.
# Fetches the app, ensures Node.js + PostgreSQL, provisions the database,
# installs dependencies, migrates, seeds, builds, and runs it under a
# supervisor (systemd unit when available, otherwise a keep-alive process).
#
#   sudo ITPM_DB_PASSWORD='…' ./install-linux.sh
#
# Env overrides: INSTALL_DIR, API_PORT, WEB_PORT, DB_PORT, GIT_REF, NO_SEED=1
set -euo pipefail

INSTALL_DIR="${INSTALL_DIR:-/opt/itpm360}"
API_PORT="${API_PORT:-4000}"
WEB_PORT="${WEB_PORT:-8080}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="itpm360"
GIT_REF="${GIT_REF:-claude/multi-country-it-project-app-icc119}"
PGDATA="${PGDATA:-/var/lib/postgresql/itpm-data}"
DB_PW="${ITPM_DB_PASSWORD:-}"
SRC_REPO="${SRC_REPO:-}"   # git URL to clone; falls back to local working tree

log(){ printf '\033[36m==>\033[0m %s\n' "$*"; }
ok(){  printf '\033[32m  ✓\033[0m %s\n' "$*"; }
die(){ printf '\033[31m  ✗ %s\033[0m\n' "$*" >&2; exit 1; }

[[ $EUID -eq 0 ]] || die "Run as root (sudo)."
[[ -n "$DB_PW" ]] || die "Set ITPM_DB_PASSWORD (the PostgreSQL superuser password)."

# --- 1. Node.js -------------------------------------------------------------
log "Ensuring Node.js (>= 20)…"
if ! command -v node >/dev/null || [[ "$(node -v | tr -d v | cut -d. -f1)" -lt 20 ]]; then
  log "Installing Node.js 22 via NodeSource…"
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash - >/dev/null 2>&1
  apt-get install -y nodejs >/dev/null 2>&1
fi
ok "Node.js $(node -v)"

# --- 2. PostgreSQL ----------------------------------------------------------
log "Ensuring PostgreSQL…"
if ! command -v psql >/dev/null; then
  log "Installing PostgreSQL 16…"
  apt-get update -qq && apt-get install -y postgresql-16 >/dev/null 2>&1
fi
PG_BIN="$(dirname "$(ls /usr/lib/postgresql/*/bin/pg_ctl | sort -V | tail -1)")"
if ! pg_isready -h localhost -p "$DB_PORT" >/dev/null 2>&1; then
  log "Starting PostgreSQL cluster…"
  if [[ ! -d "$PGDATA/base" ]]; then
    mkdir -p "$PGDATA"; chown postgres:postgres "$PGDATA"
    su postgres -c "$PG_BIN/initdb -D $PGDATA -A scram-sha-256 --pwfile=<(echo '$DB_PW')" >/dev/null 2>&1 \
      || su postgres -c "$PG_BIN/initdb -D $PGDATA -A trust" >/dev/null
  fi
  su postgres -c "$PG_BIN/pg_ctl -D $PGDATA -l $PGDATA/log -o '-p $DB_PORT' start" >/dev/null
  sleep 2
fi
pg_isready -h localhost -p "$DB_PORT" >/dev/null || die "PostgreSQL is not accepting connections."
su postgres -c "psql -p $DB_PORT -q -c \"ALTER USER postgres PASSWORD '$DB_PW';\""
su postgres -c "psql -p $DB_PORT -tAc \"SELECT 1 FROM pg_database WHERE datname='$DB_NAME'\"" | grep -q 1 \
  || su postgres -c "createdb -p $DB_PORT $DB_NAME"
ok "PostgreSQL ready, database '$DB_NAME' provisioned"

# --- 3. Fetch the application ----------------------------------------------
log "Fetching application into $INSTALL_DIR…"
rm -rf "$INSTALL_DIR"; mkdir -p "$INSTALL_DIR"
if [[ -n "$SRC_REPO" ]] && git clone --depth 1 -b "$GIT_REF" "$SRC_REPO" "$INSTALL_DIR" >/dev/null 2>&1; then
  ok "Cloned $GIT_REF from $SRC_REPO"
else
  # Fallback: copy the local working tree (excludes deps/build/secrets)
  SELF_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
  ( cd "$SELF_ROOT" && tar --exclude=node_modules --exclude=.next --exclude=.git \
      --exclude='*.env' --exclude=installer/stage --exclude='*.out' -cf - . ) | ( cd "$INSTALL_DIR" && tar -xf - )
  ok "Deployed from local source"
fi

# --- 4. Configure -----------------------------------------------------------
log "Writing configuration…"
enc_pw="$(node -e "process.stdout.write(encodeURIComponent(process.argv[1]))" "$DB_PW")"
jwt="$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")"
cat > "$INSTALL_DIR/server/.env" <<EOF
DATABASE_URL=postgres://postgres:$enc_pw@localhost:$DB_PORT/$DB_NAME
PORT=$API_PORT
JWT_SECRET=$jwt
CORS_ORIGIN=http://localhost:$WEB_PORT
NODE_ENV=production
EOF
ok "server/.env written"

# --- 5. Dependencies, migrate, seed, build ---------------------------------
log "Installing backend dependencies…"
( cd "$INSTALL_DIR/server" && npm ci --omit=dev --no-audit --no-fund >/dev/null 2>&1 \
    || npm install --omit=dev --no-audit --no-fund >/dev/null 2>&1 )
log "Applying migrations…"; ( cd "$INSTALL_DIR/server" && node src/migrate.js )
if [[ "${NO_SEED:-}" != "1" ]]; then log "Seeding demo data…"; ( cd "$INSTALL_DIR/server" && node src/seed.js >/dev/null ); fi
log "Installing & building frontend (this takes a minute)…"
( cd "$INSTALL_DIR/web" && npm ci --no-audit --no-fund >/dev/null 2>&1 || npm install --no-audit --no-fund >/dev/null 2>&1 )
( cd "$INSTALL_DIR/web" && API_URL="http://localhost:$API_PORT" npm run build >/dev/null 2>&1 )
ok "Application built"

# --- 6. Service management --------------------------------------------------
mkdir -p "$INSTALL_DIR/bin" "$INSTALL_DIR/logs"
NEXT_BIN="$INSTALL_DIR/web/node_modules/next/dist/bin/next"

if command -v systemctl >/dev/null 2>&1 && systemctl is-system-running >/dev/null 2>&1; then
  log "Registering systemd services…"
  cat > /etc/systemd/system/itpm360-api.service <<EOF
[Unit]
Description=ITPM360 API
After=network.target postgresql.service
[Service]
WorkingDirectory=$INSTALL_DIR/server
ExecStart=$(command -v node) src/index.js
Restart=always
Environment=NODE_ENV=production
[Install]
WantedBy=multi-user.target
EOF
  cat > /etc/systemd/system/itpm360-web.service <<EOF
[Unit]
Description=ITPM360 Web
After=itpm360-api.service
[Service]
WorkingDirectory=$INSTALL_DIR/web
ExecStart=$(command -v node) $NEXT_BIN start -p $WEB_PORT
Restart=always
Environment=NODE_ENV=production
Environment=API_URL=http://localhost:$API_PORT
[Install]
WantedBy=multi-user.target
EOF
  systemctl daemon-reload
  systemctl enable --now itpm360-api itpm360-web >/dev/null 2>&1
  ok "systemd services itpm360-api / itpm360-web enabled and started"
else
  log "No systemd — installing a keep-alive supervisor…"
  cat > "$INSTALL_DIR/bin/supervisor.sh" <<EOF
#!/usr/bin/env bash
# Keeps the API and web processes alive; restarts either if it exits.
cd "$INSTALL_DIR"
run(){ # name workdir cmd...
  local name="\$1" wd="\$2"; shift 2
  while true; do
    ( cd "\$wd" && "\$@" >> "$INSTALL_DIR/logs/\$name.log" 2>&1 )
    echo "\$(date '+%F %T') \$name exited (\$?), restarting in 2s" >> "$INSTALL_DIR/logs/supervisor.log"
    sleep 2
  done
}
NODE_ENV=production run api "$INSTALL_DIR/server" $(command -v node) src/index.js &
echo \$! > "$INSTALL_DIR/logs/api.sup.pid"
NODE_ENV=production API_URL="http://localhost:$API_PORT" run web "$INSTALL_DIR/web" $(command -v node) "$NEXT_BIN" start -p $WEB_PORT &
echo \$! > "$INSTALL_DIR/logs/web.sup.pid"
wait
EOF
  chmod +x "$INSTALL_DIR/bin/supervisor.sh"
  cat > "$INSTALL_DIR/bin/itpm360ctl" <<EOF
#!/usr/bin/env bash
# start|stop|status|restart ITPM360
PIDF="$INSTALL_DIR/logs/supervisor.pid"
case "\${1:-}" in
  start)
    if [[ -f "\$PIDF" ]] && kill -0 "\$(cat "\$PIDF")" 2>/dev/null; then echo "already running"; exit 0; fi
    nohup "$INSTALL_DIR/bin/supervisor.sh" >/dev/null 2>&1 &
    echo \$! > "\$PIDF"; echo "started (pid \$(cat "\$PIDF"))" ;;
  stop)
    pkill -P "\$(cat "\$PIDF" 2>/dev/null)" 2>/dev/null; kill "\$(cat "\$PIDF" 2>/dev/null)" 2>/dev/null
    fuser -k $API_PORT/tcp $WEB_PORT/tcp 2>/dev/null; rm -f "\$PIDF"; echo "stopped" ;;
  status)
    curl -fsS "http://localhost:$API_PORT/api/health" >/dev/null 2>&1 && echo "API: up" || echo "API: down"
    curl -fsS -o /dev/null "http://localhost:$WEB_PORT/login" 2>&1 && echo "Web: up (http://localhost:$WEB_PORT)" || echo "Web: down" ;;
  restart) "\$0" stop; sleep 1; "\$0" start ;;
  *) echo "usage: itpm360ctl {start|stop|status|restart}"; exit 1 ;;
esac
EOF
  chmod +x "$INSTALL_DIR/bin/itpm360ctl"
  ln -sf "$INSTALL_DIR/bin/itpm360ctl" /usr/local/bin/itpm360ctl
  ok "Supervisor + 'itpm360ctl' control command installed"
fi

log "Install complete."
echo
ok "Install dir : $INSTALL_DIR"
ok "Web UI      : http://localhost:$WEB_PORT"
ok "API health  : http://localhost:$API_PORT/api/health"
ok "Sign in     : admin@itpm360.dev / Password123!  (change immediately)"

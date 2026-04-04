#!/usr/bin/env bash
# scripts/e2e-deploy.sh
# Deploys dist/ to the E2E test server, starts MCP server under exclusive lock.
# The lock prevents multiple callers (local devs, CI) from colliding.
set -euo pipefail

SERVER="${E2E_SERVER:?E2E_SERVER must be set}"
SERVER_USER="${E2E_SERVER_USER:?E2E_SERVER_USER must be set}"
DEPLOY_DIR="/opt/arc1-e2e"
LOCKFILE="/tmp/arc1-e2e.lock"
LOCK_TIMEOUT="${E2E_LOCK_TIMEOUT:-300}"
MCP_PORT="${E2E_MCP_PORT:-3000}"
LOG_DIR="${E2E_LOG_DIR:-/tmp/arc1-e2e-logs}"

SSH_OPTS="-o StrictHostKeyChecking=no -o ConnectTimeout=10"

# Mask server address in logs (CI logs are public)
MASKED_SERVER="$(echo "${SERVER}" | sed 's/[0-9]\{1,3\}\.[0-9]\{1,3\}\.[0-9]\{1,3\}\.[0-9]\{1,3\}/***.***/g')"

mkdir -p "${LOG_DIR}"

echo ""
echo "======================================================================"
echo "  E2E Deploy"
echo "======================================================================"
echo ""
echo "  Server:     ***@${MASKED_SERVER}"
echo "  Deploy dir: ${DEPLOY_DIR}"
echo "  MCP port:   ${MCP_PORT}"
echo "  Lock file:  ${LOCKFILE} (timeout: ${LOCK_TIMEOUT}s)"
echo "  Local logs: ${LOG_DIR}/"
echo ""

# ── Pre-flight: SSH ─────────────────────────────────────────────────
echo "-- Checking SSH connectivity..."
if ! ssh ${SSH_OPTS} ${SERVER_USER}@${SERVER} "echo ok" > /dev/null 2>&1; then
  echo "ERROR: Cannot SSH to server"
  echo "  - Is the server running?"
  echo "  - Is your SSH key configured? (~/.ssh/id_rsa or id_ed25519)"
  echo "  - Try: ssh \$E2E_SERVER_USER@\$E2E_SERVER"
  exit 1
fi
echo "   SSH: OK"

# ── Pre-flight: SAP (ICM + DB health) ──────────────────────────────
echo "-- Checking SAP system..."
SAP_STATUS=$(ssh ${SSH_OPTS} ${SERVER_USER}@${SERVER} \
  "curl -s -o /dev/null -w '%{http_code}' http://localhost:50000/sap/bc/adt/discovery 2>/dev/null || echo '000'")
if [ "$SAP_STATUS" = "000" ]; then
  echo "ERROR: SAP system not reachable at localhost:50000"
  echo "  - Check Docker container: ssh \$E2E_SERVER_USER@\$E2E_SERVER 'docker ps | grep a4h'"
  echo "  - Start SAP: ssh \$E2E_SERVER_USER@\$E2E_SERVER 'docker start a4h'"
  exit 1
fi
echo "   ICM: OK (HTTP ${SAP_STATUS})"

# Deep health check: test a DB-dependent ADT call (reading a program source).
# ICM can return 401 while work processes have broken HANA connections.
# If the DB check fails, attempt recovery via sapcontrol soft shutdown.
echo "-- Checking ABAP work process DB connections..."
SAP_DB_CHECK=$(ssh ${SSH_OPTS} ${SERVER_USER}@${SERVER} \
  "curl -s -w '\n%{http_code}' -u '${SAP_USER}:$(cat /opt/arc1-e2e/.sap_password 2>/dev/null)' \
   'http://localhost:50000/sap/bc/adt/programs/programs/RSHOWTIM/source/main' 2>/dev/null || echo '000'")
SAP_DB_HTTP=$(echo "${SAP_DB_CHECK}" | tail -1)
SAP_DB_BODY=$(echo "${SAP_DB_CHECK}" | head -n -1)

if echo "${SAP_DB_BODY}" | grep -qi "database connection is not open"; then
  echo "   WARNING: ABAP work processes have broken HANA DB connections"
  echo "   Attempting recovery via sapcontrol soft shutdown + restart..."
  ssh ${SSH_OPTS} ${SERVER_USER}@${SERVER} bash <<'RECOVER'
    # Soft shutdown restarts all work processes, re-establishing DB connections.
    # Unlike a full system restart, this preserves ICM and the dispatcher.
    docker exec a4h su - a4hadm -c "sapcontrol -nr 00 -function RestartService" 2>/dev/null || true
    echo "   sapcontrol RestartService issued — waiting for work processes..."
    for i in $(seq 1 60); do
      WP_STATUS=$(docker exec a4h su - a4hadm -c "sapcontrol -nr 00 -function GetProcessList" 2>/dev/null || echo "")
      if echo "$WP_STATUS" | grep -q "GREEN"; then
        echo "   Work processes recovered after ${i}s"
        break
      fi
      sleep 2
    done
RECOVER
  # Re-check after recovery
  sleep 5
  SAP_DB_RECHECK=$(ssh ${SSH_OPTS} ${SERVER_USER}@${SERVER} \
    "curl -s -w '\n%{http_code}' -u '${SAP_USER}:$(cat /opt/arc1-e2e/.sap_password 2>/dev/null)' \
     'http://localhost:50000/sap/bc/adt/programs/programs/RSHOWTIM/source/main' 2>/dev/null || echo '000'")
  SAP_DB_RECHECK_BODY=$(echo "${SAP_DB_RECHECK}" | head -n -1)
  if echo "${SAP_DB_RECHECK_BODY}" | grep -qi "database connection is not open"; then
    echo "   ERROR: Recovery failed — DB connections still broken"
    echo "   Manual fix: ssh \$E2E_SERVER_USER@\$E2E_SERVER 'docker stop -t 7200 a4h && docker start a4h'"
    exit 1
  fi
  echo "   DB: OK (recovered after sapcontrol restart)"
elif [ "$SAP_DB_HTTP" = "200" ] || [ "$SAP_DB_HTTP" = "401" ]; then
  echo "   DB: OK (HTTP ${SAP_DB_HTTP})"
else
  echo "   DB: OK (HTTP ${SAP_DB_HTTP}, no DB error detected)"
fi

# ── Pre-flight: Lock (stale detection) ─────────────────────────────
MAX_LOCK_AGE="${E2E_MAX_LOCK_AGE:-900}"  # 15 minutes — e2e suite takes ~6 min
echo "-- Checking lock status..."
LOCK_INFO=$(ssh ${SSH_OPTS} ${SERVER_USER}@${SERVER} "cat ${LOCKFILE}.info 2>/dev/null || echo 'no active lock'")
echo "   Lock: ${LOCK_INFO}"

# Break stale locks: if the locking PID is dead or the lock is older than MAX_LOCK_AGE
ssh ${SSH_OPTS} ${SERVER_USER}@${SERVER} bash -s "${LOCKFILE}" "${MAX_LOCK_AGE}" <<'STALE_CHECK'
  LOCKFILE="$1"
  MAX_AGE="$2"
  INFO_FILE="${LOCKFILE}.info"
  [ ! -f "$INFO_FILE" ] && exit 0

  # Extract PID from lock info
  LOCK_PID=$(grep -oP 'PID: \K[0-9]+' "$INFO_FILE" 2>/dev/null || echo "")
  if [ -z "$LOCK_PID" ]; then
    exit 0
  fi

  # Check 1: Is the locking process still alive?
  if ! kill -0 "$LOCK_PID" 2>/dev/null; then
    echo "   STALE LOCK: PID $LOCK_PID is dead — breaking lock"
    rm -f "$LOCKFILE" "$INFO_FILE"
    # Also kill any orphaned MCP server
    pkill -f 'node /opt/arc1-e2e/dist/index.js' 2>/dev/null || true
    exit 0
  fi

  # Check 2: Is the lock older than MAX_AGE?
  if [ -f "$INFO_FILE" ]; then
    LOCK_MTIME=$(stat -c %Y "$INFO_FILE" 2>/dev/null || echo 0)
    NOW=$(date +%s)
    AGE=$(( NOW - LOCK_MTIME ))
    if [ "$AGE" -gt "$MAX_AGE" ]; then
      echo "   STALE LOCK: age ${AGE}s exceeds max ${MAX_AGE}s — breaking lock"
      kill "$LOCK_PID" 2>/dev/null || true
      pkill -f 'node /opt/arc1-e2e/dist/index.js' 2>/dev/null || true
      sleep 2
      rm -f "$LOCKFILE" "$INFO_FILE"
      exit 0
    fi
  fi
STALE_CHECK

# ── Pre-flight: Node.js ─────────────────────────────────────────────
echo "-- Checking Node.js on server..."
NODE_VERSION=$(ssh ${SSH_OPTS} ${SERVER_USER}@${SERVER} "node --version 2>/dev/null || echo 'MISSING'")
if [ "$NODE_VERSION" = "MISSING" ]; then
  echo "ERROR: Node.js not installed on server"
  echo "  Install: ssh \$E2E_SERVER_USER@\$E2E_SERVER 'curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && apt-get install -y nodejs'"
  exit 1
fi
echo "   Node: ${NODE_VERSION}"

# ── Sync files ──────────────────────────────────────────────────────
echo ""
echo "-- Syncing dist/ to server..."
rsync -az --delete -e "ssh ${SSH_OPTS}" dist/ ${SERVER_USER}@${SERVER}:${DEPLOY_DIR}/dist/
echo "   dist/: synced"

echo "-- Syncing node_modules/..."
rsync -az --delete -e "ssh ${SSH_OPTS}" node_modules/ ${SERVER_USER}@${SERVER}:${DEPLOY_DIR}/node_modules/
echo "   node_modules/: synced"

scp -q ${SSH_OPTS} package.json ${SERVER_USER}@${SERVER}:${DEPLOY_DIR}/
echo "   package.json: copied"

# Upload the server-side start script (avoids nested quoting issues)
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
scp -q ${SSH_OPTS} "${SCRIPT_DIR}/e2e-server-start.sh" ${SERVER_USER}@${SERVER}:${DEPLOY_DIR}/start.sh
ssh ${SSH_OPTS} ${SERVER_USER}@${SERVER} "chmod +x ${DEPLOY_DIR}/start.sh"
echo "   start.sh: uploaded"

# ── Acquire lock + start server ─────────────────────────────────────
echo ""
echo "-- Acquiring lock (waiting up to ${LOCK_TIMEOUT}s if another run is active)..."

ssh ${SSH_OPTS} ${SERVER_USER}@${SERVER} \
  "SAP_USER='${SAP_USER:?SAP_USER must be set}' flock --timeout ${LOCK_TIMEOUT} ${LOCKFILE} ${DEPLOY_DIR}/start.sh" \
  || {
  RC=$?
  echo ""
  echo "ERROR: Could not acquire lock or start server (exit code: ${RC})"
  echo ""
  LOCK_INFO=$(ssh ${SSH_OPTS} ${SERVER_USER}@${SERVER} "cat ${LOCKFILE}.info 2>/dev/null || echo '(no lock info)'")
  echo "Lock info: ${LOCK_INFO}"
  echo ""
  # Show server log if it exists
  SERVER_LOG=$(ssh ${SSH_OPTS} ${SERVER_USER}@${SERVER} "tail -20 /tmp/arc1-e2e.log 2>/dev/null || echo '(no server log)'")
  echo "Server log (last 20 lines):"
  echo "${SERVER_LOG}"
  echo ""
  echo "Options:"
  echo "  1. Wait for the other run to finish"
  echo "  2. Force stop: npm run test:e2e:stop"
  exit 1
}

echo ""
echo "======================================================================"
echo "  MCP server running on port ${MCP_PORT}"
echo "======================================================================"
echo ""

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

# ── Pre-flight: Write SAP password to server ──────────────────────
# Must happen before DB health check so curl can authenticate.
echo "-- Writing SAP credentials to server..."
ssh ${SSH_OPTS} ${SERVER_USER}@${SERVER} \
  "echo -n '${SAP_PASSWORD:?SAP_PASSWORD must be set}' > ${DEPLOY_DIR}/.sap_password && chmod 600 ${DEPLOY_DIR}/.sap_password"
echo "   .sap_password: written"

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

# Deep health check: test DB-dependent ADT calls across multiple work processes.
# SAP load-balances requests across work processes — a single request might hit a
# healthy WP while others have broken HANA connections. We send multiple requests
# to cover more work processes. If ANY fail, trigger recovery.
echo "-- Checking ABAP work process DB connections (10 requests)..."
DB_CHECK_RESULT=$(ssh ${SSH_OPTS} ${SERVER_USER}@${SERVER} bash -s "${SAP_USER}" <<'DB_CHECK'
  SAP_USER="$1"
  SAP_PASS=$(cat /opt/arc1-e2e/.sap_password 2>/dev/null)
  FAILURES=0
  AUTH_FAIL=0
  for i in $(seq 1 10); do
    BODY=$(curl -s -u "${SAP_USER}:${SAP_PASS}" \
      "http://localhost:50000/sap/bc/adt/programs/programs/RSHOWTIM/source/main" 2>/dev/null)
    if echo "$BODY" | grep -qi "database connection is not open"; then
      FAILURES=$((FAILURES + 1))
    elif echo "$BODY" | grep -qi "Anmeldung fehlgeschlagen\|401"; then
      AUTH_FAIL=$((AUTH_FAIL + 1))
    fi
  done
  echo "FAILURES=${FAILURES} AUTH_FAIL=${AUTH_FAIL}"
DB_CHECK
)
DB_FAILURES=$(echo "${DB_CHECK_RESULT}" | grep -oP 'FAILURES=\K[0-9]+' || echo "0")
DB_AUTH_FAIL=$(echo "${DB_CHECK_RESULT}" | grep -oP 'AUTH_FAIL=\K[0-9]+' || echo "0")

if [ "${DB_FAILURES}" -gt "0" ]; then
  echo "   WARNING: ${DB_FAILURES}/10 requests hit broken HANA DB connections"
  echo "   Attempting recovery: stopping + restarting ABAP instance..."
  ssh ${SSH_OPTS} ${SERVER_USER}@${SERVER} bash <<'RECOVER'
    # Full instance Stop + Start restarts all work processes and re-establishes
    # DB connections. RestartService alone doesn't always fix all WPs.
    docker exec a4h su - a4hadm -c "sapcontrol -nr 00 -function Stop" 2>/dev/null || true
    echo "   Waiting for ABAP to stop..."
    for i in $(seq 1 30); do
      sleep 5
      STATUS=$(docker exec a4h su - a4hadm -c "sapcontrol -nr 00 -function GetProcessList" 2>&1 || echo "")
      if echo "$STATUS" | grep -q "GRAY" && ! echo "$STATUS" | grep -q "GREEN"; then
        echo "   ABAP stopped after $((i*5))s"
        break
      fi
    done
    docker exec a4h su - a4hadm -c "sapcontrol -nr 00 -function Start" 2>/dev/null || true
    echo "   Waiting for ABAP to start..."
    for i in $(seq 1 90); do
      sleep 5
      STATUS=$(docker exec a4h su - a4hadm -c "sapcontrol -nr 00 -function GetProcessList" 2>&1 || echo "")
      GREEN_COUNT=$(echo "$STATUS" | grep -c "GREEN" || true)
      if [ "$GREEN_COUNT" -ge 4 ]; then
        echo "   All processes GREEN after $((i*5))s"
        break
      fi
    done
RECOVER
  # Re-check after recovery
  sleep 10
  RECHECK=$(ssh ${SSH_OPTS} ${SERVER_USER}@${SERVER} bash -s "${SAP_USER}" <<'RECHECK_SCRIPT'
    SAP_USER="$1"
    SAP_PASS=$(cat /opt/arc1-e2e/.sap_password 2>/dev/null)
    FAILURES=0
    for i in $(seq 1 10); do
      BODY=$(curl -s -u "${SAP_USER}:${SAP_PASS}" \
        "http://localhost:50000/sap/bc/adt/programs/programs/RSHOWTIM/source/main" 2>/dev/null)
      if echo "$BODY" | grep -qi "database connection is not open"; then
        FAILURES=$((FAILURES + 1))
      fi
    done
    echo "$FAILURES"
RECHECK_SCRIPT
  )
  if [ "${RECHECK}" -gt "0" ]; then
    echo "   ERROR: Recovery failed — ${RECHECK}/10 requests still hit broken DB connections"
    echo "   Manual fix: ssh \$E2E_SERVER_USER@\$E2E_SERVER 'docker stop -t 7200 a4h && docker start a4h'"
    exit 1
  fi
  echo "   DB: OK (recovered after ABAP instance restart)"
elif [ "${DB_AUTH_FAIL}" -gt "0" ]; then
  echo "   ERROR: DB check got ${DB_AUTH_FAIL}/10 auth failures (HTTP 401)"
  echo "   The SAP_USER + SAP_PASSWORD combination is rejected by the SAP system."
  echo "   Verify that the SAP_USER secret matches the user whose password is in SAP_PASSWORD."
  echo "   (e.g., if SAP_PASSWORD is for DEVELOPER, SAP_USER must also be DEVELOPER)"
  exit 1
else
  echo "   DB: OK (10/10 requests successful)"
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
    # Also kill any orphaned MCP server (glob pattern matches both absolute/relative paths)
    pkill -f 'node.*dist/index.js' 2>/dev/null || true
    fuser -k 3000/tcp 2>/dev/null || true
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
      pkill -f 'node.*dist/index.js' 2>/dev/null || true
      fuser -k 3000/tcp 2>/dev/null || true
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
# Exclude better-sqlite3: only used by src/cache/sqlite.ts (never imported in
# production). No need to deploy a native addon compiled for CI's Node ABI.
rsync -az --delete --exclude='better-sqlite3' -e "ssh ${SSH_OPTS}" node_modules/ ${SERVER_USER}@${SERVER}:${DEPLOY_DIR}/node_modules/
echo "   node_modules/: synced (excluding better-sqlite3)"

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

# ── Post-deploy: Verify server identity ────────────────────────────
echo ""
echo "-- Verifying deployed server identity..."
HEALTH_JSON=$(ssh ${SSH_OPTS} ${SERVER_USER}@${SERVER} \
  "curl -sf http://localhost:${MCP_PORT}/health 2>/dev/null || echo '{}'")
HEALTH_PID=$(echo "${HEALTH_JSON}" | grep -oP '"pid":\s*\K[0-9]+' || echo "unknown")
HEALTH_VERSION=$(echo "${HEALTH_JSON}" | grep -oP '"version":\s*"\K[^"]+' || echo "unknown")
HEALTH_STARTED=$(echo "${HEALTH_JSON}" | grep -oP '"startedAt":\s*"\K[^"]+' || echo "unknown")
EXPECTED_PID=$(ssh ${SSH_OPTS} ${SERVER_USER}@${SERVER} "cat /tmp/arc1-e2e.pid 2>/dev/null || echo 'unknown'")

if [ "$HEALTH_PID" != "$EXPECTED_PID" ] && [ "$HEALTH_PID" != "unknown" ]; then
  echo "   FATAL: Health endpoint reports PID ${HEALTH_PID} but we started PID ${EXPECTED_PID}"
  echo "   A zombie process is serving on port ${MCP_PORT}!"
  echo "   Health response: ${HEALTH_JSON}"
  exit 1
fi

echo ""
echo "======================================================================"
echo "  MCP server running on port ${MCP_PORT}"
echo "  PID:       ${HEALTH_PID}"
echo "  Version:   ${HEALTH_VERSION}"
echo "  Started:   ${HEALTH_STARTED}"
echo "======================================================================"
echo ""

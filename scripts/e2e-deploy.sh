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

# ── Pre-flight: SAP ─────────────────────────────────────────────────
echo "-- Checking SAP system..."
SAP_STATUS=$(ssh ${SSH_OPTS} ${SERVER_USER}@${SERVER} \
  "curl -s -o /dev/null -w '%{http_code}' http://localhost:50000/sap/bc/adt/discovery 2>/dev/null || echo '000'")
if [ "$SAP_STATUS" = "000" ]; then
  echo "ERROR: SAP system not reachable at localhost:50000"
  echo "  - Check Docker container: ssh \$E2E_SERVER_USER@\$E2E_SERVER 'docker ps | grep a4h'"
  echo "  - Start SAP: ssh \$E2E_SERVER_USER@\$E2E_SERVER 'docker start a4h'"
  exit 1
fi
echo "   SAP: OK (HTTP ${SAP_STATUS})"

# ── Pre-flight: Lock ────────────────────────────────────────────────
echo "-- Checking lock status..."
LOCK_INFO=$(ssh ${SSH_OPTS} ${SERVER_USER}@${SERVER} "cat ${LOCKFILE}.info 2>/dev/null || echo 'no active lock'")
echo "   Lock: ${LOCK_INFO}"

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

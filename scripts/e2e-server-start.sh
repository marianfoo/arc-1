#!/usr/bin/env bash
# scripts/e2e-server-start.sh
# Runs ON THE SERVER inside flock. Uploaded by e2e-deploy.sh.
set -euo pipefail

DEPLOY_DIR="/opt/arc1-e2e"
MCP_PORT="${MCP_PORT:-3000}"
LOCKFILE="/tmp/arc1-e2e.lock"

echo "Lock acquired at $(date -Iseconds) (PID: $$)" > "${LOCKFILE}.info"

# Kill any previous MCP server
OLD_PID=$(cat /tmp/arc1-e2e.pid 2>/dev/null || echo "")
if [ -n "$OLD_PID" ] && kill -0 "$OLD_PID" 2>/dev/null; then
  echo "   Stopping previous MCP server (PID: $OLD_PID)..."
  kill "$OLD_PID" 2>/dev/null || true
  sleep 1
fi
pkill -f "node ${DEPLOY_DIR}/dist/index.js" 2>/dev/null || true
sleep 1

# Ensure firewall allows MCP port
iptables -C INPUT -p tcp --dport "${MCP_PORT}" -j ACCEPT 2>/dev/null || \
  iptables -I INPUT -p tcp --dport "${MCP_PORT}" -j ACCEPT

# Truncate old log
> /tmp/arc1-e2e.log

# Start MCP server
cd "${DEPLOY_DIR}"
SAP_URL=http://localhost:50000 \
SAP_USER="${SAP_USER:?SAP_USER must be set}" \
SAP_PASSWORD=$(cat "${DEPLOY_DIR}/.sap_password") \
SAP_CLIENT="${SAP_CLIENT:-001}" \
SAP_INSECURE=true \
SAP_TRANSPORT=http-streamable \
SAP_HTTP_ADDR="0.0.0.0:${MCP_PORT}" \
SAP_VERBOSE=true \
nohup node dist/index.js >> /tmp/arc1-e2e.log 2>&1 &
echo $! > /tmp/arc1-e2e.pid

# Wait for health check
for i in $(seq 1 30); do
  if curl -sf "http://localhost:${MCP_PORT}/health" > /dev/null 2>&1; then
    echo "   MCP server ready (PID: $(cat /tmp/arc1-e2e.pid))"
    exit 0
  fi
  sleep 1
done

echo ""
echo "ERROR: MCP server did not start within 30s"
echo "-- Server log (last 50 lines): --"
tail -50 /tmp/arc1-e2e.log
echo "-- End of server log --"
exit 1

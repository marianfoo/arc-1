#!/usr/bin/env bash
# scripts/e2e-stop.sh
# Stops the MCP server, collects logs, releases the lock.
set -euo pipefail

SERVER="${E2E_SERVER:?E2E_SERVER must be set}"
SERVER_USER="${E2E_SERVER_USER:?E2E_SERVER_USER must be set}"
LOG_DIR="${E2E_LOG_DIR:-/tmp/arc1-e2e-logs}"

SSH_OPTS="-o StrictHostKeyChecking=no -o ConnectTimeout=10"

mkdir -p "${LOG_DIR}"

echo ""
echo "-- Collecting MCP server logs..."

# Copy server log before stopping
scp -q ${SSH_OPTS} ${SERVER_USER}@${SERVER}:/tmp/arc1-e2e.log "${LOG_DIR}/mcp-server.log" 2>/dev/null || true

if [ -f "${LOG_DIR}/mcp-server.log" ]; then
  LINE_COUNT=$(wc -l < "${LOG_DIR}/mcp-server.log" | tr -d ' ')
  echo "   Collected ${LINE_COUNT} log lines -> ${LOG_DIR}/mcp-server.log"
else
  echo "   No server log found (server may not have started)"
fi

echo "-- Stopping MCP server..."
ssh ${SSH_OPTS} ${SERVER_USER}@${SERVER} "
  if [ -f /tmp/arc1-e2e.pid ]; then
    PID=\$(cat /tmp/arc1-e2e.pid)
    if kill -0 \$PID 2>/dev/null; then
      kill \$PID
      echo \"   Stopped MCP server (PID: \$PID)\"
    else
      echo \"   MCP server already stopped (PID: \$PID was not running)\"
    fi
    rm -f /tmp/arc1-e2e.pid
  else
    echo \"   No PID file found\"
  fi
  pkill -f 'node /opt/arc1-e2e/dist/index.js' 2>/dev/null || true
  rm -f /tmp/arc1-e2e.lock.info
" 2>/dev/null || true

echo ""
echo "-- Logs saved to: ${LOG_DIR}/"
echo "   mcp-server.log  -- MCP server stderr (audit events, errors, tool calls)"
echo ""

# Show error summary if any
if [ -f "${LOG_DIR}/mcp-server.log" ]; then
  ERROR_COUNT=$(grep -c '"level":"error"' "${LOG_DIR}/mcp-server.log" 2>/dev/null; true)
  ERROR_COUNT=${ERROR_COUNT:-0}
  if [ "$ERROR_COUNT" -gt 0 ]; then
    echo "!! Found ${ERROR_COUNT} error(s) in server log. Last 5:"
    grep '"level":"error"' "${LOG_DIR}/mcp-server.log" | tail -5
    echo ""
  fi
fi

echo "MCP server stopped. Lock released."

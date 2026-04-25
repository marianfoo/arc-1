#!/usr/bin/env bash
if [[ "${BASH_SOURCE[0]}" != "$0" ]]; then
  echo "Do not source this script. Execute it: bash ${BASH_SOURCE[0]}"
  return 1 2>/dev/null || exit 1
fi

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="${ARC1_ROOT:-}"

if [[ -z "$ROOT" ]]; then
  if [[ -f "$SCRIPT_DIR/../../package.json" ]]; then
    ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
  else
    ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"
  fi
fi

[[ -n "$ROOT" ]] || { echo "Unable to resolve ARC-1 root. Set ARC1_ROOT=/absolute/path/to/arc-1"; exit 1; }
[[ -f "$ROOT/package.json" ]] || { echo "Invalid ARC1_ROOT: $ROOT (package.json missing)"; exit 1; }
[[ -f "$ROOT/dist/index.js" ]] || { echo "Missing build artifact: $ROOT/dist/index.js. Run: (cd \"$ROOT\" && npm run build)"; exit 1; }
if [[ -n "${ARC1_EXPECT_DIST_TEXT:-}" ]] && ! grep -Fq "$ARC1_EXPECT_DIST_TEXT" "$ROOT/dist/handlers/intent.js"; then
  echo "Built dist is stale: expected text not found in dist/handlers/intent.js. Run: (cd \"$ROOT\" && npm run build)" >&2
  exit 1
fi

ENV_FILE="${ARC1_ENV_FILE:-$ROOT/.env}"
[[ -f "$ENV_FILE" ]] || { echo "Missing env file: $ENV_FILE"; exit 1; }

getv() {
  local key="$1"
  local raw
  raw="$(grep "^${key}=" "$ENV_FILE" | head -n1 | cut -d= -f2- || true)"
  printf '%s' "$raw" | tr -d '\r' | sed -E "s/^[[:space:]]+|[[:space:]]+$//g; s/^['\"]//; s/['\"]$//"
}

export SAP_URL="${SAP_URL:-$(getv SAP_URL)}"
export SAP_USER="${SAP_USER:-$(getv SAP_USER)}"
export SAP_PASSWORD="${SAP_PASSWORD:-$(getv SAP_PASSWORD)}"
export SAP_CLIENT="${SAP_CLIENT:-$(getv SAP_CLIENT)}"
export SAP_LANGUAGE="${SAP_LANGUAGE:-$(getv SAP_LANGUAGE)}"
export SAP_INSECURE="${SAP_INSECURE:-$(getv SAP_INSECURE)}"
export SAP_SYSTEM_TYPE="${SAP_SYSTEM_TYPE:-$(getv SAP_SYSTEM_TYPE)}"
export SAP_TRANSPORT=stdio

# This branch uses positive safety opt-ins. Keep writes limited to local package by default.
export SAP_ALLOW_WRITES="${SAP_ALLOW_WRITES:-true}"
export SAP_ALLOW_DATA_PREVIEW="${SAP_ALLOW_DATA_PREVIEW:-false}"
export SAP_ALLOW_FREE_SQL="${SAP_ALLOW_FREE_SQL:-false}"
export SAP_ALLOW_TRANSPORT_WRITES="${SAP_ALLOW_TRANSPORT_WRITES:-false}"
export SAP_ALLOW_GIT_WRITES="${SAP_ALLOW_GIT_WRITES:-false}"
if [[ -z "${SAP_ALLOWED_PACKAGES:-}" ]]; then
  export SAP_ALLOWED_PACKAGES='$TMP'
fi

export SAP_LANGUAGE="${SAP_LANGUAGE:-EN}"
export SAP_INSECURE="${SAP_INSECURE:-false}"
export SAP_SYSTEM_TYPE="${SAP_SYSTEM_TYPE:-auto}"
export ARC1_CACHE_FILE="${ARC1_CACHE_FILE:-$ROOT/.arc1-cache.cursor.db}"

[[ -n "$SAP_URL" ]] || { echo "Missing SAP_URL in $ENV_FILE"; exit 1; }
[[ -n "$SAP_USER" ]] || { echo "Missing SAP_USER in $ENV_FILE"; exit 1; }
[[ -n "$SAP_PASSWORD" ]] || { echo "Missing SAP_PASSWORD in $ENV_FILE"; exit 1; }
node -e 'new URL(process.argv[1])' "$SAP_URL" >/dev/null || { echo "Invalid SAP_URL: [$SAP_URL]"; exit 1; }

unset SAP_READ_ONLY SAP_BLOCK_DATA SAP_BLOCK_FREE_SQL SAP_ENABLE_TRANSPORTS SAP_ENABLE_GIT
unset SAP_ALLOWED_OPS SAP_DISALLOWED_OPS ARC1_PROFILE ARC1_API_KEY

# Run away from the repository root so dotenv cannot load legacy keys from ROOT/.env.
RUNTIME_DIR="${ARC1_RUNTIME_DIR:-$ROOT/.cursor/runtime}"
mkdir -p "$RUNTIME_DIR"
cd "$RUNTIME_DIR"

exec node "$ROOT/dist/index.js"

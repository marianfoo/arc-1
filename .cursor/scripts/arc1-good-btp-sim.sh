#!/usr/bin/env bash
if [[ "${BASH_SOURCE[0]}" != "$0" ]]; then
  echo "Do not source this script. Execute it: bash ${BASH_SOURCE[0]}"
  return 1 2>/dev/null || exit 1
fi

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

export SAP_SYSTEM_TYPE="${SAP_SYSTEM_TYPE:-btp}"
exec bash "$SCRIPT_DIR/arc1-good.sh"

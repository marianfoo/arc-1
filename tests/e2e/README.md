# E2E Tests

End-to-end tests that run real MCP tool calls against a live SAP system.

Unlike the integration tests (which call ADT client methods directly), these tests exercise the full MCP stack: JSON-RPC → HTTP transport → tool handler → ADT client → SAP.

## Prerequisites

- **SAP system** running on the E2E server (check: `curl http://$E2E_SERVER:50000/sap/bc/adt/discovery`)
- **Node.js 22+** installed on the server
- **SSH access** to the E2E server (key-based, configured via `E2E_SERVER` and `E2E_SERVER_USER` env vars)
- **SAP password** stored at `/opt/arc1-e2e/.sap_password` on the server

## Quick Start

```bash
# Build + deploy + test + stop (all-in-one):
npm run test:e2e:full

# Or step by step:
npm run build                     # 1. Build dist/
npm run test:e2e:deploy           # 2. Deploy to server, start MCP
E2E_MCP_URL=http://$E2E_SERVER:3000/mcp npm run test:e2e   # 3. Run tests
npm run test:e2e:stop             # 4. Stop server, collect logs
```

## How It Works

```
Local machine                          E2E Server ($E2E_SERVER)
┌──────────────┐   rsync dist/         ┌──────────────────┐
│ npm run build│ ──────────────────▶   │ /opt/arc1-e2e/   │
│              │   ssh: flock + start  │   dist/           │
│ npm run      │ ──────────────────▶   │   node dist/...  │
│  test:e2e:   │                       │   ↕ SAP (Docker)  │
│  deploy      │                       │   localhost:50000 │
│              │   HTTP :3000/mcp      │                   │
│ vitest       │ ◀─────────────────── │   port 3000       │
│  (MCP SDK)   │                       │                   │
│              │   ssh: stop + logs    │                   │
│ npm run      │ ──────────────────▶   │   (stopped)       │
│  test:e2e:   │                       │                   │
│  stop        │ ◀── mcp-server.log   │                   │
└──────────────┘                       └──────────────────┘
```

### Concurrency / Locking

Only one E2E run can happen at a time (single SAP system). A server-side `flock` ensures this across all callers — local devs, other developers, and GitHub Actions.

- **Two devs run simultaneously:** Second one waits up to 5 minutes, then fails with "Another E2E run is in progress"
- **GH Actions + local dev:** Same flock protects both
- **Crashed run:** Lock is auto-released (tied to SSH process, not file content)

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `E2E_MCP_URL` | MCP server URL (for test client) | `http://localhost:3000/mcp` |
| `E2E_SERVER` | Server hostname | *(set in GH secret or locally)* |
| `E2E_SERVER_USER` | SSH user | *(set in GH secret or locally)* |
| `E2E_MCP_PORT` | MCP server port on server | `3000` |
| `E2E_LOCK_TIMEOUT` | Seconds to wait for lock | `300` |
| `E2E_LOG_DIR` | Local directory for collected logs | `/tmp/arc1-e2e-logs` |

## Test Object Inventory

Persistent objects on SAP (created once, expected to stay):

| Type | Name | Package | Purpose |
|------|------|---------|---------|
| PROG | `ZARC1_TEST_REPORT` | `$TMP` | Read, diagnose, lint |
| CLAS | `ZCL_ARC1_TEST` | `$TMP` | Read, activate, context, navigate |
| CLAS | `ZCL_ARC1_TEST_UT` | `$TMP` | Unit tests (ABAP Unit) |
| INTF | `ZIF_ARC1_TEST` | `$TMP` | Read, context dependency |

Setup (`beforeAll`) checks if these exist via SAPSearch. If missing, they're created from fixtures in `tests/fixtures/abap/`.

## Adding New Tests

### 1. Add a test file

Create `tests/e2e/mynewtest.e2e.test.ts` (must end with `.e2e.test.ts`):

```typescript
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { afterAll, beforeAll, describe, it } from 'vitest';
import { callTool, connectClient, expectToolSuccess, expectToolError } from './helpers.js';

describe('My New Tests', () => {
  let client: Client;
  beforeAll(async () => { client = await connectClient(); });
  afterAll(async () => { await client?.close().catch(() => {}); });

  it('does something', async () => {
    const result = await callTool(client, 'SAPRead', { type: 'PROG', name: 'RSHOWTIM' });
    const text = expectToolSuccess(result);
    // ... your assertions
  });
});
```

### 2. Need a new SAP test object?

1. Add ABAP source to `tests/fixtures/abap/<name>.abap`
2. Add entry to `PERSISTENT_OBJECTS` in `tests/e2e/fixtures.ts`
3. The setup will auto-create it on next run

### 3. Testing errors

```typescript
it('returns error for invalid input', async () => {
  const result = await callTool(client, 'SAPRead', { type: 'FOOBAR' });
  expectToolError(result, 'Unknown SAPRead type');
});
```

`expectToolError` checks:
- `isError` is true
- No raw XML in response
- No stack traces in response
- Contains expected substring(s)

## Troubleshooting

| Symptom | Where to Look | Fix |
|---------|---------------|-----|
| Deploy fails: "Cannot SSH" | Terminal output | Check SSH key, server reachable |
| Deploy fails: "SAP not reachable" | Terminal output | `ssh $E2E_SERVER_USER@$E2E_SERVER 'docker start a4h'` |
| Deploy fails: "Could not acquire lock" | Terminal shows who holds lock | Wait, or `npm run test:e2e:stop` |
| Server won't start | Terminal shows last 50 log lines | Check SAP_PASSWORD, port conflict |
| Test fails: tool returned error | Vitest output (tool call + response) | Check `$E2E_LOG_DIR/mcp-server.log` |
| Test fails: timeout | Vitest output | SAP overloaded, increase timeout |
| GH Actions failed | Artifacts tab → `e2e-logs.zip` | Contains mcp-server.log + junit-results.xml |

### Reading the Logs

```bash
# After a test run:
ls /tmp/arc1-e2e-logs/

# View server errors only:
grep '"level":"error"' /tmp/arc1-e2e-logs/mcp-server.log

# View all tool calls with timing:
grep '"event":"tool_call_end"' /tmp/arc1-e2e-logs/mcp-server.log | \
  python3 -m json.tool | grep -E 'tool|status|durationMs|errorMessage'

# Find a specific failed tool call:
grep 'SAPRead.*DDLS' /tmp/arc1-e2e-logs/mcp-server.log
```

## Known Issues

- **SAPQuery can be slow:** First query after SAP restart may take 10-15s (ABAP SQL engine warmup). Subsequent queries are fast.

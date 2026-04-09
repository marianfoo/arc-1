# CLAUDE.md - AI Assistant Guidelines

This file provides context for AI assistants (Claude, etc.) working on this project.

## Project Overview

**ARC-1** is a TypeScript MCP (Model Context Protocol) server for SAP ABAP Development Tools (ADT). It provides 11 intent-based tools (SAPRead, SAPSearch, SAPWrite, SAPActivate, SAPNavigate, SAPQuery, SAPTransport, SAPContext, SAPLint, SAPDiagnose, SAPManage) for use with Claude and other MCP-compatible LLMs.

Distributed as an npm package (`arc-1`) and Docker image (`ghcr.io/marianfoo/arc-1`).

## Quick Reference

### Build & Test

```bash
# Install dependencies
npm ci

# Build (TypeScript → dist/)
npm run build

# Run unit tests
npm test

# Run tests in watch mode
npm run test:watch

# Type check
npm run typecheck

# Lint
npm run lint

# Run integration tests (SAP system optional — skipped if not configured)
npm run test:integration

# Run BTP ABAP integration tests (local only — needs BTP service key + browser login)
TEST_BTP_SERVICE_KEY_FILE=~/.config/arc-1/btp-abap-service-key.json npm run test:integration:btp

# Dev mode (stdio transport)
npm run dev

# Dev mode (HTTP Streamable transport)
npm run dev:http
```

### Configuration (Priority: CLI > Env > .env > Defaults)

```bash
# Using environment variables
SAP_URL=http://host:50000 SAP_USER=user SAP_PASSWORD=pass npm run dev

# Using .env file (copy .env.example to .env)
npm run dev
```

| Variable / Flag | Description |
|-----------------|-------------|
| `SAP_URL` / `--url` | SAP system URL (e.g., `http://host:50000`) |
| `SAP_USER` / `--user` | SAP username |
| `SAP_PASSWORD` / `--password` | SAP password |
| `SAP_CLIENT` / `--client` | SAP client number (default: 100) |
| `SAP_LANGUAGE` / `--language` | SAP language (default: EN) |
| `SAP_INSECURE` / `--insecure` | Skip TLS verification (default: false) |
| `SAP_TRANSPORT` / `--transport` | MCP transport: `stdio` (default) or `http-streamable` |
| `SAP_READ_ONLY` / `--read-only` | Block all write operations (default: false) |
| `SAP_BLOCK_DATA` / `--block-data` | Block named table preview (default: false) |
| `SAP_BLOCK_FREE_SQL` / `--block-free-sql` | Block RunQuery execution (default: false) |
| `SAP_ALLOWED_OPS` / `--allowed-ops` | Whitelist operation types (e.g., "RSQ") |
| `SAP_DISALLOWED_OPS` / `--disallowed-ops` | Blacklist operation types (e.g., "CDUA") |
| `SAP_ALLOWED_PACKAGES` / `--allowed-packages` | Restrict to packages (default: `$TMP`; supports wildcards: "Z*") |
| `SAP_ENABLE_TRANSPORTS` / `--enable-transports` | Enable CTS transport management (default: false) |
| `ARC1_API_KEY` / `--api-key` | API key for MCP endpoint auth (Bearer token) |
| `ARC1_API_KEYS` / `--api-keys` | Multiple API keys with profiles (`key1:viewer,key2:developer`) |
| `SAP_OIDC_ISSUER` / `--oidc-issuer` | OIDC issuer URL for JWT validation |
| `SAP_OIDC_AUDIENCE` / `--oidc-audience` | OIDC audience for JWT validation |
| `SAP_BTP_SERVICE_KEY` / `--btp-service-key` | BTP ABAP service key JSON (direct connection) |
| `SAP_BTP_SERVICE_KEY_FILE` / `--btp-service-key-file` | Path to BTP ABAP service key file |
| `SAP_BTP_OAUTH_CALLBACK_PORT` / `--btp-oauth-callback-port` | OAuth browser callback port (default: auto) |
| `SAP_SYSTEM_TYPE` / `--system-type` | System type: `auto` (default), `btp`, or `onprem` |
| `ARC1_TOOL_MODE` / `--tool-mode` | Tool mode: `standard` (11 tools, default) or `hyperfocused` (1 universal SAP tool, ~200 tokens) |
| `SAP_ABAPLINT_CONFIG` / `--abaplint-config` | Path to custom abaplint.jsonc config file for lint rules |
| `SAP_LINT_BEFORE_WRITE` / `--lint-before-write` | Enable pre-write lint validation (default: true) |
| `ARC1_CACHE` / `--cache` | Cache mode: `auto` (default), `memory`, `sqlite`, `none` |
| `ARC1_CACHE_FILE` / `--cache-file` | SQLite cache file path (default: `.arc1-cache.db`) |
| `ARC1_CACHE_WARMUP` / `--cache-warmup` | Pre-warm cache on startup via TADIR scan (default: false) |
| `ARC1_CACHE_WARMUP_PACKAGES` / `--cache-warmup-packages` | Package filter for warmup (e.g., "Z*,Y*") |
| `SAP_BTP_DESTINATION` | BTP Destination name (overrides URL/user/password) |
| `SAP_BTP_PP_DESTINATION` | BTP PP Destination name (PrincipalPropagation type) |
| `SAP_PP_ENABLED` / `--pp-enabled` | Enable per-user principal propagation (default: false) |
| `SAP_PP_STRICT` / `--pp-strict` | PP failure = error, no fallback to shared client (default: false) |
| `ARC1_PROFILE` / `--profile` | Safety profile shortcut: `viewer`, `viewer-data`, `viewer-sql`, `developer`, `developer-data`, `developer-sql` |

## Codebase Structure

```
src/
├── index.ts                    # MCP server entry point
├── cli.ts                      # CLI entry point (commander)
├── server/
│   ├── server.ts               # MCP server setup, tool registration
│   ├── config.ts               # Config parser (CLI > env > .env > defaults)
│   ├── http.ts                 # HTTP Streamable transport + API key/OIDC auth
│   ├── logger.ts               # Structured logger (stderr only, never stdout)
│   ├── types.ts                # ServerConfig type, defaults
│   ├── audit.ts                # Audit logging (tool calls, elicitation events)
│   ├── context.ts              # MCP context helpers
│   ├── elicit.ts               # MCP elicitation (confirmDestructive, selectOption, promptString)
│   ├── xsuaa.ts                # XSUAA JWT validation for BTP
│   └── sinks/                  # Audit log sinks
│       ├── types.ts            # Sink interface
│       ├── stderr.ts           # Stderr sink
│       ├── file.ts             # File sink
│       └── btp-auditlog.ts     # BTP Audit Log Service sink
├── handlers/
│   ├── intent.ts               # 11 intent-based tool router (handleToolCall)
│   ├── tools.ts                # Tool definitions (names, descriptions, JSON schemas)
│   ├── schemas.ts              # Zod v4 input schemas for all MCP tools (runtime validation)
│   ├── zod-errors.ts           # Zod validation error formatting for LLM clients
│   └── hyperfocused.ts         # Hyperfocused mode (single SAP tool, ~200 tokens)
├── adt/
│   ├── client.ts               # ADT client facade (all read operations)
│   ├── http.ts                 # HTTP transport (undici/fetch, CSRF, cookies, sessions)
│   ├── errors.ts               # Typed error classes (AdtApiError, AdtSafetyError)
│   ├── safety.ts               # Safety system (read-only, op filter, pkg filter)
│   ├── features.ts             # Feature detection (auto/on/off)
│   ├── config.ts               # ADT client configuration types
│   ├── types.ts                # ADT response types
│   ├── xml-parser.ts           # XML parser (fast-xml-parser v5)
│   ├── btp.ts                  # BTP Destination Service + Connectivity proxy
│   ├── cookies.ts              # Cookie file parsing (Netscape format)
│   ├── oauth.ts                # OAuth 2.0 for BTP ABAP Environment (browser login, token lifecycle)
│   ├── crud.ts                 # CRUD operations (lock, create, update, delete)
│   ├── devtools.ts             # Dev tools (syntax check, activate, publish/unpublish SRVB, unit tests)
│   ├── diagnostics.ts          # Runtime diagnostics (short dumps ST22, ABAP profiler traces)
│   ├── codeintel.ts            # Code intelligence (find def, refs, where-used, completion)
│   ├── ui5-repository.ts       # UI5 ABAP Repository OData client (BSP deploy queries)
│   └── transport.ts            # CTS transport management
├── context/
│   ├── types.ts                # Context compression types
│   ├── deps.ts                 # AST-based dependency extraction (@abaplint/core)
│   ├── contract.ts             # Public API contract extraction
│   ├── compressor.ts           # Orchestrator (fetch + compress + format)
│   └── method-surgery.ts       # Method-level extraction, listing, and surgical replacement
├── cache/
│   ├── cache.ts                # Cache interface + types (sources, dep graphs, edges, APIs)
│   ├── memory.ts               # In-memory cache (default for stdio)
│   ├── sqlite.ts               # SQLite cache (default for http-streamable)
│   ├── caching-layer.ts        # Orchestration: source + dep caching, invalidation
│   └── warmup.ts               # Pre-warmer: TADIR scan, bulk fetch, edge index
├── aff/
│   ├── validator.ts            # AFF JSON schema validator (Ajv 2020-12)
│   └── schemas/                # Bundled AFF JSON schemas (from SAP/abap-file-formats)
│       ├── clas-v1.json        # Class schema
│       ├── intf-v1.json        # Interface schema
│       ├── prog-v1.json        # Program schema
│       ├── ddls-v1.json        # CDS view schema
│       ├── bdef-v1.json        # Behavior definition schema
│       ├── srvd-v1.json        # Service definition schema
│       └── srvb-v1.json        # Service binding schema
└── lint/
    ├── lint.ts                 # ABAP lint wrapper (@abaplint/core)
    ├── config-builder.ts       # System-aware abaplint config builder (cloud/onprem presets)
    └── presets/
        ├── cloud.ts            # BTP/Steampunk lint preset (strict cloud rules)
        └── onprem.ts           # On-premise lint preset (relaxed rules)

tests/
├── unit/                       # Unit tests (no SAP system needed)
│   ├── adt/                    # ADT client tests
│   ├── cache/                  # Cache tests
│   ├── context/                # Context compression tests
│   ├── handlers/               # Handler tests
│   ├── server/                 # Server tests
│   ├── lint/                   # Lint tests
│   ├── aff/                    # AFF validator tests
│   └── cli/                    # CLI tests
├── integration/                # Integration tests (need SAP credentials)
│   ├── helpers.ts              # Test client factory, skip logic
│   ├── adt.integration.test.ts # Live SAP tests
│   ├── context.integration.test.ts # SAPContext live tests
│   ├── audit-logging.integration.test.ts # Audit logging tests
│   ├── btp-abap.integration.test.ts # BTP ABAP tests
│   └── elicitation.integration.test.ts # MCP elicitation tests
└── fixtures/
    ├── xml/                    # Sample ADT XML responses
    └── abap/                   # Sample ABAP source files
```

## Key Files for Common Tasks

| Task | Files |
|------|-------|
| Add new read operation | `src/adt/client.ts`, `src/handlers/intent.ts`, `src/handlers/tools.ts` (for structured format, also `src/adt/xml-parser.ts`, `src/adt/types.ts`) |
| Add OData-based read (non-ADT) | `src/adt/ui5-repository.ts`, `src/handlers/intent.ts`, `src/handlers/tools.ts`, `src/handlers/schemas.ts` |
| Add new tool type | `src/handlers/tools.ts`, `src/handlers/schemas.ts`, `src/handlers/intent.ts` |
| Add/modify tool input schema | `src/handlers/schemas.ts`, `src/handlers/tools.ts` |
| Add method-level surgery | `src/context/method-surgery.ts` |
| Modify hyperfocused mode | `src/handlers/hyperfocused.ts`, `src/handlers/tools.ts` |
| Add XML response parser | `src/adt/xml-parser.ts` |
| Add safety check | `src/adt/safety.ts` |
| Add lint rule config | `src/lint/lint.ts`, `src/lint/config-builder.ts`, `src/lint/presets/` |
| Add dependency pattern | `src/context/deps.ts` |
| Add contract extraction for new type | `src/context/contract.ts` |
| Modify context output format | `src/context/compressor.ts` |
| Add runtime diagnostic | `src/adt/diagnostics.ts`, `src/handlers/intent.ts` |
| Add audit logging | `src/server/audit.ts`, `src/server/sinks/` |
| Add elicitation prompt | `src/server/elicit.ts` |
| Add XSUAA/JWT auth | `src/server/xsuaa.ts` |
| Modify scope enforcement | `src/handlers/intent.ts` (TOOL_SCOPES), `src/server/server.ts` (tool listing filter) |
| Modify OIDC token handling | `src/server/http.ts` (validateOidcToken, ~line 274) |
| Add/modify auth scopes | `xs-security.json`, `src/server/xsuaa.ts`, `src/server/http.ts`, `src/handlers/intent.ts` |
| Add safety config option | `src/adt/safety.ts`, `src/server/config.ts`, `src/server/types.ts` |
| Add feature probe | `src/adt/features.ts` |
| Add E2E test | `tests/e2e/`, helpers in `tests/e2e/helpers.ts`, fixtures in `tests/e2e/fixtures.ts` |
| Modify object caching | `src/cache/caching-layer.ts`, `src/cache/cache.ts` |
| Add cache warmup feature | `src/cache/warmup.ts`, `src/server/server.ts` |
| Add integration test | `tests/integration/adt.integration.test.ts` |
| Add BTP ABAP integration test | `tests/integration/btp-abap.integration.test.ts` |
| BTP ABAP Environment auth | `src/adt/oauth.ts`, `src/server/server.ts` |
| Add AFF schema | `src/aff/schemas/` (add `{type}-v1.json`), `src/aff/validator.ts` (add type mapping) |
| Modify AFF validation | `src/aff/validator.ts`, `src/handlers/intent.ts` (create/batch_create paths) |

## Architecture: Request Flow

Understanding how a request flows through the system is essential for working on any part of ARC-1:

```
MCP Client (Claude Desktop, Cursor, Copilot Studio)
  │
  ▼
MCP Transport (stdio or HTTP Streamable)
  │
  ├─ stdio: no auth, safety config is the only gate
  │
  ├─ HTTP: auth layer (server/http.ts)
  │   ├─ XSUAA OAuth (xsuaa.ts) → checkLocalScope() → AuthInfo { scopes, clientId, userName }
  │   ├─ OIDC JWT (http.ts) → jwtVerify() → AuthInfo { scopes }
  │   └─ API key (http.ts) → exact match → AuthInfo { scopes: all }
  │
  ▼
Tool Call Handler (server/server.ts)
  │
  ├─ Per-user client? (PP: ppEnabled + JWT → BTP Destination → per-user SAP session)
  │
  ▼
handleToolCall (handlers/intent.ts)
  │
  ├─ 1. Scope check: TOOL_SCOPES[toolName] vs authInfo.scopes (only when authInfo present)
  ├─ 2. Zod validation: getToolSchema(toolName) → safeParse(args) (rejects invalid input with LLM-friendly errors)
  ├─ 3. Route to handler: handleSAPRead(), handleSAPWrite(), etc.
  ├─ 4. Package check: checkPackage(safety, packageName) (for SAPWrite create)
  │
  ▼
ADT Client Method (adt/client.ts, crud.ts, devtools.ts, etc.)
  │
  ├─ 5. Safety check: checkOperation(safety, OperationType.Read, 'GetProgram')
  │
  ▼
HTTP Request (adt/http.ts)
  │
  ├─ CSRF token management (auto-fetch via HEAD, refresh on 403)
  ├─ Cookie/session management
  ├─ Stateful sessions for lock→modify→unlock sequences
  │
  ▼
SAP ABAP System (ADT REST API)
  └─ SAP-level authorization (S_DEVELOP, S_ADT_RES, S_TRANSPRT, etc.)
```

**Key invariant:** Checks are additive — scope check AND safety check AND SAP auth must all pass. If any layer blocks, the operation fails.

## Authorization & Safety System

### Safety System (`src/adt/safety.ts`)

Server-level config, set at startup via env vars / CLI flags. Applies to ALL users.

**Operation Types** (single-character codes, used in `allowedOps`/`disallowedOps`):
```
R = Read       S = Search     Q = Query (table preview)   F = FreeSQL
C = Create     U = Update     D = Delete                  A = Activate
T = Test       L = Lock       I = Intelligence             W = Workflow
X = Transport
```

Write ops blocked by `readOnly`: `CDUAW`. All 36+ ADT endpoints have `checkOperation()` guards.

### Scope Enforcement (`src/handlers/intent.ts`)

`TOOL_SCOPES` maps each MCP tool to a required scope. Only enforced when `authInfo` is present (HTTP transport with auth). Stdio has no auth → all tools allowed.

```typescript
const TOOL_SCOPES: Record<string, string> = {
  SAPRead: 'read',      SAPWrite: 'write',
  SAPSearch: 'read',    SAPActivate: 'write',
  SAPQuery: 'sql',      SAPManage: 'write',
  SAPNavigate: 'read',  SAPTransport: 'write',
  SAPContext: 'read',   SAPLint: 'read',
  SAPDiagnose: 'read',
};
```

### Auth Providers (Chained)

In HTTP mode, `src/server/http.ts` and `src/server/xsuaa.ts` handle auth:
1. **XSUAA** (BTP): OAuth proxy, `checkLocalScope()` extracts read/write/data/sql/admin
2. **OIDC** (self-hosted): JWT verification via JWKS, scopes from `scope`/`scp` claim
3. **API key**: Exact match, full access

### Principal Propagation

When `ppEnabled=true`, the user's JWT is used to get a per-user SAP session via BTP Destination Service. SAP sees the real user identity → SAP-level auth applies per-user. ARC-1 scopes still enforced as defense-in-depth.

### Important: POST Needed for Read Operations

7+ "read" endpoints use HTTP POST: code intelligence (findDefinition, findWhereUsed, getCompletion), syntax check, unit tests, ATC, table preview. A read-only SAP user needs `S_ADT_RES ACTVT=01 AND 02`.

## Code Patterns

### ADT Client Method

```typescript
async getProgram(name: string): Promise<string> {
  checkOperation(this.safety, OperationType.Read, 'GetProgram');
  const resp = await this.http.get(`/sap/bc/adt/programs/programs/${encodeURIComponent(name)}/source/main`);
  return resp.body;
}
```

### Handler Pattern (intent.ts)

```typescript
case 'PROG':
  return textResult(await client.getProgram(name));
case 'STRU':
  return textResult(await client.getStructure(name));
case 'DOMA': {
  const domain = await client.getDomain(name);
  return textResult(JSON.stringify(domain, null, 2));
}
```

### Safety Check

```typescript
checkOperation(this.safety, OperationType.Create, 'CreateObject');
// Throws AdtSafetyError if blocked by readOnly, allowedOps, etc.
```

### CRUD Pattern (lock → modify → unlock)

```typescript
await http.withStatefulSession(async (session) => {
  const lockHandle = await lockObject(session, objectUrl);
  try {
    await updateSource(session, sourceUrl, source, lockHandle, transport);
  } finally {
    await unlockObject(session, objectUrl, lockHandle);
  }
});
```

## Testing

### Test Levels

| Level | Command | SAP Required | Count | Config |
|-------|---------|--------------|-------|--------|
| Unit | `npm test` | No | 1148+ | `vitest.config.ts` |
| Integration | `npm run test:integration` | Yes (`TEST_SAP_URL`) | ~50 | `vitest.integration.config.ts` |
| BTP Integration | `npm run test:integration:btp` | Yes (`TEST_BTP_SERVICE_KEY_FILE`) | 28 | same |
| E2E | `npm run test:e2e` | Yes (MCP server running) | ~30 | `tests/e2e/vitest.e2e.config.ts` |

### Unit Test Mocking Pattern

All unit tests mock the HTTP layer via undici. Key helper: `tests/helpers/mock-fetch.ts`

```typescript
// Mock setup (top of test file)
const mockFetch = vi.fn();
vi.mock('undici', async (importOriginal) => {
  const actual = await importOriginal<typeof import('undici')>();
  return { ...actual, fetch: mockFetch };
});

// In beforeEach
vi.resetAllMocks();
mockFetch.mockResolvedValue(mockResponse(200, 'source code', { 'x-csrf-token': 'T' }));

// Helper to build mock Response objects
import { mockResponse } from '../../helpers/mock-fetch.js';
```

### Integration Tests
- Skipped automatically when `TEST_SAP_URL` is not set
- Uses `TEST_SAP_*` env vars (falls back to `SAP_*`)
- `getTestClient()` factory in `tests/integration/helpers.ts` creates pre-configured clients
- Sequential execution to avoid SAP session conflicts

### E2E Tests
- Full MCP protocol tests via `@modelcontextprotocol/sdk` client
- Connect to running ARC-1 server (`E2E_MCP_URL`, default: `http://localhost:3000/mcp`)
- `connectClient()` / `callTool()` / `expectToolSuccess()` / `expectToolError()` helpers in `tests/e2e/helpers.ts`
- `tests/e2e/setup.ts` ensures persistent test objects exist on SAP
- `tests/e2e/fixtures.ts` defines test objects (ZARC1_TEST_REPORT, ZCL_ARC1_TEST, etc.)
- 60s test timeout, 120s hook timeout, sequential execution

### BTP ABAP Integration Tests (local only)
- Skipped automatically when `TEST_BTP_SERVICE_KEY_FILE` is not set
- Run: `TEST_BTP_SERVICE_KEY_FILE=~/.config/arc-1/btp-abap-service-key.json npm run test:integration:btp`
- Tests BTP-specific behavior: OAuth login, restricted ABAP, released APIs, component differences
- **Not run in CI** — BTP free tier instances stop nightly and expire after 90 days
- Requires interactive browser login (OAuth Authorization Code flow)

## Technology Stack

| Technology | Purpose |
|-----------|---------|
| TypeScript 5.8 | Language |
| Node.js 22+ | Runtime |
| `@modelcontextprotocol/sdk` | MCP protocol |
| `@abaplint/core` | ABAP lexer/parser/linter |
| `undici` | HTTP client (fetch, CSRF, cookies, proxy, TLS) |
| `fast-xml-parser` v5 | ADT XML parsing |
| `better-sqlite3` | SQLite cache |
| `commander` | CLI framework |
| `ajv` v8 (2020-12) | AFF JSON schema validation |
| `zod` v4 | Tool input validation & error formatting |
| `vitest` | Testing |
| `biome` | Linting + formatting |

## Releasing

Automated via [release-please](https://github.com/googleapis/release-please). No manual version bumps or changelog edits.

### Commit conventions

Use [Conventional Commits](https://www.conventionalcommits.org/) in PR titles / commit messages:
- `feat:` → minor bump, `fix:` → patch bump, `feat!:` / `BREAKING CHANGE:` → major bump
- `chore:`, `docs:`, `ci:` → no release triggered

### Process

1. Merge PRs to `main` with conventional commit messages
2. release-please auto-creates/updates a Release PR with version bump + `CHANGELOG.md`
3. Merge the Release PR to trigger: npm publish, Docker push, GitHub Release

### Key files

| File | Purpose |
|------|---------|
| `.github/workflows/release.yml` | release-please + npm publish + Docker push |
| `.github/workflows/docker.yml` | Dev `latest` Docker image on every main push |
| `release-please-config.json` | Config: extra files to version-bump |
| `.release-please-manifest.json` | Tracks current version |
| `src/server/server.ts` | `VERSION` constant (auto-bumped via `x-release-please-version` marker) |

### Version is maintained in two places

- `package.json` — bumped by release-please automatically
- `src/server/server.ts` `VERSION` constant — bumped via the `x-release-please-version` annotation comment

### npm trusted publishing

npm publish uses OIDC trusted publishing — no `NPM_TOKEN` secret, no token rotation.

Requirements (all already configured):
- **npmjs.com**: Trusted Publisher linked to `marianfoo/arc-1` / `release.yml`
- **package.json**: `repository.url` must match the GitHub repo URL (npm verifies this against the provenance bundle)
- **npm 11.5+**: The publish job installs `npm@latest` because Node 22's bundled npm 10.x doesn't support the OIDC handshake
- **GitHub Actions**: `id-token: write` permission on the publish job

## Security & Architectural Invariants

- **stdout is sacred**: All logging goes to stderr. stdout is exclusively for MCP JSON-RPC protocol messages. Any `console.log` breaks the protocol.
- Never commit `.env`, `cookies.txt`, or `.arc1.json` (all in `.gitignore`)
- Sensitive fields (password, token, cookie) are redacted in logs
- CSRF tokens are auto-managed by `src/adt/http.ts` (fetch via HEAD, refresh on 403)
- **Safety config is the server ceiling** — per-user scopes (JWT) can only restrict further, never expand beyond server config
- **All ADT endpoints have safety guards** — every `http.get/post/put/delete` call is preceded by `checkOperation()`. No unguarded HTTP calls.
- **Error types matter**: `AdtApiError` (SAP HTTP error), `AdtSafetyError` (blocked by config), `AdtNetworkError` (connectivity). `intent.ts` formats these with LLM-friendly hints.
- **Stateful sessions**: Lock→modify→unlock sequences must use `http.withStatefulSession()` to share cookies/CSRF tokens across requests

## History

This project was migrated from Go to TypeScript on 2026-03-26.

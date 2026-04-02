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
| `SAP_BLOCK_FREE_SQL` / `--block-free-sql` | Block RunQuery execution (default: false) |
| `SAP_ALLOWED_OPS` / `--allowed-ops` | Whitelist operation types (e.g., "RSQ") |
| `SAP_DISALLOWED_OPS` / `--disallowed-ops` | Blacklist operation types (e.g., "CDUA") |
| `SAP_ALLOWED_PACKAGES` / `--allowed-packages` | Restrict to packages (supports wildcards: "Z*") |
| `ARC1_API_KEY` / `--api-key` | API key for MCP endpoint auth (Bearer token) |
| `SAP_OIDC_ISSUER` / `--oidc-issuer` | OIDC issuer URL for JWT validation |
| `SAP_OIDC_AUDIENCE` / `--oidc-audience` | OIDC audience for JWT validation |
| `SAP_BTP_SERVICE_KEY` / `--btp-service-key` | BTP ABAP service key JSON (direct connection) |
| `SAP_BTP_SERVICE_KEY_FILE` / `--btp-service-key-file` | Path to BTP ABAP service key file |
| `SAP_BTP_OAUTH_CALLBACK_PORT` / `--btp-oauth-callback-port` | OAuth browser callback port (default: auto) |
| `SAP_SYSTEM_TYPE` / `--system-type` | System type: `auto` (default), `btp`, or `onprem` |
| `SAP_BTP_DESTINATION` | BTP Destination name (overrides URL/user/password) |
| `SAP_BTP_PP_DESTINATION` | BTP PP Destination name (PrincipalPropagation type) |
| `SAP_PP_ENABLED` / `--pp-enabled` | Enable per-user principal propagation (default: false) |
| `SAP_PP_STRICT` / `--pp-strict` | PP failure = error, no fallback to shared client (default: false) |

## Codebase Structure

```
ts-src/
├── index.ts                    # MCP server entry point
├── cli.ts                      # CLI entry point (commander)
├── server/
│   ├── server.ts               # MCP server setup, tool registration
│   ├── config.ts               # Config parser (CLI > env > .env > defaults)
│   ├── http.ts                 # HTTP Streamable transport + API key/OIDC auth
│   ├── logger.ts               # Structured logger (stderr only, never stdout)
│   └── types.ts                # ServerConfig type, defaults
├── handlers/
│   ├── intent.ts               # 11 intent-based tool router (handleToolCall)
│   └── tools.ts                # Tool definitions (names, descriptions, schemas)
├── adt/
│   ├── client.ts               # ADT client facade (all read operations)
│   ├── http.ts                 # HTTP transport (axios, CSRF, cookies, sessions)
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
│   ├── devtools.ts             # Dev tools (syntax check, activate, unit tests)
│   ├── diagnostics.ts          # Runtime diagnostics (short dumps ST22, ABAP profiler traces)
│   ├── codeintel.ts            # Code intelligence (find def, refs, completion)
│   └── transport.ts            # CTS transport management
├── context/
│   ├── types.ts                # Context compression types
│   ├── deps.ts                 # AST-based dependency extraction (@abaplint/core)
│   ├── contract.ts             # Public API contract extraction
│   └── compressor.ts           # Orchestrator (fetch + compress + format)
├── cache/
│   ├── cache.ts                # Cache interface + types
│   ├── memory.ts               # In-memory cache
│   └── sqlite.ts               # SQLite cache (better-sqlite3)
└── lint/
    └── lint.ts                 # ABAP lint wrapper (@abaplint/core)

tests/
├── unit/                       # Unit tests (no SAP system needed)
│   ├── adt/                    # ADT client tests
│   ├── cache/                  # Cache tests
│   ├── context/                # Context compression tests
│   ├── handlers/               # Handler tests
│   ├── server/                 # Server tests
│   ├── lint/                   # Lint tests
│   └── cli/                    # CLI tests
├── integration/                # Integration tests (need SAP credentials)
│   ├── helpers.ts              # Test client factory, skip logic
│   ├── adt.integration.test.ts # Live SAP tests
│   └── context.integration.test.ts # SAPContext live tests
└── fixtures/
    └── xml/                    # Sample ADT XML responses
```

## Key Files for Common Tasks

| Task | Files |
|------|-------|
| Add new read operation | `ts-src/adt/client.ts`, `ts-src/handlers/intent.ts` |
| Add new tool type | `ts-src/handlers/tools.ts`, `ts-src/handlers/intent.ts` |
| Add XML response parser | `ts-src/adt/xml-parser.ts` |
| Add safety check | `ts-src/adt/safety.ts` |
| Add lint rule config | `ts-src/lint/lint.ts` |
| Add dependency pattern | `ts-src/context/deps.ts` |
| Add contract extraction for new type | `ts-src/context/contract.ts` |
| Modify context output format | `ts-src/context/compressor.ts` |
| Add runtime diagnostic | `ts-src/adt/diagnostics.ts`, `ts-src/handlers/intent.ts` |
| Add integration test | `tests/integration/adt.integration.test.ts` |
| Add BTP ABAP integration test | `tests/integration/btp-abap.integration.test.ts` |
| BTP ABAP Environment auth | `ts-src/adt/oauth.ts`, `ts-src/server/server.ts` |

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
```

### Safety Check

```typescript
checkOperation(this.safety, OperationType.Create, 'CreateObject');
// Throws AdtSafetyError if blocked
```

## Testing

### Unit Tests (546 tests)
- No SAP system required — always run with `npm test`
- Mock HTTP via `vi.mock('axios', ...)`
- XML fixtures in `tests/fixtures/xml/`

### Integration Tests (on-premise)
- Skipped automatically when `TEST_SAP_URL` is not set
- Run: `npm run test:integration`
- Uses `TEST_SAP_*` env vars (falls back to `SAP_*`)

### BTP ABAP Integration Tests (28 tests, local only)
- Skipped automatically when `TEST_BTP_SERVICE_KEY_FILE` is not set
- Run: `TEST_BTP_SERVICE_KEY_FILE=~/.config/arc-1/btp-abap-service-key.json npm run test:integration:btp`
- Tests BTP-specific behavior: OAuth login, restricted ABAP, released APIs, component differences
- **Not run in CI** — BTP free tier instances stop nightly and expire after 90 days
- Requires interactive browser login (OAuth Authorization Code flow)

## Technology Stack

| Technology | Purpose |
|-----------|---------|
| TypeScript 5.8 | Language |
| Node.js 20+ | Runtime |
| `@modelcontextprotocol/sdk` | MCP protocol |
| `@abaplint/core` | ABAP lexer/parser/linter |
| `axios` | HTTP client (CSRF, cookies) |
| `fast-xml-parser` v5 | ADT XML parsing |
| `better-sqlite3` | SQLite cache |
| `commander` | CLI framework |
| `zod` v3 | Input validation |
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
| `ts-src/server/server.ts` | `VERSION` constant (auto-bumped via `x-release-please-version` marker) |

### Version is maintained in two places

- `package.json` — bumped by release-please automatically
- `ts-src/server/server.ts` `VERSION` constant — bumped via the `x-release-please-version` annotation comment

### npm trusted publishing

npm publish uses OIDC trusted publishing — no `NPM_TOKEN` secret, no token rotation.

Requirements (all already configured):
- **npmjs.com**: Trusted Publisher linked to `marianfoo/arc-1` / `release.yml`
- **package.json**: `repository.url` must match the GitHub repo URL (npm verifies this against the provenance bundle)
- **npm 11.5+**: The publish job installs `npm@latest` because Node 22's bundled npm 10.x doesn't support the OIDC handshake
- **GitHub Actions**: `id-token: write` permission on the publish job

## Security Notes

- Never commit `.env`, `cookies.txt`, or `.arc1.json` (all in `.gitignore`)
- All logging goes to stderr (stdout reserved for MCP JSON-RPC)
- Sensitive fields (password, token, cookie) are redacted in logs
- CSRF tokens are auto-managed by `ts-src/adt/http.ts`

## History

This project was migrated from Go to TypeScript on 2026-03-26.

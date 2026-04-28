# ETag Conditional GET + Inactive Objects Endpoint Fix

## Overview

Fixes [GitHub issue #183](https://github.com/marianfoo/arc-1/issues/183) (stale source after external edits) by adopting HTTP-standard `If-None-Match` conditional GET on the source-fetching code path, and along the way fixes a long-standing path bug in the inactive-objects listing endpoint that has caused `SAPRead(type='INACTIVE_OBJECTS')` to silently 404 on every system newer than ~SAP_BASIS 7.40.

The conditional-GET design replaces the current "cache forever" behaviour with a content-validated cache: each cached source carries the SAP-emitted `etag`, every read sends `If-None-Match: <etag>`, and the server is the source of truth for freshness — 304 Not Modified means cached body is still authoritative, 200 means the body changed and cache must be replaced. No TTL, no clock dependency, no system-type detection. Verified live on a4h (S/4HANA 2023) and confirmed by primary SAP Notes evidence (notes 1760222, 1814370, 1940316) to predate SAP_BASIS 7.50, so the same mechanism works on every release ARC-1 supports.

The inactive-objects fix is a one-character path change (`/activation/inactive` → `/activation/inactiveobjects`) plus a parser update for the actual server response shape (`<ioc:ref>` instead of the previously-assumed `<adtcore:objectReference>`). The current parser was written against an inferred shape that the live server does not emit, and the misleading "Inactive objects listing is not available on this SAP system" fallback in the handler has been masking the bug.

Both fixes are independent; PR 1 (Task 1) ships first as a standalone bug fix because it is small and low-risk.

## Context

### Current State

**Inactive endpoint (wasted roundtrip + missing rich data):**
- `src/adt/client.ts:464-478` already has a fallback: it tries `/sap/bc/adt/activation/inactive` first, catches the 404, then retries `/sap/bc/adt/activation/inactiveobjects`. The endpoint listing therefore *works* on modern systems via this fallback — the diagnosis in earlier drafts of this plan ("404s on every system newer than 7.40") was wrong. What the current code actually does is waste one 404 roundtrip on every list call against any system newer than ~7.40.
- Both attempts use `Accept: application/xml`, which causes the server to return the flat `<adtcore:objectReferences>` shape — a list of object URIs/names with no metadata. Live verification confirmed the same endpoint returns the rich `<ioc:inactiveObjects>` shape (with `ioc:user`, `ioc:deleted`, sibling `<ioc:transport><ioc:ref>` for transport context) when the request specifies `Accept: application/vnd.sap.adt.inactivectsobjects.v1+xml`. The vendor MIME is content-negotiated and works on both S/4HANA 2023 and NW 7.50 SP02.
- `src/adt/xml-parser.ts:1035-1055` (`parseInactiveObjects`) only handles the flat `<adtcore:objectReference>` shape. It silently returns an empty list when given the rich ioc shape — so even if the client switched to vendor MIME, the parser would discard the new fields.
- `src/handlers/intent.ts:1235-1249` catches a 404 and returns *"Inactive objects listing is not available on this SAP system"* — only triggered if BOTH endpoint paths fail, which is rare in practice. The message is misleading rather than always-firing.
- The fixture at `tests/fixtures/xml/inactive-objects.xml` is in the flat shape (same shape NW 7.50 returns when given the generic Accept). It is not "fictional" — keep it as the legacy/flat-shape coverage. The plan adds a NEW fixture for the rich ioc shape.

**Cache freshness (the issue #183 reproducer):**
- `CachedSource` schema in `src/cache/cache.ts:62-69` has `cachedAt` but no `etag` field. `Cache.putSource` and `Cache.getSource` accept only `(objectType, objectName)` — no `version` dimension.
- `MemoryCache` and `SqliteCache` both store source forever once written. No TTL check, no etag round-trip, no conditional GET. `cached_at` column in SQLite is written but never read back.
- `CachingLayer.getSource` at `src/cache/caching-layer.ts:62-77` always returns cached source on hit without revalidation. `invalidate` is called only from write paths in `intent.ts` (12 sites). External activations done in SE80/Eclipse leave the cache stale forever within the session (and forever in the SQLite file for `http-streamable` deployments).
- The ADT source-fetching methods (`getProgram`, `getClass`, `getInterface`, `getFunction`, `getInclude`, `getDdls`, `getDcl`, `getBdef`, `getSrvd`, `getDdlx`, `getFunctionGroupSource` in `src/adt/client.ts:113-310`) all return `Promise<string>` — they do not expose etag or accept `If-None-Match`.
- Live probe on a4h confirmed every source-bearing endpoint emits `etag` and `last-modified` headers and honors `If-None-Match` with HTTP 304. The mechanism is unused on the client side today.

**Documentation alignment:**
- `README.md:50-57` describes "Built-in Object Caching" and links to `docs/caching.md`. That file does not exist — broken link.
- `CLAUDE.md` "Architecture: Request Flow" section mentions CSRF, content negotiation, cookies, etc., but says nothing about ETag/`If-None-Match`.
- `compare/00-feature-matrix.md:182` row "Inactive objects list" shows ARC-1 with ✅ — false positive given the path bug.
- The user-facing skill `.claude/commands/implement-feature.md:163` recommends `SAPRead(type='INACTIVE_OBJECTS')` as a remediation hint after RAP activation failures. The recommendation is correct but the command currently never returns anything useful — fixed by Task 1.

### Target State

**Task 1 (standalone bug fix):**
- `getInactiveObjects()` calls `/sap/bc/adt/activation/inactiveobjects` directly (no leading 404) with `Accept: application/vnd.sap.adt.inactivectsobjects.v1+xml`, getting the rich `<ioc:inactiveObjects>` shape.
- `parseInactiveObjects` handles both the rich `<ioc:object><ioc:ref>` shape (new code path) and the existing flat `<adtcore:objectReference>` shape (preserved for NW 7.50 + legacy systems and existing fixture coverage).
- `InactiveObject` interface gains optional `user`, `deleted`, and `transport` fields populated from the `ioc:` attributes when present.
- The "not available on this SAP system" message at intent.ts:1242 is removed (it was misleading and only ever fired in genuine total-failure cases).

**Tasks 2-9 (PR 2):**
- Each `CachedSource` carries the etag returned by SAP. Cache is keyed by `(type, name, version)` so active and inactive views never collide.
- Every cached source-read path sends `If-None-Match: <etag>`. On 304: return cached body, refresh `cachedAt`, do not call any further parsing. On 200 with new etag: replace cache, return fresh body. On 200 with no etag (graceful fallback for objects whose handlers don't emit one): store body without etag, next read fetches plain.
- The `[cached]` indicator distinguishes "cache hit, server-validated via 304" from "cache hit, no validator available" — for transparency in test output and audit logs.
- Cache works the same on SAP_BASIS 7.50 SP02 and S/4HANA 2023 — the ETag mechanism predates 7.50 (notes 1760222 from 2012, 1814370 from 2013).
- `README.md` mentions the conditional-GET model. `CLAUDE.md` Request Flow describes the ETag round-trip. `docs/caching.md` exists and documents the caching architecture (fixes the broken link).

### Key Files

| File | Role |
|------|------|
| `src/adt/client.ts` | `getInactiveObjects()` URL + Accept header (Task 1); source-fetching methods plumb etag through `opts.ifNoneMatch` and return `{ source, etag, notModified, statusCode }` (Task 5) |
| `src/adt/xml-parser.ts` | `parseInactiveObjects()` updated to handle real server shape + legacy shape (Task 1) |
| `src/adt/types.ts` | `InactiveObject` interface gains optional fields (Task 1); `CachedSource` referenced from cache types |
| `src/handlers/intent.ts` | Remove 404 fallback for INACTIVE_OBJECTS (Task 1); update `cachedGet` helper to use conditional-GET-aware path (Task 7) |
| `src/cache/cache.ts` | `CachedSource` gains `etag` and `version` fields; `Cache` interface methods accept `version` (Task 2) |
| `src/cache/memory.ts` | Multi-version Map keying, store/return etag (Task 3) |
| `src/cache/sqlite.ts` | Schema migration: `etag` and `version` columns, recreate cache_key derivation (Task 4) |
| `src/cache/caching-layer.ts` | `getSource()` invokes fetcher with `ifNoneMatch`, handles 304 vs 200 vs no-etag (Task 6) |
| `tests/fixtures/xml/inactive-objects.xml` | Replace fictional fixture with real captured response shape from a4h (Task 1) |
| `tests/unit/adt/xml-parser.test.ts` | Update `parseInactiveObjects` tests for both shapes (Task 1) |
| `tests/unit/adt/client.test.ts` | Update `getInactiveObjects` URL assertion (Task 1); add etag round-trip tests for source methods (Task 5) |
| `tests/unit/cache/memory.test.ts` | Etag + version round-trip tests (Task 3) |
| `tests/unit/cache/sqlite.test.ts` | Etag + version round-trip + schema migration tests (Task 4) |
| `tests/unit/cache/caching-layer.test.ts` | Conditional GET flow tests: 304-hit, 200-replace, no-etag-fallback (Task 6) |
| `tests/integration/cache.integration.test.ts` | Live a4h test: read object twice, assert second read uses 304 (Task 8) |
| `tests/e2e/cache.e2e.test.ts` | E2E: SAPRead twice, assert `[cached]` indicator and conditional-GET correctness (Task 8); SAPRead INACTIVE_OBJECTS returns valid list (Task 8) |
| `README.md` | Update "Built-in Object Caching" section to mention conditional GET (Task 9) |
| `CLAUDE.md` | Update Architecture: Request Flow + Key Files for Common Tasks table (Task 9) |
| `docs/caching.md` | New file — architecture doc that fixes the broken README link (Task 9) |

### Design Principles

1. **HTTP-standard mechanism, no SAP-specific gates.** The fix uses `If-None-Match` and the server's `etag` header — defined in `IF_HTTP_HEADER_FIELDS` in the SAP HTTP framework, independent of release. No `SAP_BASIS` version checks, no system-type branching. Verified live on a4h and confirmed by SAP Notes 1760222 (2012-09-06) and 1814370 (2013-05-24) to predate SAP_BASIS 7.50.

2. **Server is source of truth for freshness.** No TTL, no clock comparison, no internal "stale window." On every cache read the server validates via 304/200. The cache never gambles.

3. **Opportunistic, not required.** Some specific resource handlers historically had ETag emission bugs (notes 1915257, 2641168). The implementation falls back to a plain GET when the response carries no `etag` header — never errors, just stores body without a validator. Next read on that same object does a plain re-fetch.

4. **Cache key is `(type, name, version)`.** ETag includes a version discriminator (`001` active, `000` inactive) per `cl_adt_utility=>calculate_etag_base` on the server. Sending an active ETag against an inactive request is a guaranteed mismatch; cache must key both dimensions to avoid wasted misses. Default `version` is `'active'` for all current callers — no surface change to SAPRead API in this plan; the version field is internal-only.

5. **Inactive endpoint is a real fix.** Don't paper over the 404 with a fallback message. The endpoint exists and works; ARC-1 calls the wrong path. Same applies to the parser: don't reject the real response shape silently — accept both real and legacy forms defensively.

6. **No breaking changes to the SAPRead schema.** This plan does not add a `version` parameter to the SAPRead Zod schema or tool description. The cache internally tracks versions for correctness; the surface stays exactly as today. A future plan can add the user-facing parameter if there's demand for reading inactive drafts directly.

7. **Cache is rebuildable; migration is destructive.** When SqliteCache encounters a pre-migration schema (no `etag` or `version` column), drop the `sources` table and recreate. The cache is a performance optimization, never authoritative; users lose at most one re-fetch worth of latency.

## Development Approach

Tasks 1 and 2 are foundation work — Task 1 is fully independent (PR 1) and Task 2 only adds types/interface declarations without behaviour changes. Tasks 3 and 4 implement those interfaces in the two cache backends; they can be done in either order. Task 5 widens the ADT client method signatures and is the largest single task; it must come before Task 6 (which uses those signatures) and Task 7 (which depends on the new fetcher contract via the caching layer). Tasks 8-9 add integration/E2E tests and documentation. Task 10 is final verification.

Each task's checklist is self-contained — every task references the file paths, line numbers, function names, and patterns the agent needs. Each code-changing task includes a final `npm test` checkbox. Integration-touching tasks reference `INFRASTRUCTURE.md` for the live test system credentials.

## Validation Commands

- `npm test`
- `npm run typecheck`
- `npm run lint`
- `npm run test:integration` (when SAP credentials are configured per `INFRASTRUCTURE.md`)
- `npm run test:e2e` (when an MCP server is running, see `docs/setup-guide.md`)

---

### Task 1: Fix `/activation/inactiveobjects` endpoint URL, parser, and handler

**Files:**
- Modify: `src/adt/client.ts`
- Modify: `src/adt/xml-parser.ts`
- Modify: `src/adt/types.ts`
- Modify: `src/handlers/intent.ts`
- Modify: `tests/fixtures/xml/inactive-objects.xml`
- Modify: `tests/unit/adt/xml-parser.test.ts`
- Modify: `tests/unit/adt/client.test.ts`

ARC-1's `getInactiveObjects()` at `src/adt/client.ts:464-478` already has a fallback from `/sap/bc/adt/activation/inactive` to `/sap/bc/adt/activation/inactiveobjects` (catches 404, retries). The fallback works correctly on modern systems but wastes one 404 roundtrip per call. Both attempts use `Accept: application/xml` which returns the flat `<adtcore:objectReferences>` shape — missing the rich user/transport/deleted metadata that the same endpoint returns when given `Accept: application/vnd.sap.adt.inactivectsobjects.v1+xml`. The parser at `src/adt/xml-parser.ts:1035-1055` only handles the flat shape, so even with vendor Accept the rich data would be discarded. This task: (1) call `/inactiveobjects` directly without the leading 404, (2) request the vendor MIME, (3) extend the parser to handle BOTH the rich ioc shape and the existing flat shape (preserve the existing fixture for NW 7.50 + legacy coverage; add a new fixture for the rich shape).

- [ ] In `src/adt/client.ts:464-478`, replace the entire `getInactiveObjects()` body with a single direct call: `const resp = await this.http.get('/sap/bc/adt/activation/inactiveobjects', { Accept: 'application/vnd.sap.adt.inactivectsobjects.v1+xml, application/xml;q=0.5' });`. The dual Accept header lets older systems that ignore the vendor MIME fall through to `application/xml`. Drop the try/catch fallback — `/inactiveobjects` works on every release ARC-1 supports (verified live on S/4HANA 2023 and NW 7.50 SP02).
- [ ] In `src/adt/types.ts:714-720`, extend the `InactiveObject` interface with optional fields: `user?: string` (from `ioc:user` on `<ioc:object>`), `deleted?: boolean` (from `ioc:deleted` on `<ioc:object>`), `transport?: string` (from `adtcore:name` on the sibling `<ioc:transport><ioc:ref>` element when `ioc:linked="true"`), and `parentTransport?: string` (from `adtcore:parentUri` when present). Existing fields (`name`, `type`, `uri`, `description?`) stay as-is.
- [ ] In `src/adt/xml-parser.ts`, extend `parseInactiveObjects` (line ~1036). The new implementation must handle BOTH shapes:
  - **Rich ioc shape** (new code path): walk all top-level `<entry>` elements (after XML parsing strips the `ioc:` namespace prefix), find each `<object>` child with a nested `<ref>` element. Skip entries whose only child is `<transport>` (those represent transport requests with no source object). Capture `name` (from `@_name`), `type` (from `@_type`), `uri` (from `@_uri`), `description` (from `@_description` if present), `user` (from `<object>`'s `@_user`), `deleted` (parse `<object>`'s `@_deleted` as boolean: true iff string equals `'true'`), `transport` (from sibling `<transport><ref>`'s `@_name`), `parentTransport` (from sibling `<transport><ref>`'s `@_parentUri`).
  - **Flat shape** (existing code path): walk `<entry><object><objectReference>` elements (or top-level `<objectReference>` for the very-old shape). Capture only `name`, `type`, `uri`, `description` — the flat shape doesn't have user/deleted/transport metadata. This branch is what NW 7.50 returns when given `application/xml`, and what `tests/fixtures/xml/inactive-objects.xml` contains.
  - Detection rule: if the parsed XML has any `<object>` element with a nested `<ref>` (not `<objectReference>`), use the rich path. Otherwise fall through to the flat path. Both paths can coexist in the same parser without ordering ambiguity.
  - Return `[]` for empty/whitespace-only XML (existing behaviour; preserve).
- [ ] **Keep the existing fixture** `tests/fixtures/xml/inactive-objects.xml` as-is. It's the flat-shape coverage that NW 7.50 emits with generic Accept and serves as legacy-system regression coverage. Do not modify or replace it.
- [ ] Create a new fixture `tests/fixtures/xml/inactive-objects-ioc.xml` with the rich ioc shape captured live from a4h:
  ```xml
  <?xml version="1.0" encoding="utf-8"?>
  <ioc:inactiveObjects xmlns:ioc="http://www.sap.com/abapxml/inactiveCtsObjects">
    <ioc:entry>
      <ioc:object/>
      <ioc:transport ioc:user="MARIAN" ioc:linked="false">
        <ioc:ref adtcore:uri="/sap/bc/adt/cts/transportrequests/A4HK901086" adtcore:type="/RQ" adtcore:name="A4HK901086" adtcore:description="Test transport" xmlns:adtcore="http://www.sap.com/adt/core"/>
      </ioc:transport>
    </ioc:entry>
    <ioc:entry>
      <ioc:object ioc:user="MARIAN" ioc:deleted="false">
        <ioc:ref adtcore:uri="/sap/bc/adt/bo/behaviordefinitions/zc_fbclubtp" adtcore:type="BDEF/BDO" adtcore:name="ZC_FbClubTP" xmlns:adtcore="http://www.sap.com/adt/core"/>
      </ioc:object>
      <ioc:transport ioc:user="MARIAN" ioc:linked="true">
        <ioc:ref adtcore:uri="/sap/bc/adt/cts/transportrequests/A4HK901087" adtcore:type="/RQ" adtcore:name="A4HK901087" adtcore:parentUri="/sap/bc/adt/cts/transportrequests/A4HK901086" xmlns:adtcore="http://www.sap.com/adt/core"/>
      </ioc:transport>
    </ioc:entry>
    <ioc:entry>
      <ioc:object ioc:user="MARIAN" ioc:deleted="false">
        <ioc:ref adtcore:uri="/sap/bc/adt/ddic/ddl/sources/zarc1_test" adtcore:type="DDLS/DF" adtcore:name="ZARC1_TEST" adtcore:description="Test CDS" xmlns:adtcore="http://www.sap.com/adt/core"/>
      </ioc:object>
    </ioc:entry>
  </ioc:inactiveObjects>
  ```
- [ ] In `tests/unit/adt/xml-parser.test.ts:995-1029`, **keep the existing tests for the flat shape** (they verify backwards-compat with NW 7.50 output and the legacy fixture). Add a new `it('parses rich ioc shape with user/deleted/transport metadata', ...)` test that loads `inactive-objects-ioc.xml`, asserts:
  - `objects` has length 2 (the transport-only entry is skipped).
  - First: `name='ZC_FbClubTP'`, `type='BDEF/BDO'`, `uri='/sap/bc/adt/bo/behaviordefinitions/zc_fbclubtp'`, `user='MARIAN'`, `deleted=false`, `transport='A4HK901087'`, `parentTransport='/sap/bc/adt/cts/transportrequests/A4HK901086'`. No `description`.
  - Second: `name='ZARC1_TEST'`, `type='DDLS/DF'`, `description='Test CDS'`, `user='MARIAN'`, `deleted=false`, no `transport`, no `parentTransport`.
- [ ] In `tests/unit/adt/client.test.ts:950-973`, update the `getInactiveObjects` test:
  - Change the mocked URL assertion: assert the fetch call URL is `/sap/bc/adt/activation/inactiveobjects` (no leading `/inactive` 404).
  - Update the mocked Accept header expectation to include `application/vnd.sap.adt.inactivectsobjects.v1+xml`.
  - Change the mocked response body to the rich `<ioc:object><ioc:ref>` shape.
  - Assert the parsed result includes the new fields (`user`, `deleted`, `transport`).
- [ ] In `src/handlers/intent.ts:1235-1249`, simplify the `INACTIVE_OBJECTS` case. Remove the `try/catch` with the "not available on this SAP system" 404 fallback. New body: `const objects = await client.getInactiveObjects(); return textResult(JSON.stringify({ count: objects.length, objects }, null, 2));`. Real 404s from genuinely unavailable systems will surface naturally as `AdtApiError` and be formatted by the existing error path.
- [ ] Run `npm test` — all tests must pass (existing flat-shape tests still pass + new rich-shape tests pass).

---

### Task 2: Extend `Cache` interface and `CachedSource` for `version` + `etag`

**Files:**
- Modify: `src/cache/cache.ts`

The cache currently keys source by `(type, name)`. To support conditional GET correctly, the key must include a version dimension (active vs inactive — different ETags per the server-side `cl_adt_utility=>calculate_etag_base` formula), and each entry must carry the etag for the next `If-None-Match` round-trip. This task extends the type definitions only — the two cache backends and the caching layer are updated in subsequent tasks.

- [ ] In `src/cache/cache.ts:62-69`, extend the `CachedSource` interface with two new fields: `version: 'active' | 'inactive'` (required, defaults to `'active'` at write sites) and `etag?: string` (optional, undefined when the server didn't return one).
- [ ] Update `Cache` interface methods at lines 113-116:
  - `putSource(objectType: string, objectName: string, source: string, opts?: { version?: 'active' | 'inactive'; etag?: string }): void`
  - `getSource(objectType: string, objectName: string, version?: 'active' | 'inactive'): CachedSource | null` (default version is `'active'`)
  - `invalidateSource(objectType: string, objectName: string, version?: 'active' | 'inactive' | 'all'): void`. Semantics: `'active'` (default) clears the active entry only — preserves existing behaviour for the 12 SAPWrite invalidate sites. `'inactive'` clears the inactive entry only — used by future inactive-aware code. `'all'` clears both — used by SAPWrite/SAPActivate paths so that activating a draft invalidates BOTH the old active body AND the now-consumed inactive draft. Activate consumes the inactive version (it becomes the new active), so leaving a stale inactive entry in cache is wrong. Invalidating with `'all'` is the correct symmetric default for write paths.
- [ ] Update the `sourceKey()` helper at lines 139-142 to take an optional version parameter: `export function sourceKey(objectType: string, objectName: string, version: 'active' | 'inactive' = 'active'): string { return `${objectType.toUpperCase()}:${objectName.toUpperCase()}:${version}`; }`. Existing callers that don't pass version get `'active'` by default — preserves keying for code that hasn't migrated yet, and the active/inactive split is a new dimension so no migration is needed for callers reading active.
- [ ] Run `npm run typecheck` — expect compile errors in `memory.ts`, `sqlite.ts`, and `caching-layer.ts` (those are intentionally fixed in Tasks 3-6).
- [ ] Run `npm test` — same expectation: this task changes types, the implementations are updated next. If `npm test` still passes (because the type errors are only surfaced by `tsc`, not vitest), that's fine.

---

### Task 3: Update `MemoryCache` for `version` + `etag`

**Files:**
- Modify: `src/cache/memory.ts`
- Modify: `tests/unit/cache/memory.test.ts`

`MemoryCache` stores sources in a `Map<string, CachedSource>`. With the new `(type, name, version)` key shape, the existing `sources.set(sourceKey(type, name), …)` calls need to pass the version through, and `putSource` / `getSource` / `invalidateSource` must accept the new optional parameters. The class otherwise stays simple — the in-memory representation does not need a schema migration.

- [ ] In `src/cache/memory.ts:95-112`, update the source cache methods:
  - `putSource(objectType, objectName, source, opts)`: include `opts.version ?? 'active'` in the key, and store `version` and `etag` (from `opts.etag`) in the `CachedSource` value.
  - `getSource(objectType, objectName, version)`: pass `version ?? 'active'` to `sourceKey()`. Return value already carries the `version` field if it was stored.
  - `invalidateSource(objectType, objectName, version)`: delete by the version-aware key. Default `'active'` keeps existing write-invalidation behaviour for the active view.
- [ ] In `tests/unit/cache/memory.test.ts:98-118`, extend the `sources` describe block with new tests (~5 tests):
  - `stores and retrieves source with active version by default` — `putSource(type, name, body)` then `getSource(type, name)` returns the entry with `version='active'`.
  - `stores etag when provided` — `putSource(type, name, body, { etag: '20231201001' })` then `getSource` returns `etag: '20231201001'`.
  - `keeps active and inactive separate` — store body A under active, body B under inactive (via `{ version: 'inactive' }`), assert both return distinct entries.
  - `invalidateSource defaults to active version` — store both, invalidate without version arg, assert active is gone but inactive remains.
  - `invalidateSource with explicit version clears that view only` — store both, `invalidateSource(type, name, 'inactive')`, assert inactive is gone but active remains.
- [ ] Run `npm test` — all MemoryCache tests pass.

---

### Task 4: Update `SqliteCache` schema for `version` + `etag` (with destructive migration)

**Files:**
- Modify: `src/cache/sqlite.ts`
- Modify: `tests/unit/cache/sqlite.test.ts`

`SqliteCache` writes a SQLite database file (default `.arc1-cache.db`) for `http-streamable` deployments. The `sources` table needs two new columns (`etag`, `version`) and the `cache_key` derivation must include the version. Existing cache files from previous ARC-1 versions don't have these columns — we handle this by detecting the missing column on startup and dropping/recreating the `sources` table only (keeping `nodes`, `edges`, `apis`, `dep_graphs`, `func_groups` intact). The cache is a performance optimization, not authoritative — a one-time loss of cached source bodies is acceptable.

- [ ] **Migration must run BEFORE `createTables()`** to avoid a chicken-and-egg failure: the new `idx_sources_objname_version` index references the new `version` column, so attempting to create the index against an old `sources` table without that column fails before migration can drop it. Reorder the constructor:
  ```typescript
  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = NORMAL');
    this.dropOldSourcesTableIfNeeded();  // 1. Drop sources table if old schema (must run first)
    this.createTables();                 // 2. Create all tables (sources gets recreated fresh)
  }
  ```
- [ ] Add a private helper `dropOldSourcesTableIfNeeded()`:
  ```typescript
  private dropOldSourcesTableIfNeeded(): void {
    // PRAGMA table_info returns empty array if the table doesn't exist (fresh install) — that's fine, createTables will create it.
    const cols = this.db.prepare("PRAGMA table_info('sources')").all() as Array<{ name: string }>;
    if (cols.length === 0) return;  // fresh install
    const hasEtag = cols.some((c) => c.name === 'etag');
    const hasVersion = cols.some((c) => c.name === 'version');
    if (!hasEtag || !hasVersion) {
      this.db.exec('DROP TABLE IF EXISTS sources;');
      // Note: we deliberately drop, not ALTER. Cache is rebuildable; a destructive migration is simpler than column-add + backfill.
    }
  }
  ```
  Other tables (`nodes`, `edges`, `apis`, `dep_graphs`, `func_groups`) are unaffected — they keep their data.
- [ ] Update `createTables()` at lines 25-84:
  - Change the `sources` CREATE TABLE statement to include `etag TEXT` and `version TEXT NOT NULL DEFAULT 'active'` columns (keep `cached_at TEXT NOT NULL` for stats).
  - The `cache_key` PRIMARY KEY stays — but its content now includes the version (constructed by `sourceKey()`).
  - Add an index `CREATE INDEX IF NOT EXISTS idx_sources_objname_version ON sources(object_name, object_type, version)` (used for invalidation by name+version when `cache_key` derivation changes are not desired). Because migration ran first, the index creation is now safe — the table either is fresh (this is the first start) or was just dropped+recreated.
- [ ] Update `putSource()` at lines 165-178 to accept `opts?: { version?: 'active' | 'inactive'; etag?: string }`. The INSERT statement now includes `etag` and `version` columns; `cache_key` is derived from `sourceKey(type, name, opts?.version ?? 'active')`.
- [ ] Update `getSource()` at lines 180-193 to accept optional `version`, derive the right `cache_key`, and return the `etag` and `version` fields in the returned `CachedSource`.
- [ ] Update `invalidateSource()` at lines 195-198 to accept optional `version` and delete by the version-aware `cache_key`.
- [ ] In `tests/unit/cache/sqlite.test.ts:104-122`, extend the source caching tests with the same five test cases as Task 3 — same assertions, just using `SqliteCache` instead of `MemoryCache`. Use `:memory:` for the test DB (existing pattern at line 22).
- [ ] Add a migration test (~1 test): create a `SqliteCache` against a temporary file path, manually drop the `etag` column via raw SQL, close, re-open the cache, assert that the table now has both `etag` and `version` columns. Use vitest's `tmpdir`-style helpers — see existing patterns in `tests/integration/cache.integration.test.ts` for SQLite file handling if needed.
- [ ] Run `npm test` — all SqliteCache tests pass.

---

### Task 5: Update ADT client source-fetching methods to accept `If-None-Match` and return etag

**Files:**
- Modify: `src/adt/client.ts`
- Modify: `tests/unit/adt/client.test.ts`

The source-fetching methods on `AdtClient` currently return `Promise<string>`. To enable the caching layer to do conditional GETs, each method must accept optional `opts.ifNoneMatch` (which becomes the `If-None-Match` request header) and return both the body and the ETag from the response, plus a flag indicating 304 Not Modified. The HTTP layer already returns `AdtResponse` with `headers` and `statusCode` — `handleResponse` at `src/adt/http.ts:653-684` lets 304 fall through (it's not `>= 400`), so 304 simply returns an `AdtResponse` with status 304 and empty body. No `http.ts` changes are needed.

This is the widest single task. The method signatures change but the existing callers in `intent.ts` are wrapped through the `cachedGet` helper (Task 7), so most tests can be updated once the new shape lands.

- [ ] Define a shared result type at the top of `src/adt/client.ts` (right under the imports): `export interface SourceReadResult { source: string; etag?: string; notModified: boolean; statusCode: number; }`.
- [ ] Define a shared options type: `export interface SourceReadOptions { ifNoneMatch?: string; version?: 'active' | 'inactive'; }`.
- [ ] Add a private helper `private async fetchSource(path: string, opts?: SourceReadOptions): Promise<SourceReadResult>` that:
  - Takes the path (already including `/source/main`), appends `?version=<active|inactive>` if `opts?.version` is set (and not already in the path).
  - Builds extra headers: when `opts?.ifNoneMatch` is set, adds `'If-None-Match': opts.ifNoneMatch`.
  - Calls `this.http.get(path, headers)` — note `http.get` already returns `AdtResponse`.
  - Returns `{ source: resp.body, etag: resp.headers['etag'] ?? undefined, notModified: resp.statusCode === 304, statusCode: resp.statusCode }`.
- [ ] Update each source-fetching method to accept `opts?: SourceReadOptions` and return `Promise<SourceReadResult>` instead of `Promise<string>`:
  - `getProgram(name, opts?)` (line 113)
  - `getInterface(name, opts?)` (line 209)
  - `getFunction(group, name, opts?)` (line 216)
  - `getInclude(name, opts?)` (line 251)
  - `getDdls(name, opts?)` (line 258)
  - `getDcl(name, opts?)` (line 265)
  - `getBdef(name, opts?)` (line 272)
  - `getSrvd(name, opts?)` (line 279)
  - `getDdlx(name, opts?)` (line 297)
  - `getFunctionGroupSource(name, opts?)` (line 244)
  - `getClass(name, include?, opts?)` (line 120) — **special case**: the method has multi-include logic. Plumb opts through to the `/source/main` call only (the default `!include` branch at line 124-128 and the `inc === 'main'` branch at line 147). The other includes don't need conditional-GET support (they're rare and the cache layer doesn't track them — see `src/handlers/intent.ts:1292-1297` which only caches the no-include CLAS path). For the multi-include path, return concatenated body via `{ source: parts.join('\n\n'), notModified: false, statusCode: 200, etag: undefined }`.

  For each method, replace the existing `const resp = await this.http.get(...); return resp.body;` body with `return this.fetchSource(path, opts);` (use the existing path expression).
- [ ] **Audit ALL caller sites first** — these methods are called from more than just `handleSAPRead`. Run this before editing:
  ```
  grep -rnE 'client\.(getProgram|getClass|getInterface|getFunction|getInclude|getDdls|getDcl|getBdef|getSrvd|getDdlx|getFunctionGroupSource)\(' src/
  ```
  Expected sites (verified during plan research):
  - `src/handlers/intent.ts` — many sites in `handleSAPRead` (around lines 1264-1360 — go through the `cachedGet` helper which is rewritten in Task 7) PLUS direct `cachingLayer.getSource(...)` call sites at lines 2932 (CLAS), 3020 (BDEF), 4745 (compressor-style fetch). All of these must unwrap `.source` and forward `ifNoneMatch` correctly.
  - `src/context/compressor.ts` — 6 sites: lines 235, 237, 243, 256, 263, 271, 273, 433. The lines wrapped in `cachedGet(...)` (235, 237, 243, 271, 273, 433) need the same fetcher signature update as Task 7's handler. The bare `client.getFunction(match[1], name)` at lines 256 and 263 must just unwrap `.source`.
  - `src/cache/warmup.ts` — 3 source-fetching sites: lines 225 (`getClass`), 227 (`getInterface`), 298 (`getFunction`). Warmup is a first-time pre-population path — no benefit from conditional GET (cache is empty). These callers just need `.source` unwrapping. Pass through `opts: { ifNoneMatch: cached?.etag }` if a cached entry already exists (warmup at line 236 / 299 already does a `getCachedSource` lookup before fetching) — this lets re-running warmup against an unchanged system skip body transfers.
- [ ] For each caller site identified above, update the call site to use the new return shape. Two patterns:
  - **Cached path** (call goes through `cachedGet` or `cachingLayer.getSource`): the fetcher closure becomes `(ifNoneMatch) => client.getProgram(name, { ifNoneMatch })`. The caller code that destructures `{ source, hit }` continues to work — the wrapping returns the same shape.
  - **Bare path** (direct `client.getX()` call without caching): unwrap `.source` directly: `const { source } = await client.getDdlx(name); return textResult(source);`.
- [ ] In `tests/unit/adt/client.test.ts:46-238`, update the `source code read operations` describe block to assert the new return shape:
  - `getProgram returns source code` (line 47): change `expect(source).toBe(...)` to `expect(result.source).toBe(...)`. Also assert `result.notModified === false` and `result.statusCode === 200`.
  - Add new tests (~6 tests):
    - `getProgram captures etag from response header` — mock response with `{ etag: '20231201001' }` headers, assert `result.etag === '20231201001'`.
    - `getProgram returns notModified=true on 304` — mock response with status 304 and empty body, assert `result.notModified === true`, `result.source === ''`.
    - `getProgram sends If-None-Match when opts.ifNoneMatch is set` — pass `{ ifNoneMatch: 'abc123' }`, inspect `mockFetch` call arguments to verify the header was sent.
    - `getProgram appends ?version=inactive when opts.version is 'inactive'` — pass `{ version: 'inactive' }`, inspect the URL.
    - `getClass without include returns SourceReadResult` — same shape assertions as `getProgram`.
    - `getDdls returns SourceReadResult` — same.
- [ ] Run `npm test` — all client tests pass. Run `npm run typecheck` — should pass cleanly now that all callers are updated.

---

### Task 6: `CachingLayer.getSource` does conditional GET

**Files:**
- Modify: `src/cache/caching-layer.ts`
- Modify: `tests/unit/cache/caching-layer.test.ts`

`CachingLayer.getSource` currently runs a strict cache-then-fetch flow. With ETag support, it must: on cache hit, invoke the fetcher with the stored etag and inspect the result for 304/200; on 304 use cached body; on 200 with new etag replace cache; on 200 with no etag store body without etag (graceful fallback); on 404 (object deleted externally) invalidate the cache entry before re-throwing so the database stays in sync with the backend. On cache miss, do a plain fetch and store. The `fetcher` signature becomes etag-aware.

The 404-invalidation behaviour was specifically requested in [issue #183 follow-up comment](https://github.com/marianfoo/arc-1/issues/183#issuecomment) by the original reporter ("If the element is not there, aka the read completely fails, then I'd say it's OK to also delete the cache entries… as a way to be completely 'in sync' with the backend"). Live probes against a4h confirmed: ADT returns HTTP 404 with `<exc:type id="ExceptionResourceNotFound"/>` for both never-existed and externally-deleted objects, regardless of `If-None-Match`. There is no 410 Gone in the ADT contract, but this implementation handles 410 defensively in case some future endpoint emits it. ARC-1 already has `isNotFoundError(err)` at [errors.ts:551](src/adt/errors.ts:551) — reuse it.

- [ ] In `src/cache/caching-layer.ts:62-77`, replace the `getSource` implementation. The new signature: `async getSource(objectType: string, objectName: string, fetcher: (ifNoneMatch?: string) => Promise<{ source: string; etag?: string; notModified: boolean; statusCode: number }>, opts?: { version?: 'active' | 'inactive' }): Promise<{ source: string; hit: boolean; revalidated: boolean }>`.
  - `revalidated: true` means cache hit and server confirmed via 304 (the [cached] indicator becomes more transparent).
  - Behaviour:
    1. Look up cache by `(objectType, objectName, version)` (default `'active'`).
    2. If cache miss → call `fetcher(undefined)` (no `If-None-Match`). On success: store via `cache.putSource(type, name, source, { version, etag })`, return `{ source, hit: false, revalidated: false }`. On error: just re-throw (no cache entry to invalidate).
    3. If cache hit and entry has no etag → call `fetcher(undefined)` (can't do conditional fetch). On success: replace cache via `putSource`, return `{ source: result.source, hit: false, revalidated: false }`. On error: see step 5.
    4. If cache hit with etag → call `fetcher(cached.etag)`:
       - If `result.notModified` (304): return `{ source: cached.source, hit: true, revalidated: true }`. Do not refresh `cachedAt` — the existing entry is fine; rewriting it would just churn SQLite.
       - If `result.statusCode === 200`: replace cache via `cache.putSource(type, name, result.source, { version, etag: result.etag })`, return `{ source: result.source, hit: false, revalidated: false }`.
       - On error: see step 5.
    5. **Error path with cached entry present:** wrap the fetcher call (steps 3 and 4) in a try/catch. On `AdtApiError` with `statusCode === 404` or `statusCode === 410`, call `this.cache.invalidateSource(objectType, objectName, version)` before re-throwing. On any other error, just re-throw. The invalidation must happen *before* re-throwing so callers and tests see consistent state. Import `AdtApiError` from `'../adt/errors.js'` if not already imported (existing imports start at line 25).
- [ ] Update `invalidate(type, name)` at line 145-148 to accept optional `version: 'active' | 'inactive' | 'all'`. The default for SAPWrite/SAPActivate paths should be `'all'` — activation consumes the inactive draft and replaces the active body in one step, so leaving either cache view stale is incorrect. Update the 12 SAPWrite invalidation call sites in intent.ts (lines 2650, 2664, 2688, 2805, 2810, 2879, 2898, 2935, 3135, 3193, 3357 plus any others added in the meantime) to pass `'all'` explicitly: `cachingLayer?.invalidate(type, name, 'all');`. Read-side 404 invalidation in `CachingLayer.getSource` (the new code added by codex's #1 finding) uses `'active'` only because we only know the active view was deleted — the inactive view, if any, may still exist on the server and be accessible via `?version=inactive`.
- [ ] Add a new method `getCachedSourceWithEtag(objectType: string, objectName: string, version?: 'active' | 'inactive'): { source: string; etag?: string } | null` that the caller can use to retrieve cached info without fetching — returns the active version by default. Existing `getCachedSource` keeps its current signature and behaviour for backwards compat.
- [ ] In `tests/unit/cache/caching-layer.test.ts:28-70`, replace the `source caching` describe block with new tests reflecting the conditional-GET flow (~10 tests):
  - `cache miss calls fetcher with undefined ifNoneMatch and stores result with etag` — fetcher mock returns `{ source: 'body', etag: 'e1', notModified: false, statusCode: 200 }`; assert `hit=false, revalidated=false`, then assert subsequent `getCachedSourceWithEtag` returns `{ source: 'body', etag: 'e1' }`.
  - `cache hit with etag sends If-None-Match and returns cached on 304` — pre-populate cache via fetcher, then call again; second fetcher call must receive `'e1'` as `ifNoneMatch`, mock returns `{ source: '', etag: 'e1', notModified: true, statusCode: 304 }`; assert `hit=true, revalidated=true, source='body'`.
  - `cache hit with etag fetches fresh on 200 (etag changed)` — first call stores `etag=e1`; second fetcher returns `{ source: 'newbody', etag: 'e2', notModified: false, statusCode: 200 }`; assert `hit=false, revalidated=false, source='newbody'`; assert cache now has `etag=e2`.
  - `cache hit with no etag falls back to plain GET and replaces cache` — directly populate cache via `cache.putSource(type, name, 'old')` (no etag); fetcher returns `{ source: 'fresh', notModified: false, statusCode: 200 }` with no etag; assert `hit=false, source='fresh'`, cache replaced.
  - `cache miss when fetcher returns no etag stores entry without etag` — fetcher returns 200 with body but no etag; assert next call's stored entry has no etag.
  - `active and inactive entries do not collide` — put `{ version: 'active' }` then `{ version: 'inactive' }`, both retrievable independently via `getCachedSourceWithEtag`.
  - `invalidate(type, name) defaults to active version` — populate both, invalidate without version, assert active is gone but inactive remains.
  - `getSource invalidates cache and re-throws when conditional GET returns 404` — pre-populate via fetcher returning `{ source: 'body', etag: 'e1', ... }`; second fetcher rejects with `new AdtApiError('Resource ... does not exist.', 404, '/sap/bc/adt/...', '<exc:type id="ExceptionResourceNotFound"/>')`; assert the call rejects with the same error AND assert `getCachedSourceWithEtag(type, name, version)` returns `null` afterwards. Use `expect(getSource(...)).rejects.toBeInstanceOf(AdtApiError)` with status 404. Import `AdtApiError` in the test file.
  - `getSource invalidates cache and re-throws on 410 Gone` — same shape, status 410. Verifies the defensive 410 branch.
  - `getSource does NOT invalidate cache on transient errors (e.g., 503)` — pre-populate via successful fetcher; second fetcher throws `AdtApiError` with status 503; assert the call rejects but `getCachedSourceWithEtag` still returns the cached entry. Confirms only 404/410 trigger invalidation.
- [ ] Run `npm test` — all CachingLayer tests pass.

---

### Task 7: Wire conditional GET into `handleSAPRead`

**Files:**
- Modify: `src/handlers/intent.ts`
- Modify: `tests/unit/handlers/intent.test.ts` (if it exists; otherwise unit-test coverage stays at the lower layers)

The `cachedGet` helper at `src/handlers/intent.ts:1244-1252` currently invokes a fetcher that ignores `If-None-Match`. After Task 5 the underlying `client.getProgram` etc. accept etag opts, and after Task 6 the caching layer drives the conditional flow. This task wires them together at the handler level, including updating the `[cached]` indicator to distinguish between server-validated cache hits and plain hits.

- [ ] In `src/handlers/intent.ts:1244-1252`, update the `cachedGet` helper inside `handleSAPRead`:
  - Change the fetcher signature to accept `ifNoneMatch?: string` and return `SourceReadResult` (the type defined in Task 5).
  - **Do NOT do a separate cache lookup in the handler.** `CachingLayer.getSource` already owns the lookup and passes the cached etag to the fetcher via the `ifNoneMatch` argument. Calling `getCachedSourceWithEtag` from the handler before invoking `getSource` would create two sources of truth (handler reads cache, then layer reads cache again) and is a redundancy bug.
  - The new helper body is just: `const { source, hit, revalidated } = await cachingLayer.getSource(objType, objName, (ifNoneMatch) => fetcher(ifNoneMatch), { version: 'active' });`.
  - Update the return shape to `{ source: string; cacheHit: boolean; revalidated: boolean }`. (`getCachedSourceWithEtag` from Task 6 stays in the API for non-handler callers like compressor.ts that need to peek at the etag for other reasons, but is unused by `cachedGet` itself.)
- [ ] Update each call site that uses `cachedGet` (PROG, CLAS no-include, INTF, FUNC, INCL, DDLS, DCLS, BDEF, SRVD, DDLX, SRVB, SKTD, TABL, VIEW, STRU branches in `handleSAPRead` around lines 1264-1360 — these are ALL types that go through cachedGet, not just the 6 from earlier draft). The fetcher closure now receives `ifNoneMatch` and forwards it: `(ifNoneMatch) => client.getProgram(name, { ifNoneMatch })`.
- [ ] Update the `cachedTextResult` helper at line 1255-1257 with the cleaner indicator semantics (per codex Q4 — distinguish server-validated source hits from non-validated):
  - `cacheHit && revalidated` → prefix `[cached:revalidated]` (server confirmed via 304 — the common case post-PR for source reads)
  - `cacheHit && !revalidated` → prefix `[cached:unvalidated]` (rare — only when the cache entry has no stored etag, i.e., a server response that didn't emit one)
  - `!cacheHit` → no prefix
  - The unprefixed `[cached]` is reserved for **dep-graph cache hits** in `src/context/compressor.ts` (those are hash-keyed and naturally correct without server validation — different mechanism, different label). Source reads should never emit plain `[cached]` post-PR.
- [ ] Audit and update existing E2E test expectations that assert `[cached]` for source reads:
  - `tests/e2e/cache.e2e.test.ts:63` ("SAPRead — second call for same object is served from cache") — change expectation to accept `[cached:revalidated]` (the new label for source reads).
  - `tests/e2e/cache.e2e.test.ts:107` ("SAPContext deps — second call returns [cached] output") — keep `[cached]` expectation (this is the dep-graph hit path which retains the unprefixed label).
- [ ] Run `npm test` — all unit tests pass.

---

### Task 8: Add integration + E2E tests for conditional GET and inactive list

**Files:**
- Modify: `tests/integration/cache.integration.test.ts`
- Modify: `tests/e2e/cache.e2e.test.ts`

The unit tests cover the conditional-GET flow with mocked HTTP. The integration and E2E tests verify the live ADT contract on a4h (S/4HANA 2023). Before adding tests, read `INFRASTRUCTURE.md` for SAP system credentials — the host is `http://a4h.marianzeis.de:50000`, user `MARIAN`, client `001`. Tests must follow the skip taxonomy in `docs/testing-skip-policy.md` (`requireOrSkip` for missing credentials, `expectSapFailureClass` for error assertions).

- [ ] **First, audit and update existing assertions that no longer hold post-PR.** The current `tests/integration/cache.integration.test.ts` tests around lines 95-145 and `tests/e2e/cache.e2e.test.ts` lines 63-105 implicitly assume "second cache hit makes ZERO HTTP calls" (the test for "cache hit is significantly faster" works by comparing call counts or timing). Post-PR, every cache hit makes ONE conditional-GET roundtrip (which returns 304 with ~50 byte body). Update:
  - `cache hit is significantly faster than miss` (cache.integration.test.ts:107) — keep the test, but update the expectation: a 304 response is still substantially faster than fetching a full source body, so the timing comparison should still pass. Adjust the assertion margin if needed.
  - `returns MISS then HIT for same object` (cache.integration.test.ts:95) — keep, but update the implementation note: the second call is now a 304-validated hit, not a zero-HTTP cache hit. Verify the call count via mock fetch spy if the test inspects fetch invocations. If the test currently asserts `mockFetch` was called only once across both reads, change to assert it was called twice with the second call having an `If-None-Match` header.
  - `SAPRead — second call for same object is served from cache` (cache.e2e.test.ts:63) — update to accept `[cached:revalidated]` prefix instead of `[cached]` (per Task 7's indicator change). The semantic of "served from cache" is preserved; the wire-level mechanism changed.
- [ ] Add new integration tests under a new describe block `describe('Conditional GET (ETag-driven freshness)')` (~3 tests):
  - `SAPRead PROG returns 304 on second read with valid etag` — read `RSPARAM` once, capture the cached entry's etag via `cachingLayer.getCachedSourceWithEtag('PROG', 'RSPARAM', 'active')`, read again, assert the second call result has `revalidated=true`. Use `getTestClient()` factory at top of file.
  - `SAPRead returns fresh body when source changes` — uses `SAPWrite` + `SAPActivate` against a `$TMP` test object to change the etag, asserts next read fetches fresh content. **Note: this test specifically exercises the 200-replacement path, NOT the 404-invalidation path** (SAPWrite already calls `cachingLayer.invalidate(...)` so the next read is a cache miss, not a conditional GET that gets 200 with new etag — but for purposes of verifying the cache reflects new content, this is fine). Use `generateUniqueName()` from `tests/integration/crud-harness.ts`. Skip with `requireOrSkip` if write capability is not available (`SAP_ALLOW_WRITES != 'true'`).
  - `cache key separates active and inactive views` — only practical to verify if a known inactive object exists; otherwise skip with reason `NO_FIXTURE`. The test reads same object with `version: 'active'` and `version: 'inactive'` opts, asserts different etags returned.
- [ ] Add a separate describe block `describe('404 cache invalidation (external delete simulation)')` with ~1 test that **must NOT use SAPWrite to do the delete** (because SAPWrite already invalidates the cache via the write path, which would mask any failure of the read-side 404 invalidation). Implementation:
  ```typescript
  // 1. Create a transient $TMP program via SAPWrite. Cache will be empty for it.
  // 2. Read it via SAPRead — this populates cache with body + etag.
  // 3. Capture cached etag via cachingLayer.getCachedSourceWithEtag(...).
  // 4. Delete the program by calling the ADT REST endpoint DIRECTLY via raw http.delete on a SECOND AdtClient instance configured WITHOUT a cachingLayer. This bypasses the SAPWrite invalidation path entirely — the cache under test still has the stale entry.
  // 5. Read it via SAPRead on the FIRST (cached) client. This triggers the conditional GET against a now-deleted object → 404 → CachingLayer.getSource invalidates the cache entry before re-throwing.
  // 6. Assert: the SAPRead call rejects with AdtApiError(404) AND cachingLayer.getCachedSourceWithEtag(...) returns null afterwards (the entry is gone).
  ```
  Use `expectSapFailureClass(err, [404], [/not exist/i])` from `tests/helpers/expected-error.ts` for the rejection assertion. Cleanup is irrelevant — the object is already deleted. Skip with `requireOrSkip` if `SAP_ALLOW_WRITES != 'true'`.
- [ ] In the same file, add a new describe block `describe('Inactive objects endpoint')` (~2 tests):
  - `getInactiveObjects returns 200 (not 404) on supported systems` — use `getTestClient().getInactiveObjects()`, expect a non-throwing call, assert result is `Array.isArray()`. The list may be empty (no drafts) or non-empty (drafts exist) — both are valid.
  - `INACTIVE_OBJECTS handler returns valid JSON listing` — call the MCP handler at the integration test layer (see existing patterns in `cache.integration.test.ts` for handler-level tests), assert the result text parses as `{ count: number, objects: Array }`.
- [ ] In `tests/e2e/cache.e2e.test.ts`, add new tests under the existing `describe('E2E Cache Tests')` (~3 tests):
  - `SAPRead — second call uses conditional GET (304)` — call `SAPRead` twice for the persistent fixture `ZARC1_TEST_REPORT`, assert the second result text starts with `[cached]` (or `[cached:revalidated]`). The exact indicator depends on Task 7 — accept either prefix.
  - `SAPRead — INACTIVE_OBJECTS returns valid response` — call `SAPRead({ type: 'INACTIVE_OBJECTS' })`, parse the response text as JSON, assert it has `count: number` and `objects: Array` keys. Do not assert non-empty; the list may be empty depending on system state.
  - `SAPRead — second call after external mutation returns fresh body` — use the `ZARC1_TEST_REPORT` fixture: read once, modify via `SAPWrite` + `SAPActivate` (changes the etag), read again, assert the third read body matches the modified body (not the original). Cleanup: restore original body in `finally`. Use `generateUniqueName()` for any transient objects. Skip with `requireOrSkip` if write capability is unavailable.
- [ ] Run `npm run test:integration` (with credentials configured per `INFRASTRUCTURE.md`) — new tests pass against a4h.
- [ ] Run `npm run test:e2e` (with MCP server running per `docs/setup-guide.md`) — new tests pass.
- [ ] Run `npm test` — full unit suite still passes; no regressions introduced by integration/E2E test additions.

---

### Task 9: Update documentation — README, CLAUDE.md, create docs/caching.md

**Files:**
- Modify: `README.md`
- Modify: `CLAUDE.md`
- Create: `docs/caching.md`
- Modify: `compare/00-feature-matrix.md`

The README's "Built-in Object Caching" section claims "repeated reads return instantly without calling SAP" — true within a session, but post-PR the stronger claim is "repeated reads stay correct even after external activations, with one ~50-byte conditional GET per read." CLAUDE.md's "Architecture: Request Flow" section omits the ETag round-trip; adding a step preserves architectural accuracy. The README links to `docs/caching.md` which doesn't exist — create it as part of this task to fix the broken link. The feature matrix row 182 ("Inactive objects list") shows ARC-1 with ✅ but the path bug had it returning empty for years; refresh the row to reflect the genuine state post-fix.

- [ ] In `README.md` at lines 50-57 ("Built-in Object Caching"), rewrite to mention the conditional-GET model. Suggested replacement bullets:
  - **Server-validated freshness** — every cached source is tagged with the server's ETag. Repeated reads send `If-None-Match`; SAP returns HTTP 304 (~50 bytes) if unchanged or 200 with fresh body if anything changed externally. Cache stays correct across SE80/Eclipse activations.
  - **In-memory or SQLite** — automatic per-process in stdio, persistent SQLite for `http-streamable` and Docker.
  - **Dependency graph caching** — `SAPContext` dep resolution keyed by source hash; unchanged objects skip all dependent ADT calls.
  - **Pre-warmer** (existing bullet, keep as-is).
  - **Write invalidation** (existing bullet, keep as-is).
- [ ] Create `docs/caching.md`. Structure:
  - **Overview** (1 paragraph): the cache is correct by construction via HTTP `If-None-Match`; no TTL.
  - **Two backends** (table): MemoryCache (stdio), SqliteCache (http-streamable + Docker), warmup overlay for reverse-dep lookup.
  - **Source cache** subsection: keyed by `(type, name, version)`. Stores body + etag. Default version is active.
  - **Conditional GET flow** (sequence diagram in plain text):
    ```
    Read 1 (cache miss):
      handler → CachingLayer.getSource → fetcher(undefined)
      fetcher → http.get(/source/main) → 200 + etag=E1 + body
      cache.putSource(type, name, body, { etag: E1 })
      return body

    Read 2 (cache hit, server says unchanged):
      handler → CachingLayer.getSource → has cached etag=E1 → fetcher(E1)
      fetcher → http.get(/source/main, { 'If-None-Match': E1 }) → 304 + empty body
      return cached body, hit=true, revalidated=true  →  [cached:revalidated]

    Read 3 (external activation; server returns new body):
      handler → CachingLayer.getSource → has cached etag=E1 → fetcher(E1)
      fetcher → http.get(/source/main, { 'If-None-Match': E1 }) → 200 + etag=E2 + new body
      cache.putSource(type, name, new body, { etag: E2 })
      return new body, hit=false  →  fresh content, no [cached] prefix
    ```
  - **Dep graph cache**: keyed by source SHA-256 hash. Naturally correct — when source changes the hash changes and the dep graph misses. Safe to keep across external activations because the source-cache layer above ensures the hash is always fresh.
  - **Why no TTL**: HTTP `If-None-Match` is structurally correct; TTLs gamble on freshness. ETag predates SAP_BASIS 7.50 — works on every supported release. SAP Notes 1760222 (2012), 1814370 (2013) document the server-side mechanism.
  - **Inactive vs active** (new subsection): cache key includes a `version` dimension because the server emits distinct ETags per `cl_adt_utility=>calculate_etag_base()` (`...001` for active, `...000` for inactive). Currently only the active dimension is exercised by handlers; the inactive dimension is wired internally for future use.
  - **What invalidates**: SAPWrite mutations call `cachingLayer.invalidate(type, name)` (active version). gCTS sync calls `invalidate` per-synced-object. External activations are caught by the next conditional GET (304 → cached, 200 → replaced). External deletions are caught by the next conditional GET returning 404 — `CachingLayer.getSource` invalidates the entry before re-throwing the `AdtApiError`, keeping the cache database in sync with the backend ([requested in #183 follow-up](https://github.com/marianfoo/arc-1/issues/183)).
  - **Considered alternatives** (new subsection): document why the four other approaches we evaluated were rejected, so future readers don't burn cycles re-discovering the rationale. Each alternative gets one paragraph:
    - **Disable cache by default (the original #183 quick-fix instinct)** — kills the dep-graph cache, which is the killer feature for `SAPContext` (10–30× speedup on dependency-resolution workflows). Trades a fixable correctness bug for a permanent performance regression on the headline token-efficiency feature. Also: doesn't actually fix anything for the within-session case.
    - **TTL-based revalidation** — gambles on freshness. Any value > 0 means a window where stale source can be served; any value of 0 means the cache is disabled. The `cached_at` column was already in the SQLite schema for this design but it is structurally inferior to ETag: same RTT count, no bandwidth savings, requires admin tuning (always wrong by default for some user). HTTP gives us a content-validated mechanism for free; TTL would be reinventing the worse version.
    - **Versions-feed lazy revalidation** (parsing `/source/main/versions` Atom feed and comparing the latest revision timestamp) — only updates on activation, so it cannot catch un-activated drafts. Requires Atom XML parsing (extra code surface). Same RTT cost as ETag conditional GET on every revalidation. ETag wins on every dimension.
    - **Transport-system timestamp comparison** (looking up when each object was included in a transport, comparing against `cached_at`) — suggested in passing in the [#183 follow-up](https://github.com/marianfoo/arc-1/issues/183) before the reporter walked themselves out of it. Requires multiple ADT calls per cache check (transport list, transport contents, timestamp parsing), high token cost on shared service-account deployments, and still doesn't catch un-activated drafts or workbench-direct edits that bypass transports. Strictly inferior to ETag.
    - Conclude with: ETag conditional GET wins because the server is the source of truth for freshness, the round-trip is cheap (~50 bytes on cache hit), and the mechanism predates SAP_BASIS 7.50 (notes 1760222, 1814370) so there's no per-release feature gating.
- [ ] In `CLAUDE.md`, update the "Architecture: Request Flow" diagram in the "Architecture" section (look for `## Architecture: Request Flow` heading). Add the ETag step under "HTTP Request" — between "Cookie/session management" and "Stateful sessions for lock→modify→unlock sequences" add: "ETag round-trip (`If-None-Match` on cached source reads → 304 Not Modified)".
- [ ] In `CLAUDE.md`, update the "Key Files for Common Tasks" table by adding a row: `| Add cache freshness mechanism | src/cache/caching-layer.ts (getSource), src/cache/cache.ts (CachedSource etag/version), src/cache/memory.ts + sqlite.ts (storage), src/adt/client.ts (source-fetching methods) |`.
- [ ] In `compare/00-feature-matrix.md` line 182, update the "Inactive objects list" row to add a footnote or comment indicating the path was fixed in PR #N (will be filled by ralphex when the PR ships). Example: change `✅ |` to `✅ (fixed PR #XXX) |` in the ARC-1 column. Refresh the "Last Updated" date at the top of the file to today.
- [ ] Run `npm run lint` (linter sees `.md` indirectly via repository structure but won't fail) and verify no broken code references in the new doc.
- [ ] Run `npm test` — full unit suite still passes; no regressions introduced by edits to documented code paths.

---

### Task 10: Final verification

- [ ] Run full unit test suite: `npm test` — all tests pass.
- [ ] Run typecheck: `npm run typecheck` — no errors.
- [ ] Run lint: `npm run lint` — no errors.
- [ ] Run integration tests against a4h: `npm run test:integration` (requires `TEST_SAP_*` env vars per `INFRASTRUCTURE.md`) — all new conditional-GET and inactive-list tests pass.
- [ ] Run E2E tests: `npm run test:e2e` (requires running MCP server — see `docs/setup-guide.md`) — all new e2e tests pass.
- [ ] Manual smoke test: with `ARC1_CACHE=memory` and `ARC1_LOG_FORMAT=json`, run `arc-1` against a4h, call `SAPRead(type='PROG', name='RSPARAM')` twice via an MCP client, verify the second response has `[cached]` indicator and the audit log shows the second HTTP call returned status 304.
- [ ] Manual smoke test 2: call `SAPRead(type='INACTIVE_OBJECTS')` against a4h with the test user MARIAN (who has known inactive drafts) — assert the response contains a non-empty `objects` array with `BDEF/BDO`, `DDLS/DF`, etc. entries (not the "Inactive objects listing is not available" message).
- [ ] Manual smoke test 3 (404-invalidation cycle): the goal is to verify the read-side 404-invalidation path actually fires. The naive approach of using `SAPWrite(delete)` to remove the object is a **false positive** — SAPWrite already calls `cachingLayer.invalidate(...)` which removes the cache entry before any read can trigger the 404 path. To exercise the read-side path, the deletion must bypass the cache layer entirely. With `ARC1_CACHE=memory` and `SAP_ALLOW_WRITES=true` against a4h:
  1. Run ARC-1 with `ARC1_CACHE=memory` and connect via an MCP client.
  2. Create a transient `$TMP` program via `SAPWrite(action='create', type='PROG', name='ZARC1_TMP_404TEST', source='REPORT zarc1_tmp_404test.', package='$TMP')`.
  3. Read it via `SAPRead(type='PROG', name='ZARC1_TMP_404TEST')` — verify source returns and `SAPManage(action='cache_stats')` shows `sourceCount=1`.
  4. Delete the object **outside the running ARC-1 process** — open a second terminal and run a raw curl: `curl -sS -u "$TEST_SAP_USER:$TEST_SAP_PASSWORD" -X DELETE "$TEST_SAP_URL/sap/bc/adt/programs/programs/ZARC1_TMP_404TEST?lockHandle=$(...)"` (you'll need to acquire a lock first via `_action=LOCK` and pass the handle). The point is: the running ARC-1 has no signal of the deletion — its cache still holds the stale entry. Alternative: use SE80/Eclipse to delete (works if you have GUI access).
  5. Read again via the same MCP session — verify the read fails with a 404 error.
  6. Verify `SAPManage(action='cache_stats')` now shows `sourceCount=0` — the 404-invalidation path in `CachingLayer.getSource` removed the stale entry.

  This test demonstrates the issue #183 follow-up requirement that "if the element is not there, the database entries should be deleted as well." A test that uses `SAPWrite(delete)` from the same MCP server can NOT verify this code path — SAPWrite's invalidation runs before any read-side 404 is observed.
- [ ] Move this plan to `docs/plans/completed/etag-conditional-get-and-inactive-objects-fix.md`.

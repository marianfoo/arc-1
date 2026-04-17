# Caching System

## Overview

ARC-1 includes a built-in caching layer that sits between the intent handler and the ADT client. Its purpose is to reduce redundant HTTP calls to the SAP system, speed up responses for repeated operations, and enable features like reverse dependency lookup that would otherwise require expensive full-system scans on every request.

The cache stores five types of data:

- **Source code** -- raw ABAP source keyed by `(objectType, objectName)`, with a SHA-256 content hash.
- **Dependency graphs** -- compressed dependency contracts keyed by source hash.
- **Dependency edges** -- directional relationships between objects (CALLS, USES, IMPLEMENTS, INCLUDES).
- **Node metadata** -- object type, name, package, and source hash for each cached object.
- **Function group mappings** -- which function module belongs to which function group.

The system operates in three tiers of increasing capability:

| Tier | Transport | Backend | Lifetime | Features |
|------|-----------|---------|----------|----------|
| 1 | stdio (Claude Desktop) | Memory | Single session | Dedup fetches within session |
| 2 | http-streamable (server) | SQLite | Persists across sessions | Shared warm cache for all sessions |
| 3 | Docker + warmup | SQLite + pre-warmer | Persists + pre-indexed | Reverse dependency lookup, sub-second dep resolution |

## Configuration

All cache settings follow the standard ARC-1 configuration priority: CLI flags > environment variables > `.env` file > defaults.

| Env Variable | CLI Flag | Values | Default | Description |
|-------------|----------|--------|---------|-------------|
| `ARC1_CACHE` | `--cache` | `auto`, `memory`, `sqlite`, `none` | `auto` | Cache backend selection. `auto` picks memory for stdio, SQLite for http-streamable. |
| `ARC1_CACHE_FILE` | `--cache-file` | File path | `.arc1-cache.db` | Path to the SQLite database file. Relative paths resolve from the working directory. |
| `ARC1_CACHE_WARMUP` | `--cache-warmup` | `true`, `false` | `false` | Run the pre-warmer on startup (enumerates TADIR, fetches all custom objects). |
| `ARC1_CACHE_WARMUP_PACKAGES` | `--cache-warmup-packages` | Comma-separated patterns | (empty = all custom) | Package filter for warmup. Supports wildcards. |

### Auto mode behavior

When `ARC1_CACHE=auto` (the default):

- **stdio transport** -- uses in-memory cache. No files created, no persistence. The cache dies with the process.
- **http-streamable transport** -- uses SQLite. The database file is created at the path specified by `ARC1_CACHE_FILE`.

To disable caching entirely, set `ARC1_CACHE=none`.

## How It Works

### Source code caching

Every time ARC-1 fetches source code from SAP (classes, interfaces, programs, functions, etc.), the response is stored in the cache keyed by `OBJECTTYPE:OBJECTNAME` (uppercased). A SHA-256 hash of the source content is computed and stored alongside it.

On subsequent requests for the same object, the cached source is returned immediately without an ADT call. When a cached source is returned via SAPRead, the response is prefixed with `[cached]` so the caller knows the result came from cache. This matches the behavior of SAPContext dependency results.

### Hash-on-fetch mechanism

The SHA-256 hash serves a dual purpose:

1. **Dependency graph cache key** -- dependency graphs (the contracts extracted by the AST parser) are keyed by the source hash, not by the object name. If the source code hasn't changed, the hash is the same, and the entire dependency resolution is skipped -- no AST parsing, no downstream fetches.

2. **Delta detection during warmup** -- when the pre-warmer re-runs, it compares the hash of freshly fetched source against the cached hash. If they match, the object is skipped entirely (no dep extraction, no edge updates).

### Dependency graph caching

When `SAPContext` resolves dependencies for an object, the result is a list of contracts (compressed representations of each dependency). This list is stored keyed by the source hash. On the next request:

1. Fetch source (cache hit or miss).
2. Compute hash.
3. Look up dep graph by hash.
4. If found, return cached contracts -- zero additional ADT calls.
5. If not found, resolve deps normally, then store the result.

### Function group resolution caching

Function modules in SAP belong to function groups, but the mapping is not encoded in the module name. ARC-1 must search ADT to resolve which group a function belongs to. These mappings are cached permanently (they rarely change) to avoid repeated search calls.

### Write invalidation

When `SAPWrite` modifies an object, the cache entry for that object's source is invalidated. The next read will fetch fresh source from SAP, compute a new hash, and trigger dependency re-resolution if needed. This ensures the cache never serves stale source after a write.

## Cache Strategies by Deployment

| Aspect | stdio (Claude Desktop) | http-streamable (server) | Docker + warmup |
|--------|----------------------|------------------------|-----------------|
| **Backend** | Memory | SQLite | SQLite |
| **Persistence** | None (session-scoped) | Across restarts | Across restarts |
| **Config needed** | None (zero config) | None (auto-detects) | `ARC1_CACHE_WARMUP=true` |
| **First request** | Always cold | Warm after first session | Pre-warmed on startup |
| **Reverse deps** | Not available | Not available | Available (`SAPContext(action="usages")`) |
| **Multi-user** | N/A (single user) | Shared cache | Shared cache |
| **Typical setup** | `npx arc-1` | `arc-1 --transport http-streamable` | See Docker section below |

### stdio (Claude Desktop)

No configuration required. The memory cache eliminates duplicate fetches within a single conversation. When the process exits, the cache is gone.

```json
{
  "mcpServers": {
    "arc1": {
      "command": "npx",
      "args": ["-y", "arc-1"],
      "env": {
        "SAP_URL": "http://sap-host:50000",
        "SAP_USER": "developer",
        "SAP_PASSWORD": "secret"
      }
    }
  }
}
```

### http-streamable (server)

SQLite cache is selected automatically. The database persists across server restarts, so the second session benefits from the first session's fetches.

```bash
arc-1 --transport http-streamable \
      --url http://sap-host:50000 \
      --user developer \
      --password secret
```

### Docker with warmup

Full-strength caching with pre-indexed dependency graph and reverse lookup support.

```bash
docker run -d \
  -e SAP_URL=http://sap-host:50000 \
  -e SAP_USER=developer \
  -e SAP_PASSWORD=secret \
  -e SAP_TRANSPORT=http-streamable \
  -e ARC1_CACHE_WARMUP=true \
  -e ARC1_CACHE_WARMUP_PACKAGES="Z*,Y*" \
  -v arc1-cache:/app/cache \
  -e ARC1_CACHE_FILE=/app/cache/arc1.db \
  -p 8080:8080 \
  ghcr.io/marianfoo/arc-1
```

## Pre-Warmer

The pre-warmer runs at startup when `ARC1_CACHE_WARMUP=true`. It populates the cache with all custom objects so that the first user request is fast and reverse dependency lookups are available.

### Pipeline

1. **Enumerate** -- queries TADIR for all objects of type CLAS, INTF, and FUGR where the object name starts with `Z*`, `Y*`, or `/*` (namespaced).
2. **Fetch** -- retrieves source code for each object in parallel batches of 5 concurrent requests.
3. **Delta check** -- compares the SHA-256 hash of fetched source against the cached hash. If unchanged, the object is skipped (no re-parsing).
4. **Extract** -- runs the local AST parser (`@abaplint/core`) on each changed source to extract dependencies. No additional ADT calls are needed for this step.
5. **Index** -- stores source, node metadata, and dependency edges in the cache. For function groups, individual function modules are enumerated and indexed separately.
6. **Enable reverse lookup** -- sets the `warmupDone` flag, which enables `SAPContext(action="usages")`.

### Package filter syntax

The `ARC1_CACHE_WARMUP_PACKAGES` value is a comma-separated list of patterns. Each pattern maps to a SQL `LIKE` clause on the TADIR `DEVCLASS` column. The `*` wildcard maps to `%`.

| Filter | Effect |
|--------|--------|
| (empty) | All custom objects (Z*, Y*, /*) |
| `ZPROJECT` | Only package ZPROJECT (exact match) |
| `Z*` | All packages starting with Z |
| `Z*,Y*` | All Z and Y packages |
| `/COMPANY/*` | All packages in the /COMPANY/ namespace |
| `ZMOD1,ZMOD2,/NS/*` | Specific packages plus a namespace |

### Timing estimates

Estimates assume 5 concurrent requests (the default `WARMUP_CONCURRENT` value) and typical on-premise network latency:

| System size | Objects | Estimated time |
|------------|---------|---------------|
| Small | ~500 | 2-3 minutes |
| Medium | ~2,000 | 8-12 minutes |
| Large | ~5,000 | 20-30 minutes |

Delta re-runs are significantly faster because unchanged objects are skipped after hash comparison. Only objects with modified source are re-fetched and re-parsed.

The maximum number of objects per warmup run is capped at 10,000 (`WARMUP_MAX_OBJECTS`).

### Docker cron example

To keep the cache fresh on a running Docker container, schedule periodic re-warmup via cron or an external scheduler:

```bash
# Re-run warmup every 4 hours via docker exec
# (the server handles this as a SAPManage action, or restart the container)
0 */4 * * * docker restart arc1-container
```

Alternatively, mount the SQLite database on a persistent volume so that restarts with `ARC1_CACHE_WARMUP=true` perform a delta update rather than a full re-index:

```bash
docker run -d --name arc1 \
  -v arc1-cache:/app/cache \
  -e ARC1_CACHE_FILE=/app/cache/arc1.db \
  -e ARC1_CACHE_WARMUP=true \
  -e ARC1_CACHE_WARMUP_PACKAGES="Z*" \
  # ... other env vars ...
  ghcr.io/marianfoo/arc-1
```

## Reverse Dependency Lookup

### What it does

`SAPContext(action="usages", name="ZCL_MY_CLASS")` returns all objects that depend on the given object -- i.e., "who calls/uses this class?"

This is a reverse lookup on the edge index: find all edges where `toId` matches the target object.

### Requirements

Reverse dependency lookup is only available after the pre-warmer has run. The `warmupDone` flag must be set to `true`. Without warmup, the edge index is empty and there is nothing to reverse-look-up.

### How it works

1. The pre-warmer extracts dependencies from every indexed object and stores them as directed edges (`fromId -> toId`).
2. When `getUsages(objectName)` is called, the cache queries all edges where `toId = objectName.toUpperCase()`.
3. Results include the calling object (`fromId`) and the relationship type (`CALLS`, `USES`, `IMPLEMENTS`, `INCLUDES`).

### Fallback when warmup is not available

If warmup has not run, `SAPContext(action="usages", ...)` returns an `isError: true` response with setup instructions — telling the caller to start ARC-1 with `--cache-warmup` (or `ARC1_CACHE_WARMUP=true`), wait for indexing to complete, then retry.

## Performance Impact

| Scenario | Description | Estimated ADT call savings |
|----------|-------------|---------------------------|
| A | Single session, no warmup (memory cache) | 50-60% -- eliminates duplicate fetches within the session |
| B | Same session with warmup (SQLite, pre-indexed) | 85-95% -- most source and all deps served from cache |
| C | Productive system, multiple users (shared SQLite) | Sub-linear scaling -- each user benefits from objects fetched by others |

The biggest savings come from dependency graph caching. A single `SAPContext` call for a class with 15 dependencies would normally require 16+ ADT calls (1 for the class + 1 per dependency). With a warm cache and unchanged source, this drops to 0 ADT calls.

## Disk Space

### What is stored

| Data type | Storage per object | Notes |
|-----------|-------------------|-------|
| Source code | Varies (typically 2-50 KB) | Full ABAP source text |
| Dependency graphs | ~1-5 KB per object | JSON-serialized contract list |
| Edges | ~100 bytes each | One row per dependency relationship |
| Node metadata | ~200 bytes each | Object type, name, package, hash |
| Function group mappings | ~100 bytes each | Function name to group name |

### Typical database sizes

| System size | Custom objects | Approximate SQLite size |
|------------|---------------|------------------------|
| Small | ~500 | 35-50 MB |
| Medium | ~2,000 | 60-100 MB |
| Large | ~5,000 | 100-150 MB |

### CPU overhead

- **SHA-256 hashing**: negligible (~0 ms per object for typical source sizes).
- **AST parsing** (`@abaplint/core`): approximately 10 ms per object. This only runs on cache misses or during warmup for changed objects.
- **SQLite I/O**: single-digit milliseconds for reads; writes are batched during warmup.

## Limitations and Caveats

Understanding these limitations helps you avoid surprises in production.

### External writes are not detected

The cache is only invalidated when **ARC-1 itself** performs a write via `SAPWrite`. If someone modifies ABAP objects through other tools (ABAP Development Tools in Eclipse, SE38, transaction ABAP Workbench, or another ARC-1 instance), the cache will serve stale source until:

- The server restarts (memory cache) or the SQLite file is deleted
- ARC-1 performs its own write on the same object (triggers automatic invalidation)

**Mitigation:** For collaborative development environments, use stdio mode (memory cache dies on process exit) or restart the http-streamable server after external changes.

### No TTL — entries never expire automatically

Cache entries have no expiry time. A source entry stored today will still be returned a week later unless explicitly invalidated by an ARC-1 write. This is intentional (SAP objects rarely change without a write) but means stale data is possible if the same object is modified externally.

### Warmup covers CLAS, INTF, and FUGR only

The pre-warmer enumerates TADIR and only indexes objects of type `CLAS` (classes), `INTF` (interfaces), and `FUGR` (function groups). Programs (`PROG`), includes (`INCL`), CDS views (`DDLS`), behavior definitions (`BDEF`), and other types are **not** pre-indexed.

This means:
- `SAPContext(action="usages")` only finds callers among indexed object types (classes, interfaces, function groups).
- Programs that call a class won't appear in usages results.
- On-demand caching (reading PROG/DDLS/etc.) still works — those types are cached the first time they're read, they just aren't in the edge index.

### SQLite requires a native addon

The SQLite backend uses `better-sqlite3`, a native Node.js addon compiled for the host platform. If the addon is missing or compiled for a different platform, ARC-1 automatically falls back to an in-memory cache and logs a warning:

```
WARN SQLite cache unavailable (better-sqlite3 not loaded) — falling back to memory cache
```

This happens automatically — the server still starts and caches in memory. To verify which backend is active, use `SAPManage(action="cache_stats")`.

### Warmup does not block server startup

The pre-warmer runs concurrently in the background. The server starts accepting MCP requests immediately, even if warmup is still running. During warmup:

- Source reads are served normally (cache misses go to SAP, hits return immediately).
- `SAPContext(action="usages")` returns a "warmup not complete" error until warmup finishes.
- `SAPManage(action="cache_stats")` shows `warmupAvailable: false` while in progress.

### The [cached] marker in SAPContext output

When `SAPContext(action="deps")` resolves dependencies from the cache (zero ADT calls), the output header includes `[cached]`:

```
* === Dependency context for ZCL_ORDER (3 deps resolved) [cached] ===
```

Without the marker, some or all dependencies were freshly fetched from SAP. First call after server start will not show `[cached]`. Subsequent calls for unchanged objects will.

---

## Monitoring

Use `SAPManage(action="cache_stats")` to inspect the current state of the cache:

```json
{
  "enabled": true,
  "warmupAvailable": true,
  "nodeCount": 1523,
  "edgeCount": 8742,
  "apiCount": 0,
  "sourceCount": 1523,
  "contractCount": 1401
}
```

| Field | Description |
|-------|-------------|
| `enabled` | Whether caching is active (`false` when `ARC1_CACHE=none`) |
| `warmupAvailable` | Whether the pre-warmer has completed (enables reverse dep lookup) |
| `sourceCount` | Number of cached source code entries |
| `contractCount` | Number of cached dependency graphs |
| `edgeCount` | Number of dependency edges (used for reverse lookup) |
| `nodeCount` | Number of cached object metadata entries |
| `apiCount` | Number of cached released API entries (for clean core checks) |

When `enabled` is `false`, caching is disabled and all fields except `enabled` and `message` are absent.

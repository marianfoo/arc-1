# Phase 1: ADT Filestore Read Operations

## Goal

Add read-only BSP/UI5 app browsing capabilities to ARC-1 via the ADT Filestore API. This enables reading deployed Fiori apps, browsing their file structure, and retrieving file content — useful for understanding existing apps, verifying deployments, and debugging.

## Why First

- Immediate standalone value — users can browse deployed Fiori apps today
- No write operations — low risk, no safety concerns
- Feature probe already exists (`src/adt/features.ts:38`)
- Foundation for verifying Phase 4 deployments later

## API Summary

| Operation | Endpoint | Response |
|-----------|----------|----------|
| List/search apps | `GET /sap/bc/adt/filestore/ui5-bsp/objects?name={pattern}` | Atom XML feed of apps |
| Browse folder | `GET /sap/bc/adt/filestore/ui5-bsp/objects/{encodeURIComponent(app+path)}/content` | Atom XML feed (files/folders) |
| Read file | `GET /sap/bc/adt/filestore/ui5-bsp/objects/{encodeURIComponent(app+path)}/content` | Raw file content |

See `docs/plans/fiori-deployment-api-reference.md` Part 2 for full specs.

## Implementation Tasks

### 1. Add client methods (`src/adt/client.ts`)

```typescript
/** List deployed BSP/UI5 applications */
async listBspApps(query?: string, maxResults?: number): Promise<BspAppInfo[]>

/** Get BSP app file/folder structure (non-recursive, one level) */
async getBspAppStructure(appName: string, subPath?: string): Promise<BspFileNode[]>

/** Read a file from a deployed BSP app */
async getBspFileContent(appName: string, filePath: string): Promise<string>
```

Safety: All use `checkOperation(safety, OperationType.Read, 'GetBSPApp')`.

### 2. Add types (`src/adt/types.ts`)

```typescript
interface BspAppInfo {
  name: string;
  description: string;
}

interface BspFileNode {
  name: string;       // "Component.js"
  path: string;       // "/Component.js"
  type: 'file' | 'folder';
  etag?: string;      // "20230112203908" (files only)
}
```

### 3. Add XML parser (`src/adt/xml-parser.ts`)

Parse Atom XML feed responses. Key points:
- Use `fast-xml-parser` with `removeNSPrefix: true` (already configured in ARC-1)
- Normalize single entry vs array: `Array.isArray(feed.entry) ? feed.entry : [feed.entry]`
- File vs folder: `<category term="file"/>` vs `<category term="folder"/>`
- Extract `afr:etag` from file entries

### 4. Add SAPRead types (`src/handlers/tools.ts`)

Add `BSP` type to SAPRead:
- `SAPRead(type="BSP")` → list all BSP apps (or search with `name` param)
- `SAPRead(type="BSP", name="ZAPP_BOOKING")` → browse root file structure
- `SAPRead(type="BSP", name="ZAPP_BOOKING", include="i18n")` → browse subfolder
- `SAPRead(type="BSP", name="ZAPP_BOOKING", include="manifest.json")` → read file content

Auto-detect file vs folder by checking if `include` looks like a file (has extension) vs folder.

### 5. Add intent handler (`src/handlers/intent.ts`)

Handle BSP type in the SAPRead handler:
- No `name` → `listBspApps()`
- `name` without `include` → `getBspAppStructure(name)`
- `name` with `include` (folder) → `getBspAppStructure(name, include)`
- `name` with `include` (file) → `getBspFileContent(name, include)`

### 6. Feature gate

Only show BSP type in tool description when `features.ui5.available === true`. Already have the feature probe — just need to conditionally include BSP in the SAPRead type list.

### 7. Add Zod schema (`src/handlers/schemas.ts`)

Add `BSP` to the SAPRead type enum. The `name` and `include` params already exist.

### 8. Tests

- Unit tests: mock Atom XML responses, test parsing, test URL encoding
- Fixture XML files in `tests/fixtures/xml/` (use real format from open-ux-tools test mocks)

## URL Encoding Warning

The path separator `/` between app name and file path must be **percent-encoded** as `%2f`. The entire `appName + path` is a single URL segment:

```typescript
// CORRECT:
const url = `/sap/bc/adt/filestore/ui5-bsp/objects/${encodeURIComponent(appName + filePath)}/content`;

// WRONG (will 404):
const url = `/sap/bc/adt/filestore/ui5-bsp/objects/${encodeURIComponent(appName)}${filePath}/content`;
```

## Files to Modify

| File | Change |
|------|--------|
| `src/adt/client.ts` | Add `listBspApps()`, `getBspAppStructure()`, `getBspFileContent()` |
| `src/adt/types.ts` | Add `BspAppInfo`, `BspFileNode` interfaces |
| `src/adt/xml-parser.ts` | Add `parseBspAppList()`, `parseBspFolderListing()` |
| `src/handlers/tools.ts` | Add `BSP` to SAPRead types, update descriptions |
| `src/handlers/schemas.ts` | Add `BSP` to SAPRead type enum |
| `src/handlers/intent.ts` | Add BSP case in SAPRead handler |
| `tests/unit/adt/client.test.ts` | Unit tests for new methods |
| `tests/unit/handlers/intent.test.ts` | Handler tests |
| `tests/fixtures/xml/` | Atom XML fixture files |

## Estimated Effort

1-2 days including tests.

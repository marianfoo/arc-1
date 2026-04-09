# Phase 3: ABAP Repository Service (Query/Describe)

## Goal

Add read operations against the `/sap/opu/odata/UI5/ABAP_REPOSITORY_SRV` OData service. This enables querying deployed BSP apps, checking existence, and downloading app content. It also validates the API works with ARC-1's HTTP client before attempting write operations in Phase 4.

## Why Third

- Foundation for Phase 4 deployment — must be able to query before deploying
- **Needs manual testing** — this is an OData service on a different path (`/sap/opu/odata/`) than ADT (`/sap/bc/adt/`). CSRF tokens, cookies, and auth may behave differently.
- Understanding the API's real behavior is essential before implementing writes

## API Summary

**Base path:** `/sap/opu/odata/UI5/ABAP_REPOSITORY_SRV`
**Available since:** SAP_UI 7.53

| Operation | Method | Path |
|-----------|--------|------|
| Get app info | GET | `/Repositories('{name}')?$format=json` |
| Download app | GET | `/Repositories('{name}')?CodePage=UTF8&DownloadFiles=RUNTIME&$format=json` |
| Service metadata | GET | `/$metadata` |

See `docs/plans/fiori-deployment-api-reference.md` Part 1 for full specs.

## Key Technical Questions (Need Manual Testing)

1. **CSRF token sharing:** Does the ADT CSRF token (fetched from `/sap/bc/adt/core/discovery`) work for `/sap/opu/odata/` requests? Or does the OData service require its own CSRF token?

2. **Cookie sharing:** Are session cookies from ADT valid for the OData service on the same host? (Likely yes — same domain.)

3. **Auth sharing:** Does the same basic auth / BTP OAuth work? (Likely yes — same SAP system.)

4. **Feature detection:** What's the best way to probe if the service is available?
   - `HEAD /sap/opu/odata/UI5/ABAP_REPOSITORY_SRV` → 200 means available
   - Or check via ADT Discovery catalog?

5. **Response format:** Verify the JSON response structure matches what open-ux-tools expects (`{ d: { Name, Package, Description, ZipArchive } }`).

6. **Error format:** Verify error response JSON format for 404, 401, 403.

## Implementation Tasks

### 1. Create new module (`src/adt/ui5-repository.ts`)

```typescript
/**
 * Client for the SAPUI5 ABAP Repository OData Service.
 * Used for querying and deploying BSP/UI5 applications.
 *
 * This is a separate service from ADT (/sap/opu/odata/ vs /sap/bc/adt/).
 * May require separate CSRF token handling.
 */

const SERVICE_PATH = '/sap/opu/odata/UI5/ABAP_REPOSITORY_SRV';

interface BspAppMetadata {
  Name: string;
  Package: string;
  Description: string;
  Info: string;
  ZipArchive?: string; // base64-encoded ZIP (only with DownloadFiles param)
}

/** Check if a BSP app exists and get its metadata */
async function getAppInfo(http, name): Promise<BspAppMetadata | undefined>

/** Download app files as base64-encoded ZIP */
async function downloadApp(http, name): Promise<Buffer | undefined>

/** Check if the ABAP Repository service is available */
async function probeService(http): Promise<boolean>
```

### 2. Handle CSRF for OData service

Two approaches to investigate:

**Option A:** Reuse ADT CSRF token — try the existing token from `src/adt/http.ts`. If it works, no changes needed.

**Option B:** Fetch separate CSRF token — add `X-Csrf-Token: Fetch` header to the first GET request to the OData service. Store and reuse for subsequent requests.

Test both during manual testing. Prefer Option A if it works.

### 3. Add feature probe (`src/adt/features.ts`)

```typescript
{ id: 'ui5repo', endpoint: '/sap/opu/odata/UI5/ABAP_REPOSITORY_SRV', description: 'UI5 ABAP Repository' },
```

This probes whether the OData service is available (SAP_UI 7.53+).

### 4. Expose via SAPRead or SAPManage

Option: Add `BSP_REPO` type to SAPRead (distinct from `BSP` which is the filestore):
- `SAPRead(type="BSP_REPO", name="ZAPP_BOOKING")` → get app metadata (name, package, description)
- `SAPRead(type="BSP_REPO", name="ZAPP_BOOKING", include="download")` → download as ZIP

Or: Extend the Phase 1 `BSP` type to also support metadata queries. The handler would check the feature flag and route to the appropriate API.

### 5. Tests

- Unit tests: mock OData JSON responses
- Manual testing on a real SAP system is **mandatory** for this phase

## Open Questions

- Can we reuse `src/adt/http.ts` for OData paths, or do we need a separate HTTP client?
- How does `sap-client` parameter work with OData services? (ADT uses `sap-client` query param)
- Does the `ABAP_REPOSITORY_SRV` work on BTP ABAP Environment, or only on-prem?
- What happens when `SAP_UI < 7.53`?

## Files to Create/Modify

| File | Change |
|------|--------|
| `src/adt/ui5-repository.ts` | **New** — OData client for ABAP Repository Service |
| `src/adt/features.ts` | Add `ui5repo` feature probe |
| `src/adt/types.ts` | Add `BspAppMetadata` interface |
| `src/handlers/intent.ts` | Add BSP_REPO handling (or extend BSP) |
| `src/handlers/tools.ts` | Update descriptions |
| `src/handlers/schemas.ts` | Update schemas |
| `tests/unit/adt/ui5-repository.test.ts` | **New** — unit tests |

## Estimated Effort

1-2 days including manual testing and debugging.

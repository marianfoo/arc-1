# Phase 2: Publish Service Binding

## Goal

Add the ability to publish and unpublish service bindings via ADT API. This is the missing step between creating a RAP stack and having a working OData service. After publishing, the Fiori Elements preview URL becomes available — just like clicking "Publish" and "Preview" in ADT Eclipse.

## Why Second

- Eliminates the biggest manual step in RAP generation (Step 13 in `generate-rap-service` skill currently says "create manually in ADT")
- Enables Fiori Elements preview URL without needing a full BSP deployment
- Confirmed working API — used by vibing-steampunk (`PublishServiceBinding`) and mcp-abap-abap-adt-api (`publishServiceBinding`)
- Very small effort (XS)

## API

### Publish

```
POST /sap/bc/adt/businessservices/bindings/{encodeURIComponent(name)}
X-Csrf-Token: {token}
Query: action=publish
```

### Unpublish

```
POST /sap/bc/adt/businessservices/bindings/{encodeURIComponent(name)}
X-Csrf-Token: {token}
Query: action=unpublish
```

### Preview URL (after publish)

For OData V4 bindings, the service URL pattern is:
```
/sap/opu/odata4/sap/{binding_name}/srvd_a2x/sap/{service_definition}/0001/
```

The Fiori Elements preview (on systems with UI5) is accessible via the service binding's preview endpoint. The exact URL depends on the system but typically follows:
```
/sap/bc/adt/businessservices/odatav4/{binding_name}/preview
```

**Note:** The exact preview URL mechanism needs manual testing. The SRVB metadata (already readable via `getSrvb()`) contains the service URL which can be used to construct the preview.

## Implementation Tasks

### 1. Add publish/unpublish to devtools (`src/adt/devtools.ts`)

```typescript
/** Publish a service binding → registers OData service */
export async function publishServiceBinding(
  http: AdtHttpClient,
  safety: SafetyConfig,
  name: string,
): Promise<string> {
  checkOperation(safety, OperationType.Activate, 'PublishServiceBinding');
  const resp = await http.post(
    `/sap/bc/adt/businessservices/bindings/${encodeURIComponent(name)}`,
    '', // empty body
    { /* headers */ },
    { action: 'publish' } // query params
  );
  return resp.body;
}

/** Unpublish a service binding → deregisters OData service */
export async function unpublishServiceBinding(
  http: AdtHttpClient,
  safety: SafetyConfig,
  name: string,
): Promise<string> {
  checkOperation(safety, OperationType.Activate, 'UnpublishServiceBinding');
  const resp = await http.post(
    `/sap/bc/adt/businessservices/bindings/${encodeURIComponent(name)}`,
    '',
    { /* headers */ },
    { action: 'unpublish' }
  );
  return resp.body;
}
```

### 2. Add SAPActivate action (`src/handlers/intent.ts`)

Add `publish_srvb` and `unpublish_srvb` actions to SAPActivate handler:

```typescript
case 'publish_srvb':
  await publishServiceBinding(http, safety, name);
  // Read back to confirm and show service URL
  const srvbInfo = await client.getSrvb(name);
  return textResult(`Service binding ${name} published.\n${srvbInfo}`);

case 'unpublish_srvb':
  await unpublishServiceBinding(http, safety, name);
  return textResult(`Service binding ${name} unpublished.`);
```

### 3. Update tool descriptions (`src/handlers/tools.ts`)

Add `publish_srvb` and `unpublish_srvb` to SAPActivate action enum and description.

### 4. Update Zod schema (`src/handlers/schemas.ts`)

Add the new action values to SAPActivate schema.

### 5. Update generate-rap-service skill

Replace Step 13 "manual creation" instruction. After the SRVB is created (still manual), add:

```
SAPActivate(action="publish_srvb", name="ZSB_<entity>_V4")
```

Then read back to get the service URL:
```
SAPRead(type="SRVB", name="ZSB_<entity>_V4")
```

The skill can then provide the preview URL to the user.

### 6. Safety considerations

- `publishServiceBinding` uses `OperationType.Activate` — blocked by `readOnly` mode
- `unpublishServiceBinding` also `OperationType.Activate`
- Both require write access in safety config

### 7. Tests

- Unit test: mock POST with `?action=publish`, verify URL and method
- Unit test: verify safety check blocks in read-only mode

## Files to Modify

| File | Change |
|------|--------|
| `src/adt/devtools.ts` | Add `publishServiceBinding()`, `unpublishServiceBinding()` |
| `src/handlers/intent.ts` | Add `publish_srvb`, `unpublish_srvb` cases in SAPActivate |
| `src/handlers/tools.ts` | Update SAPActivate description and action enum |
| `src/handlers/schemas.ts` | Add new actions to SAPActivate schema |
| `skills/generate-rap-service.md` | Update Step 13 to include publish step |
| `.claude/commands/generate-rap-service.md` | Same update |
| `tests/unit/adt/devtools.test.ts` | Unit tests |

## Estimated Effort

Half day including tests.

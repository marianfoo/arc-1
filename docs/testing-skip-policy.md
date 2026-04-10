# Testing Skip Policy

This document defines ARC-1's policy for skipping tests. Every skip must be explicit, use a standard API, and include an actionable reason visible in test output.

## Valid Skip Reasons

These are the accepted reasons for a test to skip at runtime:

### Missing SAP Credentials

Integration and E2E tests require a live SAP system. When credentials are not configured, tests skip early in `beforeAll`.

```typescript
const client = getTestClient();
if (!client) return; // handled at suite level — entire describe block skipped
```

### Missing Fixture on Shared System

Some tests depend on objects that may not exist on every SAP system (e.g., DDLS views, custom Z objects).

```typescript
it('extracts CDS dependencies', async (ctx) => {
  requireOrSkip(ctx, cdsName, SkipReason.NO_DDLS);
  // ...test logic...
});
```

### Backend Does Not Support Feature

Older SAP versions or BTP ABAP may lack specific ADT endpoints.

```typescript
it('reads profiler traces', async (ctx) => {
  requireOrSkip(ctx, profilerAvailable, SkipReason.BACKEND_UNSUPPORTED);
});
```

### Optional Custom Objects Not Deployed

E2E tests may require test objects (ZARC1_TEST_REPORT, ZCL_ARC1_TEST, etc.) that are created on demand.

```typescript
it('finds references to ZIF_ARC1_TEST', async (ctx) => {
  if (!hasCustomObjects) return ctx.skip();
  // ...test logic...
});
```

### No Runtime Data Available

Some diagnostics tests check for short dumps or traces that may not exist on a clean system.

```typescript
it('lists short dump details', async (ctx) => {
  if (dumps.length === 0) return ctx.skip('No dumps on system — nothing to verify');
  // ...test logic...
});
```

## Problematic Patterns (DO NOT)

### Early return without skip

```typescript
// BAD: counts as PASS, hides missing prerequisites
it('extracts deps', async () => {
  if (!ddlSource) return; // <-- silent pass, inflates pass count
  // ...never reached...
});
```

### Catch-and-continue without assertion

```typescript
// BAD: swallows real failures
it('reads object', async () => {
  try {
    const result = await client.getProgram('ZTEST');
    expect(result).toBeDefined();
  } catch {
    // skip — no assertion, no skip signal
  }
});
```

### Permanent it.skip without issue tracking

```typescript
// BAD: forgotten, never re-enabled
it.skip('flaky transport test', async () => { ... });
```

If a test must be disabled, file an issue and reference it in a comment.

### Workflow-level skip hiding runtime regressions

Excluding entire test suites from certain event types (e.g., only running integration tests on PRs) can hide regressions introduced by direct pushes to main.

## How to Skip Correctly

### For precondition checks: requireOrSkip

Use `requireOrSkip` when a test depends on a value discovered at runtime (e.g., a DDLS name found during `beforeAll`). It narrows the type and skips with a reason if the value is nullish.

```typescript
import { requireOrSkip } from '../../helpers/skip-policy.js';

it('extracts CDS entity name', async (ctx) => {
  requireOrSkip(ctx, cdsName, 'No DDLS candidate found on system');
  // cdsName is now typed as string (non-null)
  const result = await client.getDdlSource(cdsName);
  expect(result).toContain('define');
});
```

### For runtime decisions: ctx.skip

Use `ctx.skip('reason')` directly when the skip decision depends on runtime state that is not a simple null check.

```typescript
it('verifies dump details', async (ctx) => {
  if (dumps.length === 0) return ctx.skip('No dumps on system — nothing to verify');
  const detail = await client.getShortDumpDetail(dumps[0].id);
  expect(detail).toBeDefined();
});
```

### Always include actionable reason text

The reason should tell someone reading CI output what prerequisite is missing and ideally how to fix it.

Good: `'No DDLS object found on system — deploy a CDS view to enable this test'`
Bad: `'skipped'`

## Skip Reason Constants

The shared helper at `tests/helpers/skip-policy.ts` exports these standard constants:

| Constant | Value | When to use |
|----------|-------|-------------|
| `NO_CREDENTIALS` | SAP credentials not configured | Suite-level skip when `TEST_SAP_URL` is absent |
| `NO_FIXTURE` | Required test fixture not available on system | Expected object not found during discovery |
| `BACKEND_UNSUPPORTED` | Backend does not support this feature | ADT endpoint returns 404/501 |
| `NO_DDLS` | No DDLS object found on system | CDS/DDLS tests when no view is available |
| `NO_DUMPS` | No short dumps found on system | Diagnostics tests on clean systems |
| `NO_CUSTOM_OBJECTS` | Custom Z objects not deployed on system | E2E tests requiring ZARC1_TEST_* objects |

Use these constants for consistency. Add new constants to the helper when a new skip category emerges.

## CI Policy

- Internal PRs and pushes to `main` run all test suites: unit, integration, and E2E.
- External fork PRs skip integration and E2E jobs because repository secrets are not available to forks.
- Tests that skip at runtime (missing fixtures, unsupported features) appear as SKIPPED in reports, not PASSED.
- All skips are visible in CI output and telemetry, making it easy to detect when a system is missing expected prerequisites.

## Reference Patterns

The canonical example of correct skip usage is `tests/e2e/navigate.e2e.test.ts`. It demonstrates:

- A `hasCustomObjects` flag set in `beforeAll` via a lightweight probe
- Individual tests calling `ctx.skip()` when the flag is false
- Tests that run when objects are present make real assertions (not just "defined" checks)

```typescript
// From tests/e2e/navigate.e2e.test.ts
it('finds references to ZIF_ARC1_TEST', async (ctx) => {
  if (!hasCustomObjects) return ctx.skip();
  const result = await callTool(client, 'SAPNavigate', { ... });
  const text = expectToolSuccess(result);
  const refs = JSON.parse(text);
  expect(refs.length).toBeGreaterThanOrEqual(1);
});
```

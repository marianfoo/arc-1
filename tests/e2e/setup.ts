/**
 * E2E fixture sync — keeps persistent test objects aligned with local fixtures.
 *
 * For each object in PERSISTENT_OBJECTS:
 *   1. SAPSearch to discover existing object type(s) on the SAP system
 *   2. If missing → SAPWrite create from fixture → SAPActivate
 *   3. If present but source drifted → SAPWrite delete old object(s) → recreate from fixture
 *   4. If present and source matches fixture → keep as-is
 *
 * Objects are created in $TMP and intended only for automated E2E validation.
 */

import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { PERSISTENT_OBJECTS, readFixture } from './fixtures.js';
import { callTool, type ToolResult } from './helpers.js';

type PersistentObject = (typeof PERSISTENT_OBJECTS)[number];

export interface FixtureSyncSummary {
  created: string[];
  recreated: string[];
  unchanged: string[];
  deleted: string[];
  /**
   * Fixtures whose create/recreate hit a known backend quirk (e.g. NW 7.50
   * lock-handle 423, DOMA/DTEL endpoint 404) — recorded here instead of
   * aborting the whole sync so tests can cleanly skip via `requireOrSkip` /
   * `expectToolSuccessOrSkip` based on the same taxonomy.
   */
  skipped: Array<{ label: string; reason: string }>;
}

/**
 * Classify a fixture-sync error message against the release-gap / backend-quirk
 * taxonomy. Kept in sync with `classifyToolErrorSkip()` in tests/e2e/helpers.ts
 * and `ddicSkipReason()` in tests/integration/crud.lifecycle.integration.test.ts
 * (see docs/integration-test-skips.md).
 */
export function classifyFixtureError(message: string): string | null {
  if (/status 423.*invalid lock handle/i.test(message)) {
    return 'NW 7.50 lock-handle session correlation differs — create+PUT sequence returns 423 on this release';
  }
  // A stale partial-create from a previous failed sync run: the object shell
  // exists on SAP but wasn't indexed / populated, so our SAPSearch returns empty
  // yet SAPWrite(create) fails with 500 "already exists". Rather than fighting
  // it here — which would need a delete-under-lock that may also 423 on 7.50 —
  // skip cleanly and surface the situation to the operator.
  if (/A program or include already exists/i.test(message) || /does already exist/i.test(message)) {
    return 'Stale partial-create detected (object exists on SAP but not indexed) — delete manually via SE80 and re-run sync';
  }
  if (/\/sap\/bc\/adt\/ddic\/domains(?:\/|\b).*(?:does not exist|not found)/i.test(message)) {
    return '/ddic/domains endpoint not available on this release';
  }
  if (/\/sap\/bc\/adt\/ddic\/dataelements\b.*Unsupported Media Type/i.test(message)) {
    return 'DTEL v2 content type not supported on this release';
  }
  if (/\/sap\/bc\/adt\/ddic\/tables(?:\?|\b).*(?:does not exist|not found)/i.test(message)) {
    return '/ddic/tables collection not available on this release';
  }
  if (/\/sap\/bc\/adt\/packages\b.*(?:No suitable|does not exist)/i.test(message)) {
    return '/packages endpoint not available on this release';
  }
  return null;
}

/**
 * Ensure all persistent test objects exist on SAP and match fixture content.
 * Existing objects with source drift are deleted and recreated.
 */
export async function syncPersistentFixtures(client: Client): Promise<FixtureSyncSummary> {
  const summary: FixtureSyncSummary = {
    created: [],
    recreated: [],
    unchanged: [],
    deleted: [],
    skipped: [],
  };

  for (const obj of PERSISTENT_OBJECTS) {
    const label = `${obj.type} ${obj.name}`;
    const expectedType = obj.type.toUpperCase();
    const desiredSource = normalizeSource(readFixture(obj.fixture));
    const existingTypes = await findExistingObjectTypes(client, obj.name);
    const hasExpectedType = existingTypes.includes(expectedType);

    if (!hasExpectedType && existingTypes.length === 0) {
      console.log(`    [setup] ${label}: missing -> creating from ${obj.fixture}`);
      try {
        await createObjectFromFixture(client, obj);
        await activateObject(client, obj.type, obj.name);
        summary.created.push(label);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const reason = classifyFixtureError(msg);
        if (reason === null) throw err;
        console.warn(`    [setup] ${label}: skipping — ${reason}`);
        summary.skipped.push({ label, reason });
      }
      continue;
    }

    let needsRecreate = !hasExpectedType;
    if (hasExpectedType) {
      const liveSource = await readObjectSource(client, obj.type, obj.name);
      if (normalizeSource(liveSource) !== desiredSource) {
        needsRecreate = true;
        console.log(`    [setup] ${label}: fixture drift detected -> delete + recreate`);
      }
    }

    if (!needsRecreate) {
      const staleTypes = existingTypes.filter((type) => type !== expectedType);
      if (staleTypes.length > 0) {
        console.log(`    [setup] ${label}: removing stale typed variants (${staleTypes.join(', ')})`);
        await deleteObjectTypes(client, obj.name, staleTypes, summary.deleted);
      }
      console.log(`    [setup] ${label}: up-to-date`);
      summary.unchanged.push(label);
      continue;
    }

    if (existingTypes.length > 0) {
      console.log(`    [setup] ${label}: deleting existing object(s) [${existingTypes.join(', ')}]`);
      await deleteObjectTypes(client, obj.name, existingTypes, summary.deleted);
    }

    console.log(`    [setup] ${label}: recreating from ${obj.fixture}`);
    try {
      await createObjectFromFixture(client, obj);
      await activateObject(client, obj.type, obj.name);
      summary.recreated.push(label);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const reason = classifyFixtureError(msg);
      if (reason === null) throw err;
      console.warn(`    [setup] ${label}: skipping recreate — ${reason}`);
      summary.skipped.push({ label, reason });
    }
  }

  console.log(
    `    [setup] Fixture sync summary: created=${summary.created.length}, recreated=${summary.recreated.length}, unchanged=${summary.unchanged.length}, deleted=${summary.deleted.length}, skipped=${summary.skipped.length}`,
  );
  if (summary.skipped.length > 0) {
    console.log(
      `    [setup] Some fixtures skipped due to known backend gaps — affected tests will auto-skip. See docs/integration-test-skips.md.`,
    );
  }
  return summary;
}

/**
 * Backward-compatible alias used by older docs/callers.
 */
export async function ensureTestObjects(client: Client): Promise<string[]> {
  const summary = await syncPersistentFixtures(client);
  return [...summary.created, ...summary.recreated];
}

/**
 * Delete all persistent fixture objects currently present on the target system.
 * Useful for manual reset.
 */
export async function deletePersistentFixtures(client: Client): Promise<string[]> {
  const deleted: string[] = [];
  for (const obj of PERSISTENT_OBJECTS) {
    const existingTypes = await findExistingObjectTypes(client, obj.name);
    if (existingTypes.length === 0) continue;
    await deleteObjectTypes(client, obj.name, existingTypes, deleted);
  }
  return deleted;
}

async function createObjectFromFixture(client: Client, obj: PersistentObject): Promise<void> {
  const source = readFixture(obj.fixture);
  const createResult = await callTool(client, 'SAPWrite', {
    action: 'create',
    type: obj.type,
    name: obj.name,
    source,
    package: '$TMP',
  });
  assertToolSuccess(createResult, `create ${obj.type} ${obj.name}`);
}

async function activateObject(client: Client, type: string, name: string): Promise<void> {
  const activateResult = await callTool(client, 'SAPActivate', { type, name });
  if (activateResult.isError) {
    // SAPActivate may surface warnings as error text in some backends.
    console.warn(`    [setup] ${name} activation warning: ${toolText(activateResult).slice(0, 300)}`);
  }
}

// Types SAPWrite(action="delete") accepts. SAP-generated siblings like STOB (structure
// objects auto-created when a DDLS is activated) are not directly deletable and are
// cleaned up implicitly when their parent DDLS is removed — filter them out so we don't
// fail the fixture sync on a phantom cleanup step.
const DELETABLE_TYPES = new Set([
  'PROG',
  'CLAS',
  'INTF',
  'FUNC',
  'INCL',
  'DDLS',
  'DCLS',
  'DDLX',
  'BDEF',
  'SRVD',
  'SRVB',
  'SKTD',
  'TABL',
  'DOMA',
  'DTEL',
  'MSAG',
]);

async function deleteObjectTypes(client: Client, name: string, types: string[], sink: string[]): Promise<void> {
  for (const type of types) {
    if (!DELETABLE_TYPES.has(type.toUpperCase())) {
      console.warn(
        `    [setup] delete skipped for ${type} ${name}: type not directly deletable (likely SAP-generated sibling)`,
      );
      continue; // best-effort-cleanup
    }
    const deleteResult = await callTool(client, 'SAPWrite', {
      action: 'delete',
      type,
      name,
    });
    if (deleteResult.isError) {
      const text = toolText(deleteResult);
      if (/not found|does not exist|unknown/i.test(text)) continue;
      if (/still in use|dependent object|used by|cannot be deleted/i.test(text)) {
        console.warn(`    [setup] delete skipped for ${type} ${name}: ${text.slice(0, 240)}`);
        continue; // best-effort-cleanup
      }
      // NW 7.50 lock-handle 423 quirk — the same pattern that breaks create+PUT
      // also breaks lock+DELETE. Treat as skip so the sync doesn't abort.
      if (/status 423.*invalid lock handle/i.test(text)) {
        console.warn(
          `    [setup] delete skipped for ${type} ${name}: NW 7.50 lock-handle 423 quirk (object remains; tests that need a fresh fixture will skip)`,
        );
        continue;
      }
      throw new Error(`Failed to delete ${type} ${name}: ${text}`);
    }
    sink.push(`${type} ${name}`);
  }
}

async function findExistingObjectTypes(client: Client, name: string): Promise<string[]> {
  const result = await callTool(client, 'SAPSearch', { query: name, maxResults: 20 });
  if (result.isError) {
    return [];
  }
  const text = toolText(result);
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripCachedPrefix(text));
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const types = new Set<string>();
  for (const entry of parsed) {
    if (!entry || typeof entry !== 'object') continue;
    const objectName = getString(entry, 'objectName');
    const objectType = getString(entry, 'objectType');
    if (!objectName || !objectType) continue;
    // On NW 7.50 the search result decorates the name with a display suffix
    // like "ZIF_ARC1_TEST (Interface)". Normalize by stripping anything after
    // the first space or "(" so equality matches the bare object name.
    const bareName = objectName.split(/\s|\(/)[0];
    if (bareName.toUpperCase() !== name.toUpperCase()) continue;
    types.add(objectType.split('/')[0].toUpperCase());
  }
  return [...types];
}

async function readObjectSource(client: Client, type: string, name: string): Promise<string> {
  const result = await callTool(client, 'SAPRead', { type, name });
  assertToolSuccess(result, `read ${type} ${name}`);
  return toolText(result);
}

function assertToolSuccess(result: ToolResult, action: string): void {
  if (result.isError) {
    throw new Error(`${action} failed: ${toolText(result)}`);
  }
  if (!result.content?.length || !result.content[0]?.text) {
    throw new Error(`${action} failed: empty response`);
  }
}

function toolText(result: ToolResult): string {
  return result.content?.map((item) => item.text).join('\n') ?? '';
}

function stripCachedPrefix(text: string): string {
  return text.replace(/^\[cached\]\n/, '');
}

function normalizeSource(source: string): string {
  return stripCachedPrefix(source).replace(/\r\n/g, '\n').trimEnd();
}

function getString(input: object, key: string): string | null {
  const value = (input as Record<string, unknown>)[key];
  return typeof value === 'string' ? value : null;
}

/**
 * Check if an object exists on SAP via SAPSearch.
 * Retained for compatibility with older call sites.
 */
export async function objectExists(client: Client, query: string): Promise<boolean> {
  const types = await findExistingObjectTypes(client, query);
  return types.length > 0;
}

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
  };

  for (const obj of PERSISTENT_OBJECTS) {
    const label = `${obj.type} ${obj.name}`;
    const expectedType = obj.type.toUpperCase();
    const desiredSource = normalizeSource(readFixture(obj.fixture));
    const existingTypes = await findExistingObjectTypes(client, obj.name);
    const hasExpectedType = existingTypes.includes(expectedType);

    if (!hasExpectedType && existingTypes.length === 0) {
      console.log(`    [setup] ${label}: missing -> creating from ${obj.fixture}`);
      await createObjectFromFixture(client, obj);
      await activateObject(client, obj.type, obj.name);
      summary.created.push(label);
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
    await createObjectFromFixture(client, obj);
    await activateObject(client, obj.type, obj.name);
    summary.recreated.push(label);
  }

  console.log(
    `    [setup] Fixture sync summary: created=${summary.created.length}, recreated=${summary.recreated.length}, unchanged=${summary.unchanged.length}, deleted=${summary.deleted.length}`,
  );
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

async function deleteObjectTypes(client: Client, name: string, types: string[], sink: string[]): Promise<void> {
  for (const type of types) {
    const deleteResult = await callTool(client, 'SAPWrite', {
      action: 'delete',
      type,
      name,
    });
    if (deleteResult.isError) {
      const text = toolText(deleteResult);
      if (/not found|does not exist|unknown/i.test(text)) continue;
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
    if (objectName.toUpperCase() !== name.toUpperCase()) continue;
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

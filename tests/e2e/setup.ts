/**
 * E2E test setup — ensures persistent test objects exist on the SAP system.
 *
 * For each object in PERSISTENT_OBJECTS:
 *   1. SAPSearch to check if it exists
 *   2. If missing → SAPWrite create from fixture → SAPActivate
 *   3. If exists → skip
 *
 * This runs in beforeAll of each test suite that needs fixture objects.
 * It's cheap (~100ms per object if they exist, ~2s per object if creating).
 */

import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { PERSISTENT_OBJECTS, readFixture } from './fixtures.js';
import { callTool, expectToolSuccess } from './helpers.js';

/**
 * Ensure all persistent test objects exist on SAP.
 * Returns a list of objects that were created (for logging).
 */
export async function ensureTestObjects(client: Client): Promise<string[]> {
  const created: string[] = [];

  for (const obj of PERSISTENT_OBJECTS) {
    const exists = await objectExists(client, obj.searchQuery);
    if (exists) {
      console.log(`    [setup] ${obj.type} ${obj.name}: exists`);
      continue;
    }

    console.log(`    [setup] ${obj.type} ${obj.name}: creating from ${obj.fixture}...`);
    const source = readFixture(obj.fixture);

    try {
      // Create
      const createResult = await callTool(client, 'SAPWrite', {
        action: 'create',
        type: obj.type,
        name: obj.name,
        source,
        package: '$TMP',
      });
      expectToolSuccess(createResult);

      // Activate
      const activateResult = await callTool(client, 'SAPActivate', {
        name: obj.name,
        type: obj.type,
      });
      // Activation may have warnings — that's OK as long as it didn't throw
      if (activateResult.isError) {
        console.warn(`    [setup] ${obj.name} activation warning: ${activateResult.content[0]?.text?.slice(0, 200)}`);
      }

      created.push(`${obj.type} ${obj.name}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`    [setup] FAILED to create ${obj.type} ${obj.name}: ${message}`);
      throw new Error(
        `E2E setup failed: could not create ${obj.type} ${obj.name}.\n` +
          `  Error: ${message}\n` +
          `  The test suite cannot run without this object.\n` +
          `  Fix: create it manually or check SAP connectivity.`,
      );
    }
  }

  if (created.length > 0) {
    console.log(`    [setup] Created ${created.length} objects: ${created.join(', ')}`);
  } else {
    console.log('    [setup] All test objects already exist.');
  }

  return created;
}

/**
 * Check if an object exists on SAP via SAPSearch.
 */
async function objectExists(client: Client, query: string): Promise<boolean> {
  try {
    const result = await callTool(client, 'SAPSearch', { query, maxResults: 1 });
    const text = result.content?.[0]?.text ?? '[]';
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) && parsed.length > 0;
  } catch {
    return false;
  }
}

/**
 * CRUD test harness for integration tests.
 *
 * Provides unique name generation, an object registry for cleanup tracking,
 * retry-aware delete logic, and XML builder for ADT object creation.
 *
 * All functions are pure or take explicit dependencies (no global state).
 */

import { deleteObject, lockObject } from '../../src/adt/crud.js';
import type { AdtHttpClient } from '../../src/adt/http.js';
import type { SafetyConfig } from '../../src/adt/safety.js';

/**
 * Generate a unique ABAP-valid object name.
 * Returns `${prefix}_${timestamp_base36}` — uppercase, max 30 chars.
 */
export function generateUniqueName(prefix: string): string {
  const suffix = Date.now().toString(36).toUpperCase().slice(-6);
  const name = `${prefix}_${suffix}`;
  if (name.length > 30) {
    throw new Error(`Generated name "${name}" exceeds 30 characters. Use a shorter prefix.`);
  }
  return name;
}

/** Entry tracked by CrudRegistry */
export interface RegistryEntry {
  objectUrl: string;
  objectType: string;
  name: string;
}

/**
 * Tracks created objects for guaranteed cleanup.
 * Objects are returned in reverse creation order (last created = first deleted)
 * to respect potential dependencies.
 */
export class CrudRegistry {
  private entries: RegistryEntry[] = [];

  register(objectUrl: string, objectType: string, name: string): void {
    this.entries.push({ objectUrl, objectType, name });
  }

  getAll(): RegistryEntry[] {
    return [...this.entries].reverse();
  }

  remove(name: string): void {
    this.entries = this.entries.filter((e) => e.name !== name);
  }

  get size(): number {
    return this.entries.length;
  }
}

/** Result of a retryDelete attempt */
export interface RetryDeleteResult {
  success: boolean;
  attempts: number;
  lastError?: string;
}

/**
 * Attempt to delete an object with retries on lock conflicts.
 * Uses exponential backoff between retries.
 */
export async function retryDelete(
  http: AdtHttpClient,
  safety: SafetyConfig,
  objectUrl: string,
  maxRetries = 3,
  delayMs = 500,
): Promise<RetryDeleteResult> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await http.withStatefulSession(async (session) => {
        const lock = await lockObject(session, safety, objectUrl);
        await deleteObject(session, safety, objectUrl, lock.lockHandle);
      });
      return { success: true, attempts: attempt };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      const isLockConflict = /locked|enqueue/i.test(message);

      if (!isLockConflict || attempt === maxRetries) {
        return { success: false, attempts: attempt, lastError: message };
      }

      // Exponential backoff before retry
      await new Promise((resolve) => setTimeout(resolve, delayMs * 2 ** (attempt - 1)));
    }
  }

  // Should not reach here, but satisfy TypeScript
  return { success: false, attempts: maxRetries, lastError: 'Max retries exhausted' };
}

/** Cleanup report from cleanupAll */
export interface CleanupReport {
  cleaned: number;
  failed: Array<{ name: string; error: string }>;
}

/**
 * Iterate all registered objects and attempt to delete each.
 * Returns a report of successes and failures.
 */
export async function cleanupAll(
  http: AdtHttpClient,
  safety: SafetyConfig,
  registry: CrudRegistry,
): Promise<CleanupReport> {
  const entries = registry.getAll();
  let cleaned = 0;
  const failed: Array<{ name: string; error: string }> = [];

  for (const entry of entries) {
    const result = await retryDelete(http, safety, entry.objectUrl);
    if (result.success) {
      registry.remove(entry.name);
      cleaned++;
    } else {
      failed.push({ name: entry.name, error: result.lastError ?? 'Unknown error' });
    }
  }

  return { cleaned, failed };
}

/** Escape XML special characters */
function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Build ADT-compatible creation XML for an object type.
 * Supports PROG and CLAS types (matching the patterns in src/handlers/intent.ts).
 */
export function buildCreateXml(objectType: string, name: string, packageName: string, description: string): string {
  switch (objectType) {
    case 'PROG':
      return `<?xml version="1.0" encoding="UTF-8"?>
<program:abapProgram xmlns:program="http://www.sap.com/adt/programs/programs"
                     xmlns:adtcore="http://www.sap.com/adt/core"
                     adtcore:description="${escapeXml(description)}"
                     adtcore:name="${escapeXml(name)}"
                     adtcore:type="PROG/P"
                     adtcore:masterLanguage="EN"
                     adtcore:responsible="DEVELOPER">
  <adtcore:packageRef adtcore:name="${escapeXml(packageName)}"/>
</program:abapProgram>`;
    case 'CLAS':
      return `<?xml version="1.0" encoding="UTF-8"?>
<class:abapClass xmlns:class="http://www.sap.com/adt/oo/classes"
                 xmlns:adtcore="http://www.sap.com/adt/core"
                 adtcore:description="${escapeXml(description)}"
                 adtcore:name="${escapeXml(name)}"
                 adtcore:type="CLAS/OC"
                 adtcore:masterLanguage="EN"
                 adtcore:responsible="DEVELOPER">
  <adtcore:packageRef adtcore:name="${escapeXml(packageName)}"/>
</class:abapClass>`;
    default:
      throw new Error(`Unsupported object type for XML generation: ${objectType}`);
  }
}

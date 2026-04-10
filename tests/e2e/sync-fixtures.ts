/**
 * E2E fixture management entrypoint.
 *
 * Default mode: sync fixtures (create missing, recreate on drift).
 * Clean mode:   --clean (delete all managed persistent fixtures).
 */

import { connectClient } from './helpers.js';
import { deletePersistentFixtures, syncPersistentFixtures } from './setup.js';

async function main(): Promise<void> {
  const cleanMode = process.argv.includes('--clean');

  if (cleanMode) {
    console.log('\n[E2E fixtures] clean mode: deleting managed persistent fixtures...');
  } else {
    console.log('\n[E2E fixtures] sync mode: reconciling managed persistent fixtures...');
  }

  const client = await connectClient();
  try {
    if (cleanMode) {
      const deleted = await deletePersistentFixtures(client);
      console.log(`[E2E fixtures] deleted=${deleted.length}`);
      if (deleted.length > 0) {
        console.log(`[E2E fixtures] deleted objects: ${deleted.join(', ')}`);
      }
      return;
    }

    const summary = await syncPersistentFixtures(client);
    console.log(
      `[E2E fixtures] created=${summary.created.length}, recreated=${summary.recreated.length}, unchanged=${summary.unchanged.length}, deleted=${summary.deleted.length}`,
    );
  } finally {
    await client.close().catch(() => {});
  }
}

main().catch((err) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`\n[E2E fixtures] failed: ${message}`);
  process.exit(1);
});

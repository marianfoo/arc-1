import { describe, expect, it } from 'vitest';
import { AdtClient } from '../../../src/adt/client.js';
import { Semaphore } from '../../../src/adt/semaphore.js';

/**
 * Task 1 (Layer 3): shared SAP-bound Semaphore across all AdtClient instances.
 *
 * Verifies the bug fix: with principal propagation, ARC1_MAX_CONCURRENT must be a
 * server-wide cap, not a per-client cap. Two clients sharing one Semaphore should
 * exhaust the same slot pool; without a shared instance, each client would get its own.
 */
describe('shared SAP Semaphore (Layer 3)', () => {
  it('two AdtClients share one Semaphore when adtSemaphore is provided', () => {
    const shared = new Semaphore(5);
    const a = new AdtClient({ baseUrl: 'http://a.test', adtSemaphore: shared });
    const b = new AdtClient({ baseUrl: 'http://b.test', adtSemaphore: shared });
    // Both clients' http config carries the SAME semaphore reference
    expect(a.http.semaphore).toBe(shared);
    expect(b.http.semaphore).toBe(shared);
    expect(a.http.semaphore).toBe(b.http.semaphore);
  });

  it('without adtSemaphore, each client gets its own private Semaphore (legacy)', () => {
    const a = new AdtClient({ baseUrl: 'http://a.test', maxConcurrent: 5 });
    const b = new AdtClient({ baseUrl: 'http://b.test', maxConcurrent: 5 });
    expect(a.http.semaphore).toBeDefined();
    expect(b.http.semaphore).toBeDefined();
    expect(a.http.semaphore).not.toBe(b.http.semaphore);
  });

  it('adtSemaphore takes precedence over maxConcurrent', () => {
    const shared = new Semaphore(2);
    const c = new AdtClient({ baseUrl: 'http://c.test', maxConcurrent: 100, adtSemaphore: shared });
    expect(c.http.semaphore).toBe(shared);
  });

  it('shared Semaphore serializes acquires across two clients', async () => {
    const shared = new Semaphore(1);
    const order: string[] = [];

    // Simulate two clients each running a request through the shared limit.
    // The second call must wait for the first to release.
    const run = async (label: string) => {
      await shared.run(async () => {
        order.push(`${label}:start`);
        await new Promise((r) => setTimeout(r, 20));
        order.push(`${label}:end`);
      });
    };

    await Promise.all([run('A'), run('B')]);

    // Either A then B, or B then A — but never interleaved.
    expect(order).toEqual(
      order[0] === 'A:start' ? ['A:start', 'A:end', 'B:start', 'B:end'] : ['B:start', 'B:end', 'A:start', 'A:end'],
    );
  });

  it('shared Semaphore tracks inflight + waiting counts across clients', async () => {
    const shared = new Semaphore(2);

    // Acquire 2 slots — semaphore is full.
    await shared.acquire();
    await shared.acquire();
    expect(shared.inflight).toBe(2);
    expect(shared.waiting).toBe(0);

    // Start two more acquires (will queue).
    const p1 = shared.acquire();
    const p2 = shared.acquire();

    // Yield to the event loop so the queued waiters are registered.
    await new Promise((r) => setImmediate(r));
    expect(shared.waiting).toBe(2);

    // Release one — first waiter wakes.
    shared.release();
    await p1;
    expect(shared.inflight).toBe(2);
    expect(shared.waiting).toBe(1);

    // Release one — second waiter wakes.
    shared.release();
    await p2;

    // Cleanup
    shared.release();
    shared.release();
    expect(shared.inflight).toBe(0);
  });
});

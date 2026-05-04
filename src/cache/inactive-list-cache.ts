import type { AdtClient } from '../adt/client.js';
import type { InactiveObject } from '../adt/types.js';

interface CachedInactiveList {
  username: string;
  objects: InactiveObject[];
  fetchedAt: number;
}

export class InactiveListCache {
  private byUsername = new Map<string, CachedInactiveList>();
  private ttlMs = 60_000;

  async getOrFetch(client: AdtClient): Promise<InactiveObject[]> {
    const cached = this.byUsername.get(client.username);
    if (cached && Date.now() - cached.fetchedAt < this.ttlMs) {
      return cached.objects;
    }

    const objects = await client.getInactiveObjects();
    this.byUsername.set(client.username, {
      username: client.username,
      objects,
      fetchedAt: Date.now(),
    });
    return objects;
  }

  getCached(username: string): InactiveObject[] | null {
    return this.byUsername.get(username)?.objects ?? null;
  }

  invalidate(username: string): void {
    this.byUsername.delete(username);
  }

  clear(): void {
    this.byUsername.clear();
  }

  stats(): { userCount: number; totalEntries: number } {
    let totalEntries = 0;
    for (const cached of this.byUsername.values()) {
      totalEntries += cached.objects.length;
    }
    return {
      userCount: this.byUsername.size,
      totalEntries,
    };
  }
}

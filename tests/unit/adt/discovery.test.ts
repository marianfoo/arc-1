import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { fetchDiscoveryDocument, resolveAcceptType, resolveContentType } from '../../../src/adt/discovery.js';
import type { AdtHttpClient } from '../../../src/adt/http.js';
import { parseDiscoveryDocument } from '../../../src/adt/xml-parser.js';

const fixturesDir = join(import.meta.dirname, '../../fixtures/xml');
const loadFixture = (name: string) => readFileSync(join(fixturesDir, name), 'utf-8');

describe('ADT Discovery', () => {
  describe('parseDiscoveryDocument', () => {
    it('parses fixture into expected map size', () => {
      const xml = loadFixture('discovery.xml');
      const map = parseDiscoveryDocument(xml);
      expect(map.size).toBe(9);
    });

    it('returns multiple accepts in order', () => {
      const xml = loadFixture('discovery.xml');
      const map = parseDiscoveryDocument(xml);
      expect(map.get('/sap/bc/adt/oo/classes')).toEqual([
        'application/vnd.sap.adt.oo.classes.v2+xml',
        'application/vnd.sap.adt.oo.classes.v4+xml',
        'text/html',
      ]);
    });

    it('omits collections without accepts', () => {
      const xml = loadFixture('discovery.xml');
      const map = parseDiscoveryDocument(xml);
      expect(map.has('/sap/bc/adt/activation')).toBe(false);
    });

    it('returns single accept as one-element array', () => {
      const xml = loadFixture('discovery.xml');
      const map = parseDiscoveryDocument(xml);
      expect(map.get('/sap/bc/adt/ddic/domains')).toEqual(['application/vnd.sap.adt.domains.v2+xml']);
    });

    it('normalizes absolute href URLs to ADT paths', () => {
      const xml = loadFixture('discovery.xml');
      const map = parseDiscoveryDocument(xml);
      expect(map.has('/sap/bc/adt/oo/interfaces')).toBe(true);
    });

    it('returns empty map for empty XML', () => {
      expect(parseDiscoveryDocument('')).toEqual(new Map());
    });

    it('returns empty map for malformed XML without throwing', () => {
      expect(parseDiscoveryDocument('<app:service><app:workspace>')).toEqual(new Map());
    });

    it('skips collections missing href', () => {
      const xml = loadFixture('discovery.xml');
      const map = parseDiscoveryDocument(xml);
      expect(map.has('')).toBe(false);
      expect(map.size).toBe(9);
    });

    it('preserves MIME types exactly', () => {
      const xml = loadFixture('discovery.xml');
      const map = parseDiscoveryDocument(xml);
      const types = map.get('/sap/bc/adt/functions/groups');
      expect(types).toEqual([
        'application/vnd.sap.adt.functions.groups.v1+xml',
        'application/vnd.sap.adt.functions.groups.v3+xml',
      ]);
    });

    it('overwrites duplicate href with latest collection', () => {
      const xml = loadFixture('discovery.xml');
      const map = parseDiscoveryDocument(xml);
      expect(map.get('/sap/bc/adt/programs/programs')).toEqual([
        'application/vnd.sap.adt.programs.programs.v2+xml',
        'text/plain',
      ]);
    });
  });

  describe('fetchDiscoveryDocument', () => {
    function mockClient(getImpl: (path: string, headers?: Record<string, string>) => Promise<{ body: string }>) {
      return { get: vi.fn().mockImplementation(getImpl) } as unknown as AdtHttpClient;
    }

    it('fetches and parses discovery document successfully', async () => {
      const xml = loadFixture('discovery.xml');
      const client = mockClient(async () => ({ body: xml }));
      const map = await fetchDiscoveryDocument(client);
      expect(map.size).toBe(9);
      expect((client as any).get).toHaveBeenCalledWith('/sap/bc/adt/discovery', {
        Accept: 'application/atomsvc+xml',
      });
    });

    it('returns empty map on 404', async () => {
      const client = mockClient(async () => {
        throw { statusCode: 404 };
      });
      const map = await fetchDiscoveryDocument(client);
      expect(map).toEqual(new Map());
    });

    it('returns empty map on 406', async () => {
      const client = mockClient(async () => {
        throw { statusCode: 406 };
      });
      const map = await fetchDiscoveryDocument(client);
      expect(map).toEqual(new Map());
    });

    it('returns empty map on network errors', async () => {
      const client = mockClient(async () => {
        throw new Error('ECONNRESET');
      });
      const map = await fetchDiscoveryDocument(client);
      expect(map).toEqual(new Map());
    });
  });

  describe('resolveAcceptType / resolveContentType', () => {
    it('resolves exact path matches', () => {
      const map = new Map<string, string[]>([
        ['/sap/bc/adt/oo/classes', ['application/vnd.sap.adt.oo.classes.v4+xml']],
      ]);
      expect(resolveAcceptType(map, '/sap/bc/adt/oo/classes')).toBe('application/vnd.sap.adt.oo.classes.v4+xml');
    });

    it('resolves prefix path matches', () => {
      const map = new Map<string, string[]>([
        ['/sap/bc/adt/oo/classes', ['application/vnd.sap.adt.oo.classes.v4+xml']],
      ]);
      expect(resolveAcceptType(map, '/sap/bc/adt/oo/classes/ZCL_FOO/source/main')).toBe(
        'application/vnd.sap.adt.oo.classes.v4+xml',
      );
    });

    it('uses longest prefix match', () => {
      const map = new Map<string, string[]>([
        ['/sap/bc/adt/oo', ['application/vnd.sap.adt.oo.v1+xml']],
        ['/sap/bc/adt/oo/classes', ['application/vnd.sap.adt.oo.classes.v4+xml']],
      ]);
      expect(resolveAcceptType(map, '/sap/bc/adt/oo/classes/ZCL_FOO')).toBe(
        'application/vnd.sap.adt.oo.classes.v4+xml',
      );
    });

    it('returns undefined when no collection matches', () => {
      const map = new Map<string, string[]>([
        ['/sap/bc/adt/oo/classes', ['application/vnd.sap.adt.oo.classes.v4+xml']],
      ]);
      expect(resolveAcceptType(map, '/sap/bc/adt/unknown/path')).toBeUndefined();
    });

    it('returns undefined for an empty discovery map', () => {
      expect(resolveAcceptType(new Map(), '/sap/bc/adt/oo/classes')).toBeUndefined();
    });

    it('resolveContentType returns first type from matched collection', () => {
      const map = new Map<string, string[]>([
        ['/sap/bc/adt/ddic/ddl/sources', ['application/vnd.sap.adt.ddic.ddl.sources.v2+xml', 'application/*']],
      ]);
      expect(resolveContentType(map, '/sap/bc/adt/ddic/ddl/sources/ZI_TRAVEL/source/main')).toBe(
        'application/vnd.sap.adt.ddic.ddl.sources.v2+xml',
      );
    });

    it('resolves independently across multiple collections', () => {
      const map = new Map<string, string[]>([
        ['/sap/bc/adt/oo/classes', ['application/vnd.sap.adt.oo.classes.v4+xml']],
        ['/sap/bc/adt/programs/programs', ['application/vnd.sap.adt.programs.programs.v2+xml']],
      ]);
      expect(resolveAcceptType(map, '/sap/bc/adt/oo/classes/ZCL_FOO/source/main')).toBe(
        'application/vnd.sap.adt.oo.classes.v4+xml',
      );
      expect(resolveAcceptType(map, '/sap/bc/adt/programs/programs/ZREP/source/main')).toBe(
        'application/vnd.sap.adt.programs.programs.v2+xml',
      );
    });

    it('ignores query parameters during matching', () => {
      const map = new Map<string, string[]>([
        ['/sap/bc/adt/repository/informationsystem/search', ['application/vnd.sap.adt.repository.search.v1+xml']],
      ]);
      expect(
        resolveAcceptType(map, '/sap/bc/adt/repository/informationsystem/search?operation=quickSearch&query=ZCL*'),
      ).toBe('application/vnd.sap.adt.repository.search.v1+xml');
    });
  });
});

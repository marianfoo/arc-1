import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  getDump,
  getTraceDbAccesses,
  getTraceHitlist,
  getTraceStatements,
  listDumps,
  listTraces,
  parseDumpDetail,
  parseDumpList,
  parseTraceDbAccesses,
  parseTraceHitlist,
  parseTraceList,
  parseTraceStatements,
} from '../../../ts-src/adt/diagnostics.js';
import { AdtSafetyError } from '../../../ts-src/adt/errors.js';
import type { AdtHttpClient } from '../../../ts-src/adt/http.js';
import { unrestrictedSafetyConfig } from '../../../ts-src/adt/safety.js';

const FIXTURES_DIR = join(__dirname, '../../fixtures/xml');

function mockHttp(responseBody = ''): AdtHttpClient {
  return {
    get: vi.fn().mockResolvedValue({ statusCode: 200, headers: {}, body: responseBody }),
    post: vi.fn().mockResolvedValue({ statusCode: 200, headers: {}, body: responseBody }),
    put: vi.fn().mockResolvedValue({ statusCode: 200, headers: {}, body: '' }),
    delete: vi.fn().mockResolvedValue({ statusCode: 200, headers: {}, body: '' }),
    fetchCsrfToken: vi.fn(),
    withStatefulSession: vi.fn(),
  } as unknown as AdtHttpClient;
}

function mockHttpMulti(responses: Record<string, string>): AdtHttpClient {
  return {
    get: vi.fn().mockImplementation((url: string) => {
      for (const [pattern, body] of Object.entries(responses)) {
        if (url.includes(pattern)) {
          return Promise.resolve({ statusCode: 200, headers: {}, body });
        }
      }
      return Promise.resolve({ statusCode: 200, headers: {}, body: '' });
    }),
    post: vi.fn().mockResolvedValue({ statusCode: 200, headers: {}, body: '' }),
    put: vi.fn().mockResolvedValue({ statusCode: 200, headers: {}, body: '' }),
    delete: vi.fn().mockResolvedValue({ statusCode: 200, headers: {}, body: '' }),
    fetchCsrfToken: vi.fn(),
    withStatefulSession: vi.fn(),
  } as unknown as AdtHttpClient;
}

describe('Runtime Diagnostics', () => {
  // ─── listDumps ──────────────────────────────────────────────────────

  describe('listDumps', () => {
    it('parses dump listing from Atom feed', async () => {
      const xml = readFileSync(join(FIXTURES_DIR, 'dumps-list.xml'), 'utf-8');
      const http = mockHttp(xml);
      const result = await listDumps(http, unrestrictedSafetyConfig());

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        id: '20260328201914vhcala4hci_A4H_00%20%20%20DEVELOPER%20001%2019',
        timestamp: '2026-03-28T20:19:14Z',
        user: 'DEVELOPER',
        error: 'STRING_OFFSET_TOO_LARGE',
        program: 'SAPLSUSR_CERTRULE',
      });
      expect(result[1]).toEqual({
        id: '20260327150000vhcala4hci_A4H_00%20%20%20ADMIN%20001%2005',
        timestamp: '2026-03-27T15:00:00Z',
        user: 'ADMIN',
        error: 'COMPUTE_INT_ZERODIVIDE',
        program: 'SAPMTEST',
      });
    });

    it('sends correct Accept header', async () => {
      const http = mockHttp('<atom:feed xmlns:atom="http://www.w3.org/2005/Atom"></atom:feed>');
      await listDumps(http, unrestrictedSafetyConfig());
      expect(http.get).toHaveBeenCalledWith('/sap/bc/adt/runtime/dumps', {
        Accept: 'application/atom+xml;type=feed',
      });
    });

    it('passes user filter as query parameter', async () => {
      const http = mockHttp('<atom:feed xmlns:atom="http://www.w3.org/2005/Atom"></atom:feed>');
      await listDumps(http, unrestrictedSafetyConfig(), { user: 'DEVELOPER' });
      expect(http.get).toHaveBeenCalledWith(expect.stringContaining('$query='), expect.any(Object));
      const url = (http.get as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
      // The comma is URL-encoded by encodeURIComponent
      expect(url).toContain('equals(user%2CDEVELOPER)');
    });

    it('passes maxResults as $top parameter', async () => {
      const http = mockHttp('<atom:feed xmlns:atom="http://www.w3.org/2005/Atom"></atom:feed>');
      await listDumps(http, unrestrictedSafetyConfig(), { maxResults: 10 });
      const url = (http.get as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
      expect(url).toContain('$top=10');
    });

    it('returns empty array for empty feed', async () => {
      const xml = '<?xml version="1.0"?><atom:feed xmlns:atom="http://www.w3.org/2005/Atom"></atom:feed>';
      const http = mockHttp(xml);
      const result = await listDumps(http, unrestrictedSafetyConfig());
      expect(result).toEqual([]);
    });

    it('is blocked when Read is disallowed', async () => {
      const http = mockHttp();
      const safety = { ...unrestrictedSafetyConfig(), disallowedOps: 'R' };
      await expect(listDumps(http, safety)).rejects.toThrow(AdtSafetyError);
    });

    it('is blocked in read-only mode (dumps are read operations, should work)', async () => {
      const http = mockHttp('<atom:feed xmlns:atom="http://www.w3.org/2005/Atom"></atom:feed>');
      const safety = { ...unrestrictedSafetyConfig(), readOnly: true };
      // Read operations should NOT be blocked in read-only mode
      await expect(listDumps(http, safety)).resolves.toBeDefined();
    });
  });

  // ─── getDump ────────────────────────────────────────────────────────

  describe('getDump', () => {
    it('fetches XML metadata and formatted text in parallel', async () => {
      const xmlDetail = readFileSync(join(FIXTURES_DIR, 'dump-detail.xml'), 'utf-8');
      const formattedText = readFileSync(join(FIXTURES_DIR, 'dump-formatted.txt'), 'utf-8');
      const http = mockHttpMulti({
        formatted: formattedText,
        'runtime/dump/TEST_ID': xmlDetail,
      });

      const result = await getDump(http, unrestrictedSafetyConfig(), 'TEST_ID');

      expect(result.error).toBe('STRING_OFFSET_TOO_LARGE');
      expect(result.exception).toBe('CX_SY_RANGE_OUT_OF_BOUNDS');
      expect(result.program).toBe('SAPLSUSR_CERTRULE');
      expect(result.user).toBe('DEVELOPER');
      expect(result.timestamp).toBe('2026-03-28T20:19:14Z');
      expect(result.formattedText).toContain('STRING_OFFSET_TOO_LARGE');
      expect(result.terminationUri).toContain('lsusr_certrulef01');
      expect(result.chapters.length).toBeGreaterThan(0);
    });

    it('parses chapters correctly', async () => {
      const xmlDetail = readFileSync(join(FIXTURES_DIR, 'dump-detail.xml'), 'utf-8');
      const http = mockHttpMulti({
        formatted: 'test content',
        'runtime/dump/TEST_ID': xmlDetail,
      });

      const result = await getDump(http, unrestrictedSafetyConfig(), 'TEST_ID');

      expect(result.chapters).toContainEqual({
        name: 'kap0',
        title: 'Short Text',
        category: 'ABAP Developer View',
      });
      expect(result.chapters).toContainEqual({
        name: 'kap1',
        title: 'What happened?',
        category: 'User View',
      });
    });

    it('makes two parallel GET requests with correct Accept headers', async () => {
      const http = mockHttp('');
      try {
        await getDump(http, unrestrictedSafetyConfig(), 'DUMP_123');
      } catch {
        // May fail on parsing empty response, that's ok
      }
      expect(http.get).toHaveBeenCalledTimes(2);
      const calls = (http.get as ReturnType<typeof vi.fn>).mock.calls;
      // XML metadata request
      expect(calls).toContainEqual([
        '/sap/bc/adt/runtime/dump/DUMP_123',
        { Accept: 'application/vnd.sap.adt.runtime.dump.v1+xml' },
      ]);
      // Formatted text request
      expect(calls).toContainEqual(['/sap/bc/adt/runtime/dump/DUMP_123/formatted', { Accept: 'text/plain' }]);
    });

    it('is blocked when Read is disallowed', async () => {
      const http = mockHttp();
      const safety = { ...unrestrictedSafetyConfig(), disallowedOps: 'R' };
      await expect(getDump(http, safety, 'DUMP_ID')).rejects.toThrow(AdtSafetyError);
    });
  });

  // ─── parseDumpList ──────────────────────────────────────────────────

  describe('parseDumpList', () => {
    it('handles single entry feed', () => {
      const xml = `<atom:feed xmlns:atom="http://www.w3.org/2005/Atom">
        <atom:entry xml:lang="EN">
          <atom:author><atom:name>TESTUSER</atom:name></atom:author>
          <atom:category term="MESSAGE_TYPE_X" label="ABAP runtime error"/>
          <atom:category term="ZTEST_PROG" label="Terminated ABAP program"/>
          <atom:link href="adt://SYS/sap/bc/adt/runtime/dump/DUMP_001" rel="self" type="text/plain"/>
          <atom:published>2026-04-01T10:00:00Z</atom:published>
        </atom:entry>
      </atom:feed>`;

      const result = parseDumpList(xml);
      expect(result).toHaveLength(1);
      expect(result[0]!.user).toBe('TESTUSER');
      expect(result[0]!.error).toBe('MESSAGE_TYPE_X');
      expect(result[0]!.program).toBe('ZTEST_PROG');
      expect(result[0]!.id).toBe('DUMP_001');
    });

    it('handles empty feed', () => {
      const xml = '<atom:feed xmlns:atom="http://www.w3.org/2005/Atom"></atom:feed>';
      expect(parseDumpList(xml)).toEqual([]);
    });

    it('handles URL-encoded dump IDs', () => {
      const xml = `<atom:feed xmlns:atom="http://www.w3.org/2005/Atom">
        <atom:entry>
          <atom:author><atom:name>USER</atom:name></atom:author>
          <atom:category term="ERROR" label="ABAP runtime error"/>
          <atom:category term="PROG" label="Terminated ABAP program"/>
          <atom:link href="/sap/bc/adt/runtime/dump/20260328%20%20ID%20WITH%20SPACES" rel="self" type="text/plain"/>
          <atom:published>2026-03-28T00:00:00Z</atom:published>
        </atom:entry>
      </atom:feed>`;

      const result = parseDumpList(xml);
      expect(result[0]!.id).toBe('20260328%20%20ID%20WITH%20SPACES');
    });
  });

  // ─── parseDumpDetail ────────────────────────────────────────────────

  describe('parseDumpDetail', () => {
    it('extracts all metadata from XML', () => {
      const xml = readFileSync(join(FIXTURES_DIR, 'dump-detail.xml'), 'utf-8');
      const result = parseDumpDetail(xml, 'formatted content', 'TEST_ID');

      expect(result.id).toBe('TEST_ID');
      expect(result.error).toBe('STRING_OFFSET_TOO_LARGE');
      expect(result.exception).toBe('CX_SY_RANGE_OUT_OF_BOUNDS');
      expect(result.program).toBe('SAPLSUSR_CERTRULE');
      expect(result.user).toBe('DEVELOPER');
      expect(result.formattedText).toBe('formatted content');
    });

    it('extracts termination URI', () => {
      const xml = readFileSync(join(FIXTURES_DIR, 'dump-detail.xml'), 'utf-8');
      const result = parseDumpDetail(xml, '', 'ID');
      expect(result.terminationUri).toContain('lsusr_certrulef01');
      expect(result.terminationUri).toContain('#start=27');
    });

    it('extracts chapters', () => {
      const xml = readFileSync(join(FIXTURES_DIR, 'dump-detail.xml'), 'utf-8');
      const result = parseDumpDetail(xml, '', 'ID');
      expect(result.chapters).toHaveLength(6);
      expect(result.chapters[0]).toEqual({
        name: 'kap0',
        title: 'Short Text',
        category: 'ABAP Developer View',
      });
    });
  });

  // ─── listTraces ─────────────────────────────────────────────────────

  describe('listTraces', () => {
    it('returns empty array for empty feed', async () => {
      const xml = `<?xml version="1.0" encoding="utf-8"?><atom:feed xmlns:atom="http://www.w3.org/2005/Atom">
        <atom:title>ABAP Traces in A4H</atom:title>
        <atom:updated>2026-04-01T20:31:12Z</atom:updated>
      </atom:feed>`;
      const http = mockHttp(xml);
      const result = await listTraces(http, unrestrictedSafetyConfig());
      expect(result).toEqual([]);
    });

    it('sends correct Accept header', async () => {
      const http = mockHttp('<atom:feed xmlns:atom="http://www.w3.org/2005/Atom"></atom:feed>');
      await listTraces(http, unrestrictedSafetyConfig());
      expect(http.get).toHaveBeenCalledWith('/sap/bc/adt/runtime/traces/abaptraces', {
        Accept: 'application/atom+xml;type=feed',
      });
    });

    it('parses trace entries', async () => {
      const xml = `<atom:feed xmlns:atom="http://www.w3.org/2005/Atom">
        <atom:entry>
          <atom:title>Trace for ZTEST</atom:title>
          <atom:link href="/sap/bc/adt/runtime/traces/abaptraces/TRACE_001" rel="self"/>
          <atom:updated>2026-04-01T10:00:00Z</atom:updated>
        </atom:entry>
      </atom:feed>`;
      const http = mockHttp(xml);
      const result = await listTraces(http, unrestrictedSafetyConfig());
      expect(result).toHaveLength(1);
      expect(result[0]!.title).toBe('Trace for ZTEST');
      expect(result[0]!.id).toBe('TRACE_001');
    });

    it('is blocked when Read is disallowed', async () => {
      const http = mockHttp();
      const safety = { ...unrestrictedSafetyConfig(), disallowedOps: 'R' };
      await expect(listTraces(http, safety)).rejects.toThrow(AdtSafetyError);
    });
  });

  // ─── parseTraceList ─────────────────────────────────────────────────

  describe('parseTraceList', () => {
    it('handles empty feed', () => {
      const xml = '<atom:feed xmlns:atom="http://www.w3.org/2005/Atom"></atom:feed>';
      expect(parseTraceList(xml)).toEqual([]);
    });

    it('parses trace entries with extended data', () => {
      const xml = `<atom:feed xmlns:atom="http://www.w3.org/2005/Atom">
        <atom:entry trc:state="completed" trc:objectName="ZTEST_PROG" trc:runtime="12345" xmlns:trc="http://www.sap.com/adt/runtime/traces/abaptraces">
          <atom:title>Trace run</atom:title>
          <atom:link href="/sap/bc/adt/runtime/traces/abaptraces/TR_001" rel="self"/>
          <atom:updated>2026-04-01T12:00:00Z</atom:updated>
        </atom:entry>
      </atom:feed>`;
      const result = parseTraceList(xml);
      expect(result).toHaveLength(1);
      expect(result[0]!.state).toBe('completed');
      expect(result[0]!.objectName).toBe('ZTEST_PROG');
      expect(result[0]!.runtime).toBe(12345);
    });
  });

  // ─── Trace analysis parsers ─────────────────────────────────────────

  describe('parseTraceHitlist', () => {
    it('parses hitlist entries', () => {
      const xml = `<hitList>
        <hitListEntry callingProgram="CL_TEST=>METHOD1" calledProgram="CL_HELPER=>DO_WORK" hitCount="42" grossTime="5000" traceEventNetTime="3000"/>
        <hitListEntry callingProgram="CL_HELPER=>DO_WORK" calledProgram="CL_DB=>SELECT" hitCount="10" grossTime="2000" traceEventNetTime="1500"/>
      </hitList>`;
      const result = parseTraceHitlist(xml);
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        callingProgram: 'CL_TEST=>METHOD1',
        calledProgram: 'CL_HELPER=>DO_WORK',
        hitCount: 42,
        grossTime: 5000,
        netTime: 3000,
      });
    });

    it('returns empty for no entries', () => {
      expect(parseTraceHitlist('<hitList/>')).toEqual([]);
    });
  });

  describe('parseTraceStatements', () => {
    it('parses statement entries', () => {
      const xml = `<statements>
        <traceStatement callLevel="0" hitCount="1" isProceduralUnit="true" grossTime="10000" description="CL_TEST=>MAIN"/>
        <traceStatement callLevel="1" hitCount="5" isProceduralUnit="false" grossTime="500" description="SELECT"/>
      </statements>`;
      const result = parseTraceStatements(xml);
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        callLevel: 0,
        hitCount: 1,
        isProceduralUnit: true,
        grossTime: 10000,
        description: 'CL_TEST=>MAIN',
      });
      expect(result[1]!.isProceduralUnit).toBe(false);
    });

    it('returns empty for no entries', () => {
      expect(parseTraceStatements('<statements/>')).toEqual([]);
    });
  });

  describe('parseTraceDbAccesses', () => {
    it('parses DB access entries', () => {
      const xml = `<dbAccesses>
        <dbAccess tableName="MARA" statement="SELECT" type="OpenSQL" totalCount="100" bufferedCount="95" accessTime="2500"/>
        <dbAccess tableName="VBAK" statement="SELECT" type="OpenSQL" totalCount="50" bufferedCount="0" accessTime="8000"/>
      </dbAccesses>`;
      const result = parseTraceDbAccesses(xml);
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        tableName: 'MARA',
        statement: 'SELECT',
        type: 'OpenSQL',
        totalCount: 100,
        bufferedCount: 95,
        accessTime: 2500,
      });
    });

    it('returns empty for no entries', () => {
      expect(parseTraceDbAccesses('<dbAccesses/>')).toEqual([]);
    });
  });

  // ─── Trace analysis functions ────────────────────────────────────────

  describe('getTraceHitlist', () => {
    it('calls correct endpoint', async () => {
      const http = mockHttp('<hitList/>');
      await getTraceHitlist(http, unrestrictedSafetyConfig(), 'TRACE_001');
      expect(http.get).toHaveBeenCalledWith('/sap/bc/adt/runtime/traces/abaptraces/TRACE_001/hitlist', {
        Accept: 'application/xml',
      });
    });

    it('is blocked when Read is disallowed', async () => {
      const http = mockHttp();
      const safety = { ...unrestrictedSafetyConfig(), disallowedOps: 'R' };
      await expect(getTraceHitlist(http, safety, 'TRACE_001')).rejects.toThrow(AdtSafetyError);
    });
  });

  describe('getTraceStatements', () => {
    it('calls correct endpoint', async () => {
      const http = mockHttp('<statements/>');
      await getTraceStatements(http, unrestrictedSafetyConfig(), 'TRACE_002');
      expect(http.get).toHaveBeenCalledWith('/sap/bc/adt/runtime/traces/abaptraces/TRACE_002/statements', {
        Accept: 'application/xml',
      });
    });
  });

  describe('getTraceDbAccesses', () => {
    it('calls correct endpoint', async () => {
      const http = mockHttp('<dbAccesses/>');
      await getTraceDbAccesses(http, unrestrictedSafetyConfig(), 'TRACE_003');
      expect(http.get).toHaveBeenCalledWith('/sap/bc/adt/runtime/traces/abaptraces/TRACE_003/dbAccesses', {
        Accept: 'application/xml',
      });
    });
  });
});

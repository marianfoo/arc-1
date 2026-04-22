import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildArgs, coerceValue, parseArgPair, readJsonInput } from '../../../src/cli-args.js';

describe('cli-args: coerceValue', () => {
  it('coerces booleans', () => {
    expect(coerceValue('true')).toBe(true);
    expect(coerceValue('false')).toBe(false);
  });

  it('coerces null', () => {
    expect(coerceValue('null')).toBeNull();
  });

  it('coerces integers and floats', () => {
    expect(coerceValue('42')).toBe(42);
    expect(coerceValue('-7')).toBe(-7);
    expect(coerceValue('3.14')).toBe(3.14);
  });

  it('coerces JSON objects and arrays', () => {
    expect(coerceValue('{"a":1}')).toEqual({ a: 1 });
    expect(coerceValue('[1,2,3]')).toEqual([1, 2, 3]);
  });

  it('leaves bare strings untouched', () => {
    expect(coerceValue('ZCL_FOO')).toBe('ZCL_FOO');
    expect(coerceValue('')).toBe('');
    expect(coerceValue('123abc')).toBe('123abc');
  });

  it('returns the raw string when JSON parse fails', () => {
    expect(coerceValue('{not-json}')).toBe('{not-json}');
  });
});

describe('cli-args: parseArgPair', () => {
  it('splits on the first =', () => {
    expect(parseArgPair('name=ZCL_FOO')).toEqual(['name', 'ZCL_FOO']);
    expect(parseArgPair('query=select * from t where x=1')).toEqual(['query', 'select * from t where x=1']);
  });

  it('coerces values', () => {
    expect(parseArgPair('flat=true')).toEqual(['flat', true]);
    expect(parseArgPair('max=50')).toEqual(['max', 50]);
  });

  it('throws on missing =', () => {
    expect(() => parseArgPair('novalue')).toThrow(/key=value/);
  });

  it('throws on empty key', () => {
    expect(() => parseArgPair('=value')).toThrow(/key=value/);
  });
});

describe('cli-args: buildArgs', () => {
  it('merges --json and --arg, with --arg overriding', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'arc1-cli-'));
    const jsonFile = join(tmp, 'args.json');
    writeFileSync(jsonFile, JSON.stringify({ type: 'CLAS', name: 'FROM_JSON', flat: false }));
    try {
      const merged = buildArgs({ json: jsonFile, arg: ['name=FROM_ARG', 'flat=true'] });
      expect(merged).toEqual({ type: 'CLAS', name: 'FROM_ARG', flat: true });
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('works with only --arg', () => {
    expect(buildArgs({ arg: ['type=PROG', 'name=ZREPORT'] })).toEqual({ type: 'PROG', name: 'ZREPORT' });
  });

  it('works with only --json (inline)', () => {
    expect(buildArgs({ json: '{"action":"sql","query":"SELECT 1"}' })).toEqual({
      action: 'sql',
      query: 'SELECT 1',
    });
  });

  it('returns empty object with no input', () => {
    expect(buildArgs({})).toEqual({});
  });
});

describe('cli-args: readJsonInput', () => {
  let tmp: string;
  beforeAll(() => {
    tmp = mkdtempSync(join(tmpdir(), 'arc1-cli-'));
  });
  afterAll(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it('reads inline JSON object', () => {
    expect(readJsonInput('{"a":1}')).toEqual({ a: 1 });
  });

  it('reads from a file path', () => {
    const file = join(tmp, 'payload.json');
    writeFileSync(file, JSON.stringify({ hello: 'world' }));
    expect(readJsonInput(file)).toEqual({ hello: 'world' });
  });

  it('rejects non-object payloads', () => {
    expect(() => readJsonInput('[1,2,3]')).toThrow(/object/);
    const file = join(tmp, 'scalar.json');
    writeFileSync(file, '"just a string"');
    expect(() => readJsonInput(file)).toThrow(/object/);
  });
});

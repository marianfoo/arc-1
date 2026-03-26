import { describe, expect, it } from 'vitest';
import { parseCookieFileContent, parseCookieString } from '../../../ts-src/adt/cookies.js';

describe('parseCookieString', () => {
  it('parses simple cookie string', () => {
    const cookies = parseCookieString('sap-usercontext=abc; SAP_SESSIONID=xyz');
    expect(cookies).toEqual({
      'sap-usercontext': 'abc',
      SAP_SESSIONID: 'xyz',
    });
  });

  it('handles empty string', () => {
    expect(parseCookieString('')).toEqual({});
  });

  it('handles single cookie', () => {
    const cookies = parseCookieString('key=value');
    expect(cookies).toEqual({ key: 'value' });
  });

  it('handles whitespace', () => {
    const cookies = parseCookieString('  key1 = val1 ;  key2 = val2  ');
    expect(cookies).toEqual({ key1: 'val1', key2: 'val2' });
  });

  it('handles values with equals sign', () => {
    const cookies = parseCookieString('token=abc=def=ghi');
    expect(cookies).toEqual({ token: 'abc=def=ghi' });
  });

  it('skips entries without equals', () => {
    const cookies = parseCookieString('key=value; invalid; other=ok');
    expect(cookies).toEqual({ key: 'value', other: 'ok' });
  });
});

describe('parseCookieFileContent', () => {
  it('parses Netscape format (7 tab-separated fields)', () => {
    const content = [
      '# Netscape HTTP Cookie File',
      '.example.com\tTRUE\t/\tFALSE\t0\tsap-usercontext\tabc123',
      '.example.com\tTRUE\t/\tFALSE\t0\tSAP_SESSIONID\txyz789',
    ].join('\n');

    const cookies = parseCookieFileContent(content);
    expect(cookies).toEqual({
      'sap-usercontext': 'abc123',
      SAP_SESSIONID: 'xyz789',
    });
  });

  it('skips comments and empty lines', () => {
    const content = ['# This is a comment', '', '  ', '.example.com\tTRUE\t/\tFALSE\t0\tkey\tvalue'].join('\n');

    const cookies = parseCookieFileContent(content);
    expect(cookies).toEqual({ key: 'value' });
  });

  it('falls back to key=value format', () => {
    const content = ['key1=value1', 'key2=value2'].join('\n');
    const cookies = parseCookieFileContent(content);
    expect(cookies).toEqual({ key1: 'value1', key2: 'value2' });
  });

  it('handles mixed formats', () => {
    const content = ['# Comment', '.example.com\tTRUE\t/\tFALSE\t0\tnetscape\tcookievalue', 'simple=keyvalue'].join(
      '\n',
    );

    const cookies = parseCookieFileContent(content);
    expect(cookies).toEqual({
      netscape: 'cookievalue',
      simple: 'keyvalue',
    });
  });

  it('handles empty file', () => {
    expect(parseCookieFileContent('')).toEqual({});
  });
});

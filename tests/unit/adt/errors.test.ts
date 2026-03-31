import { describe, expect, it } from 'vitest';
import { AdtApiError } from '../../../ts-src/adt/errors.js';

describe('AdtApiError', () => {
  describe('extractCleanMessage', () => {
    it('extracts localizedMessage from SAP XML exception', () => {
      const xml = `<?xml version="1.0" encoding="utf-8"?>
<exc:exception xmlns:exc="http://www.sap.com/abapxml/types/communicationframework">
  <exc:localizedMessage lang="EN">Object PROG ZZZNOTEXIST999 does not exist</exc:localizedMessage>
  <exc:exception_id>NOT_FOUND</exc:exception_id>
</exc:exception>`;
      expect(AdtApiError.extractCleanMessage(xml)).toBe('Object PROG ZZZNOTEXIST999 does not exist');
    });

    it('extracts localizedMessage without namespace prefix', () => {
      const xml = '<exception><localizedMessage lang="EN">Lock conflict on object</localizedMessage></exception>';
      expect(AdtApiError.extractCleanMessage(xml)).toBe('Lock conflict on object');
    });

    it('extracts message element as fallback', () => {
      const xml = '<error><message lang="EN">Syntax error in line 5</message></error>';
      expect(AdtApiError.extractCleanMessage(xml)).toBe('Syntax error in line 5');
    });

    it('extracts title from HTML error page', () => {
      const html =
        '<html><head><title>503 Service Unavailable</title></head><body><h1>Service Unavailable</h1></body></html>';
      expect(AdtApiError.extractCleanMessage(html)).toBe('503 Service Unavailable');
    });

    it('extracts h1 from HTML without title', () => {
      const html = '<html><body><h1>Gateway Timeout</h1></body></html>';
      expect(AdtApiError.extractCleanMessage(html)).toBe('Gateway Timeout');
    });

    it('returns plain text as-is', () => {
      expect(AdtApiError.extractCleanMessage('Session timed out')).toBe('Session timed out');
    });

    it('truncates long plain text', () => {
      const long = 'A'.repeat(500);
      expect(AdtApiError.extractCleanMessage(long)).toBe('A'.repeat(300));
    });

    it('strips tags from unrecognized XML', () => {
      const xml = '<root><nested>Some error text</nested><other>more</other></root>';
      expect(AdtApiError.extractCleanMessage(xml)).toBe('Some error text more');
    });

    it('handles empty string', () => {
      expect(AdtApiError.extractCleanMessage('')).toBe('Unknown error');
    });

    it('handles XML with only tags and no text', () => {
      expect(AdtApiError.extractCleanMessage('<root><empty/></root>')).toBe(
        'SAP returned an error (no readable message)',
      );
    });
  });

  describe('constructor strips XML from message', () => {
    it('stores clean message, preserves raw body', () => {
      const xml = `<exc:exception xmlns:exc="http://www.sap.com/abapxml/types/communicationframework">
  <exc:localizedMessage lang="EN">Program ZTEST not found</exc:localizedMessage>
</exc:exception>`;
      const err = new AdtApiError(xml, 404, '/sap/bc/adt/programs/programs/ZTEST', xml);

      expect(err.message).toBe(
        'ADT API error: status 404 at /sap/bc/adt/programs/programs/ZTEST: Program ZTEST not found',
      );
      expect(err.responseBody).toContain('exc:exception'); // Raw body preserved for debugging
      expect(err.message).not.toContain('<'); // No XML in message
    });
  });
});

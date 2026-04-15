import { describe, expect, it } from 'vitest';
import { AdtApiError } from '../../../src/adt/errors.js';

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

    it('extracts msgText from SAP HTML 500 error page', () => {
      const html = `<!DOCTYPE html>
<html><head><title>Application Server Error</title></head><body>
<p class="detailText"><span id="msgText">Syntax error in program ZC_FBCLUBTP===================BD        .</span></p>
</body></html>`;
      expect(AdtApiError.extractCleanMessage(html)).toBe(
        'Application Server Error: Syntax error in program ZC_FBCLUBTP===================BD        .',
      );
    });

    it('extracts msgText without title context', () => {
      const html = '<html><body><span id="msgText">The ASSERT condition was violated.</span></body></html>';
      expect(AdtApiError.extractCleanMessage(html)).toBe('The ASSERT condition was violated.');
    });

    it('extracts detailText paragraph', () => {
      const html = '<html><body><p class="detailText">Session expired for user DEVELOPER</p></body></html>';
      expect(AdtApiError.extractCleanMessage(html)).toBe('Session expired for user DEVELOPER');
    });
  });

  describe('constructor deep error extraction', () => {
    it('extracts msgText from full responseBody when truncated message only yields HTML title', () => {
      // Simulate: first 500 chars only contain the HTML head (title), but full body has msgText deeper
      const shortHtml = '<html><head><title>Application Server Error</title></head><body>' + 'x'.repeat(400);
      const fullHtml =
        shortHtml +
        '<p class="detailText"><span id="msgText">Syntax error in program ZC_FBCLUBTP===================BD</span></p></body></html>';
      const err = new AdtApiError(shortHtml, 500, '/sap/bc/adt/activation', fullHtml);
      expect(err.message).toContain('Syntax error in program ZC_FBCLUBTP');
    });
  });

  describe('extractAllMessages', () => {
    it('extracts additional messages beyond the first', () => {
      const xml = `<?xml version="1.0" encoding="utf-8"?>
<exc:exception xmlns:exc="http://www.sap.com/abapxml/types/communicationframework">
  <exc:localizedMessage lang="EN">DDL source could not be saved</exc:localizedMessage>
  <exc:localizedMessage lang="EN">Field POSITION is a reserved keyword (line 5, col 3)</exc:localizedMessage>
  <exc:localizedMessage lang="EN">Check CDS documentation</exc:localizedMessage>
</exc:exception>`;
      const messages = AdtApiError.extractAllMessages(xml);
      expect(messages).toHaveLength(2);
      expect(messages[0]).toBe('Field POSITION is a reserved keyword (line 5, col 3)');
      expect(messages[1]).toBe('Check CDS documentation');
    });

    it('returns empty array for single message', () => {
      const xml = `<exc:exception xmlns:exc="http://www.sap.com/abapxml/types/communicationframework">
  <exc:localizedMessage lang="EN">Object not found</exc:localizedMessage>
</exc:exception>`;
      expect(AdtApiError.extractAllMessages(xml)).toHaveLength(0);
    });

    it('returns empty array for empty XML', () => {
      expect(AdtApiError.extractAllMessages('')).toHaveLength(0);
    });

    it('returns empty array for HTML response', () => {
      expect(AdtApiError.extractAllMessages('<html><body>Error</body></html>')).toHaveLength(0);
    });

    it('handles messages without namespace prefix', () => {
      const xml = `<exception>
  <localizedMessage lang="EN">First error</localizedMessage>
  <localizedMessage lang="EN">Second error on line 10</localizedMessage>
</exception>`;
      const messages = AdtApiError.extractAllMessages(xml);
      expect(messages).toHaveLength(1);
      expect(messages[0]).toBe('Second error on line 10');
    });
  });

  describe('extractProperties', () => {
    it('extracts key-value properties from SAP XML', () => {
      const xml = `<exc:exception xmlns:exc="http://www.sap.com/abapxml/types/communicationframework">
  <exc:localizedMessage lang="EN">Syntax error</exc:localizedMessage>
  <exc:properties>
    <entry key="T100KEY-NO">039</entry>
    <entry key="LINE">15</entry>
    <entry key="COLUMN">8</entry>
  </exc:properties>
</exc:exception>`;
      const props = AdtApiError.extractProperties(xml);
      expect(props['T100KEY-NO']).toBe('039');
      expect(props.LINE).toBe('15');
      expect(props.COLUMN).toBe('8');
    });

    it('returns empty object for XML without properties', () => {
      const xml = `<exc:exception xmlns:exc="http://www.sap.com/abapxml/types/communicationframework">
  <exc:localizedMessage lang="EN">Not found</exc:localizedMessage>
</exc:exception>`;
      expect(AdtApiError.extractProperties(xml)).toEqual({});
    });

    it('returns empty object for empty input', () => {
      expect(AdtApiError.extractProperties('')).toEqual({});
    });

    it('extracts multiple properties correctly', () => {
      const xml = `<properties>
  <entry key="MSG_ID">CL</entry>
  <entry key="MSG_NO">001</entry>
  <entry key="SEVERITY">E</entry>
</properties>`;
      const props = AdtApiError.extractProperties(xml);
      expect(Object.keys(props)).toHaveLength(3);
      expect(props.MSG_ID).toBe('CL');
      expect(props.SEVERITY).toBe('E');
    });
  });

  describe('extractDdicDiagnostics', () => {
    it('extracts structured diagnostics from SBD_MESSAGES-style response', () => {
      const xml = `<?xml version="1.0" encoding="utf-8"?>
<exc:exception xmlns:exc="http://www.sap.com/abapxml/types/communicationframework">
  <exc:localizedMessage lang="EN">Can&apos;t save due to errors in source</exc:localizedMessage>
  <exc:localizedMessage lang="EN">Missing required annotation @AbapCatalog.enhancement.category</exc:localizedMessage>
  <exc:properties>
    <entry key="T100KEY-MSGID">SBD_MESSAGES</entry>
    <entry key="T100KEY-MSGNO">007</entry>
    <entry key="T100KEY-V1">ZI_TRAVEL</entry>
    <entry key="T100KEY-V2">FIELD_NAME</entry>
    <entry key="LINE">5</entry>
    <entry key="COLUMN">12</entry>
  </exc:properties>
</exc:exception>`;
      const diagnostics = AdtApiError.extractDdicDiagnostics(xml);
      expect(diagnostics.length).toBeGreaterThan(0);
      expect(diagnostics[0]?.messageId).toBe('SBD_MESSAGES');
      expect(diagnostics[0]?.messageNumber).toBe('007');
      expect(diagnostics[0]?.variables).toEqual(['ZI_TRAVEL', 'FIELD_NAME']);
      expect(diagnostics[0]?.lineNumber).toBe(5);
    });

    it('extracts V1-V4 message variables when present', () => {
      const xml = `<exc:exception xmlns:exc="http://www.sap.com/abapxml/types/communicationframework">
  <exc:localizedMessage lang="EN">Generic DDIC failure</exc:localizedMessage>
  <exc:properties>
    <entry key="T100KEY-MSGID">SBD</entry>
    <entry key="T100KEY-MSGNO">007</entry>
    <entry key="T100KEY-V1">V1</entry>
    <entry key="T100KEY-V2">V2</entry>
    <entry key="T100KEY-V3">V3</entry>
    <entry key="T100KEY-V4">V4</entry>
  </exc:properties>
</exc:exception>`;
      const diagnostics = AdtApiError.extractDdicDiagnostics(xml);
      expect(diagnostics[0]?.variables).toEqual(['V1', 'V2', 'V3', 'V4']);
    });

    it('parses line number from line/column properties and message text', () => {
      const xml = `<exc:exception xmlns:exc="http://www.sap.com/abapxml/types/communicationframework">
  <exc:localizedMessage lang="EN">Field "POSITION" invalid at line 17</exc:localizedMessage>
  <exc:properties>
    <entry key="T100KEY-MSGID">SBD</entry>
    <entry key="T100KEY-MSGNO">007</entry>
    <entry key="LINE">17</entry>
  </exc:properties>
</exc:exception>`;
      const diagnostics = AdtApiError.extractDdicDiagnostics(xml);
      expect(diagnostics[0]?.lineNumber).toBe(17);
    });

    it('returns empty array for empty XML', () => {
      expect(AdtApiError.extractDdicDiagnostics('')).toEqual([]);
    });

    it('returns empty array for non-DDIC XML with single localizedMessage', () => {
      const xml = `<exc:exception xmlns:exc="http://www.sap.com/abapxml/types/communicationframework">
  <exc:localizedMessage lang="EN">Object not found</exc:localizedMessage>
</exc:exception>`;
      expect(AdtApiError.extractDdicDiagnostics(xml)).toEqual([]);
    });

    it('extracts diagnostics from multiple localized messages even without properties', () => {
      const xml = `<exc:exception xmlns:exc="http://www.sap.com/abapxml/types/communicationframework">
  <exc:localizedMessage lang="EN">Can&apos;t save due to errors in source</exc:localizedMessage>
  <exc:localizedMessage lang="EN">Line 9: Unknown type ABAP.XXX</exc:localizedMessage>
</exc:exception>`;
      const diagnostics = AdtApiError.extractDdicDiagnostics(xml);
      expect(diagnostics).toHaveLength(2);
      expect(diagnostics[1]?.lineNumber).toBe(9);
    });
  });

  describe('formatDdicDiagnostics', () => {
    it('formats structured DDIC diagnostics as bullet list', () => {
      const xml = `<exc:exception xmlns:exc="http://www.sap.com/abapxml/types/communicationframework">
  <exc:localizedMessage lang="EN">Can&apos;t save due to errors in source</exc:localizedMessage>
  <exc:properties>
    <entry key="T100KEY-MSGID">SBD_MESSAGES</entry>
    <entry key="T100KEY-MSGNO">007</entry>
    <entry key="T100KEY-V1">FIELD_A</entry>
    <entry key="LINE">5</entry>
  </exc:properties>
</exc:exception>`;
      const formatted = AdtApiError.formatDdicDiagnostics(xml);
      expect(formatted).toContain('DDIC diagnostics:');
      expect(formatted).toContain('[SBD_MESSAGES/007]');
      expect(formatted).toContain('V1=FIELD_A');
      expect(formatted).toContain('Line 5');
    });

    it('returns empty string when no DDIC diagnostics exist', () => {
      const xml = `<exc:exception xmlns:exc="http://www.sap.com/abapxml/types/communicationframework">
  <exc:localizedMessage lang="EN">Object not found</exc:localizedMessage>
</exc:exception>`;
      expect(AdtApiError.formatDdicDiagnostics(xml)).toBe('');
    });
  });

  describe('isServerError', () => {
    it('returns true for 500', () => {
      const err = new AdtApiError('Server error', 500, '/sap/bc/adt/test');
      expect(err.isServerError).toBe(true);
    });

    it('returns true for 502', () => {
      const err = new AdtApiError('Bad gateway', 502, '/sap/bc/adt/test');
      expect(err.isServerError).toBe(true);
    });

    it('returns true for 503', () => {
      const err = new AdtApiError('Service unavailable', 503, '/sap/bc/adt/test');
      expect(err.isServerError).toBe(true);
    });

    it('returns false for 400', () => {
      const err = new AdtApiError('Bad request', 400, '/sap/bc/adt/test');
      expect(err.isServerError).toBe(false);
    });

    it('returns false for 404', () => {
      const err = new AdtApiError('Not found', 404, '/sap/bc/adt/test');
      expect(err.isServerError).toBe(false);
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

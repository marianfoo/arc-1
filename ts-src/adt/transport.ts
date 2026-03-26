/**
 * CTS Transport management for SAP ADT.
 *
 * Transport operations require explicit opt-in via enableTransports flag.
 * Safety checks are applied at every entry point.
 */

import type { AdtHttpClient } from './http.js';
import { checkTransport, type SafetyConfig } from './safety.js';
import type { TransportRequest } from './types.js';

/** List transport requests for a user */
export async function listTransports(
  http: AdtHttpClient,
  safety: SafetyConfig,
  user?: string,
): Promise<TransportRequest[]> {
  checkTransport(safety, '', 'ListTransports', false);

  let url = '/sap/bc/adt/cts/transportrequests';
  if (user && user !== '*') {
    url += `?user=${encodeURIComponent(user)}`;
  }

  const resp = await http.get(url, { Accept: 'application/xml' });
  return parseTransportList(resp.body);
}

/** Get details of a specific transport request */
export async function getTransport(
  http: AdtHttpClient,
  safety: SafetyConfig,
  transportId: string,
): Promise<TransportRequest | null> {
  checkTransport(safety, transportId, 'GetTransport', false);

  const resp = await http.get(`/sap/bc/adt/cts/transportrequests/${encodeURIComponent(transportId)}`, {
    Accept: 'application/xml',
  });

  const transports = parseTransportList(resp.body);
  return transports[0] ?? null;
}

/** Create a new transport request */
export async function createTransport(
  http: AdtHttpClient,
  safety: SafetyConfig,
  description: string,
  targetPackage?: string,
): Promise<string> {
  checkTransport(safety, '', 'CreateTransport', true);

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<tm:root xmlns:tm="http://www.sap.com/cts/transports">
  <tm:request tm:desc="${escapeXml(description)}" tm:type="K"${targetPackage ? ` tm:target="${escapeXml(targetPackage)}"` : ''}/>
</tm:root>`;

  const resp = await http.post('/sap/bc/adt/cts/transportrequests', body, 'application/xml', {
    Accept: 'application/xml',
  });

  // Extract transport number from response
  const match = resp.body.match(/tm:number="([^"]*)"/);
  return match?.[1] ?? '';
}

/** Release a transport request */
export async function releaseTransport(http: AdtHttpClient, safety: SafetyConfig, transportId: string): Promise<void> {
  checkTransport(safety, transportId, 'ReleaseTransport', true);

  await http.post(`/sap/bc/adt/cts/transportrequests/${encodeURIComponent(transportId)}/newreleasejobs`);
}

// ─── Parsers ────────────────────────────────────────────────────────

function parseTransportList(xml: string): TransportRequest[] {
  const transports: TransportRequest[] = [];
  const trRegex =
    /<tm:request[^>]*tm:number="([^"]*)"[^>]*tm:owner="([^"]*)"[^>]*tm:desc="([^"]*)"[^>]*tm:status="([^"]*)"[^>]*tm:type="([^"]*)"/g;

  let match: RegExpExecArray | null;
  while ((match = trRegex.exec(xml)) !== null) {
    transports.push({
      id: match[1]!,
      description: match[3]!,
      owner: match[2]!,
      status: match[4]!,
      type: match[5]!,
      tasks: [],
    });
  }

  return transports;
}

function escapeXml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

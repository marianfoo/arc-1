/**
 * CTS Transport management for SAP ADT.
 *
 * Transport operations require explicit opt-in via enableTransports flag.
 * Safety checks are applied at every entry point.
 */

import type { AdtHttpClient } from './http.js';
import { checkTransport, type SafetyConfig } from './safety.js';
import type { TransportObject, TransportRequest, TransportTask } from './types.js';
import { escapeXmlAttr, findDeepNodes, parseXml } from './xml-parser.js';

// ─── CTS Media Types & Namespaces ──────────────────────────────────

/** Accept header for tree-structured responses (list/get transport) */
export const CTS_ACCEPT_TREE = 'application/vnd.sap.adt.transportorganizertree.v1+xml';

/** Content-Type / Accept for organizer write operations (create transport) */
export const CTS_CONTENT_TYPE_ORGANIZER = 'application/vnd.sap.adt.transportorganizer.v1+xml';

/** XML namespace for CTS ADT transport manager payloads */
export const CTS_NAMESPACE_TM = 'http://www.sap.com/cts/adt/tm';

/** List transport requests for a user */
export async function listTransports(
  http: AdtHttpClient,
  safety: SafetyConfig,
  user?: string,
  status?: string,
): Promise<TransportRequest[]> {
  checkTransport(safety, '', 'ListTransports', false);

  const params = new URLSearchParams();
  if (user && user !== '*') {
    params.set('user', user);
  }
  if (status) {
    params.set('status', status);
  }

  let url = '/sap/bc/adt/cts/transportrequests';
  const qs = params.toString();
  if (qs) {
    url += `?${qs}`;
  }

  const resp = await http.get(url, { Accept: CTS_ACCEPT_TREE });
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
    Accept: CTS_CONTENT_TYPE_ORGANIZER,
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
  transportType = 'K',
): Promise<string> {
  checkTransport(safety, '', 'CreateTransport', true);

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<tm:root xmlns:tm="${CTS_NAMESPACE_TM}">
  <tm:request tm:desc="${escapeXmlAttr(description)}" tm:type="${escapeXmlAttr(transportType)}"${targetPackage ? ` tm:target="${escapeXmlAttr(targetPackage)}"` : ''}/>
</tm:root>`;

  const resp = await http.post('/sap/bc/adt/cts/transportrequests', body, CTS_CONTENT_TYPE_ORGANIZER, {
    Accept: CTS_CONTENT_TYPE_ORGANIZER,
  });

  // Extract transport number from response
  const parsed = parseXml(resp.body);
  const requests = findDeepNodes(parsed, 'request');
  return String(requests[0]?.['@_number'] ?? '');
}

/** Release a transport request */
export async function releaseTransport(http: AdtHttpClient, safety: SafetyConfig, transportId: string): Promise<void> {
  checkTransport(safety, transportId, 'ReleaseTransport', true);

  await http.post(
    `/sap/bc/adt/cts/transportrequests/${encodeURIComponent(transportId)}/newreleasejobs`,
    undefined,
    undefined,
    { Accept: CTS_CONTENT_TYPE_ORGANIZER },
  );
}

/** Release a transport request recursively — tasks first, then parent */
export async function releaseTransportRecursive(
  http: AdtHttpClient,
  safety: SafetyConfig,
  transportId: string,
): Promise<{ released: string[] }> {
  checkTransport(safety, transportId, 'ReleaseTransportRecursive', true);

  const transport = await getTransport(http, safety, transportId);
  const released: string[] = [];

  if (transport) {
    for (const task of transport.tasks) {
      if (task.status !== 'R') {
        checkTransport(safety, task.id, 'ReleaseTransportRecursive', true);
        await releaseTransport(http, safety, task.id);
        released.push(task.id);
      }
    }

    // Skip parent if already released (idempotent/retry-safe)
    if (transport.status === 'R') {
      return { released };
    }
  }

  await releaseTransport(http, safety, transportId);
  released.push(transportId);

  return { released };
}

/** Delete a transport request */
export async function deleteTransport(
  http: AdtHttpClient,
  safety: SafetyConfig,
  transportId: string,
  recursive = false,
): Promise<void> {
  checkTransport(safety, transportId, 'DeleteTransport', true);

  if (recursive) {
    const transport = await getTransport(http, safety, transportId);
    if (transport) {
      for (const task of transport.tasks) {
        if (task.status !== 'R') {
          checkTransport(safety, task.id, 'DeleteTransport', true);
          await http.delete(`/sap/bc/adt/cts/transportrequests/${encodeURIComponent(task.id)}`);
        }
      }
    }
  }

  await http.delete(`/sap/bc/adt/cts/transportrequests/${encodeURIComponent(transportId)}`);
}

/** Reassign a transport request to a new owner */
export async function reassignTransport(
  http: AdtHttpClient,
  safety: SafetyConfig,
  transportId: string,
  newOwner: string,
  recursive = false,
): Promise<void> {
  checkTransport(safety, transportId, 'ReassignTransport', true);

  if (recursive) {
    const transport = await getTransport(http, safety, transportId);
    if (transport) {
      for (const task of transport.tasks) {
        if (task.status !== 'R') {
          checkTransport(safety, task.id, 'ReassignTransport', true);
          await reassignSingle(http, task.id, newOwner);
        }
      }
    }
  }

  await reassignSingle(http, transportId, newOwner);
}

async function reassignSingle(http: AdtHttpClient, transportId: string, newOwner: string): Promise<void> {
  const body = `<?xml version="1.0" encoding="ASCII"?>
<tm:root xmlns:tm="${CTS_NAMESPACE_TM}"
 tm:number="${escapeXmlAttr(transportId)}"
 tm:targetuser="${escapeXmlAttr(newOwner)}"
 tm:useraction="changeowner"/>`;

  await http.put(
    `/sap/bc/adt/cts/transportrequests/${encodeURIComponent(transportId)}`,
    body,
    CTS_CONTENT_TYPE_ORGANIZER,
    { Accept: CTS_CONTENT_TYPE_ORGANIZER },
  );
}

// ─── Parsers ────────────────────────────────────────────────────────

function parseTransportList(xml: string): TransportRequest[] {
  const parsed = parseXml(xml);
  const requests = findDeepNodes(parsed, 'request');

  return requests.map((req) => {
    const tasks: TransportTask[] = findDeepNodes(req, 'task').map((t) => {
      const objects: TransportObject[] = findDeepNodes(t, 'abap_object').map((o) => ({
        pgmid: String(o['@_pgmid'] ?? ''),
        type: String(o['@_type'] ?? ''),
        name: String(o['@_name'] ?? ''),
        wbtype: String(o['@_wbtype'] ?? ''),
        description: String(o['@_obj_desc'] ?? o['@_obj_info'] ?? ''),
        locked: String(o['@_lock_status'] ?? '') === 'X',
        position: String(o['@_position'] ?? '000000'),
      }));

      return {
        id: String(t['@_number'] ?? ''),
        description: String(t['@_desc'] ?? ''),
        owner: String(t['@_owner'] ?? ''),
        status: String(t['@_status'] ?? ''),
        objects,
      };
    });

    return {
      id: String(req['@_number'] ?? ''),
      description: String(req['@_desc'] ?? ''),
      owner: String(req['@_owner'] ?? ''),
      status: String(req['@_status'] ?? ''),
      type: String(req['@_type'] ?? ''),
      tasks,
    };
  });
}

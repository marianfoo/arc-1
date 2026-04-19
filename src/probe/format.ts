/**
 * Human-readable formatters for probe reports.
 *
 * Kept separate from the runner so the runner stays pure and JSON-serializable,
 * and so the CLI can opt between `--format table` and `--format json`.
 */

import type { ProbeReport, TypeResult, Verdict } from './types.js';

const VERDICT_LABEL: Record<Verdict, string> = {
  'available-high': 'AVAILABLE (high)',
  'available-medium': 'AVAILABLE (medium)',
  'unavailable-high': 'UNAVAILABLE (high)',
  'unavailable-likely': 'UNAVAILABLE (likely)',
  'auth-blocked': 'AUTH BLOCKED',
  ambiguous: 'AMBIGUOUS',
};

const DISCOVERY_SHORT = { discovered: 'Y', 'not-discovered': 'N', 'no-discovery-map': '-' };

function signalShortForKnown(k: TypeResult['signals']['knownObject']): string {
  switch (k.kind) {
    case 'ok':
      return `OK(${k.objectName})`;
    case 'all-missing':
      return `404×${k.attempted.length}`;
    case 'auth-blocked':
      return '401/403';
    case 'error':
      return 'ERR';
    case 'not-tested':
      return '—';
  }
}

function signalShortForRelease(r: TypeResult['signals']['release']): string {
  switch (r.kind) {
    case 'ok':
      return `${r.detected}>=${r.floor || '?'}`;
    case 'below-floor':
      return `${r.detected}<${r.floor}`;
    case 'unknown':
      return '?';
  }
}

function padRight(s: string, n: number): string {
  return s.length >= n ? s : s + ' '.repeat(n - s.length);
}

/** Render the full report as a plain-text block (for terminal output). */
export function formatTable(report: ProbeReport): string {
  const lines: string[] = [];
  lines.push(`SAP system:       ${report.system.baseUrl}`);
  lines.push(`SAP_BASIS:        ${report.system.abapRelease ?? '(unknown)'}`);
  lines.push(`System type:      ${report.system.systemType ?? 'unknown'}`);
  lines.push(`SAP client:       ${report.system.client ?? '(default)'}`);
  lines.push(`Discovery size:   ${report.system.discoveryMapSize} collections`);
  lines.push(`Probed at:        ${report.system.probedAt}`);
  if (report.system.products && report.system.products.length > 0) {
    // Surface the product-line markers that matter for "which SAP is this really".
    const markers = ['SAP_BASIS', 'SAP_ABA', 'S4FND', 'S4CORE', 'SAP_CLOUD', 'SAP_UI'];
    const shown = report.system.products.filter((p) => markers.includes(p.name.toUpperCase()));
    if (shown.length > 0) {
      const joined = shown.map((p) => `${p.name} ${p.release}${p.spLevel ? ` SP${p.spLevel}` : ''}`).join(', ');
      lines.push(`Key components:   ${joined}`);
    }
  }
  lines.push('');

  const header = [
    padRight('TYPE', 6),
    padRight('VERDICT', 21),
    padRight('DISCO', 5),
    padRight('COLLECTION', 22),
    padRight('KNOWN', 14),
    padRight('RELEASE', 11),
    'REASON',
  ].join(' ');
  lines.push(header);
  lines.push('-'.repeat(header.length));

  for (const r of report.results) {
    const statusFragment = r.signals.collection.statusCode
      ? `${r.signals.collection.classification} ${r.signals.collection.statusCode}`
      : r.signals.collection.classification;
    lines.push(
      [
        padRight(r.type, 6),
        padRight(VERDICT_LABEL[r.verdict], 21),
        padRight(DISCOVERY_SHORT[r.signals.discovery], 5),
        padRight(statusFragment, 22),
        padRight(signalShortForKnown(r.signals.knownObject), 14),
        padRight(signalShortForRelease(r.signals.release), 11),
        r.reason,
      ].join(' '),
    );
  }

  lines.push('');
  lines.push('Quality metrics');
  lines.push('---------------');
  const q = report.quality;
  const pct = (n: number) => `${(n * 100).toFixed(0)}%`;
  lines.push(`  Coverage — discovery:     ${pct(q.coverage.discovery)}`);
  lines.push(`  Coverage — collection:    ${pct(q.coverage.collection)}`);
  lines.push(`  Coverage — known-object:  ${pct(q.coverage.knownObject)}`);
  lines.push(`  Coverage — release:       ${pct(q.coverage.release)}`);
  lines.push(
    `  Discovery vs known-object: ${
      q.discoveryAccuracyVsKnownObject === null
        ? 'n/a (no known-object positives)'
        : pct(q.discoveryAccuracyVsKnownObject)
    }`,
  );
  lines.push('');
  lines.push('  Verdicts:');
  for (const [k, v] of Object.entries(q.verdictHistogram)) {
    lines.push(`    ${padRight(k, 20)} ${v}`);
  }
  if (q.ambiguousTypes.length > 0) {
    lines.push('');
    lines.push(`  Ambiguous (signals disagree — review): ${q.ambiguousTypes.join(', ')}`);
  }
  if (q.uncoveredByKnownObject.length > 0) {
    lines.push('');
    lines.push(`  No known-object fixture (probe blind spot): ${q.uncoveredByKnownObject.join(', ')}`);
  }
  return lines.join('\n');
}

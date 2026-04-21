import type { SystemType } from './types.js';

export type RapPreflightSeverity = 'error' | 'warning';

export interface RapPreflightFinding {
  severity: RapPreflightSeverity;
  ruleId: string;
  message: string;
  line?: number;
  column?: number;
  suggestion?: string;
}

export interface RapPreflightContext {
  systemType?: SystemType;
  abapRelease?: string;
}

export interface RapPreflightResult {
  findings: RapPreflightFinding[];
  errors: RapPreflightFinding[];
  warnings: RapPreflightFinding[];
  blocked: boolean;
}

/**
 * Deterministic RAP pre-write checks for artifact types where activation-time
 * round-trips are expensive and common failure patterns are known.
 *
 * This validator intentionally focuses on static checks with high signal.
 */
export function validateRapSource(type: string, source: string, context: RapPreflightContext = {}): RapPreflightResult {
  const normalizedType = type.toUpperCase();
  const findings: RapPreflightFinding[] = [];

  if (!source.trim()) {
    return { findings, errors: [], warnings: [], blocked: false };
  }

  switch (normalizedType) {
    case 'TABL':
      validateTabl(source, context, findings);
      break;
    case 'BDEF':
      validateBdef(source, context, findings);
      break;
    case 'DDLX':
      validateDdlx(source, context, findings);
      break;
    case 'DDLS':
      validateDdls(source, context, findings);
      break;
    default:
      break;
  }

  const errors = findings.filter((f) => f.severity === 'error');
  const warnings = findings.filter((f) => f.severity === 'warning');
  return {
    findings,
    errors,
    warnings,
    blocked: errors.length > 0,
  };
}

export function formatRapPreflightFindings(findings: RapPreflightFinding[]): string {
  if (findings.length === 0) return '';
  return findings
    .map((f) => {
      const loc = f.line ? ` (line ${f.line}${f.column ? `:${f.column}` : ''})` : '';
      const suggestion = f.suggestion ? `\n    Suggestion: ${f.suggestion}` : '';
      return `  - [${f.ruleId}] ${f.message}${loc}${suggestion}`;
    })
    .join('\n');
}

function validateTabl(source: string, context: RapPreflightContext, findings: RapPreflightFinding[]): void {
  const lines = source.split('\n');

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? '';

    // curr requires @Semantics.amount.currencyCode directly above the field.
    if (/\babap\.curr\s*\(/i.test(line) && !hasNearbyAnnotation(lines, i, /@Semantics\.amount\.currencyCode\b/i)) {
      findings.push({
        severity: 'error',
        ruleId: 'TABL_CURR_REQUIRES_CURRENCY_CODE',
        message: 'abap.curr field is missing @Semantics.amount.currencyCode.',
        line: i + 1,
        suggestion: 'Add @Semantics.amount.currencyCode above the amount field and pair it with an abap.cuky field.',
      });
    }

    // quan requires @Semantics.quantity.unitOfMeasure directly above the field.
    if (/\babap\.quan\s*\(/i.test(line) && !hasNearbyAnnotation(lines, i, /@Semantics\.quantity\.unitOfMeasure\b/i)) {
      findings.push({
        severity: 'error',
        ruleId: 'TABL_QUAN_REQUIRES_UNIT',
        message: 'abap.quan field is missing @Semantics.quantity.unitOfMeasure.',
        line: i + 1,
        suggestion:
          'Add @Semantics.quantity.unitOfMeasure above the quantity field and pair it with an abap.unit field.',
      });
    }

    if (isOnPrem75x(context)) {
      if (/\babap\.uname\b/i.test(line)) {
        findings.push({
          severity: 'error',
          ruleId: 'TABL_FORBIDDEN_ABAP_UNAME',
          message: 'abap.uname is not accepted in TABL source on on-prem 7.5x.',
          line: i + 1,
          suggestion: 'Use syuname for user fields.',
        });
      }
      if (/\babap\.utclong\b/i.test(line)) {
        findings.push({
          severity: 'error',
          ruleId: 'TABL_FORBIDDEN_ABAP_UTCLONG',
          message: 'abap.utclong is not accepted in TABL source on on-prem 7.5x.',
          line: i + 1,
          suggestion: 'Use timestampl for timestamp fields.',
        });
      }
      if (/\babap\.boolean\b/i.test(line)) {
        findings.push({
          severity: 'error',
          ruleId: 'TABL_FORBIDDEN_ABAP_BOOLEAN',
          message: 'abap.boolean is not accepted in TABL source on on-prem 7.5x.',
          line: i + 1,
          suggestion: 'Use abap.char(1) with X/space semantics for boolean-like fields.',
        });
      }
    }
  }
}

function validateBdef(source: string, context: RapPreflightContext, findings: RapPreflightFinding[]): void {
  const lines = source.split('\n');

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? '';

    if (/\bauthorization\s+master\s*\(\s*none\s*\)/i.test(line)) {
      findings.push({
        severity: 'error',
        ruleId: 'BDEF_INVALID_AUTH_MASTER_NONE',
        message: 'authorization master ( none ) is invalid. Only global or instance are allowed.',
        line: i + 1,
        suggestion:
          'Use authorization master ( global ) or authorization master ( instance ), or omit until handlers exist.',
      });
    }
  }

  if (isOnPrem75x(context)) {
    if (/\bprojection\s*;/i.test(source) && /\buse\s+etag\b/i.test(source)) {
      findings.push({
        severity: 'error',
        ruleId: 'BDEF_PROJECTION_USE_ETAG_UNSUPPORTED',
        message: 'Projection BDEF contains "use etag", which is not supported as a header construct on on-prem 7.5x.',
        suggestion: 'Keep projection BDEF header as "projection;" and inherit etag behavior from interface BDEF.',
      });
    }
  }

  const etagNames = Array.from(source.matchAll(/\betag\s+master\s+([A-Za-z_]\w*)/gi), (m) => m[1]?.toLowerCase() ?? '');
  const duplicate = firstDuplicate(etagNames);
  if (duplicate) {
    findings.push({
      severity: 'warning',
      ruleId: 'BDEF_DUPLICATE_ETAG_MASTER_NAME',
      message: `Multiple etag master declarations reuse "${duplicate}". This commonly fails for root/dependent entities.`,
      suggestion: 'Use distinct etag master field names across root and dependent entities.',
    });
  }
}

function validateDdlx(source: string, context: RapPreflightContext, findings: RapPreflightFinding[]): void {
  const lines = source.split('\n');

  if (isOnPrem75x(context)) {
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i] ?? '';
      if (/@UI\.headerInfo\b/i.test(line) || /@Search\.searchable\b/i.test(line) || /@ObjectModel\./i.test(line)) {
        findings.push({
          severity: 'error',
          ruleId: 'DDLX_ANNOTATION_SCOPE_ONPREM_75X',
          message: 'Annotation scope is unsupported in DDLX on on-prem 7.5x (headerInfo/searchable/objectmodel).',
          line: i + 1,
          suggestion:
            'Move these annotations to the projection DDLS source and keep DDLX to UI facet/lineItem/fieldGroup style annotations.',
        });
      }
    }
  }

  const perFieldSeen = new Map<string, Set<string>>();
  let pendingKinds: string[] = [];

  for (let i = 0; i < lines.length; i += 1) {
    const raw = lines[i] ?? '';
    const line = raw.trim();
    if (!line) continue;

    const annMatch = line.match(/^@UI\.(lineItem|fieldGroup|selectionField)\b/i);
    if (annMatch) {
      pendingKinds.push(`@UI.${annMatch[1].toLowerCase()}`);
      continue;
    }

    if (line.startsWith('@')) {
      continue;
    }

    const fieldMatch = line.match(/^([A-Za-z_]\w*)\s*;/);
    if (fieldMatch) {
      const field = fieldMatch[1]!.toLowerCase();
      const seenForField = perFieldSeen.get(field) ?? new Set<string>();
      const seenInCurrentBlock = new Set<string>();

      for (const kind of pendingKinds) {
        if (seenInCurrentBlock.has(kind) || seenForField.has(kind)) {
          findings.push({
            severity: 'error',
            ruleId: 'DDLX_DUPLICATE_UI_ANNOTATION',
            message: `Field "${field}" has duplicate ${kind} annotation entries.`,
            line: i + 1,
            suggestion: 'Consolidate each UI annotation type into one block per field.',
          });
        }
        seenInCurrentBlock.add(kind);
      }

      for (const kind of seenInCurrentBlock) {
        seenForField.add(kind);
      }
      perFieldSeen.set(field, seenForField);
      pendingKinds = [];
      continue;
    }

    pendingKinds = [];
  }
}

function validateDdls(source: string, _context: RapPreflightContext, findings: RapPreflightFinding[]): void {
  const match = source.match(/\bselect\s+from\s+\w+\s*{\s*[^}]*\bclient\b[^}]*}/is);
  if (match) {
    findings.push({
      severity: 'warning',
      ruleId: 'DDLS_CLIENT_FIELD_IN_SELECT_LIST',
      message: 'CDS view entity select list appears to include client explicitly.',
      suggestion: 'For view entities, omit client from the select list and let SAP handle implicit client filtering.',
    });
  }
}

function hasNearbyAnnotation(lines: string[], lineIndex: number, annotationPattern: RegExp): boolean {
  for (let i = lineIndex - 1; i >= 0 && i >= lineIndex - 5; i -= 1) {
    const candidate = (lines[i] ?? '').trim();
    if (!candidate) continue;
    if (annotationPattern.test(candidate)) return true;
    if (candidate.startsWith('@')) continue;
    break;
  }
  return false;
}

function firstDuplicate(values: string[]): string | undefined {
  const seen = new Set<string>();
  for (const value of values) {
    if (!value) continue;
    if (seen.has(value)) return value;
    seen.add(value);
  }
  return undefined;
}

function isOnPrem75x(context: RapPreflightContext): boolean {
  if (context.systemType === 'btp') return false;
  if (context.systemType !== 'onprem') return false;

  const release = parseAbapRelease(context.abapRelease);
  if (release === undefined) return true;
  return release >= 750 && release <= 759;
}

function parseAbapRelease(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number.parseInt(value.replace(/\D/g, ''), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
  return parsed;
}

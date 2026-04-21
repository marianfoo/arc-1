export type RapHandlerKind =
  | 'action'
  | 'determination'
  | 'validation'
  | 'instance_authorization'
  | 'global_authorization';

export interface RapHandlerRequirement {
  kind: RapHandlerKind;
  methodName: string;
  entityName: string;
  entityAlias: string;
  targetHandlerClass: string;
  declarationLine: number;
  signature: string;
}

export interface RapHandlerApplySkipped {
  requirement: RapHandlerRequirement;
  reason: string;
}

export interface RapHandlerApplyResult {
  updatedSource: string;
  inserted: RapHandlerRequirement[];
  skipped: RapHandlerApplySkipped[];
  changed: boolean;
}

interface RapBehaviorBlock {
  entityName: string;
  alias: string;
  startLine: number;
  lines: string[];
}

interface ClassDefinitionRange {
  name: string;
  start: number;
  end: number;
  privateSection?: number;
}

function countChar(value: string, char: string): number {
  return value.split(char).length - 1;
}

function collectStatement(lines: string[], startIdx: number): string {
  let statement = lines[startIdx] ?? '';
  if (statement.includes(';')) return statement;
  for (let j = startIdx + 1; j < lines.length; j += 1) {
    const next = lines[j] ?? '';
    statement += ` ${next}`;
    if (next.includes(';')) break;
    // Safety cutoff: behavior blocks shouldn't have single statements > 20 lines.
    if (j - startIdx > 20) break;
  }
  return statement;
}

function normalizeMethodName(name: string): string {
  return name.replace(/\.$/, '').trim().toLowerCase();
}

function deriveAlias(entityName: string): string {
  const noNamespace = entityName.split('/').at(-1) ?? entityName;
  const noPrefix = noNamespace.replace(/^[A-Z]{1,4}_/, '');
  const normalized = (noPrefix || noNamespace).replace(/[^A-Za-z0-9_]/g, '');
  return normalized || 'Entity';
}

function parseBehaviorBlocks(source: string): RapBehaviorBlock[] {
  const blocks: RapBehaviorBlock[] = [];
  const lines = source.split('\n');

  let current:
    | {
        entityName: string;
        alias: string;
        startLine: number;
        lines: string[];
        depth: number;
        seenOpening: boolean;
      }
    | undefined;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? '';

    if (!current) {
      const defineMatch = line.match(/^\s*define\s+behavior\s+for\s+([^\s{]+)(?:\s+alias\s+([A-Za-z_]\w*))?/i);
      if (!defineMatch) continue;

      const entityName = defineMatch[1] ?? '';
      const alias = defineMatch[2] ?? deriveAlias(entityName);
      current = {
        entityName,
        alias,
        startLine: i + 1,
        lines: [],
        depth: 0,
        seenOpening: false,
      };
    }

    current.lines.push(line);
    if (line.includes('{')) current.seenOpening = true;
    current.depth += countChar(line, '{') - countChar(line, '}');

    if (current.seenOpening && current.depth <= 0) {
      blocks.push({
        entityName: current.entityName,
        alias: current.alias,
        startLine: current.startLine,
        lines: current.lines,
      });
      current = undefined;
    }
  }

  return blocks;
}

function pushRequirement(out: RapHandlerRequirement[], requirement: RapHandlerRequirement, seen: Set<string>): void {
  const key = [
    requirement.targetHandlerClass.toLowerCase(),
    requirement.kind,
    normalizeMethodName(requirement.methodName),
    requirement.entityAlias.toLowerCase(),
  ].join('|');
  if (seen.has(key)) return;
  seen.add(key);
  out.push(requirement);
}

/**
 * Extract RAP behavior-pool handler method requirements from interface BDEF source.
 */
export function extractRapHandlerRequirements(bdefSource: string): RapHandlerRequirement[] {
  const requirements: RapHandlerRequirement[] = [];
  const seen = new Set<string>();
  const blocks = parseBehaviorBlocks(bdefSource);

  for (const block of blocks) {
    const alias = block.alias;
    const targetHandlerClass = `lhc_${alias.toLowerCase()}`;
    const body = block.lines.join('\n');

    for (let idx = 0; idx < block.lines.length; idx += 1) {
      const line = block.lines[idx] ?? '';
      const declarationLine = block.startLine + idx;

      // Match: [static] [factory|internal] action [(features...)] <name>
      // Examples: "action Foo", "internal action Foo", "factory action Foo",
      //           "static factory action Foo", "action ( features: instance ) Foo".
      const actionMatch = line.match(
        /^\s*(?:static\s+)?(?:(?:internal|factory)\s+)*action(?:\s*\([^)]*\))?\s+([A-Za-z_]\w*)\b/i,
      );
      if (actionMatch?.[1]) {
        const actionName = actionMatch[1];
        const methodName = normalizeMethodName(actionName);
        const actionDecl = collectStatement(block.lines, idx);
        const hasResult = /\bresult\b/i.test(actionDecl);
        const resultPart = hasResult ? ' RESULT result' : '';
        pushRequirement(
          requirements,
          {
            kind: 'action',
            methodName,
            entityName: block.entityName,
            entityAlias: alias,
            targetHandlerClass,
            declarationLine,
            signature:
              `METHODS ${methodName} FOR MODIFY\n` + `  IMPORTING keys FOR ACTION ${alias}~${actionName}${resultPart}.`,
          },
          seen,
        );
      }

      const determinationMatch = line.match(/^\s*determination\s+([A-Za-z_]\w*)\s+on\s+(modify|save)\b/i);
      if (determinationMatch?.[1] && determinationMatch[2]) {
        const determinationName = determinationMatch[1];
        const event = determinationMatch[2].toUpperCase();
        const methodName = normalizeMethodName(determinationName);
        pushRequirement(
          requirements,
          {
            kind: 'determination',
            methodName,
            entityName: block.entityName,
            entityAlias: alias,
            targetHandlerClass,
            declarationLine,
            signature:
              `METHODS ${methodName} FOR DETERMINE ON ${event}\n` +
              `  IMPORTING keys FOR ${alias}~${determinationName}.`,
          },
          seen,
        );
      }

      const validationMatch = line.match(/^\s*validation\s+([A-Za-z_]\w*)\s+on\s+(modify|save)\b/i);
      if (validationMatch?.[1] && validationMatch[2]) {
        const validationName = validationMatch[1];
        const event = validationMatch[2].toUpperCase();
        const methodName = normalizeMethodName(validationName);
        pushRequirement(
          requirements,
          {
            kind: 'validation',
            methodName,
            entityName: block.entityName,
            entityAlias: alias,
            targetHandlerClass,
            declarationLine,
            signature:
              `METHODS ${methodName} FOR VALIDATE ON ${event}\n` + `  IMPORTING keys FOR ${alias}~${validationName}.`,
          },
          seen,
        );
      }
    }

    const instanceAuthMatch = body.match(/\bauthorization\s+master\s*\(\s*instance\s*\)/i);
    if (instanceAuthMatch) {
      pushRequirement(
        requirements,
        {
          kind: 'instance_authorization',
          methodName: 'get_instance_authorizations',
          entityName: block.entityName,
          entityAlias: alias,
          targetHandlerClass,
          declarationLine: block.startLine,
          signature:
            'METHODS get_instance_authorizations FOR INSTANCE AUTHORIZATION\n' +
            `  IMPORTING keys REQUEST requested_authorizations FOR ${alias} RESULT result.`,
        },
        seen,
      );
    }

    const globalAuthMatch = body.match(/\bauthorization\s+master\s*\(\s*global\s*\)/i);
    if (globalAuthMatch) {
      pushRequirement(
        requirements,
        {
          kind: 'global_authorization',
          methodName: 'get_global_authorizations',
          entityName: block.entityName,
          entityAlias: alias,
          targetHandlerClass,
          declarationLine: block.startLine,
          signature:
            'METHODS get_global_authorizations FOR GLOBAL AUTHORIZATION\n' +
            `  IMPORTING REQUEST requested_authorizations FOR ${alias} RESULT result.`,
        },
        seen,
      );
    }
  }

  return requirements;
}

function parseClassDefinitionRanges(source: string): ClassDefinitionRange[] {
  const lines = source.split('\n');
  const ranges: ClassDefinitionRange[] = [];

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? '';
    const startMatch = line.match(/^\s*CLASS\s+([A-Za-z_][\w$]*)\s+DEFINITION\b/i);
    if (!startMatch?.[1]) continue;

    const name = startMatch[1];
    const isDeferred = /\bDEFINITION\b.*\bDEFERRED\b/i.test(line);
    if (isDeferred) {
      // Deferred declarations are single-line declarations without ENDCLASS.
      ranges.push({ name, start: i, end: i });
      continue;
    }

    let end = i;
    let privateSection: number | undefined;
    for (let j = i + 1; j < lines.length; j += 1) {
      const inner = lines[j] ?? '';
      if (privateSection === undefined && /^\s*PRIVATE\s+SECTION\./i.test(inner)) {
        privateSection = j;
      }
      if (/^\s*ENDCLASS\./i.test(inner)) {
        end = j;
        break;
      }
    }

    ranges.push({ name, start: i, end, privateSection });
    i = end;
  }

  return ranges;
}

/**
 * Parse method declarations (`METHODS ...`) per class definition.
 */
export function parseClassDefinitionMethods(source: string): Map<string, Set<string>> {
  const lines = source.split('\n');
  const ranges = parseClassDefinitionRanges(source);
  const out = new Map<string, Set<string>>();

  for (const range of ranges) {
    const key = range.name.toLowerCase();
    const methods = out.get(key) ?? new Set<string>();

    for (let i = range.start; i <= range.end; i += 1) {
      const line = lines[i] ?? '';
      const match = line.match(/^\s*(?:CLASS-)?METHODS\s+([A-Za-z_~][\w~]*)/i);
      if (!match?.[1]) continue;
      methods.add(normalizeMethodName(match[1]));
    }

    out.set(key, methods);
  }

  return out;
}

/**
 * Determine which RAP handler requirements are missing from class definitions.
 */
export function findMissingRapHandlerRequirements(
  requirements: RapHandlerRequirement[],
  classSource: string,
): RapHandlerRequirement[] {
  const classMethods = parseClassDefinitionMethods(classSource);

  return requirements.filter((req) => {
    const methods = classMethods.get(req.targetHandlerClass.toLowerCase());
    if (!methods) return true;
    return !methods.has(normalizeMethodName(req.methodName));
  });
}

/**
 * Insert missing RAP handler signatures into matching `lhc_*` class definitions.
 * This modifies declaration sections only; no method implementations are created.
 */
export function applyRapHandlerSignatures(
  classSource: string,
  requirements: RapHandlerRequirement[],
): RapHandlerApplyResult {
  if (requirements.length === 0) {
    return { updatedSource: classSource, inserted: [], skipped: [], changed: false };
  }

  const lines = classSource.split('\n');
  const ranges = parseClassDefinitionRanges(classSource);
  const methodsByClass = parseClassDefinitionMethods(classSource);
  const grouped = new Map<string, RapHandlerRequirement[]>();

  for (const req of requirements) {
    const key = req.targetHandlerClass.toLowerCase();
    const list = grouped.get(key) ?? [];
    list.push(req);
    grouped.set(key, list);
  }

  type Edit = { index: number; lines: string[] };
  const edits: Edit[] = [];
  const inserted: RapHandlerRequirement[] = [];
  const skipped: RapHandlerApplySkipped[] = [];

  for (const [targetClassName, classRequirements] of grouped.entries()) {
    const range = ranges.find((r) => r.name.toLowerCase() === targetClassName);
    if (!range) {
      for (const req of classRequirements) {
        skipped.push({
          requirement: req,
          reason: `Handler class ${req.targetHandlerClass} not found in behavior pool.`,
        });
      }
      continue;
    }

    const existingMethods = methodsByClass.get(targetClassName) ?? new Set<string>();
    const toInsert = classRequirements.filter((req) => !existingMethods.has(normalizeMethodName(req.methodName)));
    if (toInsert.length === 0) continue;

    const signatureLines: string[] = [];
    for (let i = 0; i < toInsert.length; i += 1) {
      const req = toInsert[i]!;
      signatureLines.push(...req.signature.split('\n').map((line) => `    ${line}`));
      if (i < toInsert.length - 1) signatureLines.push('');
      inserted.push(req);
    }

    if (range.privateSection === undefined) {
      const block = ['  PRIVATE SECTION.', ...signatureLines, ''];
      edits.push({ index: range.end, lines: block });
      continue;
    }

    edits.push({
      index: range.privateSection + 1,
      lines: [...signatureLines, ''],
    });
  }

  if (edits.length === 0) {
    return { updatedSource: classSource, inserted, skipped, changed: false };
  }

  const sorted = edits.sort((a, b) => b.index - a.index);
  for (const edit of sorted) {
    lines.splice(edit.index, 0, ...edit.lines);
  }

  return {
    updatedSource: lines.join('\n'),
    inserted,
    skipped,
    changed: inserted.length > 0,
  };
}

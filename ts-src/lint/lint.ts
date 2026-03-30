/**
 * ABAP Lint wrapper using @abaplint/core.
 *
 * In the Go version, we had a custom port of the abaplint lexer (1,700 LOC).
 * Now that we're in TypeScript, we use @abaplint/core directly — it's the
 * original implementation, maintained by the abaplint author.
 *
 * This gives us the full lexer + parser + linter with 100+ rules,
 * instead of our Go port's 8 rules and 48 token types.
 */

import { Config, MemoryFile, Registry, Version } from '@abaplint/core';

/** Lint result from @abaplint/core */
export interface LintResult {
  rule: string;
  message: string;
  line: number;
  column: number;
  endLine: number;
  endColumn: number;
  severity: 'error' | 'warning' | 'info';
}

/** Default abaplint configuration for ARC-1 */
const DEFAULT_CONFIG = Config.getDefault(Version.v702);

/**
 * Lint ABAP source code using @abaplint/core.
 *
 * @param source - ABAP source code
 * @param filename - Filename with appropriate extension (.prog.abap, .clas.abap, etc.)
 * @param config - Optional abaplint configuration (defaults to standard ABAP rules)
 */
export function lintAbapSource(source: string, filename: string, config?: Config): LintResult[] {
  const reg = new Registry(config ?? DEFAULT_CONFIG);
  reg.addFile(new MemoryFile(filename, source));
  reg.parse();

  return reg.findIssues().map((issue) => ({
    rule: issue.getKey(),
    message: issue.getMessage(),
    line: issue.getStart().getRow(),
    column: issue.getStart().getCol(),
    endLine: issue.getEnd().getRow(),
    endColumn: issue.getEnd().getCol(),
    severity: mapSeverity(issue.getSeverity()),
  }));
}

/**
 * Auto-detect the correct filename for ABAP source based on content.
 * abaplint uses the file extension to determine the object type.
 */
export function detectFilename(source: string, objectName: string): string {
  // Strip leading comment lines ("! doc comments, * comments) and blank lines to find the first keyword
  const stripped = source.replace(/^(\s*(["*!].*)?[\r\n]*)*/m, '');
  const upper = stripped.toUpperCase().trimStart();
  if (upper.startsWith('CLASS')) return `${objectName.toLowerCase()}.clas.abap`;
  if (upper.startsWith('INTERFACE')) return `${objectName.toLowerCase()}.intf.abap`;
  if (upper.startsWith('FUNCTION-POOL') || upper.startsWith('FUNCTION')) return `${objectName.toLowerCase()}.fugr.abap`;
  if (upper.startsWith('REPORT') || upper.startsWith('PROGRAM')) return `${objectName.toLowerCase()}.prog.abap`;
  if (upper.startsWith('DEFINE VIEW') || upper.startsWith('@')) return `${objectName.toLowerCase()}.ddls.asddls`;
  if (upper.startsWith('MANAGED') || upper.startsWith('UNMANAGED') || upper.startsWith('ABSTRACT'))
    return `${objectName.toLowerCase()}.bdef.asbdef`;
  // Default to class (enables most rules)
  return `${objectName.toLowerCase()}.clas.abap`;
}

/** Map abaplint severity to our severity levels */
function mapSeverity(severity: { toString(): string }): 'error' | 'warning' | 'info' {
  const s = severity.toString().toLowerCase();
  if (s === 'error') return 'error';
  if (s === 'warning') return 'warning';
  return 'info';
}

/**
 * Module load tracer for e2e debugging.
 * Use with: node --require ./scripts/e2e-trace-sqlite.cjs dist/index.js
 *
 * Intercepts require() calls to detect if better-sqlite3 is loaded,
 * and logs the caller stack trace to help identify the import chain.
 */
'use strict';

const Module = require('module');
const origResolve = Module._resolveFilename;

Module._resolveFilename = function(request, parent) {
  if (request === 'better-sqlite3' || request.includes('better-sqlite3')) {
    const stack = new Error().stack;
    process.stderr.write(`\n[TRACE-SQLITE] better-sqlite3 loaded!\n`);
    process.stderr.write(`[TRACE-SQLITE] request: ${request}\n`);
    process.stderr.write(`[TRACE-SQLITE] parent: ${parent?.filename || '(none)'}\n`);
    process.stderr.write(`[TRACE-SQLITE] stack:\n${stack}\n\n`);
  }
  return origResolve.apply(this, arguments);
};

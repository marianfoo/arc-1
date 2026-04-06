/**
 * abaplint preset for on-premise SAP systems (7.02 – 7.58).
 *
 * More relaxed than cloud: allows classic object types, FORMs,
 * obsolete statements are warnings (not errors), and cloud-specific
 * rules are disabled.
 *
 * The ABAP version is set dynamically based on SAP_BASIS release.
 */

import type { RuleOverrides } from '../config-builder.js';

/** Rules that BLOCK writes on on-premise systems (errors) */
export const ONPREM_ERROR_RULES: RuleOverrides = {
  // --- Correctness ---
  parser_error: { severity: 'Error' },
  parser_missing_space: { severity: 'Error' },
  begin_end_names: { severity: 'Error' },
  unreachable_code: { severity: 'Error' },
  identical_conditions: { severity: 'Error' },
};

/** Rules that produce warnings on on-premise systems (advisory) */
export const ONPREM_WARNING_RULES: RuleOverrides = {
  obsolete_statement: {
    severity: 'Warning',
    refresh: true,
    compute: true,
    add: true,
    subtract: true,
    multiply: true,
    divide: true,
    move: true,
  },
  keyword_case: {
    severity: 'Warning',
    style: 'upper',
    ignoreExceptions: true,
    ignoreLowerClassImplmentationStatement: true,
  },
  line_length: { severity: 'Warning', length: 120 },
  indentation: { severity: 'Warning' },
  sequential_blank: { severity: 'Warning', lines: 4 },
  whitespace_end: { severity: 'Warning' },
  functional_writing: { severity: 'Warning', ignoreExceptions: true },
  method_length: { severity: 'Warning', statements: 110, ignoreTestClasses: true },
  cyclomatic_complexity: { severity: 'Warning', max: 25 },
  nesting: { severity: 'Warning', depth: 6 },
  unused_variables: { severity: 'Warning' },
  unused_methods: { severity: 'Warning' },
  sql_escape_host_variables: { severity: 'Warning' },
};

/** Rules explicitly disabled for on-premise preset */
export const ONPREM_DISABLED_RULES: string[] = [
  // Cloud-only constraints (not applicable on-prem)
  'cloud_types',
  'strict_sql',
  // Too noisy for MCP context
  'abapdoc',
  'description_empty',
  // Naming conventions are project-specific
  'no_prefixes',
  'local_variable_names',
  'method_parameter_names',
  'class_attribute_names',
  'local_class_naming',
  'types_naming',
  'object_naming',
  'allowed_object_naming',
  // Not useful for single-file lint
  'check_ddic',
  'check_include',
  'check_text_elements',
  'check_abstract',
  'forbidden_void_type',
  'unknown_types',
  // Alignment rules too opinionated
  'align_parameters',
  'align_pseudo_comments',
  'align_type_expressions',
  // Would need project context
  'db_operation_in_loop',
  'select_add_order_by',
  'uncaught_exception',
];

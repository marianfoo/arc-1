/**
 * abaplint preset for BTP / ABAP Cloud (Steampunk) systems.
 *
 * Enforces cloud-specific constraints: no classic object types (PROG, FORM),
 * strict Open SQL, host variable escaping, modern ABAP style.
 *
 * Based on abapGit's abaplint configuration and Steampunk API constraints.
 */

import type { RuleOverrides } from '../config-builder.js';

/** Rules that BLOCK writes on cloud systems (errors) */
export const CLOUD_ERROR_RULES: RuleOverrides = {
  // --- Correctness ---
  parser_error: { severity: 'Error' },
  parser_missing_space: { severity: 'Error' },
  begin_end_names: { severity: 'Error' },
  unreachable_code: { severity: 'Error' },
  identical_conditions: { severity: 'Error' },

  // --- CDS correctness ---
  cds_parser_error: { severity: 'Error' },
  cds_legacy_view: { severity: 'Error' },

  // --- Cloud-specific constraints ---
  cloud_types: { severity: 'Error' },
  strict_sql: { severity: 'Error' },
  sql_escape_host_variables: { severity: 'Error' },

  // --- Obsolete syntax (not available in cloud) ---
  obsolete_statement: {
    severity: 'Error',
    refresh: true,
    compute: true,
    add: true,
    subtract: true,
    multiply: true,
    divide: true,
    move: true,
    requested: true,
    occurs: true,
    setExtended: true,
    withHeaderLine: true,
    fieldSymbolStructure: true,
    typePools: true,
    load: true,
    parameter: true,
    ranges: true,
    communication: true,
    pack: true,
    selectWithoutInto: true,
    freeMemory: true,
    exitFromSQL: true,
    sortByFS: true,
    callTransformation: true,
    regex: true,
    occurences: true,
    clientSpecified: true,
    formDefinition: true,
    formImplementation: true,
  },
};

/** Rules that produce warnings on cloud systems (advisory) */
export const CLOUD_WARNING_RULES: RuleOverrides = {
  // --- CDS style (advisory) ---
  cds_association_name: { severity: 'Warning' },
  cds_comment_style: { severity: 'Warning' },
  cds_field_order: { severity: 'Warning' },

  prefer_inline: { severity: 'Warning' },
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
  prefer_raise_exception_new: { severity: 'Warning' },
  use_new: { severity: 'Warning' },
  prefer_xsdbool: { severity: 'Warning' },
  use_bool_expression: { severity: 'Warning' },
  prefer_corresponding: { severity: 'Warning' },
  exporting: { severity: 'Warning' },
  use_line_exists: { severity: 'Warning' },
  method_length: { severity: 'Warning', statements: 110, ignoreTestClasses: true },
  cyclomatic_complexity: { severity: 'Warning', max: 25 },
  nesting: { severity: 'Warning', depth: 6 },
  unused_variables: { severity: 'Warning' },
  unused_methods: { severity: 'Warning' },
};

/** Rules explicitly disabled for cloud preset */
export const CLOUD_DISABLED_RULES: string[] = [
  // VDM naming prefixes (ZI_, ZC_, ZR_, etc.) are project-specific
  'cds_naming',
  // Too noisy for MCP context — LLM generates code without doc comments
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
  // Not useful for single-file lint (need full project context)
  'check_ddic',
  'check_include',
  'check_text_elements',
  'check_abstract',
  'forbidden_void_type',
  'unknown_types',
  // Alignment rules are too opinionated for generated code
  'align_parameters',
  'align_pseudo_comments',
  'align_type_expressions',
  // Would need project context
  'db_operation_in_loop',
  'select_add_order_by',
  'uncaught_exception',
];

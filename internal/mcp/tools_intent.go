// Package mcp provides the MCP server implementation for ABAP ADT tools.
// tools_intent.go registers the 11 intent-based ARC-1 tools with rich LLM-friendly descriptions.
package mcp

import (
	"github.com/mark3labs/mcp-go/mcp"
)

// registerIntentTools registers the 11 intent-based tools for ARC-1 mode.
// In read-only mode, write tools (SAPWrite, SAPManage) are not registered.
// In block-free-sql mode, SAPQuery is not registered.
func (s *Server) registerIntentTools() {
	var isReadOnly, isBlockSQL bool
	if s.adtClient != nil {
		safety := s.adtClient.Safety()
		isReadOnly = safety.ReadOnly
		isBlockSQL = safety.BlockFreeSQL
	}
	// Also check config-level read-only
	if s.config != nil && s.config.ReadOnly {
		isReadOnly = true
	}
	if s.config != nil && s.config.BlockFreeSQL {
		isBlockSQL = true
	}

	// 1. SAPRead — always available
	s.mcpServer.AddTool(sapReadTool(), s.handleSAPRead)

	// 2. SAPSearch — always available
	s.mcpServer.AddTool(sapSearchTool(), s.handleSAPSearch)

	// 3. SAPWrite — hidden in read-only mode
	if !isReadOnly {
		s.mcpServer.AddTool(sapWriteTool(), s.handleSAPWrite)
	}

	// 4. SAPActivate — partially restricted in read-only mode
	s.mcpServer.AddTool(sapActivateTool(isReadOnly), s.handleSAPActivate)

	// 5. SAPNavigate — always available
	s.mcpServer.AddTool(sapNavigateTool(), s.handleSAPNavigate)

	// 6. SAPQuery — blocked if --block-free-sql
	if !isBlockSQL {
		s.mcpServer.AddTool(sapQueryTool(), s.handleSAPQuery)
	}

	// 7. SAPTransport — always registered (write ops blocked by handler if read-only)
	s.mcpServer.AddTool(sapTransportTool(isReadOnly), s.handleSAPTransport)

	// 8. SAPContext — always available
	s.mcpServer.AddTool(sapContextTool(), s.handleSAPContext)

	// 9. SAPLint — always available
	s.mcpServer.AddTool(sapLintTool(), s.handleSAPLint)

	// 10. SAPDiagnose — always available
	s.mcpServer.AddTool(sapDiagnoseTool(), s.handleSAPDiagnose)

	// 11. SAPManage — hidden in read-only mode
	if !isReadOnly {
		s.mcpServer.AddTool(sapManageTool(), s.handleSAPManage)
	}
}

// ============================================================================
// Tool definitions with LLM-optimized descriptions
// ============================================================================

func sapReadTool() mcp.Tool {
	return mcp.NewTool("SAPRead",
		mcp.WithDescription(`Read source code, metadata, table structures, table contents, package contents, system information, or any other data from an SAP ABAP system.

WHAT THIS TOOL CAN READ:
- Source code: PROG (programs), PROG_FULL (program with all includes expanded), CLAS (classes), INTF (interfaces), FUNC (function modules), FUGR (function groups), INCL (includes), DDLS (CDS views), BDEF (behavior definitions), SRVD (service definitions)
- Data dictionary: TABLE (structure), TABLE_CONTENTS (data rows), DOMAIN, DATA_ELEMENT, STRUCTURE, METADATA_EXTENSION, METADATA_EXTENSION_SOURCE
- Packages: PACKAGE (list objects in a package), PACKAGE_TREE (recursive package hierarchy)
- System: SYSTEM (version, release, kernel), COMPONENTS (installed software), CONNECTION_INFO, FEATURES
- Messages: MESSAGES (message class texts)
- Enhancements: ENHANCEMENT_SPOT, ENHANCEMENT_IMPL, ENHANCEMENTS
- UI5/Fiori: UI5_APPS (list BSP apps), UI5_APP (app details), UI5_FILE (file content)
- Documentation: ABAP_DOC (F1 help for ABAP keywords/objects at a cursor position)
- API Release: API_RELEASE (check if an object is released for ABAP Cloud / C1 contract)
- Other: CLASS_INFO (class metadata), TRANSACTION, TYPE_INFO

EXAMPLES:
- Read a class: type="CLAS", name="ZCL_MY_CLASS"
- Read a specific method only: type="CLAS", name="ZCL_MY_CLASS", method="MY_METHOD"
- Read test classes: type="CLAS", name="ZCL_MY_CLASS", include="testclasses"
- Read a function module: type="FUNC", name="Z_MY_FM", parent="Z_MY_FGRP"
- Read table structure: type="TABLE", name="MARA"
- Read table data: type="TABLE_CONTENTS", name="MARA", max_rows=10
- Read system info: type="SYSTEM"
- List all objects in a package: type="PACKAGE", name="$TMP"
- Full package tree: type="PACKAGE_TREE", name="$ZADT", max_depth=3
- Read CDS view: type="DDLS", name="ZI_SALESORDER"
- Full program with includes: type="PROG_FULL", name="SAPMV45A"
- Check API release state: type="API_RELEASE", name="CL_SALV_TABLE", release_object_type="CLAS"
- Get ABAP documentation: type="ABAP_DOC", name="ZCL_MY_CLASS", line=10, column=5`),
		mcp.WithString("type", mcp.Required(),
			mcp.Description("Object type: PROG, PROG_FULL, CLAS, INTF, FUNC, FUGR, INCL, DDLS, BDEF, SRVD, TABLE, TABLE_CONTENTS, PACKAGE, PACKAGE_TREE, SYSTEM, COMPONENTS, MESSAGES, DOMAIN, DATA_ELEMENT, STRUCTURE, METADATA_EXTENSION, METADATA_EXTENSION_SOURCE, ENHANCEMENT_SPOT, ENHANCEMENT_IMPL, ENHANCEMENTS, UI5_APPS, UI5_APP, UI5_FILE, CLASS_INFO, TRANSACTION, TYPE_INFO, CONNECTION_INFO, FEATURES, ABAP_DOC, API_RELEASE"),
		),
		mcp.WithString("name",
			mcp.Description("Object name (not required for SYSTEM, COMPONENTS, CONNECTION_INFO, FEATURES, UI5_APPS)"),
		),
		mcp.WithString("method",
			mcp.Description("For CLAS type only: return only this method's source code instead of the full class"),
		),
		mcp.WithString("include",
			mcp.Description("For CLAS type: which class include to read. Values: testclasses, locals_def, locals_imp, macros. Default: main source"),
		),
		mcp.WithString("parent",
			mcp.Description("For FUNC type: the function group name (required)"),
		),
		mcp.WithNumber("max_rows",
			mcp.Description("For TABLE_CONTENTS: maximum number of rows to return (default: 100)"),
		),
		mcp.WithString("sql_query",
			mcp.Description("For TABLE_CONTENTS: ABAP SQL WHERE clause to filter rows"),
		),
		mcp.WithString("app_name",
			mcp.Description("For UI5_FILE type: the BSP application name"),
		),
		mcp.WithNumber("line",
			mcp.Description("For ABAP_DOC type: source line number (1-based)"),
		),
		mcp.WithNumber("column",
			mcp.Description("For ABAP_DOC type: source column number (1-based)"),
		),
		mcp.WithNumber("max_depth",
			mcp.Description("For PACKAGE_TREE type: maximum recursion depth (default: 5)"),
		),
		mcp.WithString("release_object_type",
			mcp.Description("For API_RELEASE type: the object type to check (CLAS, INTF, TABL, etc.). Default: CLAS"),
		),
	)
}

func sapSearchTool() mcp.Tool {
	return mcp.NewTool("SAPSearch",
		mcp.WithDescription(`Search for ABAP objects by name pattern, search within source code (grep), or find where an object is used. Use this to discover what exists in the SAP system.

FOUR SEARCH MODES:

1. OBJECT SEARCH (scope="object" or omit scope):
   Find objects by name pattern. Supports wildcards: ZCL_* finds all classes starting with ZCL_.
   Example: query="ZCL_ORDER*" finds ZCL_ORDER, ZCL_ORDER_ITEM, etc.

2. SOURCE TEXT SEARCH (scope="source_text"):
   Search within ABAP source code across one or more packages, like grep.
   Requires 'packages' parameter. Returns matching lines with context.
   Example: query="MODIFY ztable", packages="$TMP" finds all modifications of ztable.

3. WHERE-USED ANALYSIS (scope="where_used"):
   Find all places where an object is referenced/called.
   Example: query="ZCL_MY_CLASS", scope="where_used" finds all callers.

4. WHERE-USED WITH SNIPPETS (scope="where_used_snippets"):
   Same as where_used, but includes code context around each usage location.
   Example: query="ZCL_MY_CLASS", scope="where_used_snippets" shows surrounding code.

TIPS:
- Use object search first to discover what exists, then source_text to find specific code patterns.
- Wildcards: * matches any characters. Z* finds everything starting with Z.
- For source_text, always specify packages to limit the search scope.
- Use where_used_snippets to see HOW an object is used, not just WHERE.`),
		mcp.WithString("query", mcp.Required(),
			mcp.Description("Search query: name pattern with wildcards (e.g., ZCL_*, Z*ORDER*) for object scope, or text/regex for source_text scope"),
		),
		mcp.WithString("scope",
			mcp.Description("Search scope: 'object' (default, find by name), 'source_text' (grep source code), or 'where_used' (find references)"),
		),
		mcp.WithString("object_type",
			mcp.Description("Filter by object type: CLAS, PROG, INTF, FUNC, TABL, etc. Optional for object scope, used as type hint for where_used"),
		),
		mcp.WithString("packages",
			mcp.Description("Package name(s) to search within (required for source_text scope, comma-separated for multiple)"),
		),
		mcp.WithNumber("max_results",
			mcp.Description("Maximum number of results (default: 100)"),
		),
	)
}

func sapWriteTool() mcp.Tool {
	return mcp.NewTool("SAPWrite",
		mcp.WithDescription(`Create new ABAP objects or update existing source code. Automatically handles locking, writing, activation, and unlocking. NOT available in read-only mode.

THREE WRITE MODES:

1. CREATE (mode="create"):
   Creates a new ABAP object with the given source code.
   Requires: type, name, source, package, description.
   Example: Create a new class in $TMP package.

2. UPDATE (mode="update" or omit mode):
   Overwrites the entire source code of an existing object.
   The object is locked, updated, activated, and unlocked automatically.

3. EDIT (mode="edit"):
   Surgical find-and-replace within existing source code.
   Requires: find, replace parameters. Only the matched text is changed.
   Safer than full update when making small changes.

SUPPORTED TYPES: PROG, CLAS, INTF, DDLS, BDEF, SRVD

IMPORTANT:
- For new objects, 'package' and 'description' are required.
- For objects in transportable packages, provide 'transport' parameter.
- To write class test includes, set include="testclasses".
- To update a single method, use the 'method' parameter (CLAS only).`),
		mcp.WithString("type", mcp.Required(),
			mcp.Description("Object type: PROG, CLAS, INTF, DDLS, BDEF, SRVD"),
		),
		mcp.WithString("name", mcp.Required(),
			mcp.Description("Object name (e.g., ZCL_MY_CLASS, Z_MY_PROGRAM)"),
		),
		mcp.WithString("source",
			mcp.Description("ABAP source code (required for create/update modes, not needed for edit mode)"),
		),
		mcp.WithString("mode",
			mcp.Description("Write mode: 'create' (new object), 'update' (overwrite source), 'edit' (find-and-replace). Default: auto-detect"),
		),
		mcp.WithString("package",
			mcp.Description("Package name (required for create mode, e.g., '$TMP' for local, 'ZPACKAGE' for transportable)"),
		),
		mcp.WithString("description",
			mcp.Description("Object description (required for create mode)"),
		),
		mcp.WithString("include",
			mcp.Description("Class include to write: testclasses, locals_def, locals_imp, macros"),
		),
		mcp.WithString("find",
			mcp.Description("For edit mode: exact text to find in the source code"),
		),
		mcp.WithString("replace",
			mcp.Description("For edit mode: replacement text"),
		),
		mcp.WithString("transport",
			mcp.Description("Transport request number (for objects in transportable packages)"),
		),
		mcp.WithString("method",
			mcp.Description("For CLAS type: update only this method's source code"),
		),
	)
}

func sapActivateTool(readOnly bool) mcp.Tool {
	desc := `Check syntax, activate objects, run unit tests, or run ATC quality checks on ABAP objects. Use after writing code to validate and make changes effective.

AVAILABLE ACTIONS:
- syntax_check: Check ABAP syntax without modifying anything (always safe)
- activate: Make changes live by activating an object (blocked in read-only mode)
- activate_package: Activate all inactive objects in a package (blocked in read-only mode)
- run_tests: Execute ABAP Unit tests for an object (safe, read-only)
- atc_check: Run ATC (ABAP Test Cockpit) quality checks (safe, read-only)
- pretty_print: Format/indent ABAP source code (blocked in read-only mode)
- inactive_objects: List all currently inactive objects in the system

TYPICAL WORKFLOW:
1. Write code with SAPWrite
2. Check syntax: action="syntax_check"
3. Activate: action="activate"
4. Run tests: action="run_tests"
5. Quality check: action="atc_check"`

	if readOnly {
		desc = `Check syntax, run unit tests, or run ATC quality checks on ABAP objects. Read-only mode is active — activate and pretty_print are not available.

AVAILABLE ACTIONS (read-only safe):
- syntax_check: Check ABAP syntax without modifying anything
- run_tests: Execute ABAP Unit tests for an object
- atc_check: Run ATC (ABAP Test Cockpit) quality checks
- inactive_objects: List all currently inactive objects in the system`
	}

	return mcp.NewTool("SAPActivate",
		mcp.WithDescription(desc),
		mcp.WithString("action", mcp.Required(),
			mcp.Description("Action to perform: syntax_check, activate, activate_package, run_tests, atc_check, pretty_print, inactive_objects"),
		),
		mcp.WithString("type",
			mcp.Description("Object type (e.g., CLAS, PROG, INTF, DDLS). Required for most actions"),
		),
		mcp.WithString("name",
			mcp.Description("Object name or package name. Required for most actions"),
		),
		mcp.WithString("variant",
			mcp.Description("For atc_check: ATC check variant name (optional, uses system default if omitted)"),
		),
	)
}

func sapNavigateTool() mcp.Tool {
	return mcp.NewTool("SAPNavigate",
		mcp.WithDescription(`Navigate code relationships in SAP ABAP. Find definitions, references, call graphs, object structures, and CDS view dependencies. Essential for understanding unfamiliar codebases.

AVAILABLE ACTIONS:
- find_definition: Jump to where a symbol (variable, method, class) is defined. Provide source code context + line/column position.
- find_references: Find all places where a symbol is used across the system.
- object_structure: Get the hierarchical structure of an object (class methods, function module parameters, etc.)
- dependencies: Get CDS view dependency chain (what views depend on this view)
- call_graph: Full bidirectional call graph for an object
- callers: Who calls this object? (incoming references)
- callees: What does this object call? (outgoing references)
- analyze_call_graph: Detailed analysis of the call graph with metrics
- compare_call_graphs: Compare call graphs of two objects
- type_hierarchy: Class/interface inheritance hierarchy
- class_components: List all methods, attributes, and events of a class

TIPS:
- Start with object_structure to understand an unfamiliar class or function group.
- Use callers/callees to trace execution flow.
- For CDS views, use dependencies to understand the data model.`),
		mcp.WithString("action", mcp.Required(),
			mcp.Description("Navigation action: find_definition, find_references, object_structure, dependencies, call_graph, callers, callees, analyze_call_graph, compare_call_graphs, type_hierarchy, class_components"),
		),
		mcp.WithString("type",
			mcp.Description("Object type (e.g., CLAS, PROG, INTF, FUNC, DDLS)"),
		),
		mcp.WithString("name",
			mcp.Description("Object name"),
		),
		mcp.WithNumber("line",
			mcp.Description("For find_definition: source line number where the symbol appears"),
		),
		mcp.WithNumber("column",
			mcp.Description("For find_definition: source column number where the symbol appears"),
		),
		mcp.WithString("source",
			mcp.Description("For find_definition: source code context (the line containing the symbol)"),
		),
		mcp.WithNumber("max_depth",
			mcp.Description("For call_graph/callers/callees: maximum traversal depth (default: 3)"),
		),
		mcp.WithString("name2",
			mcp.Description("For compare_call_graphs: second object name to compare against"),
		),
	)
}

func sapQueryTool() mcp.Tool {
	return mcp.NewTool("SAPQuery",
		mcp.WithDescription(`Execute SQL queries against SAP database tables using ABAP SQL syntax. Returns query results as structured data.

IMPORTANT — ABAP SQL IS NOT STANDARD SQL:
- Use ASCENDING/DESCENDING instead of ASC/DESC
- Use the max_rows parameter instead of LIMIT (LIMIT is not supported)
- SELECT * FROM table_name works for simple queries
- WHERE, GROUP BY, HAVING, ORDER BY work as expected
- Use UP TO n ROWS in the SELECT statement as an alternative to max_rows
- Field names use SAP column names (check table structure with SAPRead type=TABLE first)

EXAMPLES:
- Simple query: sql="SELECT * FROM mara", max_rows=10
- Filtered: sql="SELECT matnr, maktx FROM mara WHERE mtart = 'FERT'"
- Sorted: sql="SELECT * FROM mara ORDER BY matnr ASCENDING"
- Aggregated: sql="SELECT mtart, COUNT(*) as cnt FROM mara GROUP BY mtart"

SAFETY: This tool can be disabled entirely via --block-free-sql flag.`),
		mcp.WithString("sql", mcp.Required(),
			mcp.Description("ABAP SQL SELECT statement. Use ABAP SQL syntax, not standard SQL. Example: SELECT * FROM mara WHERE mtart = 'FERT'"),
		),
		mcp.WithNumber("max_rows",
			mcp.Description("Maximum number of rows to return (default: 100). Use this instead of SQL LIMIT clause"),
		),
	)
}

func sapTransportTool(readOnly bool) mcp.Tool {
	desc := `Work with SAP Change and Transport System (CTS) requests. List, inspect, create, release, or manage transport requests.

AVAILABLE ACTIONS:
- list: List transport requests (filtered by user, default: current user, use user="*" for all)
- get: Get details of a specific transport request
- create: Create a new transport request (requires --enable-transports flag)
- release: Release a transport request (requires --enable-transports flag)
- delete: Delete a transport request (requires --enable-transports flag)
- find_by_object: Find which transport(s) contain a specific object (requires object_type + name)
- set_owner: Change the owner of a transport request (requires transport + owner)
- add_user: Add a user to a transport request (creates a task for them, requires transport + user)

WHAT IS A TRANSPORT?
Transports are SAP's version control for moving changes between systems (DEV → QA → PROD). Every change to a non-local object must be recorded in a transport request. Local objects ($TMP package) do not need transports.

TIPS:
- Use list with user="*" to see all open transports in the system.
- Use find_by_object to find which transport contains a specific object.
- Create transports before making changes to transportable objects.
- Release transports to make them available for import into target systems.`

	if readOnly {
		desc = `Inspect SAP Change and Transport System (CTS) requests. Read-only mode is active — only list, get, and find_by_object actions are available.

AVAILABLE ACTIONS:
- list: List transport requests (filtered by user, default: current user, use user="*" for all)
- get: Get details of a specific transport request
- find_by_object: Find which transport(s) contain a specific object`
	}

	return mcp.NewTool("SAPTransport",
		mcp.WithDescription(desc),
		mcp.WithString("action", mcp.Required(),
			mcp.Description("Transport action: list, get, create, release, delete, find_by_object, set_owner, add_user"),
		),
		mcp.WithString("transport",
			mcp.Description("Transport request number (e.g., 'A4HK900001'). Required for get, release, delete, set_owner, add_user"),
		),
		mcp.WithString("user",
			mcp.Description("For list: filter by user (default: current user, '*' for all users). For add_user: the user to add."),
		),
		mcp.WithString("description",
			mcp.Description("For create: transport description"),
		),
		mcp.WithString("target",
			mcp.Description("For create: target system (optional)"),
		),
		mcp.WithString("object_type",
			mcp.Description("For find_by_object: object type (CLAS, PROG, INTF, TABL, etc.)"),
		),
		mcp.WithString("name",
			mcp.Description("For find_by_object: object name"),
		),
		mcp.WithString("owner",
			mcp.Description("For set_owner: new owner username"),
		),
		mcp.WithString("package",
			mcp.Description("For find_by_object: package name (optional, helps narrow search)"),
		),
	)
}

func sapContextTool() mcp.Tool {
	return mcp.NewTool("SAPContext",
		mcp.WithDescription(`Get rich, compressed context for AI code analysis. Fetches source code plus type signatures of all dependencies, bundled into a single response. Optimized to provide maximum useful information within token limits.

USE THIS BEFORE asking questions about unfamiliar ABAP code. It provides:
1. Full source code of the requested objects
2. Type signatures (method signatures, interface definitions) of objects they depend on
3. Dependency relationships

This is more efficient than reading objects one by one, because it resolves and bundles dependencies automatically. Results are cached — repeated calls return instantly.

PARAMETERS:
- objects: List of objects as "TYPE NAME" pairs (e.g., ["CLAS ZCL_ORDER", "INTF ZIF_ORDER"])
- depth: How many levels of dependencies to expand (1-3, default 1)
  - depth=1: Source + direct dependency signatures
  - depth=2: + dependencies of dependencies
  - depth=3: Maximum expansion (may be large)

EXAMPLE:
objects=["CLAS ZCL_ORDER_HANDLER"], depth=2
→ Returns ZCL_ORDER_HANDLER source + signatures of all interfaces it implements + classes it uses + their dependencies`),
		mcp.WithString("objects", mcp.Required(),
			mcp.Description("Objects to get context for. Format: JSON array of 'TYPE NAME' strings, e.g., [\"CLAS ZCL_ORDER\", \"INTF ZIF_ORDER\"]"),
		),
		mcp.WithNumber("depth",
			mcp.Description("Dependency expansion depth: 1 (default, direct deps), 2 (deps of deps), 3 (maximum)"),
		),
	)
}

func sapLintTool() mcp.Tool {
	return mcp.NewTool("SAPLint",
		mcp.WithDescription(`Run static analysis on ABAP source code using abaplint rules. Returns structured findings: naming violations, obsolete statements, clean core violations. Uses a Go-native ABAP lexer/parser — no external dependencies.

USE THIS BEFORE asking an AI to review code. Get objective, rule-based findings first, then use AI judgment for the rest.

CRITICAL FOR S/4HANA MIGRATION: Identifies code patterns that will break in S/4HANA or ABAP Cloud — obsolete statements, direct table access, deprecated APIs.

The tool fetches the object's source code from SAP and runs lint rules against it. You can also provide source code directly via the 'source' parameter.

PARAMETERS:
- type: Object type (CLAS, PROG, INTF, etc.)
- name: Object name
- rules: Rule set (optional, default: all)
- source: Optional source code to lint directly (skips SAP fetch)`),
		mcp.WithString("type", mcp.Required(),
			mcp.Description("Object type: CLAS, PROG, INTF, FUNC, DDLS, etc."),
		),
		mcp.WithString("name", mcp.Required(),
			mcp.Description("Object name"),
		),
		mcp.WithString("rules",
			mcp.Description("Rule set: 'all' (default), 'clean_core', 'naming', 'obsolete'"),
		),
		mcp.WithString("source",
			mcp.Description("Optional: provide ABAP source code directly instead of fetching from SAP"),
		),
	)
}

func sapDiagnoseTool() mcp.Tool {
	return mcp.NewTool("SAPDiagnose",
		mcp.WithDescription(`Investigate runtime errors (short dumps), performance traces, and SQL traces in SAP. Essential for answering "why did this crash?" or "why is this slow?"

AVAILABLE ACTIONS:

RUNTIME ERRORS (Short Dumps):
- list_dumps: List recent runtime errors/short dumps. Filter by user, program, date range.
- get_dump: Get full details of a specific dump (ABAP call stack, error variables, source position).

PERFORMANCE TRACES (ABAP Profiler / ATRA):
- list_traces: List recorded performance traces.
- get_trace: Get detailed trace results (call hierarchy, timing, hit counts).
- trace_execution: Record a new performance trace for an object.

SQL TRACES (ST05):
- sql_trace_state: Check if SQL trace is currently active.
- list_sql_traces: List recorded SQL trace results.

EXAMPLES:
- Find recent crashes: action="list_dumps", date_from="20260301"
- Investigate a crash: action="get_dump", dump_id="..."
- Check slow queries: action="list_sql_traces"
- Profile a program: action="trace_execution", type="PROG", name="Z_SLOW_REPORT"`),
		mcp.WithString("action", mcp.Required(),
			mcp.Description("Diagnostic action: list_dumps, get_dump, list_traces, get_trace, trace_execution, sql_trace_state, list_sql_traces"),
		),
		mcp.WithString("dump_id",
			mcp.Description("For get_dump: the dump ID to retrieve"),
		),
		mcp.WithString("trace_id",
			mcp.Description("For get_trace: the trace ID to retrieve"),
		),
		mcp.WithString("type",
			mcp.Description("For trace_execution: object type (PROG, CLAS, etc.)"),
		),
		mcp.WithString("name",
			mcp.Description("For trace_execution: object name to trace"),
		),
		mcp.WithString("user",
			mcp.Description("Filter by SAP username"),
		),
		mcp.WithString("program",
			mcp.Description("For list_dumps: filter by program name"),
		),
		mcp.WithString("date_from",
			mcp.Description("Filter start date in YYYYMMDD format (e.g., '20260301')"),
		),
		mcp.WithString("date_to",
			mcp.Description("Filter end date in YYYYMMDD format"),
		),
		mcp.WithNumber("max_results",
			mcp.Description("Maximum number of results (default: 100)"),
		),
	)
}

func sapManageTool() mcp.Tool {
	return mcp.NewTool("SAPManage",
		mcp.WithDescription(`Manage SAP object lifecycle: create packages, delete objects, clone objects, import/export files, compare source versions. NOT available in read-only mode.

AVAILABLE ACTIONS:
- create_package: Create a new development package. Requires name and description.
- delete: Delete an ABAP object. Requires type and name. Irreversible!
- create_table: Create a new transparent table (DDIC table definition).
- export_to_file: Export object source code to a local file.
- import_from_file: Import source code from a local file into an SAP object.
- compare_source: Compare two versions of source code (local vs SAP).
- clone: Clone an existing object with a new name.
- rename: Rename an object.
- lock: Manually lock an object for editing.
- unlock: Manually unlock an object.

TIPS:
- Create packages before creating objects that need them.
- For objects in transportable packages, provide the 'transport' parameter.
- Export before modifying to create a backup.
- Use compare_source to review changes before activating.`),
		mcp.WithString("action", mcp.Required(),
			mcp.Description("Management action: create_package, delete, create_table, export_to_file, import_from_file, compare_source, clone, rename, lock, unlock"),
		),
		mcp.WithString("type",
			mcp.Description("Object type (for delete, lock, unlock, clone, rename)"),
		),
		mcp.WithString("name",
			mcp.Description("Object name or package name"),
		),
		mcp.WithString("description",
			mcp.Description("Description (for create_package)"),
		),
		mcp.WithString("parent_package",
			mcp.Description("Parent package (for create_package, optional)"),
		),
		mcp.WithString("transport",
			mcp.Description("Transport request number (for transportable packages)"),
		),
	)
}

// Package mcp provides the MCP server implementation for ABAP ADT tools.
// handlers_intent.go contains the 11 intent-based tool handlers for ARC-1.
// Each tool consolidates multiple granular handlers into a single, LLM-friendly interface.
package mcp

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/mark3labs/mcp-go/mcp"
)

// ============================================================================
// Tool 1: SAPRead — Read any SAP object
// ============================================================================

func (s *Server) handleSAPRead(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	args := request.GetArguments()
	objectType := strings.ToUpper(getStr(args, "type"))
	name := getStr(args, "name")

	if objectType == "" {
		return newToolResultError("'type' is required. Use one of: PROG, PROG_FULL, CLAS, INTF, FUNC, FUGR, INCL, DDLS, BDEF, SRVD, TABLE, TABLE_CONTENTS, PACKAGE, PACKAGE_TREE, SYSTEM, COMPONENTS, MESSAGES, DOMAIN, DATA_ELEMENT, STRUCTURE, METADATA_EXTENSION, METADATA_EXTENSION_SOURCE, ENHANCEMENTS, ENHANCEMENT_SPOT, ENHANCEMENT_IMPL, UI5_APPS, UI5_APP, UI5_FILE, TRANSACTION, TYPE_INFO, CONNECTION_INFO, FEATURES, ABAP_DOC, API_RELEASE"), nil
	}

	// Route to existing handlers based on type
	switch objectType {
	case "PROG":
		return s.handleGetProgram(ctx, fakeRequest(map[string]any{"program_name": name}))
	case "CLAS":
		include := getStr(args, "include")
		method := getStr(args, "method")
		if include != "" {
			return s.handleGetClassInclude(ctx, fakeRequest(map[string]any{
				"class_name":   name,
				"include_type": include,
			}))
		}
		r := map[string]any{"object_type": "CLAS", "name": name}
		if method != "" {
			r["method"] = method
		}
		if v, ok := args["include_context"]; ok {
			r["include_context"] = v
		}
		if v, ok := args["max_deps"]; ok {
			r["max_deps"] = v
		}
		return s.handleGetSource(ctx, fakeRequest(r))
	case "INTF":
		return s.handleGetSource(ctx, fakeRequest(map[string]any{"object_type": "INTF", "name": name}))
	case "FUNC":
		parent := getStr(args, "parent")
		if parent == "" {
			return newToolResultError("'parent' (function group name) is required for FUNC type"), nil
		}
		return s.handleGetSource(ctx, fakeRequest(map[string]any{"object_type": "FUNC", "name": name, "parent": parent}))
	case "FUGR":
		return s.handleGetFunctionGroup(ctx, fakeRequest(map[string]any{"function_group": name}))
	case "INCL":
		return s.handleGetInclude(ctx, fakeRequest(map[string]any{"include_name": name}))
	case "DDLS", "BDEF", "SRVD", "MSAG", "VIEW":
		return s.handleGetSource(ctx, fakeRequest(map[string]any{"object_type": objectType, "name": name}))
	case "TABLE":
		return s.handleGetTable(ctx, fakeRequest(map[string]any{"table_name": name}))
	case "TABLE_CONTENTS":
		r := map[string]any{"table_name": name}
		if v, ok := args["max_rows"]; ok {
			r["maxRows"] = v
		}
		if v := getStr(args, "sql_query"); v != "" {
			r["sql_query"] = v
		}
		return s.handleGetTableContents(ctx, fakeRequest(r))
	case "PACKAGE":
		return s.handleGetPackage(ctx, fakeRequest(map[string]any{"package_name": name}))
	case "SYSTEM":
		return s.handleGetSystemInfo(ctx, fakeRequest(nil))
	case "COMPONENTS":
		return s.handleGetInstalledComponents(ctx, fakeRequest(nil))
	case "MESSAGES":
		return s.handleGetMessages(ctx, fakeRequest(map[string]any{"message_class": name}))
	case "DOMAIN":
		return s.handleGetDomain(ctx, fakeRequest(map[string]any{"domain_name": name}))
	case "DATA_ELEMENT":
		return s.handleGetDataElement(ctx, fakeRequest(map[string]any{"data_element_name": name}))
	case "STRUCTURE":
		return s.handleGetStructure(ctx, fakeRequest(map[string]any{"structure_name": name}))
	case "METADATA_EXTENSION":
		return s.handleGetMetadataExtension(ctx, fakeRequest(map[string]any{"name": name}))
	case "METADATA_EXTENSION_SOURCE":
		return s.handleGetMetadataExtensionSource(ctx, fakeRequest(map[string]any{"name": name}))
	case "ENHANCEMENTS":
		return s.handleGetEnhancements(ctx, fakeRequest(map[string]any{"object_type": getStr(args, "object_type_filter"), "object_name": name}))
	case "ENHANCEMENT_SPOT":
		return s.handleGetEnhancementSpot(ctx, fakeRequest(map[string]any{"enhancement_spot_name": name}))
	case "ENHANCEMENT_IMPL":
		return s.handleGetEnhancementImpl(ctx, fakeRequest(map[string]any{"enhancement_impl_name": name}))
	case "UI5_APPS":
		return s.handleUI5ListApps(ctx, fakeRequest(nil))
	case "UI5_APP":
		return s.handleUI5GetApp(ctx, fakeRequest(map[string]any{"app_name": name}))
	case "UI5_FILE":
		appName := getStr(args, "app_name")
		return s.handleUI5GetFileContent(ctx, fakeRequest(map[string]any{"app_name": appName, "file_path": name}))
	case "TRANSACTION":
		return s.handleGetTransaction(ctx, fakeRequest(map[string]any{"transaction_code": name}))
	case "TYPE_INFO":
		return s.handleGetTypeInfo(ctx, fakeRequest(map[string]any{"type_name": name}))
	case "CONNECTION_INFO":
		return s.handleGetConnectionInfo(ctx, fakeRequest(nil))
	case "FEATURES":
		return s.handleGetFeatures(ctx, fakeRequest(nil))
	case "CLASS_INFO":
		return s.handleGetClassInfo(ctx, fakeRequest(map[string]any{"class_name": name}))

	// --- Quick Win Features ---
	case "ABAP_DOC":
		return s.handleGetAbapDoc(ctx, args)
	case "API_RELEASE":
		return s.handleGetAPIRelease(ctx, args)
	case "PACKAGE_TREE":
		return s.handleGetPackageTree(ctx, args)
	case "PROG_FULL":
		return s.handleGetProgramFull(ctx, args)
	default:
		// Try GetSource as fallback for any ADT object type
		return s.handleGetSource(ctx, fakeRequest(map[string]any{"object_type": objectType, "name": name}))
	}
}

// ============================================================================
// Tool 2: SAPSearch — Find objects in SAP
// ============================================================================

func (s *Server) handleSAPSearch(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	args := request.GetArguments()
	scope := strings.ToLower(getStr(args, "scope"))
	query := getStr(args, "query")

	if query == "" {
		return newToolResultError("'query' is required — provide a name pattern (e.g., ZCL_*, Z*ORDER*) or regex for source_text scope"), nil
	}

	switch scope {
	case "", "object":
		// SearchObject — find objects by name pattern
		r := map[string]any{"query": query}
		if v, ok := args["max_results"]; ok {
			r["maxResults"] = v
		}
		return s.handleSearchObject(ctx, fakeRequest(r))

	case "source_text", "grep":
		// GrepPackages / GrepObjects — search within source code
		if pkgs := getStr(args, "packages"); pkgs != "" {
			r := map[string]any{
				"packages": pkgs,
				"pattern":  query,
			}
			if v, ok := args["case_insensitive"]; ok {
				r["case_insensitive"] = v
			}
			return s.handleGrepPackages(ctx, fakeRequest(r))
		}
		return newToolResultError("'packages' parameter is required for source_text scope — specify one or more package names (comma-separated)"), nil

	case "where_used":
		// Where-used analysis
		objectType := getStr(args, "object_type")
		r := map[string]any{
			"object_name": query,
		}
		if objectType != "" {
			r["object_type"] = objectType
		}
		return s.handleGetWhereUsed(ctx, fakeRequest(r))

	case "where_used_snippets":
		// Where-used analysis with code context snippets
		objectType := getStr(args, "object_type")
		return s.handleGetWhereUsedSnippets(ctx, objectType, query)

	default:
		return newToolResultError(fmt.Sprintf("unknown scope '%s' — use 'object', 'source_text', 'where_used', or 'where_used_snippets'", scope)), nil
	}
}

// ============================================================================
// Tool 3: SAPWrite — Write/create ABAP source (hidden in read-only mode)
// ============================================================================

func (s *Server) handleSAPWrite(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	args := request.GetArguments()
	objectType := strings.ToUpper(getStr(args, "type"))
	name := getStr(args, "name")
	source := getStr(args, "source")
	mode := strings.ToLower(getStr(args, "mode"))

	if objectType == "" || name == "" {
		return newToolResultError("'type' and 'name' are required"), nil
	}

	// Surgical edit mode
	if mode == "edit" {
		findStr := getStr(args, "find")
		replaceStr := getStr(args, "replace")
		if findStr == "" {
			return newToolResultError("'find' parameter is required for edit mode"), nil
		}
		r := map[string]any{
			"object_type":    objectType,
			"name":           name,
			"find":           findStr,
			"replace":        replaceStr,
			"activate_after": true,
		}
		if v := getStr(args, "transport"); v != "" {
			r["transport"] = v
		}
		return s.handleEditSource(ctx, fakeRequest(r))
	}

	// Full write/create via WriteSource
	if source == "" {
		return newToolResultError("'source' is required for create/update modes"), nil
	}

	r := map[string]any{
		"object_type": objectType,
		"name":        name,
		"source":      source,
	}
	if mode != "" {
		r["mode"] = mode
	}
	if v := getStr(args, "package"); v != "" {
		r["package"] = v
	}
	if v := getStr(args, "description"); v != "" {
		r["description"] = v
	}
	if v := getStr(args, "include"); v != "" {
		r["include"] = v
	}
	if v := getStr(args, "transport"); v != "" {
		r["transport"] = v
	}
	if v := getStr(args, "method"); v != "" {
		r["method"] = v
	}
	if v := getStr(args, "test_source"); v != "" {
		r["test_source"] = v
	}

	return s.handleWriteSource(ctx, fakeRequest(r))
}

// ============================================================================
// Tool 4: SAPActivate — Validate and activate ABAP objects
// ============================================================================

func (s *Server) handleSAPActivate(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	args := request.GetArguments()
	action := strings.ToLower(getStr(args, "action"))
	objectType := strings.ToUpper(getStr(args, "type"))
	name := getStr(args, "name")

	switch action {
	case "syntax_check":
		if objectType == "" || name == "" {
			return newToolResultError("'type' and 'name' are required for syntax_check"), nil
		}
		return s.handleSyntaxCheck(ctx, fakeRequest(map[string]any{
			"object_type": objectType,
			"name":        name,
		}))

	case "activate":
		if objectType == "" || name == "" {
			return newToolResultError("'type' and 'name' are required for activate"), nil
		}
		return s.handleActivate(ctx, fakeRequest(map[string]any{
			"object_type": objectType,
			"name":        name,
		}))

	case "activate_package":
		if name == "" {
			return newToolResultError("'name' (package name) is required for activate_package"), nil
		}
		return s.handleActivatePackage(ctx, fakeRequest(map[string]any{
			"package_name": name,
		}))

	case "run_tests":
		if objectType == "" || name == "" {
			return newToolResultError("'type' and 'name' are required for run_tests"), nil
		}
		return s.handleRunUnitTests(ctx, fakeRequest(map[string]any{
			"object_type": objectType,
			"name":        name,
		}))

	case "atc_check":
		if objectType == "" || name == "" {
			return newToolResultError("'type' and 'name' are required for atc_check"), nil
		}
		r := map[string]any{
			"object_type": objectType,
			"object_name": name,
		}
		if v := getStr(args, "variant"); v != "" {
			r["variant"] = v
		}
		return s.handleRunATCCheck(ctx, fakeRequest(r))

	case "pretty_print":
		if objectType == "" || name == "" {
			return newToolResultError("'type' and 'name' are required for pretty_print"), nil
		}
		return s.handlePrettyPrint(ctx, fakeRequest(map[string]any{
			"object_type": objectType,
			"name":        name,
		}))

	case "inactive_objects":
		return s.handleGetInactiveObjects(ctx, fakeRequest(nil))

	default:
		return newToolResultError("'action' is required. Use one of: syntax_check, activate, activate_package, run_tests, atc_check, pretty_print, inactive_objects"), nil
	}
}

// ============================================================================
// Tool 5: SAPNavigate — Navigate code relationships
// ============================================================================

func (s *Server) handleSAPNavigate(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	args := request.GetArguments()
	action := strings.ToLower(getStr(args, "action"))
	objectType := strings.ToUpper(getStr(args, "type"))
	name := getStr(args, "name")

	switch action {
	case "find_definition":
		r := map[string]any{
			"object_type": objectType,
			"name":        name,
		}
		if v, ok := args["line"]; ok {
			r["line"] = v
		}
		if v, ok := args["column"]; ok {
			r["column"] = v
		}
		if v := getStr(args, "source"); v != "" {
			r["source"] = v
		}
		return s.handleFindDefinition(ctx, fakeRequest(r))

	case "find_references":
		return s.handleFindReferences(ctx, fakeRequest(map[string]any{
			"object_type": objectType,
			"name":        name,
		}))

	case "object_structure":
		return s.handleGetObjectStructure(ctx, fakeRequest(map[string]any{
			"object_type": objectType,
			"name":        name,
		}))

	case "dependencies":
		return s.handleGetCDSDependencies(ctx, fakeRequest(map[string]any{
			"cds_view_name": name,
		}))

	case "call_graph":
		r := map[string]any{
			"object_type": objectType,
			"name":        name,
		}
		if v, ok := args["max_depth"]; ok {
			r["max_depth"] = v
		}
		return s.handleGetCallGraph(ctx, fakeRequest(r))

	case "callers":
		r := map[string]any{
			"object_type": objectType,
			"name":        name,
		}
		if v, ok := args["max_depth"]; ok {
			r["max_depth"] = v
		}
		return s.handleGetCallersOf(ctx, fakeRequest(r))

	case "callees":
		r := map[string]any{
			"object_type": objectType,
			"name":        name,
		}
		if v, ok := args["max_depth"]; ok {
			r["max_depth"] = v
		}
		return s.handleGetCalleesOf(ctx, fakeRequest(r))

	case "analyze_call_graph":
		r := map[string]any{
			"object_type": objectType,
			"name":        name,
		}
		if v, ok := args["max_depth"]; ok {
			r["max_depth"] = v
		}
		return s.handleAnalyzeCallGraph(ctx, fakeRequest(r))

	case "compare_call_graphs":
		name2 := getStr(args, "name2")
		r := map[string]any{
			"object_type": objectType,
			"name":        name,
		}
		if name2 != "" {
			r["name2"] = name2
		}
		return s.handleCompareCallGraphs(ctx, fakeRequest(r))

	case "type_hierarchy":
		return s.handleGetTypeHierarchy(ctx, fakeRequest(map[string]any{
			"object_type": objectType,
			"name":        name,
		}))

	case "class_components":
		return s.handleGetClassComponents(ctx, fakeRequest(map[string]any{
			"class_name": name,
		}))

	default:
		return newToolResultError("'action' is required. Use one of: find_definition, find_references, object_structure, dependencies, call_graph, callers, callees, analyze_call_graph, compare_call_graphs, type_hierarchy, class_components"), nil
	}
}

// ============================================================================
// Tool 6: SAPQuery — Execute ABAP SQL queries
// ============================================================================

func (s *Server) handleSAPQuery(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	args := request.GetArguments()
	sql := getStr(args, "sql")

	if sql == "" {
		return newToolResultError("'sql' is required — provide an ABAP SQL SELECT statement. Note: use ASCENDING/DESCENDING instead of ASC/DESC, and use max_rows parameter instead of LIMIT"), nil
	}

	r := map[string]any{"sql": sql}
	if v, ok := args["max_rows"]; ok {
		r["maxRows"] = v
	}
	return s.handleRunQuery(ctx, fakeRequest(r))
}

// ============================================================================
// Tool 7: SAPTransport — Work with CTS transport requests
// ============================================================================

func (s *Server) handleSAPTransport(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	args := request.GetArguments()
	action := strings.ToLower(getStr(args, "action"))

	switch action {
	case "list":
		r := map[string]any{}
		if v := getStr(args, "user"); v != "" {
			r["user"] = v
		}
		return s.handleListTransports(ctx, fakeRequest(r))

	case "get":
		transport := getStr(args, "transport")
		if transport == "" {
			return newToolResultError("'transport' (transport number) is required for get action"), nil
		}
		return s.handleGetTransport(ctx, fakeRequest(map[string]any{"transport": transport}))

	case "create":
		r := map[string]any{}
		if v := getStr(args, "description"); v != "" {
			r["description"] = v
		}
		if v := getStr(args, "target"); v != "" {
			r["target"] = v
		}
		return s.handleCreateTransport(ctx, fakeRequest(r))

	case "release":
		transport := getStr(args, "transport")
		if transport == "" {
			return newToolResultError("'transport' (transport number) is required for release action"), nil
		}
		return s.handleReleaseTransport(ctx, fakeRequest(map[string]any{"transport": transport}))

	case "delete":
		transport := getStr(args, "transport")
		if transport == "" {
			return newToolResultError("'transport' (transport number) is required for delete action"), nil
		}
		return s.handleDeleteTransport(ctx, fakeRequest(map[string]any{"transport": transport}))

	case "find_by_object":
		objectType := getStr(args, "object_type")
		objectName := getStr(args, "name")
		if objectType == "" || objectName == "" {
			return newToolResultError("'object_type' and 'name' are required for find_by_object action"), nil
		}
		return s.handleFindTransportForObject(ctx, objectType, objectName, getStr(args, "package"))

	case "set_owner":
		transport := getStr(args, "transport")
		owner := getStr(args, "owner")
		if transport == "" || owner == "" {
			return newToolResultError("'transport' and 'owner' are required for set_owner action"), nil
		}
		return s.handleSetTransportOwner(ctx, transport, owner)

	case "add_user":
		transport := getStr(args, "transport")
		user := getStr(args, "user")
		if transport == "" || user == "" {
			return newToolResultError("'transport' and 'user' are required for add_user action"), nil
		}
		return s.handleAddTransportUser(ctx, transport, user)

	default:
		return newToolResultError("'action' is required. Use one of: list, get, create, release, delete, find_by_object, set_owner, add_user"), nil
	}
}

// ============================================================================
// Tool 8: SAPContext — Get rich AI context for code analysis
// ============================================================================

func (s *Server) handleSAPContext(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	// Pass through to existing GetContext handler
	return s.handleGetContext(ctx, request)
}

// ============================================================================
// Tool 9: SAPLint — Static ABAP code analysis
// ============================================================================

func (s *Server) handleSAPLint(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	args := request.GetArguments()
	objectType := strings.ToUpper(getStr(args, "type"))
	name := getStr(args, "name")

	if objectType == "" || name == "" {
		return newToolResultError("'type' and 'name' are required"), nil
	}

	r := map[string]any{
		"object_type": objectType,
		"name":        name,
	}
	if v := getStr(args, "rules"); v != "" {
		r["rules"] = v
	}
	if v := getStr(args, "source"); v != "" {
		r["source"] = v
	}

	// Route to parse_abap handler which includes lint capability
	return s.handleParseABAP(ctx, fakeRequest(r))
}

// ============================================================================
// Tool 10: SAPDiagnose — Runtime diagnostics (dumps, traces, SQL traces)
// ============================================================================

func (s *Server) handleSAPDiagnose(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	args := request.GetArguments()
	action := strings.ToLower(getStr(args, "action"))

	switch action {
	case "list_dumps":
		r := map[string]any{}
		if v := getStr(args, "user"); v != "" {
			r["user"] = v
		}
		if v := getStr(args, "program"); v != "" {
			r["program"] = v
		}
		if v := getStr(args, "date_from"); v != "" {
			r["date_from"] = v
		}
		if v := getStr(args, "date_to"); v != "" {
			r["date_to"] = v
		}
		if v, ok := args["max_results"]; ok {
			r["max_results"] = v
		}
		return s.handleListDumps(ctx, fakeRequest(r))

	case "get_dump":
		dumpID := getStr(args, "dump_id")
		if dumpID == "" {
			return newToolResultError("'dump_id' is required for get_dump action"), nil
		}
		return s.handleGetDump(ctx, fakeRequest(map[string]any{"dump_id": dumpID}))

	case "list_traces":
		r := map[string]any{}
		if v := getStr(args, "user"); v != "" {
			r["user"] = v
		}
		if v, ok := args["max_results"]; ok {
			r["max_results"] = v
		}
		return s.handleListTraces(ctx, fakeRequest(r))

	case "get_trace":
		traceID := getStr(args, "trace_id")
		if traceID == "" {
			return newToolResultError("'trace_id' is required for get_trace action"), nil
		}
		return s.handleGetTrace(ctx, fakeRequest(map[string]any{"trace_id": traceID}))

	case "sql_trace_state":
		return s.handleGetSQLTraceState(ctx, fakeRequest(nil))

	case "list_sql_traces":
		return s.handleListSQLTraces(ctx, fakeRequest(nil))

	case "trace_execution":
		objectType := strings.ToUpper(getStr(args, "type"))
		name := getStr(args, "name")
		if objectType == "" || name == "" {
			return newToolResultError("'type' and 'name' are required for trace_execution"), nil
		}
		return s.handleTraceExecution(ctx, fakeRequest(map[string]any{
			"object_type": objectType,
			"name":        name,
		}))

	default:
		return newToolResultError("'action' is required. Use one of: list_dumps, get_dump, list_traces, get_trace, sql_trace_state, list_sql_traces, trace_execution"), nil
	}
}

// ============================================================================
// Tool 11: SAPManage — Object lifecycle management (hidden in read-only mode)
// ============================================================================

func (s *Server) handleSAPManage(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	args := request.GetArguments()
	action := strings.ToLower(getStr(args, "action"))

	switch action {
	case "create_package":
		r := map[string]any{}
		if v := getStr(args, "name"); v != "" {
			r["package_name"] = v
		}
		if v := getStr(args, "description"); v != "" {
			r["description"] = v
		}
		if v := getStr(args, "parent_package"); v != "" {
			r["parent_package"] = v
		}
		if v := getStr(args, "transport"); v != "" {
			r["transport"] = v
		}
		return s.handleCreatePackage(ctx, fakeRequest(r))

	case "delete":
		objectType := strings.ToUpper(getStr(args, "type"))
		name := getStr(args, "name")
		if objectType == "" || name == "" {
			return newToolResultError("'type' and 'name' are required for delete"), nil
		}
		r := map[string]any{
			"object_type": objectType,
			"name":        name,
		}
		if v := getStr(args, "transport"); v != "" {
			r["transport"] = v
		}
		return s.handleDeleteObject(ctx, fakeRequest(r))

	case "create_table":
		r := map[string]any{}
		for k, v := range args {
			if k != "action" {
				r[k] = v
			}
		}
		return s.handleCreateTable(ctx, fakeRequest(r))

	case "export_to_file":
		r := map[string]any{}
		for k, v := range args {
			if k != "action" {
				r[k] = v
			}
		}
		return s.handleSaveToFile(ctx, fakeRequest(r))

	case "import_from_file":
		r := map[string]any{}
		for k, v := range args {
			if k != "action" {
				r[k] = v
			}
		}
		return s.handleDeployFromFile(ctx, fakeRequest(r))

	case "compare_source":
		r := map[string]any{}
		for k, v := range args {
			if k != "action" {
				r[k] = v
			}
		}
		return s.handleCompareSource(ctx, fakeRequest(r))

	case "clone":
		r := map[string]any{}
		for k, v := range args {
			if k != "action" {
				r[k] = v
			}
		}
		return s.handleCloneObject(ctx, fakeRequest(r))

	case "rename":
		r := map[string]any{}
		for k, v := range args {
			if k != "action" {
				r[k] = v
			}
		}
		return s.handleRenameObject(ctx, fakeRequest(r))

	case "lock":
		objectType := strings.ToUpper(getStr(args, "type"))
		name := getStr(args, "name")
		return s.handleLockObject(ctx, fakeRequest(map[string]any{
			"object_type": objectType,
			"name":        name,
		}))

	case "unlock":
		objectType := strings.ToUpper(getStr(args, "type"))
		name := getStr(args, "name")
		return s.handleUnlockObject(ctx, fakeRequest(map[string]any{
			"object_type": objectType,
			"name":        name,
		}))

	default:
		return newToolResultError("'action' is required. Use one of: create_package, delete, create_table, export_to_file, import_from_file, compare_source, clone, rename, lock, unlock"), nil
	}
}

// ============================================================================
// Helpers
// ============================================================================

// getStr extracts a string from args map, returning "" if not found.
func getStr(args map[string]any, key string) string {
	if v, ok := args[key].(string); ok {
		return v
	}
	return ""
}

// fakeRequest creates a CallToolRequest with the given arguments.
// This allows intent-based handlers to delegate to existing granular handlers.
func fakeRequest(args map[string]any) mcp.CallToolRequest {
	if args == nil {
		args = map[string]any{}
	}
	return mcp.CallToolRequest{
		Params: mcp.CallToolParams{
			Arguments: args,
		},
	}
}

// ============================================================================
// Quick Win Handler Implementations
// ============================================================================

// handleGetAbapDoc retrieves ABAP documentation (F1 help) for an object/keyword.
func (s *Server) handleGetAbapDoc(ctx context.Context, args map[string]any) (*mcp.CallToolResult, error) {
	name := getStr(args, "name")
	if name == "" {
		return newToolResultError("'name' is required for ABAP_DOC type"), nil
	}

	objectType := getStr(args, "doc_object_type")
	if objectType == "" {
		objectType = getStr(args, "type")
	}

	line := 1
	column := 1
	if lf, ok := args["line"].(float64); ok {
		line = int(lf)
	}
	if cf, ok := args["column"].(float64); ok {
		column = int(cf)
	}

	// Build object URI from type + name
	objType := strings.ToUpper(objectType)
	objectURI := ""
	switch {
	case objType == "CLAS" || objType == "CLASS":
		objectURI = fmt.Sprintf("/sap/bc/adt/oo/classes/%s/source/main", strings.ToUpper(name))
	case objType == "PROG" || objType == "PROGRAM":
		objectURI = fmt.Sprintf("/sap/bc/adt/programs/programs/%s/source/main", strings.ToUpper(name))
	case objType == "INTF" || objType == "INTERFACE":
		objectURI = fmt.Sprintf("/sap/bc/adt/oo/interfaces/%s/source/main", strings.ToUpper(name))
	case objType == "FUNC":
		objectURI = fmt.Sprintf("/sap/bc/adt/functions/groups/%s/source/main", strings.ToUpper(name))
	default:
		// For keyword documentation, just pass the name as-is
		objectURI = fmt.Sprintf("/sap/bc/adt/programs/programs/%s/source/main", strings.ToUpper(name))
	}

	doc, err := s.adtClient.GetAbapDoc(ctx, objectURI, line, column)
	if err != nil {
		return newToolResultError(fmt.Sprintf("GetAbapDoc failed: %v", err)), nil
	}

	return mcp.NewToolResultText(doc), nil
}

// handleGetAPIRelease retrieves the API release state (C1 contract) of an object.
func (s *Server) handleGetAPIRelease(ctx context.Context, args map[string]any) (*mcp.CallToolResult, error) {
	name := getStr(args, "name")
	if name == "" {
		return newToolResultError("'name' is required for API_RELEASE type"), nil
	}

	objectType := getStr(args, "release_object_type")
	if objectType == "" {
		objectType = "CLAS" // default to class
	}

	info, err := s.adtClient.GetAPIReleaseState(ctx, objectType, name)
	if err != nil {
		return newToolResultError(fmt.Sprintf("GetAPIReleaseState failed: %v", err)), nil
	}

	output, _ := json.MarshalIndent(info, "", "  ")
	return mcp.NewToolResultText(string(output)), nil
}

// handleGetPackageTree retrieves the full recursive package tree.
func (s *Server) handleGetPackageTree(ctx context.Context, args map[string]any) (*mcp.CallToolResult, error) {
	name := getStr(args, "name")
	if name == "" {
		return newToolResultError("'name' (package name) is required for PACKAGE_TREE type"), nil
	}

	maxDepth := 5
	if df, ok := args["max_depth"].(float64); ok {
		maxDepth = int(df)
	}

	tree, err := s.adtClient.GetPackageTree(ctx, name, maxDepth)
	if err != nil {
		return newToolResultError(fmt.Sprintf("GetPackageTree failed: %v", err)), nil
	}

	output, _ := json.MarshalIndent(tree, "", "  ")
	return mcp.NewToolResultText(string(output)), nil
}

// handleGetProgramFull retrieves a program with all includes expanded inline.
func (s *Server) handleGetProgramFull(ctx context.Context, args map[string]any) (*mcp.CallToolResult, error) {
	name := getStr(args, "name")
	if name == "" {
		return newToolResultError("'name' (program name) is required for PROG_FULL type"), nil
	}

	source, err := s.adtClient.GetProgramWithIncludes(ctx, name)
	if err != nil {
		return newToolResultError(fmt.Sprintf("GetProgramWithIncludes failed: %v", err)), nil
	}

	return mcp.NewToolResultText(source), nil
}

// handleGetWhereUsedSnippets finds where an object is used, with code context snippets.
func (s *Server) handleGetWhereUsedSnippets(ctx context.Context, objectType, objectName string) (*mcp.CallToolResult, error) {
	if objectName == "" {
		return newToolResultError("'query' (object name) is required for where_used_snippets scope"), nil
	}

	if objectType == "" {
		objectType = "CLAS"
	}

	snippets, err := s.adtClient.GetWhereUsedWithSnippets(ctx, objectType, objectName)
	if err != nil {
		return newToolResultError(fmt.Sprintf("GetWhereUsedWithSnippets failed: %v", err)), nil
	}

	output, _ := json.MarshalIndent(snippets, "", "  ")
	return mcp.NewToolResultText(string(output)), nil
}

// handleFindTransportForObject finds which transport(s) contain a specific object.
func (s *Server) handleFindTransportForObject(ctx context.Context, objectType, objectName, devClass string) (*mcp.CallToolResult, error) {
	refs, err := s.adtClient.FindTransportForObject(ctx, objectType, objectName, devClass)
	if err != nil {
		return newToolResultError(fmt.Sprintf("FindTransportForObject failed: %v", err)), nil
	}

	if len(refs) == 0 {
		return mcp.NewToolResultText(fmt.Sprintf("No transport found for %s %s", objectType, objectName)), nil
	}

	output, _ := json.MarshalIndent(refs, "", "  ")
	return mcp.NewToolResultText(string(output)), nil
}

// handleSetTransportOwner changes the owner of a transport request.
func (s *Server) handleSetTransportOwner(ctx context.Context, transport, owner string) (*mcp.CallToolResult, error) {
	err := s.adtClient.SetTransportOwner(ctx, transport, owner)
	if err != nil {
		return newToolResultError(fmt.Sprintf("SetTransportOwner failed: %v", err)), nil
	}

	return mcp.NewToolResultText(fmt.Sprintf("Transport %s owner changed to %s", transport, strings.ToUpper(owner))), nil
}

// handleAddTransportUser adds a user to a transport request.
func (s *Server) handleAddTransportUser(ctx context.Context, transport, user string) (*mcp.CallToolResult, error) {
	err := s.adtClient.AddTransportUser(ctx, transport, user)
	if err != nil {
		return newToolResultError(fmt.Sprintf("AddTransportUser failed: %v", err)), nil
	}

	return mcp.NewToolResultText(fmt.Sprintf("User %s added to transport %s", strings.ToUpper(user), transport)), nil
}

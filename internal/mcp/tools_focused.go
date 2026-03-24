// Package mcp provides the MCP server implementation for ABAP ADT tools.
// tools_focused.go defines the focused mode tool whitelist.
package mcp

// focusedToolSet returns the set of tools enabled in focused mode.
func focusedToolSet() map[string]bool {
	return map[string]bool{
		// Unified tools (2)
		"GetSource":   true,
		"WriteSource": true,

		// Search tools (3)
		"GrepObjects":  true,
		"GrepPackages": true,
		"SearchObject": true,

		// Primary workflow (1)
		"EditSource": true,

		// Data/Metadata read (7)
		"GetTable":           true,
		"GetTableContents":   true,
		"RunQuery":           true,
		"GetPackage":         true,
		"GetFunctionGroup":   true,
		"GetCDSDependencies": true,
		"GetMessages":        true,

		// Code intelligence (3)
		"FindDefinition": true,
		"FindReferences": true,
		"GetContext":     true,

		// Development tools (11)
		"SyntaxCheck":        true,
		"RunUnitTests":       true,
		"RunATCCheck":        true,
		"Activate":           true,
		"ActivatePackage":    true,
		"PrettyPrint":        true,
		"GetInactiveObjects": true,
		"CreatePackage":      true,
		"CreateTable":        true,
		"CompareSource":      true,
		"CloneObject":        true,
		"GetClassInfo":       true,

		// Advanced/Edge cases (2)
		"LockObject":   true,
		"UnlockObject": true,

		// File-based operations (2)
		"ImportFromFile": true,
		"ExportToFile":   true,

		// System information (2)
		"GetSystemInfo":          true,
		"GetInstalledComponents": true,

		// Code analysis (7)
		"GetCallGraph":       true,
		"GetObjectStructure": true,
		"GetCallersOf":       true,
		"GetCalleesOf":       true,
		"AnalyzeCallGraph":   true,
		"CompareCallGraphs":  true,
		"TraceExecution":     true,

		// Runtime errors / Short dumps (2)
		"ListDumps": true,
		"GetDump":   true,

		// ABAP Profiler / Traces (2)
		"ListTraces": true,
		"GetTrace":   true,

		// SQL Trace / ST05 (2)
		"GetSQLTraceState": true,
		"ListSQLTraces":    true,

		// UI5/Fiori BSP Management (3 read-only)
		"UI5ListApps":       true,
		"UI5GetApp":         true,
		"UI5GetFileContent": true,

		// CTS/Transport Management (2 read-only in focused mode)
		"ListTransports": true,
		"GetTransport":   true,

		// Where-Used Analysis (1)
		"GetWhereUsed": true,

		// Enhancement Framework (3 read-only)
		"GetEnhancementSpot": true,
		"GetEnhancements":    true,
		"GetEnhancementImpl": true,

		// DDIC Read (4 read-only)
		"GetDomain":                  true,
		"GetDataElement":             true,
		"GetStructure":               true,
		"GetMetadataExtension":       true,
		"GetMetadataExtensionSource": true,

	}
}

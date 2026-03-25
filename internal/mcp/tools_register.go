// Package mcp provides the MCP server implementation for ABAP ADT tools.
// tools_register.go registers the ARC-1 intent-based tools.
package mcp

// registerTools registers the 11 ARC-1 intent-based tools.
// Read-only mode hides write tools (SAPWrite, SAPManage).
// Block-free-sql hides SAPQuery.
func (s *Server) registerTools() {
	s.registerIntentTools()
}

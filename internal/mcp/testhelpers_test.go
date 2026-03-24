package mcp

import (
	"context"
	"encoding/json"
	"testing"

	"github.com/mark3labs/mcp-go/mcp"
)

// listTools returns all tools registered on the server.
func listTools(t *testing.T, s *Server) []mcp.Tool {
	t.Helper()

	rawResponse := s.mcpServer.HandleMessage(context.Background(), []byte(`{
		"jsonrpc": "2.0",
		"id": 1,
		"method": "tools/list",
		"params": {}
	}`))

	response, ok := rawResponse.(mcp.JSONRPCResponse)
	if !ok {
		t.Fatalf("expected JSONRPCResponse, got %T", rawResponse)
	}

	switch result := response.Result.(type) {
	case mcp.ListToolsResult:
		return result.Tools
	case *mcp.ListToolsResult:
		return result.Tools
	default:
		t.Fatalf("expected ListToolsResult, got %T", response.Result)
		return nil
	}
}

// toolNames returns the set of tool names registered on the server.
func toolNames(t *testing.T, s *Server) map[string]bool {
	t.Helper()
	tools := listTools(t, s)
	names := make(map[string]bool, len(tools))
	for _, tool := range tools {
		names[tool.Name] = true
	}
	return names
}

// callTool invokes a tool on the server and returns the result.
func callTool(t *testing.T, s *Server, toolName string, args map[string]interface{}) *mcp.CallToolResult {
	t.Helper()

	params := map[string]interface{}{
		"name":      toolName,
		"arguments": args,
	}
	payload, _ := json.Marshal(map[string]interface{}{
		"jsonrpc": "2.0",
		"id":      1,
		"method":  "tools/call",
		"params":  params,
	})

	rawResponse := s.mcpServer.HandleMessage(context.Background(), payload)
	response, ok := rawResponse.(mcp.JSONRPCResponse)
	if !ok {
		// Check for error response
		if errResp, ok := rawResponse.(mcp.JSONRPCError); ok {
			t.Fatalf("JSON-RPC error: code=%d msg=%s", errResp.Error.Code, errResp.Error.Message)
		}
		t.Fatalf("expected JSONRPCResponse, got %T", rawResponse)
	}

	switch result := response.Result.(type) {
	case *mcp.CallToolResult:
		return result
	case mcp.CallToolResult:
		return &result
	default:
		t.Fatalf("expected CallToolResult, got %T", response.Result)
		return nil
	}
}

// resultText extracts the text from a tool result.
func resultText(t *testing.T, result *mcp.CallToolResult) string {
	t.Helper()
	if len(result.Content) == 0 {
		return ""
	}
	if tc, ok := result.Content[0].(mcp.TextContent); ok {
		return tc.Text
	}
	t.Fatalf("expected TextContent, got %T", result.Content[0])
	return ""
}

// newServerWithConfig creates a test server with the given config.
func newServerWithConfig(cfg *Config) *Server {
	if cfg.Client == "" {
		cfg.Client = "001"
	}
	if cfg.Language == "" {
		cfg.Language = "EN"
	}
	if cfg.Mode == "" {
		cfg.Mode = "focused"
	}
	return NewServer(cfg)
}

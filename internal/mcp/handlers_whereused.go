// Package mcp provides the MCP server implementation for ABAP ADT tools.
// handlers_whereused.go contains the handler for where-used analysis.
package mcp

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/mark3labs/mcp-go/mcp"
)

func (s *Server) handleGetWhereUsed(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	args := request.GetArguments()

	// Support both object_url (direct ADT URI) and object_type + object_name (friendly)
	objectURL, _ := args["object_url"].(string)
	objectType, _ := args["object_type"].(string)
	objectName, _ := args["object_name"].(string)

	if objectURL == "" && (objectType == "" || objectName == "") {
		return newToolResultError("either object_url OR both object_type and object_name are required"), nil
	}

	enableAllTypes := false
	if eat, ok := args["enable_all_types"].(bool); ok {
		enableAllTypes = eat
	}

	var results interface{}
	var err error

	if objectURL != "" {
		results, err = s.adtClient.GetWhereUsed(ctx, objectURL, enableAllTypes)
	} else {
		results, err = s.adtClient.GetWhereUsedByType(ctx, objectType, objectName, enableAllTypes)
	}

	if err != nil {
		return newToolResultError(fmt.Sprintf("GetWhereUsed failed: %v", err)), nil
	}

	output, _ := json.MarshalIndent(results, "", "  ")
	return mcp.NewToolResultText(string(output)), nil
}

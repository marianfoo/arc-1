// Package mcp provides the MCP server implementation for ABAP ADT tools.
// handlers_context.go contains the GetContext handler for dependency context compression.
package mcp

import (
	"context"
	"fmt"

	"github.com/mark3labs/mcp-go/mcp"
	"github.com/oisee/vibing-steampunk/pkg/ctxcomp"
)

// routeContextAction routes "analyze" with type=context.
func (s *Server) routeContextAction(ctx context.Context, action, objectType, objectName string, params map[string]any) (*mcp.CallToolResult, bool, error) {
	if action != "analyze" {
		return nil, false, nil
	}
	if getStringParam(params, "type") == "context" {
		return s.callHandler(ctx, s.handleGetContext, params)
	}
	return nil, false, nil
}

// adtSourceAdapter adapts adt.Client to the ctxcomp.ADTSourceFetcher interface.
type adtSourceAdapter struct {
	server *Server
}

func (a *adtSourceAdapter) GetSource(ctx context.Context, objectType, name string, opts interface{}) (string, error) {
	return a.server.adtClient.GetSource(ctx, objectType, name, nil)
}

func (s *Server) handleGetContext(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	objectType, ok := request.Params.Arguments["object_type"].(string)
	if !ok || objectType == "" {
		return newToolResultError("object_type is required"), nil
	}

	name, ok := request.Params.Arguments["name"].(string)
	if !ok || name == "" {
		return newToolResultError("name is required"), nil
	}

	source, _ := request.Params.Arguments["source"].(string)
	maxDeps := 20
	if md, ok := request.Params.Arguments["max_deps"].(float64); ok && md > 0 {
		maxDeps = int(md)
	}

	// Fetch source from SAP if not provided
	if source == "" {
		var err error
		source, err = s.adtClient.GetSource(ctx, objectType, name, nil)
		if err != nil {
			return newToolResultError(fmt.Sprintf("GetContext: failed to fetch source for %s %s: %v", objectType, name, err)), nil
		}
	}

	provider := ctxcomp.NewMultiSourceProvider("", &adtSourceAdapter{server: s})
	compressor := ctxcomp.NewCompressor(provider, maxDeps)
	result, err := compressor.Compress(ctx, source, name, objectType)
	if err != nil {
		return newToolResultError(fmt.Sprintf("GetContext failed: %v", err)), nil
	}

	if result.Prologue == "" {
		return mcp.NewToolResultText(fmt.Sprintf("No resolvable dependencies found for %s %s", objectType, name)), nil
	}

	// Append stats
	output := fmt.Sprintf("%s\n* Stats: %d deps found, %d resolved, %d failed, %d lines",
		result.Prologue, result.Stats.DepsFound, result.Stats.DepsResolved, result.Stats.DepsFailed, result.Stats.TotalLines)

	return mcp.NewToolResultText(output), nil
}

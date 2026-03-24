// Package mcp provides the MCP server implementation for ABAP ADT tools.
// handlers_enhancements.go contains handlers for enhancement framework operations.
package mcp

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/mark3labs/mcp-go/mcp"
)

func (s *Server) handleGetEnhancementSpot(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	spotName, ok := request.GetArguments()["spot_name"].(string)
	if !ok || spotName == "" {
		return newToolResultError("spot_name is required"), nil
	}

	spot, err := s.adtClient.GetEnhancementSpot(ctx, spotName)
	if err != nil {
		return newToolResultError(fmt.Sprintf("GetEnhancementSpot failed: %v", err)), nil
	}

	output, _ := json.MarshalIndent(spot, "", "  ")
	return mcp.NewToolResultText(string(output)), nil
}

func (s *Server) handleGetEnhancements(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	objectURL, ok := request.GetArguments()["object_url"].(string)
	if !ok || objectURL == "" {
		return newToolResultError("object_url is required"), nil
	}

	elements, err := s.adtClient.GetEnhancements(ctx, objectURL)
	if err != nil {
		return newToolResultError(fmt.Sprintf("GetEnhancements failed: %v", err)), nil
	}

	output, _ := json.MarshalIndent(elements, "", "  ")
	return mcp.NewToolResultText(string(output)), nil
}

func (s *Server) handleGetEnhancementImpl(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	spotName, ok := request.GetArguments()["spot_name"].(string)
	if !ok || spotName == "" {
		return newToolResultError("spot_name is required"), nil
	}

	implName, ok := request.GetArguments()["impl_name"].(string)
	if !ok || implName == "" {
		return newToolResultError("impl_name is required"), nil
	}

	source, err := s.adtClient.GetEnhancementImpl(ctx, spotName, implName)
	if err != nil {
		return newToolResultError(fmt.Sprintf("GetEnhancementImpl failed: %v", err)), nil
	}

	return mcp.NewToolResultText(source), nil
}

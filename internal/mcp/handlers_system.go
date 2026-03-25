// Package mcp provides the MCP server implementation for ABAP ADT tools.
// handlers_system.go contains handlers for system information operations.
package mcp

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/mark3labs/mcp-go/mcp"
	"github.com/marianfoo/arc-1/pkg/adt"
)

// routeSystemAction routes "system" info/components/connection/features.
func (s *Server) routeSystemAction(ctx context.Context, action, objectType, objectName string, params map[string]any) (*mcp.CallToolResult, bool, error) {
	if action != "system" {
		return nil, false, nil
	}
	switch objectType {
	case "INFO":
		return s.callHandler(ctx, s.handleGetSystemInfo, params)
	case "COMPONENTS":
		return s.callHandler(ctx, s.handleGetInstalledComponents, params)
	case "CONNECTION":
		return s.callHandler(ctx, s.handleGetConnectionInfo, params)
	case "FEATURES":
		return s.callHandler(ctx, s.handleGetFeatures, params)
	}
	return nil, false, nil
}

// --- System Information Handlers ---

func (s *Server) handleGetSystemInfo(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	info, err := s.adtClient.GetSystemInfo(ctx)
	if err != nil {
		return newToolResultError(fmt.Sprintf("Failed to get system info: %v", err)), nil
	}

	result, _ := json.MarshalIndent(info, "", "  ")
	return mcp.NewToolResultText(string(result)), nil
}

func (s *Server) handleGetInstalledComponents(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	components, err := s.adtClient.GetInstalledComponents(ctx)
	if err != nil {
		return newToolResultError(fmt.Sprintf("Failed to get installed components: %v", err)), nil
	}

	result, _ := json.MarshalIndent(components, "", "  ")
	return mcp.NewToolResultText(string(result)), nil
}

func (s *Server) handleGetConnectionInfo(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	// Return current connection info for introspection
	info := map[string]interface{}{
		"user":   s.config.Username,
		"url":    s.config.BaseURL,
		"client": s.config.Client,
		"mode":   "arc1",
	}

	// Add feature summary
	info["features"] = s.featureProber.FeatureSummary(ctx)

	result, _ := json.MarshalIndent(info, "", "  ")
	return mcp.NewToolResultText(string(result)), nil
}

func (s *Server) handleGetFeatures(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	// Probe all features
	results := s.featureProber.ProbeAll(ctx)

	// Format output
	type featureOutput struct {
		Features map[string]*adt.FeatureStatus `json:"features"`
		Summary  string                        `json:"summary"`
	}

	output := featureOutput{
		Features: make(map[string]*adt.FeatureStatus),
		Summary:  s.featureProber.FeatureSummary(ctx),
	}

	for id, status := range results {
		output.Features[string(id)] = status
	}

	result, _ := json.MarshalIndent(output, "", "  ")
	return mcp.NewToolResultText(string(result)), nil
}

// GetAbapHelp removed — WebSocket-based documentation lookup has been removed.

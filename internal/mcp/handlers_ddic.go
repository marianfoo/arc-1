// Package mcp provides the MCP server implementation for ABAP ADT tools.
// handlers_ddic.go contains handlers for DDIC operations (Domain, DataElement, Structure, DDLX).
package mcp

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/mark3labs/mcp-go/mcp"
)

// --- Domain Handlers ---

func (s *Server) handleGetDomain(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	name, ok := request.GetArguments()["name"].(string)
	if !ok || name == "" {
		return newToolResultError("name is required"), nil
	}

	domain, err := s.adtClient.GetDomain(ctx, name)
	if err != nil {
		return newToolResultError(fmt.Sprintf("GetDomain failed: %v", err)), nil
	}

	output, _ := json.MarshalIndent(domain, "", "  ")
	return mcp.NewToolResultText(string(output)), nil
}

func (s *Server) handleCreateDomain(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	args := request.GetArguments()
	name, _ := args["name"].(string)
	description, _ := args["description"].(string)
	packageName, _ := args["package"].(string)
	dataType, _ := args["data_type"].(string)
	transport, _ := args["transport"].(string)

	if name == "" || packageName == "" || dataType == "" {
		return newToolResultError("name, package, and data_type are required"), nil
	}
	if description == "" {
		description = name
	}

	var length, decimals int
	if l, ok := args["length"].(float64); ok {
		length = int(l)
	}
	if d, ok := args["decimals"].(float64); ok {
		decimals = int(d)
	}

	err := s.adtClient.CreateDomain(ctx, name, description, packageName, dataType, length, decimals, transport)
	if err != nil {
		return newToolResultError(fmt.Sprintf("CreateDomain failed: %v", err)), nil
	}

	return mcp.NewToolResultText(fmt.Sprintf("Domain %s created successfully", name)), nil
}

func (s *Server) handleValidateDomain(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	args := request.GetArguments()
	name, _ := args["name"].(string)
	packageName, _ := args["package"].(string)
	description, _ := args["description"].(string)

	if name == "" || packageName == "" {
		return newToolResultError("name and package are required"), nil
	}

	err := s.adtClient.ValidateDomain(ctx, name, packageName, description)
	if err != nil {
		return newToolResultError(fmt.Sprintf("ValidateDomain failed: %v", err)), nil
	}

	return mcp.NewToolResultText(fmt.Sprintf("Domain %s validation passed", name)), nil
}

// --- DataElement Handlers ---

func (s *Server) handleGetDataElement(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	name, ok := request.GetArguments()["name"].(string)
	if !ok || name == "" {
		return newToolResultError("name is required"), nil
	}

	de, err := s.adtClient.GetDataElement(ctx, name)
	if err != nil {
		return newToolResultError(fmt.Sprintf("GetDataElement failed: %v", err)), nil
	}

	output, _ := json.MarshalIndent(de, "", "  ")
	return mcp.NewToolResultText(string(output)), nil
}

func (s *Server) handleCreateDataElement(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	args := request.GetArguments()
	name, _ := args["name"].(string)
	description, _ := args["description"].(string)
	packageName, _ := args["package"].(string)
	domainName, _ := args["domain_name"].(string)
	transport, _ := args["transport"].(string)

	if name == "" || packageName == "" || domainName == "" {
		return newToolResultError("name, package, and domain_name are required"), nil
	}
	if description == "" {
		description = name
	}

	err := s.adtClient.CreateDataElement(ctx, name, description, packageName, domainName, transport)
	if err != nil {
		return newToolResultError(fmt.Sprintf("CreateDataElement failed: %v", err)), nil
	}

	return mcp.NewToolResultText(fmt.Sprintf("DataElement %s created successfully", name)), nil
}

func (s *Server) handleValidateDataElement(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	args := request.GetArguments()
	name, _ := args["name"].(string)
	packageName, _ := args["package"].(string)
	description, _ := args["description"].(string)

	if name == "" || packageName == "" {
		return newToolResultError("name and package are required"), nil
	}

	err := s.adtClient.ValidateDataElement(ctx, name, packageName, description)
	if err != nil {
		return newToolResultError(fmt.Sprintf("ValidateDataElement failed: %v", err)), nil
	}

	return mcp.NewToolResultText(fmt.Sprintf("DataElement %s validation passed", name)), nil
}

// --- Structure Handlers ---

func (s *Server) handleGetStructureDefinition(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	name, ok := request.GetArguments()["name"].(string)
	if !ok || name == "" {
		return newToolResultError("name is required"), nil
	}

	structure, err := s.adtClient.GetStructureDefinition(ctx, name)
	if err != nil {
		return newToolResultError(fmt.Sprintf("GetStructureDefinition failed: %v", err)), nil
	}

	output, _ := json.MarshalIndent(structure, "", "  ")
	return mcp.NewToolResultText(string(output)), nil
}

// --- DDLX / Metadata Extension Handlers ---

func (s *Server) handleGetMetadataExtension(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	name, ok := request.GetArguments()["name"].(string)
	if !ok || name == "" {
		return newToolResultError("name is required"), nil
	}

	ext, err := s.adtClient.GetMetadataExtension(ctx, name)
	if err != nil {
		return newToolResultError(fmt.Sprintf("GetMetadataExtension failed: %v", err)), nil
	}

	output, _ := json.MarshalIndent(ext, "", "  ")
	return mcp.NewToolResultText(string(output)), nil
}

func (s *Server) handleGetMetadataExtensionSource(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	name, ok := request.GetArguments()["name"].(string)
	if !ok || name == "" {
		return newToolResultError("name is required"), nil
	}

	source, err := s.adtClient.GetMetadataExtensionSource(ctx, name)
	if err != nil {
		return newToolResultError(fmt.Sprintf("GetMetadataExtensionSource failed: %v", err)), nil
	}

	return mcp.NewToolResultText(source), nil
}

func (s *Server) handleCreateMetadataExtension(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	args := request.GetArguments()
	name, _ := args["name"].(string)
	description, _ := args["description"].(string)
	packageName, _ := args["package"].(string)
	source, _ := args["source"].(string)
	transport, _ := args["transport"].(string)

	if name == "" || packageName == "" || source == "" {
		return newToolResultError("name, package, and source are required"), nil
	}
	if description == "" {
		description = name
	}

	err := s.adtClient.CreateMetadataExtension(ctx, name, description, packageName, source, transport)
	if err != nil {
		return newToolResultError(fmt.Sprintf("CreateMetadataExtension failed: %v", err)), nil
	}

	return mcp.NewToolResultText(fmt.Sprintf("MetadataExtension %s created successfully", name)), nil
}

package mcp

import (
	"testing"
)

// ============================================================================
// ARC-1 Tool Registration Tests
// ============================================================================

// TestARC1Registers11Tools verifies default config registers exactly 11 intent tools.
func TestARC1Registers11Tools(t *testing.T) {
	s := newServerWithConfig(&Config{
		BaseURL:  "https://sap.example.com:44300",
		Username: "testuser",
		Password: "testpass",
	})

	tools := listTools(t, s)
	t.Logf("ARC-1 tool count: %d", len(tools))

	expectedTools := []string{
		"SAPRead", "SAPSearch", "SAPWrite", "SAPActivate",
		"SAPNavigate", "SAPQuery", "SAPTransport", "SAPContext",
		"SAPLint", "SAPDiagnose", "SAPManage",
	}

	if len(tools) != len(expectedTools) {
		names := make([]string, len(tools))
		for i, tool := range tools {
			names[i] = tool.Name
		}
		t.Fatalf("expected %d tools, got %d: %v", len(expectedTools), len(tools), names)
	}

	names := toolNames(t, s)
	for _, tool := range expectedTools {
		if !names[tool] {
			t.Errorf("missing expected tool %q", tool)
		}
	}
}

// TestReadOnlyHidesWriteTools verifies read-only mode hides SAPWrite and SAPManage.
func TestReadOnlyHidesWriteTools(t *testing.T) {
	s := newServerWithConfig(&Config{
		BaseURL:  "https://sap.example.com:44300",
		Username: "testuser",
		Password: "testpass",
		ReadOnly: true,
	})

	names := toolNames(t, s)
	tools := listTools(t, s)
	t.Logf("Read-only tool count: %d", len(tools))

	if names["SAPWrite"] {
		t.Error("SAPWrite should NOT be registered in read-only mode")
	}
	if names["SAPManage"] {
		t.Error("SAPManage should NOT be registered in read-only mode")
	}

	// Read tools should still be present
	readTools := []string{"SAPRead", "SAPSearch", "SAPActivate", "SAPNavigate", "SAPContext", "SAPLint", "SAPDiagnose"}
	for _, tool := range readTools {
		if !names[tool] {
			t.Errorf("read tool %q should be registered in read-only mode", tool)
		}
	}

	// 11 - SAPWrite - SAPManage = 9
	if len(tools) != 9 {
		t.Fatalf("read-only mode should register 9 tools, got %d", len(tools))
	}
}

// TestBlockFreeSQLHidesQuery verifies --block-free-sql hides SAPQuery.
func TestBlockFreeSQLHidesQuery(t *testing.T) {
	s := newServerWithConfig(&Config{
		BaseURL:      "https://sap.example.com:44300",
		Username:     "testuser",
		Password:     "testpass",
		BlockFreeSQL: true,
	})

	names := toolNames(t, s)
	if names["SAPQuery"] {
		t.Error("SAPQuery should NOT be registered when BlockFreeSQL is true")
	}

	tools := listTools(t, s)
	// 11 - SAPQuery = 10
	if len(tools) != 10 {
		t.Fatalf("block-free-sql should have 10 tools, got %d", len(tools))
	}
}

// TestReadOnlyBlockSQLHas8Tools verifies the most restrictive config.
func TestReadOnlyBlockSQLHas8Tools(t *testing.T) {
	s := newServerWithConfig(&Config{
		BaseURL:      "https://sap.example.com:44300",
		Username:     "testuser",
		Password:     "testpass",
		ReadOnly:     true,
		BlockFreeSQL: true,
	})

	tools := listTools(t, s)
	// 11 - SAPWrite - SAPManage - SAPQuery = 8
	if len(tools) != 8 {
		names := make([]string, len(tools))
		for i, tool := range tools {
			names[i] = tool.Name
		}
		t.Fatalf("most restrictive config should have 8 tools, got %d: %v", len(tools), names)
	}
}

// TestReadOnlySafetyConfig verifies ReadOnly flag propagates to ADT safety.
func TestReadOnlySafetyConfig(t *testing.T) {
	s := newServerWithConfig(&Config{
		BaseURL:  "https://sap.example.com:44300",
		Username: "testuser",
		Password: "testpass",
		ReadOnly: true,
	})

	safety := s.adtClient.Safety()
	if !safety.ReadOnly {
		t.Error("ReadOnly=true config flag must set Safety.ReadOnly = true")
	}
}

// TestDefaultIsUnrestricted verifies default config has no safety restrictions.
func TestDefaultIsUnrestricted(t *testing.T) {
	s := newServerWithConfig(&Config{
		BaseURL:  "https://sap.example.com:44300",
		Username: "testuser",
		Password: "testpass",
	})

	safety := s.adtClient.Safety()
	if safety.ReadOnly {
		t.Error("default config should not be read-only")
	}
	if safety.BlockFreeSQL {
		t.Error("default config should not block free SQL")
	}
}

// TestBlockFreeSQLSafetyConfig verifies BlockFreeSQL propagates to safety.
func TestBlockFreeSQLSafetyConfig(t *testing.T) {
	s := newServerWithConfig(&Config{
		BaseURL:      "https://sap.example.com:44300",
		Username:     "testuser",
		Password:     "testpass",
		BlockFreeSQL: true,
	})

	safety := s.adtClient.Safety()
	if !safety.BlockFreeSQL {
		t.Error("BlockFreeSQL=true must set Safety.BlockFreeSQL = true")
	}
}

// TestAllowedPackagesConfig verifies AllowedPackages propagates to safety.
func TestAllowedPackagesConfig(t *testing.T) {
	s := newServerWithConfig(&Config{
		BaseURL:         "https://sap.example.com:44300",
		Username:        "testuser",
		Password:        "testpass",
		AllowedPackages: []string{"$TMP", "Z*"},
	})

	safety := s.adtClient.Safety()
	if len(safety.AllowedPackages) != 2 {
		t.Fatalf("expected 2 AllowedPackages, got %d", len(safety.AllowedPackages))
	}
	if !safety.IsPackageAllowed("$TMP") {
		t.Error("$TMP should be allowed")
	}
	if !safety.IsPackageAllowed("ZTEST") {
		t.Error("ZTEST should be allowed via Z* wildcard")
	}
	if safety.IsPackageAllowed("PROD") {
		t.Error("PROD should NOT be allowed")
	}
}

// TestAllowedOpsConfig verifies AllowedOps propagates to safety.
func TestAllowedOpsConfig(t *testing.T) {
	s := newServerWithConfig(&Config{
		BaseURL:    "https://sap.example.com:44300",
		Username:   "testuser",
		Password:   "testpass",
		AllowedOps: "RSQ",
	})

	safety := s.adtClient.Safety()
	if safety.AllowedOps != "RSQ" {
		t.Errorf("AllowedOps = %q, want %q", safety.AllowedOps, "RSQ")
	}
}

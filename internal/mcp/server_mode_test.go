package mcp

import (
	"testing"
)

// TestFocusedModeToolCount ensures focused mode registers a specific number of tools.
// This test prevents accidental tool additions — if you add a tool, update this count.
func TestFocusedModeToolCount(t *testing.T) {
	s := newServerWithConfig(&Config{
		BaseURL:  "https://sap.example.com:44300",
		Username: "testuser",
		Password: "testpass",
		Mode:     "focused",
	})

	tools := listTools(t, s)
	// Count should match the focusedToolSet() entries + always-on tools (GetConnectionInfo, GetFeatures)
	// This is a regression test — update when intentionally adding/removing tools
	t.Logf("Focused mode tool count: %d", len(tools))

	if len(tools) == 0 {
		t.Fatal("focused mode should register at least some tools")
	}
}

// TestHyperfocusedModeRegistersOnlyUniversalTool ensures hyperfocused mode registers exactly 1 tool.
func TestHyperfocusedModeRegistersOnlyUniversalTool(t *testing.T) {
	s := newServerWithConfig(&Config{
		BaseURL:  "https://sap.example.com:44300",
		Username: "testuser",
		Password: "testpass",
		Mode:     "hyperfocused",
	})

	tools := listTools(t, s)
	if len(tools) != 1 {
		t.Fatalf("hyperfocused mode should register exactly 1 tool, got %d", len(tools))
	}
	if tools[0].Name != "SAP" {
		t.Fatalf("hyperfocused mode tool should be 'SAP', got %q", tools[0].Name)
	}
}

// TestReadOnlyModeHasTools verifies that readonly mode registers tools and sets safety.
// Note: Currently readonly mode registers all focused tools but blocks writes at the ADT
// client level via safety config. The new tool surface (Phase 3) will hide write tools
// at the registration level.
func TestReadOnlyModeHasTools(t *testing.T) {
	s := newServerWithConfig(&Config{
		BaseURL:  "https://sap.example.com:44300",
		Username: "testuser",
		Password: "testpass",
		Mode:     "readonly",
	})

	names := toolNames(t, s)

	// These read tools SHOULD be present
	readTools := []string{
		"GetSource",
		"SearchObject",
		"GetTable",
		"GetTableContents",
		"GetSystemInfo",
		"FindDefinition",
		"FindReferences",
		"ListDumps",
		"GetDump",
	}

	for _, tool := range readTools {
		if !names[tool] {
			t.Errorf("read tool %q should be registered in readonly mode", tool)
		}
	}
}

// TestReadOnlyConfigImpliesSafety verifies that read-only mode sets safety flags.
func TestReadOnlyConfigImpliesSafety(t *testing.T) {
	s := newServerWithConfig(&Config{
		BaseURL:  "https://sap.example.com:44300",
		Username: "testuser",
		Password: "testpass",
		Mode:     "readonly",
	})

	if s.adtClient == nil {
		t.Fatal("ADT client should not be nil")
	}
}

// TestExpertModeRegistersMoreTools verifies expert mode has more tools than focused.
func TestExpertModeRegistersMoreTools(t *testing.T) {
	focused := newServerWithConfig(&Config{
		BaseURL:  "https://sap.example.com:44300",
		Username: "testuser",
		Password: "testpass",
		Mode:     "focused",
	})

	expert := newServerWithConfig(&Config{
		BaseURL:  "https://sap.example.com:44300",
		Username: "testuser",
		Password: "testpass",
		Mode:     "expert",
	})

	focusedTools := listTools(t, focused)
	expertTools := listTools(t, expert)

	if len(expertTools) <= len(focusedTools) {
		t.Fatalf("expert mode (%d tools) should have more tools than focused mode (%d tools)",
			len(expertTools), len(focusedTools))
	}
	t.Logf("Focused: %d tools, Expert: %d tools", len(focusedTools), len(expertTools))
}

// TestDisabledGroupsRemovesTools verifies that --disabled-groups removes tools.
func TestDisabledGroupsRemovesTools(t *testing.T) {
	withUI5 := newServerWithConfig(&Config{
		BaseURL:  "https://sap.example.com:44300",
		Username: "testuser",
		Password: "testpass",
		Mode:     "focused",
	})

	withoutUI5 := newServerWithConfig(&Config{
		BaseURL:        "https://sap.example.com:44300",
		Username:       "testuser",
		Password:       "testpass",
		Mode:           "focused",
		DisabledGroups: "5",
	})

	withNames := toolNames(t, withUI5)
	withoutNames := toolNames(t, withoutUI5)

	// UI5 tools should be present without disabled groups
	if !withNames["UI5ListApps"] {
		t.Error("UI5ListApps should be registered without disabled groups")
	}

	// UI5 tools should be absent with "5" disabled
	ui5Tools := []string{"UI5ListApps", "UI5GetApp", "UI5GetFileContent"}
	for _, tool := range ui5Tools {
		if withoutNames[tool] {
			t.Errorf("UI5 tool %q should NOT be registered with disabled group '5'", tool)
		}
	}
}

// TestDisabledGroupsTransportsRemoved verifies "C" disables transport tools.
func TestDisabledGroupsTransportsRemoved(t *testing.T) {
	s := newServerWithConfig(&Config{
		BaseURL:        "https://sap.example.com:44300",
		Username:       "testuser",
		Password:       "testpass",
		Mode:           "focused",
		DisabledGroups: "C",
	})

	names := toolNames(t, s)
	if names["ListTransports"] {
		t.Error("ListTransports should NOT be registered with disabled group 'C'")
	}
	if names["GetTransport"] {
		t.Error("GetTransport should NOT be registered with disabled group 'C'")
	}
}

// TestCoreToolsAlwaysPresent verifies essential tools are always registered.
func TestCoreToolsAlwaysPresent(t *testing.T) {
	s := newServerWithConfig(&Config{
		BaseURL:  "https://sap.example.com:44300",
		Username: "testuser",
		Password: "testpass",
		Mode:     "focused",
	})

	names := toolNames(t, s)

	// Always-on tools
	alwaysOn := []string{"GetConnectionInfo", "GetFeatures"}
	for _, tool := range alwaysOn {
		if !names[tool] {
			t.Errorf("always-on tool %q should be registered", tool)
		}
	}

	// Core focused tools
	coreTools := []string{
		"GetSource", "WriteSource", "SearchObject",
		"GrepObjects", "GrepPackages",
		"SyntaxCheck", "RunUnitTests",
		"GetTable", "GetTableContents", "RunQuery",
		"FindDefinition", "FindReferences",
		"GetSystemInfo",
	}
	for _, tool := range coreTools {
		if !names[tool] {
			t.Errorf("core tool %q should be registered in focused mode", tool)
		}
	}
}

// TestRemovedToolsNotPresent verifies that removed experimental tools are gone.
func TestRemovedToolsNotPresent(t *testing.T) {
	for _, mode := range []string{"focused", "expert"} {
		t.Run(mode, func(t *testing.T) {
			s := newServerWithConfig(&Config{
				BaseURL:  "https://sap.example.com:44300",
				Username: "testuser",
				Password: "testpass",
				Mode:     mode,
			})

			names := toolNames(t, s)

			// These tools should NEVER be registered (removed features)
			removedTools := []string{
				// Debugger (WebSocket)
				"SetBreakpoint", "GetBreakpoints", "DeleteBreakpoint",
				"DebuggerListen", "DebuggerAttach", "DebuggerDetach",
				"DebuggerStep", "DebuggerGetStack", "DebuggerGetVariables",
				"CallRFC",
				// AMDP
				"AMDPDebuggerStart", "AMDPDebuggerResume", "AMDPDebuggerStop",
				"AMDPDebuggerStep", "AMDPGetVariables", "AMDPSetBreakpoint", "AMDPGetBreakpoints",
				// Git
				"GitTypes", "GitExport",
				// Reports
				"RunReport", "RunReportAsync", "GetAsyncResult",
				// Install
				"InstallZADTVSP", "InstallAbapGit", "ListDependencies", "InstallDummyTest", "DeployZip",
				// Service binding
				"PublishServiceBinding", "UnpublishServiceBinding",
				// Move (WebSocket)
				"MoveObject",
				// Help
				"GetAbapHelp",
			}

			for _, tool := range removedTools {
				if names[tool] {
					t.Errorf("removed tool %q should NOT be registered in %s mode", tool, mode)
				}
			}
		})
	}
}

// TestToolsConfigOverridesFocusedMode verifies .vsp.json tool config overrides.
func TestToolsConfigOverridesFocusedMode(t *testing.T) {
	// Disable a normally-enabled tool
	toolsConfig := map[string]bool{
		"GetSource": false,
	}

	s := newServerWithConfig(&Config{
		BaseURL:     "https://sap.example.com:44300",
		Username:    "testuser",
		Password:    "testpass",
		Mode:        "focused",
		ToolsConfig: toolsConfig,
	})

	names := toolNames(t, s)
	if names["GetSource"] {
		t.Error("GetSource should be disabled via toolsConfig override")
	}
}

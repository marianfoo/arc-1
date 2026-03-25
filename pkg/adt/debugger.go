package adt

import (
	"context"
	"encoding/hex"
	"encoding/xml"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// --- Breakpoint Types ---

// BreakpointKind represents the type of breakpoint.
type BreakpointKind string

const (
	BreakpointKindLine        BreakpointKind = "line"
	BreakpointKindStatement   BreakpointKind = "statement"
	BreakpointKindException   BreakpointKind = "exception"
	BreakpointKindMessage     BreakpointKind = "message"
	BreakpointKindBadi        BreakpointKind = "badi"        // Business Add-In breakpoint
	BreakpointKindEnhancement BreakpointKind = "enhancement" // Enhancement point breakpoint
	BreakpointKindWatchpoint  BreakpointKind = "watchpoint"  // Data watchpoint (variable change)
	BreakpointKindMethod      BreakpointKind = "method"      // Method/function entry breakpoint
)

// BreakpointScope determines the lifetime of a breakpoint.
type BreakpointScope string

const (
	// BreakpointScopeExternal persists across sessions (external/static breakpoints)
	BreakpointScopeExternal BreakpointScope = "external"
	// BreakpointScopeDebugger is session-bound (only during debug session)
	BreakpointScopeDebugger BreakpointScope = "debugger"
)

// DebuggingMode determines how debugging is triggered.
type DebuggingMode string

const (
	// DebuggingModeUser debugs all processes of a specific user
	DebuggingModeUser DebuggingMode = "user"
	// DebuggingModeTerminal debugs processes from a specific terminal
	DebuggingModeTerminal DebuggingMode = "terminal"
)

// terminalID is a unique identifier for this vsp session.
// IMPORTANT: This must be deterministic across MCP tool calls since each call
// may be a separate process. We use a fixed ID based on the username.
var (
	terminalIDUser   string // Set via SetTerminalIDUser for deterministic ID
	terminalIDCustom string // Set via SetTerminalID for SAP GUI compatibility
)

// SetTerminalIDUser sets the username used to generate a deterministic terminal ID.
// This should be called early in the MCP server initialization.
// If not set, a fixed default terminal ID will be used.
func SetTerminalIDUser(user string) {
	terminalIDUser = user
}

// SetTerminalID sets a custom terminal ID (e.g., from SAP GUI).
// Use the same ID as SAP GUI to enable cross-tool breakpoint sharing.
// SAP GUI stores this in: Windows Registry HKCU\Software\SAP\ABAP Debugging\TerminalID
// or on Linux/Mac: ~/.SAP/ABAPDebugging/terminalId
func SetTerminalID(id string) {
	terminalIDCustom = id
}

// getTerminalID returns a terminal ID for this vsp session.
// Priority: 1) Custom ID (SAP GUI), 2) User-based ID, 3) Default
func getTerminalID() string {
	// 1. Use custom terminal ID if set (for SAP GUI compatibility)
	if terminalIDCustom != "" {
		return terminalIDCustom
	}
	// 2. Deterministic: use hash of username for consistent ID across processes
	if terminalIDUser != "" {
		h := make([]byte, 8)
		for i, c := range terminalIDUser {
			h[i%8] ^= byte(c)
		}
		return "arc1-" + hex.EncodeToString(h)
	}
	// 3. Fixed default - better than random for MCP scenarios
	return "arc1-mcp-default"
}

// Breakpoint represents an ABAP debugger breakpoint.
type Breakpoint struct {
	ID          string         `json:"id"`
	Kind        BreakpointKind `json:"kind"`
	Enabled     bool           `json:"enabled"`
	URI         string         `json:"uri,omitempty"`         // ADT URI for line breakpoints
	Line        int            `json:"line,omitempty"`        // Line number for line breakpoints
	Condition   string         `json:"condition,omitempty"`   // Optional condition expression
	Statement   string         `json:"statement,omitempty"`   // Statement type for statement breakpoints
	Exception   string         `json:"exception,omitempty"`   // Exception class for exception breakpoints
	MessageID   string         `json:"messageId,omitempty"`   // Message ID for message breakpoints
	MessageType string         `json:"messageType,omitempty"` // Message type (E, W, I, S, A)
	MessageArea string         `json:"messageArea,omitempty"` // Message class/area (e.g., "00", "SY")

	// BAdi and Enhancement breakpoints
	BadiName        string `json:"badiName,omitempty"`        // BAdi definition name
	EnhancementSpot string `json:"enhancementSpot,omitempty"` // Enhancement spot name
	EnhancementImpl string `json:"enhancementImpl,omitempty"` // Enhancement implementation name

	// Watchpoint (data breakpoint)
	Variable       string `json:"variable,omitempty"`       // Variable name to watch
	WatchCondition string `json:"watchCondition,omitempty"` // When to trigger: "change", "read", "any"

	// Method breakpoint
	ClassName  string `json:"className,omitempty"`  // Class name for method breakpoint
	MethodName string `json:"methodName,omitempty"` // Method name for method breakpoint

	// Read-only fields returned by SAP
	ActualLine int    `json:"actualLine,omitempty"` // Actual line after adjustment
	IsActive   bool   `json:"isActive,omitempty"`   // Whether BP is currently active
	ObjectName string `json:"objectName,omitempty"` // Name of the object containing the BP
}

// BreakpointRequest contains parameters for creating breakpoints.
type BreakpointRequest struct {
	Scope           BreakpointScope `json:"scope"`
	DebuggingMode   DebuggingMode   `json:"debuggingMode"`
	TerminalID      string          `json:"terminalId,omitempty"`
	User            string          `json:"user,omitempty"`
	IdeID           string          `json:"ideId,omitempty"`           // IDE identifier (default: "arc1")
	ClientID        string          `json:"clientId,omitempty"`        // Client ID for breakpoints
	SystemDebugging bool            `json:"systemDebugging,omitempty"` // Enable system debugging
	Deactivated     bool            `json:"deactivated,omitempty"`     // Create breakpoints in deactivated state
	SyncScopeURI    string          `json:"syncScopeUri,omitempty"`    // Partial sync scope URI
	Breakpoints     []Breakpoint    `json:"breakpoints"`
}

// BreakpointResponse contains the result of breakpoint operations.
type BreakpointResponse struct {
	Breakpoints []Breakpoint `json:"breakpoints"`
}

// --- External Breakpoints API ---
// DEPRECATED: These functions return 403 CSRF errors in current SAP versions.
// Use WebSocket debug domain (ZADT_VSP) for breakpoint management instead.

// SetExternalBreakpoint creates an external (persistent) breakpoint.
// Deprecated: Use ZADT_VSP WebSocket handler with debug domain instead.
// These breakpoints persist across sessions and trigger when the specified user runs code that hits them.
//
// For line breakpoints:
//   - objectURI: ADT URI of the object (e.g., "/sap/bc/adt/programs/programs/ZTEST")
//   - line: Source line number (1-based)
//
// For exception breakpoints:
//   - exceptionClass: Exception class name (e.g., "CX_SY_ZERODIVIDE")
//
// For statement breakpoints:
//   - statement: Statement type (e.g., "WRITE", "CALL FUNCTION")
func (c *Client) SetExternalBreakpoint(ctx context.Context, req *BreakpointRequest) (*BreakpointResponse, error) {
	if req.Scope == "" {
		req.Scope = BreakpointScopeExternal
	}
	if req.DebuggingMode == "" {
		req.DebuggingMode = DebuggingModeUser
	}

	body, err := buildBreakpointRequestXML(req)
	if err != nil {
		return nil, fmt.Errorf("building breakpoint request: %w", err)
	}

	// POST with XML body - all parameters are in the XML, no query params needed
	resp, err := c.transport.Request(ctx, "/sap/bc/adt/debugger/breakpoints", &RequestOptions{
		Method:      http.MethodPost,
		Body:        []byte(body),
		ContentType: "application/xml",
		Accept:      "application/xml",
	})
	if err != nil {
		return nil, fmt.Errorf("set external breakpoint failed: %w", err)
	}

	return parseBreakpointResponse(resp.Body)
}

// GetExternalBreakpoints retrieves all external breakpoints for a user.
// Deprecated: Use ZADT_VSP WebSocket handler with debug domain instead.
// user is required for external breakpoints in user debugging mode.
func (c *Client) GetExternalBreakpoints(ctx context.Context, user string) (*BreakpointResponse, error) {
	query := url.Values{}
	query.Set("scope", string(BreakpointScopeExternal))
	query.Set("debuggingMode", string(DebuggingModeUser))
	// All four parameters required - terminalId identifies this vsp session
	query.Set("requestUser", user)
	query.Set("terminalId", getTerminalID())
	query.Set("ideId", "arc1")

	resp, err := c.transport.Request(ctx, "/sap/bc/adt/debugger/breakpoints", &RequestOptions{
		Method: http.MethodGet,
		Accept: "application/xml",
		Query:  query,
	})
	if err != nil {
		return nil, fmt.Errorf("get external breakpoints failed: %w", err)
	}

	// Handle empty response (no breakpoints)
	if len(resp.Body) == 0 {
		return &BreakpointResponse{}, nil
	}

	return parseBreakpointResponse(resp.Body)
}

// DeleteExternalBreakpoint removes an external breakpoint by ID.
// Deprecated: Use ZADT_VSP WebSocket handler with debug domain instead.
// user is required for external breakpoints in user debugging mode.
func (c *Client) DeleteExternalBreakpoint(ctx context.Context, breakpointID string, user string) error {
	query := url.Values{}
	query.Set("scope", string(BreakpointScopeExternal))
	query.Set("debuggingMode", string(DebuggingModeUser))
	// All parameters required - terminalId identifies this vsp session
	query.Set("requestUser", user)
	query.Set("terminalId", getTerminalID())
	query.Set("ideId", "arc1")

	endpoint := fmt.Sprintf("/sap/bc/adt/debugger/breakpoints/%s", url.PathEscape(breakpointID))
	_, err := c.transport.Request(ctx, endpoint, &RequestOptions{
		Method: http.MethodDelete,
		Query:  query,
	})
	if err != nil {
		return fmt.Errorf("delete external breakpoint failed: %w", err)
	}

	return nil
}

// DeleteAllExternalBreakpoints removes all external breakpoints for a user.
// Deprecated: Use ZADT_VSP WebSocket handler with debug domain instead.
func (c *Client) DeleteAllExternalBreakpoints(ctx context.Context, user string) error {
	// Get all breakpoints first
	bps, err := c.GetExternalBreakpoints(ctx, user)
	if err != nil {
		return fmt.Errorf("getting breakpoints for deletion: %w", err)
	}

	// Delete each one
	for _, bp := range bps.Breakpoints {
		if err := c.DeleteExternalBreakpoint(ctx, bp.ID, user); err != nil {
			return fmt.Errorf("deleting breakpoint %s: %w", bp.ID, err)
		}
	}

	return nil
}

// ValidateBreakpointCondition checks if a breakpoint condition expression is valid.
func (c *Client) ValidateBreakpointCondition(ctx context.Context, condition string) (bool, string, error) {
	body := fmt.Sprintf(`<?xml version="1.0" encoding="UTF-8"?>
<dbg:condition xmlns:dbg="http://www.sap.com/adt/debugger">%s</dbg:condition>`,
		xmlEscape(condition))

	resp, err := c.transport.Request(ctx, "/sap/bc/adt/debugger/breakpoints/conditions", &RequestOptions{
		Method:      http.MethodPost,
		Body:        []byte(body),
		ContentType: "application/xml",
		Accept:      "application/xml",
	})
	if err != nil {
		// Check if it's a validation error (400) vs other error
		return false, err.Error(), nil
	}

	// Parse validation result
	type validationResult struct {
		Valid   bool   `xml:"valid,attr"`
		Message string `xml:"message,attr"`
	}

	xmlStr := strings.ReplaceAll(string(resp.Body), "dbg:", "")
	var result validationResult
	if err := xml.Unmarshal([]byte(xmlStr), &result); err != nil {
		// If parsing fails but request succeeded, assume valid
		return true, "", nil
	}

	return result.Valid, result.Message, nil
}

// --- Helper functions ---

func buildBreakpointRequestXML(req *BreakpointRequest) (string, error) {
	// Set defaults
	ideID := req.IdeID
	if ideID == "" {
		ideID = "arc1"
	}
	// Use provided terminalId or generate session-unique one
	termID := req.TerminalID
	if termID == "" {
		termID = getTerminalID()
	}

	var bpElements []string

	for _, bp := range req.Breakpoints {
		// Default enabled to true if not explicitly disabled
		enabledAttr := `enabled="true"`
		if !bp.Enabled {
			// Only set to false if explicitly set - default should be true for new BPs
			// But we check the Kind first to see if it's a fresh struct
		}

		switch bp.Kind {
		case BreakpointKindLine:
			// Line breakpoint: uses adtcore:uri attribute with fragment for line number
			uri := bp.URI
			if bp.Line > 0 {
				uri = fmt.Sprintf("%s#start=%d", bp.URI, bp.Line)
			}
			attrs := fmt.Sprintf(`kind="line" %s adtcore:uri="%s"`, enabledAttr, xmlEscape(uri))
			if bp.Condition != "" {
				attrs += fmt.Sprintf(` condition="%s"`, xmlEscape(bp.Condition))
			}
			bpElements = append(bpElements, fmt.Sprintf(`<breakpoint %s/>`, attrs))

		case BreakpointKindException:
			bpElements = append(bpElements, fmt.Sprintf(`<breakpoint kind="exception" %s exceptionClass="%s"/>`,
				enabledAttr, xmlEscape(bp.Exception)))

		case BreakpointKindStatement:
			bpElements = append(bpElements, fmt.Sprintf(`<breakpoint kind="statement" %s statement="%s"/>`,
				enabledAttr, xmlEscape(bp.Statement)))

		case BreakpointKindMessage:
			bpElements = append(bpElements, fmt.Sprintf(`<breakpoint kind="message" %s msgId="%s" msgTy="%s"/>`,
				enabledAttr, xmlEscape(bp.MessageID), xmlEscape(bp.MessageType)))
		}
	}

	// Build breakpoint content
	bpContent := ""
	if len(bpElements) > 0 {
		bpContent = "\n  " + strings.Join(bpElements, "\n  ") + "\n"
	}

	// Build optional attributes
	optionalAttrs := ""
	if req.SystemDebugging {
		optionalAttrs += ` systemDebugging="true"`
	}
	if req.Deactivated {
		optionalAttrs += ` deactivated="true"`
	}

	// XML format based on Simple Transformation TPDA_ADT_BREAKPOINTS_REQUEST
	// terminalId is always included - it identifies this vsp session to SAP
	return fmt.Sprintf(`<?xml version="1.0" encoding="UTF-8"?>
<dbg:breakpoints xmlns:dbg="http://www.sap.com/adt/debugger" xmlns:adtcore="http://www.sap.com/adt/core" debuggingMode="%s" scope="%s" requestUser="%s" terminalId="%s" ideId="%s"%s>%s</dbg:breakpoints>`,
		string(req.DebuggingMode), string(req.Scope), xmlEscape(req.User),
		xmlEscape(termID), xmlEscape(ideID),
		optionalAttrs, bpContent), nil
}

func parseBreakpointResponse(data []byte) (*BreakpointResponse, error) {
	// Strip namespace prefixes for easier parsing
	xmlStr := string(data)
	xmlStr = strings.ReplaceAll(xmlStr, "dbg:", "")
	xmlStr = strings.ReplaceAll(xmlStr, "adtcore:", "")

	// Response format: <breakpoints><breakpoint kind="..." id="..." uri="..."/></breakpoints>
	type xmlBreakpoint struct {
		ID             string `xml:"id,attr"`
		Kind           string `xml:"kind,attr"`
		Enabled        bool   `xml:"enabled,attr"`
		IsActive       bool   `xml:"isActive,attr"`
		URI            string `xml:"uri,attr"`          // adtcore:uri attribute
		Condition      string `xml:"condition,attr"`    // condition attribute
		ExceptionClass string `xml:"exceptionClass,attr"`
		Statement      string `xml:"statement,attr"`
		MsgID          string `xml:"msgId,attr"`
		MsgTy          string `xml:"msgTy,attr"`
		ErrorMessage   string `xml:"errorMessage,attr"` // Error case
		ObjectName     string `xml:"name,attr"`         // adtcore:name attribute
	}

	// Parse root <breakpoints> element directly
	type xmlBreakpoints struct {
		XMLName     xml.Name        `xml:"breakpoints"`
		Breakpoints []xmlBreakpoint `xml:"breakpoint"`
	}

	var resp xmlBreakpoints
	if err := xml.Unmarshal([]byte(xmlStr), &resp); err != nil {
		return nil, fmt.Errorf("parsing breakpoint response: %w", err)
	}

	result := &BreakpointResponse{}
	for _, bp := range resp.Breakpoints {
		// Skip breakpoints with error messages (couldn't be created)
		if bp.ErrorMessage != "" {
			continue
		}

		breakpoint := Breakpoint{
			ID:          bp.ID,
			Kind:        BreakpointKind(bp.Kind),
			Enabled:     bp.Enabled,
			IsActive:    bp.IsActive,
			URI:         bp.URI,
			Condition:   bp.Condition,
			Exception:   bp.ExceptionClass,
			Statement:   bp.Statement,
			MessageID:   bp.MsgID,
			MessageType: bp.MsgTy,
			ObjectName:  bp.ObjectName,
		}

		// Extract line number from URI fragment if present
		if strings.Contains(breakpoint.URI, "#start=") {
			parts := strings.SplitN(breakpoint.URI, "#start=", 2)
			if len(parts) == 2 {
				breakpoint.URI = parts[0]
				fmt.Sscanf(parts[1], "%d", &breakpoint.Line)
			}
		}

		result.Breakpoints = append(result.Breakpoints, breakpoint)
	}

	return result, nil
}

// xmlEscape escapes special XML characters
func xmlEscape(s string) string {
	s = strings.ReplaceAll(s, "&", "&amp;")
	s = strings.ReplaceAll(s, "<", "&lt;")
	s = strings.ReplaceAll(s, ">", "&gt;")
	s = strings.ReplaceAll(s, "\"", "&quot;")
	s = strings.ReplaceAll(s, "'", "&apos;")
	return s
}

// --- Convenience functions for creating breakpoints ---

// NewLineBreakpoint creates a line breakpoint request.
// objectURI: ADT URI (e.g., "/sap/bc/adt/programs/programs/ZTEST/source/main")
// line: Source line number (1-based)
func NewLineBreakpoint(objectURI string, line int) Breakpoint {
	return Breakpoint{
		Kind:    BreakpointKindLine,
		Enabled: true,
		URI:     objectURI,
		Line:    line,
	}
}

// NewExceptionBreakpoint creates an exception breakpoint request.
// exceptionClass: Exception class name (e.g., "CX_SY_ZERODIVIDE")
func NewExceptionBreakpoint(exceptionClass string) Breakpoint {
	return Breakpoint{
		Kind:      BreakpointKindException,
		Enabled:   true,
		Exception: exceptionClass,
	}
}

// NewStatementBreakpoint creates a statement breakpoint request.
// statement: Statement type (e.g., "WRITE", "CALL FUNCTION", "RAISE EXCEPTION")
func NewStatementBreakpoint(statement string) Breakpoint {
	return Breakpoint{
		Kind:      BreakpointKindStatement,
		Enabled:   true,
		Statement: statement,
	}
}

// NewMessageBreakpoint creates a message breakpoint request.
// messageID: Message ID (e.g., "001")
// messageType: Message type (E=Error, W=Warning, I=Info, S=Success, A=Abort)
func NewMessageBreakpoint(messageID string, messageType string) Breakpoint {
	return Breakpoint{
		Kind:        BreakpointKindMessage,
		Enabled:     true,
		MessageID:   messageID,
		MessageType: messageType,
	}
}

// --- Debug Listener Types ---

// DebuggeeKind represents the type of debuggee.
type DebuggeeKind string

const (
	DebuggeeKindDebuggee        DebuggeeKind = "debuggee"
	DebuggeeKindPostMortem      DebuggeeKind = "postmortem"
	DebuggeeKindPostMortemDialog DebuggeeKind = "postmortem_dialog"
)

// Debuggee represents a process that has hit a breakpoint and is waiting for debugging.
type Debuggee struct {
	ID            string       `json:"debuggeeId"`
	Kind          DebuggeeKind `json:"kind"`
	Client        int          `json:"client"`
	TerminalID    string       `json:"terminalId"`
	IdeID         string       `json:"ideId"`
	User          string       `json:"debuggeeUser"`
	Program       string       `json:"program"`
	Include       string       `json:"include"`
	Line          int          `json:"line"`
	RFCDest       string       `json:"rfcDest,omitempty"`
	AppServer     string       `json:"appServer,omitempty"`
	SystemID      string       `json:"systemId,omitempty"`
	SystemNumber  int          `json:"systemNumber,omitempty"`
	Timestamp     int64        `json:"timestamp,omitempty"`
	IsAttachable  bool         `json:"isAttachable"`
	IsSameServer  bool         `json:"isSameServer"`
	InstanceName  string       `json:"instanceName,omitempty"`
	// For post-mortem debugging (short dumps)
	DumpID     string `json:"dumpId,omitempty"`
	DumpDate   string `json:"dumpDate,omitempty"`
	DumpTime   string `json:"dumpTime,omitempty"`
	DumpHost   string `json:"dumpHost,omitempty"`
	DumpUser   string `json:"dumpUser,omitempty"`
	DumpClient string `json:"dumpClient,omitempty"`
	DumpURI    string `json:"dumpUri,omitempty"`
}

// ListenerConflict represents a conflict with another debug listener.
type ListenerConflict struct {
	ConflictText string `json:"conflictText"`
	IdeUser      string `json:"ideUser"`
}

// ListenResult represents the result of a debug listen operation.
type ListenResult struct {
	Debuggee *Debuggee         `json:"debuggee,omitempty"`
	Conflict *ListenerConflict `json:"conflict,omitempty"`
	TimedOut bool              `json:"timedOut"`
}

// ListenOptions configures the debug listener.
type ListenOptions struct {
	DebuggingMode         DebuggingMode `json:"debuggingMode"`
	User                  string        `json:"user,omitempty"`        // Required for user mode
	TerminalID            string        `json:"terminalId,omitempty"`  // Auto-generated if empty
	IdeID                 string        `json:"ideId,omitempty"`       // Default: "arc1"
	TimeoutSeconds        int           `json:"timeout,omitempty"`     // Default: 240
	CheckConflict         bool          `json:"checkConflict"`
	NotifyOnConflict      bool          `json:"notifyOnConflict"`
}

// --- Debug Listener API ---

// DebuggerListen starts a debug listener that waits for a debuggee to hit a breakpoint.
// This is a BLOCKING call that uses long-polling. It will return when:
// - A debuggee is caught (returns Debuggee info)
// - Timeout occurs (returns TimedOut=true)
// - A conflict is detected (returns Conflict info)
// - Context is cancelled
//
// Default timeout is 240 seconds. For longer waits, call this in a loop.
func (c *Client) DebuggerListen(ctx context.Context, opts *ListenOptions) (*ListenResult, error) {
	if opts == nil {
		opts = &ListenOptions{}
	}
	if opts.DebuggingMode == "" {
		opts.DebuggingMode = DebuggingModeUser
	}
	if opts.IdeID == "" {
		opts.IdeID = "arc1"
	}
	if opts.TerminalID == "" {
		opts.TerminalID = getTerminalID()
	}
	if opts.TimeoutSeconds == 0 {
		opts.TimeoutSeconds = 240
	}

	query := url.Values{}
	query.Set("debuggingMode", string(opts.DebuggingMode))
	query.Set("terminalId", opts.TerminalID)
	query.Set("ideId", opts.IdeID)
	query.Set("timeout", fmt.Sprintf("%d", opts.TimeoutSeconds))

	if opts.User != "" {
		query.Set("requestUser", opts.User)
	}
	if opts.CheckConflict {
		query.Set("checkConflict", "true")
	}
	if opts.NotifyOnConflict {
		query.Set("isNotifiedOnConflict", "true")
	}

	// Long-polling request - use extended timeout via context
	httpTimeout := time.Duration(opts.TimeoutSeconds+30) * time.Second
	listenCtx, cancel := context.WithTimeout(ctx, httpTimeout)
	defer cancel()

	resp, err := c.transport.Request(listenCtx, "/sap/bc/adt/debugger/listeners", &RequestOptions{
		Method: http.MethodPost,
		Accept: "application/vnd.sap.as+xml",
		Query:  query,
	})
	if err != nil {
		// Check for conflict error
		if strings.Contains(err.Error(), "conflict") {
			return &ListenResult{
				Conflict: &ListenerConflict{
					ConflictText: err.Error(),
				},
			}, nil
		}
		return nil, fmt.Errorf("debugger listen failed: %w", err)
	}

	// Empty response = timeout
	if len(resp.Body) == 0 {
		return &ListenResult{TimedOut: true}, nil
	}

	// Parse debuggee response
	debuggee, err := parseDebuggeeResponse(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("parsing debuggee response: %w", err)
	}

	return &ListenResult{Debuggee: debuggee}, nil
}

// DebuggerCheckListener checks if there are active debug listeners.
// Returns nil if no listeners are active.
func (c *Client) DebuggerCheckListener(ctx context.Context, opts *ListenOptions) (*ListenerConflict, error) {
	if opts == nil {
		opts = &ListenOptions{}
	}
	if opts.DebuggingMode == "" {
		opts.DebuggingMode = DebuggingModeUser
	}
	if opts.IdeID == "" {
		opts.IdeID = "arc1"
	}
	if opts.TerminalID == "" {
		opts.TerminalID = getTerminalID()
	}

	query := url.Values{}
	query.Set("debuggingMode", string(opts.DebuggingMode))
	query.Set("terminalId", opts.TerminalID)
	query.Set("ideId", opts.IdeID)
	query.Set("checkConflict", "true")

	if opts.User != "" {
		query.Set("requestUser", opts.User)
	}

	_, err := c.transport.Request(ctx, "/sap/bc/adt/debugger/listeners", &RequestOptions{
		Method: http.MethodGet,
		Accept: "application/xml",
		Query:  query,
	})
	if err != nil {
		// 404 = no listeners active
		if strings.Contains(err.Error(), "404") {
			return nil, nil
		}
		// Conflict detected
		if strings.Contains(err.Error(), "conflict") || strings.Contains(err.Error(), "409") {
			return &ListenerConflict{ConflictText: err.Error()}, nil
		}
		return nil, fmt.Errorf("check listener failed: %w", err)
	}

	return nil, nil
}

// DebuggerStopListener stops an active debug listener.
func (c *Client) DebuggerStopListener(ctx context.Context, opts *ListenOptions) error {
	if opts == nil {
		opts = &ListenOptions{}
	}
	if opts.DebuggingMode == "" {
		opts.DebuggingMode = DebuggingModeUser
	}
	if opts.IdeID == "" {
		opts.IdeID = "arc1"
	}
	if opts.TerminalID == "" {
		opts.TerminalID = getTerminalID()
	}

	query := url.Values{}
	query.Set("debuggingMode", string(opts.DebuggingMode))
	query.Set("terminalId", opts.TerminalID)
	query.Set("ideId", opts.IdeID)

	if opts.User != "" {
		query.Set("requestUser", opts.User)
	}

	_, err := c.transport.Request(ctx, "/sap/bc/adt/debugger/listeners", &RequestOptions{
		Method: http.MethodDelete,
		Query:  query,
	})
	if err != nil {
		return fmt.Errorf("stop listener failed: %w", err)
	}

	return nil
}

// parseDebuggeeResponse parses the XML response containing debuggee information.
func parseDebuggeeResponse(data []byte) (*Debuggee, error) {
	if len(data) == 0 {
		return nil, nil
	}

	// Strip namespace prefixes
	xmlStr := string(data)
	xmlStr = strings.ReplaceAll(xmlStr, "asx:", "")
	xmlStr = strings.ReplaceAll(xmlStr, "abap:", "")

	// The response is in ABAP XML format: <abap><values><DATA><STPDA_DEBUGGEE>...</STPDA_DEBUGGEE></DATA></values></abap>
	type stpdaDebuggee struct {
		Client              int    `xml:"CLIENT"`
		DebuggeeID          string `xml:"DEBUGGEE_ID"`
		TerminalID          string `xml:"TERMINAL_ID"`
		IdeID               string `xml:"IDE_ID"`
		DebuggeeUser        string `xml:"DEBUGGEE_USER"`
		ProgramCurrent      string `xml:"PRG_CURR"`
		IncludeCurrent      string `xml:"INCL_CURR"`
		LineCurrent         int    `xml:"LINE_CURR"`
		RFCDest             string `xml:"RFCDEST"`
		AppServer           string `xml:"APPLSERVER"`
		SystemID            string `xml:"SYSID"`
		SystemNumber        int    `xml:"SYSNR"`
		Timestamp           int64  `xml:"TSTMP"`
		DebuggeeKind        string `xml:"DBGEE_KIND"`
		IsAttachImpossible  string `xml:"IS_ATTACH_IMPOSSIBLE"`
		IsSameServer        string `xml:"IS_SAME_SERVER"`
		InstanceName        string `xml:"INSTANCE_NAME"`
		DumpID              string `xml:"DUMP_ID"`
		DumpDate            string `xml:"DUMP_DATE"`
		DumpTime            string `xml:"DUMP_TIME"`
		DumpHost            string `xml:"DUMP_HOST"`
		DumpUser            string `xml:"DUMP_UNAME"`
		DumpClient          string `xml:"DUMP_CLIENT"`
		DumpURI             string `xml:"DUMP_URI"`
	}

	type abapResponse struct {
		XMLName xml.Name `xml:"abap"`
		Values  struct {
			Data struct {
				Debuggee stpdaDebuggee `xml:"STPDA_DEBUGGEE"`
			} `xml:"DATA"`
		} `xml:"values"`
	}

	var resp abapResponse
	if err := xml.Unmarshal([]byte(xmlStr), &resp); err != nil {
		return nil, fmt.Errorf("parsing debuggee XML: %w", err)
	}

	d := resp.Values.Data.Debuggee
	if d.DebuggeeID == "" {
		return nil, nil // No debuggee
	}

	debuggee := &Debuggee{
		ID:           d.DebuggeeID,
		Client:       d.Client,
		TerminalID:   d.TerminalID,
		IdeID:        d.IdeID,
		User:         d.DebuggeeUser,
		Program:      d.ProgramCurrent,
		Include:      d.IncludeCurrent,
		Line:         d.LineCurrent,
		RFCDest:      d.RFCDest,
		AppServer:    d.AppServer,
		SystemID:     d.SystemID,
		SystemNumber: d.SystemNumber,
		Timestamp:    d.Timestamp,
		InstanceName: d.InstanceName,
		DumpID:       d.DumpID,
		DumpDate:     d.DumpDate,
		DumpTime:     d.DumpTime,
		DumpHost:     d.DumpHost,
		DumpUser:     d.DumpUser,
		DumpClient:   d.DumpClient,
		DumpURI:      d.DumpURI,
	}

	// Parse kind
	switch d.DebuggeeKind {
	case "POSTMORTEM":
		debuggee.Kind = DebuggeeKindPostMortem
	case "POSTMORTEM_DIALOG":
		debuggee.Kind = DebuggeeKindPostMortemDialog
	default:
		debuggee.Kind = DebuggeeKindDebuggee
	}

	// Parse boolean flags
	debuggee.IsAttachable = d.IsAttachImpossible != "X"
	debuggee.IsSameServer = d.IsSameServer == "X"

	return debuggee, nil
}

// --- Debug Session Types ---

// DebugStepType represents the type of debug step operation.
type DebugStepType string

const (
	DebugStepInto       DebugStepType = "stepInto"
	DebugStepOver       DebugStepType = "stepOver"
	DebugStepReturn     DebugStepType = "stepReturn"
	DebugStepContinue   DebugStepType = "stepContinue"
	DebugStepRunToLine  DebugStepType = "stepRunToLine"
	DebugStepJumpToLine DebugStepType = "stepJumpToLine"
	DebugTerminate      DebugStepType = "terminateDebuggee"
)

// DebugSettings contains debugger session settings.
type DebugSettings struct {
	SystemDebugging       bool `json:"systemDebugging"`
	CreateExceptionObject bool `json:"createExceptionObject"`
	BackgroundRFC         bool `json:"backgroundRFC"`
	SharedObjectDebugging bool `json:"sharedObjectDebugging"`
	ShowDataAging         bool `json:"showDataAging"`
	UpdateDebugging       bool `json:"updateDebugging"`
}

// DebugAction represents an available debugger action.
type DebugAction struct {
	Name     string `json:"name"`
	Style    string `json:"style"`
	Group    string `json:"group"`
	Title    string `json:"title"`
	Link     string `json:"link"`
	Value    string `json:"value"`
	Disabled bool   `json:"disabled"`
}

// DebugReachedBreakpoint represents a breakpoint that was hit.
type DebugReachedBreakpoint struct {
	ID                              string `json:"id"`
	Kind                            string `json:"kind"`
	UnresolvableCondition           string `json:"unresolvableCondition,omitempty"`
	UnresolvableConditionErrorOffset string `json:"unresolvableConditionErrorOffset,omitempty"`
}

// DebugState contains the current debug session state.
type DebugState struct {
	IsRFC                       bool           `json:"isRfc"`
	IsSameSystem                bool           `json:"isSameSystem"`
	ServerName                  string         `json:"serverName"`
	DebugSessionID              string         `json:"debugSessionId"`
	ProcessID                   int            `json:"processId"`
	IsPostMortem                bool           `json:"isPostMortem"`
	IsUserAuthorizedForChanges  bool           `json:"isUserAuthorizedForChanges"`
	DebuggeeSessionID           string         `json:"debuggeeSessionId"`
	AbapTraceState              string         `json:"abapTraceState"`
	CanAdvancedTableFeatures    bool           `json:"canAdvancedTableFeatures"`
	IsNonExclusive              bool           `json:"isNonExclusive"`
	IsNonExclusiveToggled       bool           `json:"isNonExclusiveToggled"`
	GuiEditorGuid               string         `json:"guiEditorGuid"`
	SessionTitle                string         `json:"sessionTitle"`
	IsSteppingPossible          bool           `json:"isSteppingPossible"`
	IsTerminationPossible       bool           `json:"isTerminationPossible"`
	Actions                     []DebugAction  `json:"actions,omitempty"`
}

// DebugAttachResult contains the result of attaching to a debuggee.
type DebugAttachResult struct {
	DebugState
	ReachedBreakpoints []DebugReachedBreakpoint `json:"reachedBreakpoints,omitempty"`
}

// DebugStepResult contains the result of a step operation.
type DebugStepResult struct {
	DebugState
	IsDebuggeeChanged  bool                     `json:"isDebuggeeChanged"`
	Settings           DebugSettings            `json:"settings"`
	ReachedBreakpoints []DebugReachedBreakpoint `json:"reachedBreakpoints,omitempty"`
}

// DebugStackEntry represents a single entry in the call stack.
type DebugStackEntry struct {
	StackPosition int    `json:"stackPosition"`
	StackType     string `json:"stackType"`     // ABAP, DYNP, ENHANCEMENT
	StackURI      string `json:"stackUri"`
	ProgramName   string `json:"programName"`
	IncludeName   string `json:"includeName"`
	Line          int    `json:"line"`
	EventType     string `json:"eventType"`
	EventName     string `json:"eventName"`
	SourceType    string `json:"sourceType"`    // ABAP, DYNP, ST
	SystemProgram bool   `json:"systemProgram"`
	IsVit         bool   `json:"isVit"`
	URI           string `json:"uri"`
}

// DebugStackInfo contains the call stack information.
type DebugStackInfo struct {
	IsRFC                 bool              `json:"isRfc"`
	IsSameSystem          bool              `json:"isSameSystem"`
	ServerName            string            `json:"serverName"`
	DebugCursorStackIndex int               `json:"debugCursorStackIndex,omitempty"`
	Stack                 []DebugStackEntry `json:"stack"`
}

// DebugMetaType represents the metatype of a variable.
type DebugMetaType string

const (
	DebugMetaTypeSimple     DebugMetaType = "simple"
	DebugMetaTypeString     DebugMetaType = "string"
	DebugMetaTypeStructure  DebugMetaType = "structure"
	DebugMetaTypeTable      DebugMetaType = "table"
	DebugMetaTypeDataRef    DebugMetaType = "dataref"
	DebugMetaTypeObjectRef  DebugMetaType = "objectref"
	DebugMetaTypeClass      DebugMetaType = "class"
	DebugMetaTypeObject     DebugMetaType = "object"
	DebugMetaTypeBoxRef     DebugMetaType = "boxref"
	DebugMetaTypeBoxedComp  DebugMetaType = "boxedcomp"
	DebugMetaTypeAnonymComp DebugMetaType = "anonymcomp"
	DebugMetaTypeUnknown    DebugMetaType = "unknown"
)

// DebugVariable represents a variable in the debugger.
type DebugVariable struct {
	ID               string        `json:"id"`
	Name             string        `json:"name"`
	DeclaredTypeName string        `json:"declaredTypeName"`
	ActualTypeName   string        `json:"actualTypeName"`
	Kind             string        `json:"kind"`
	InstantiationKind string       `json:"instantiationKind"`
	AccessKind       string        `json:"accessKind"`
	MetaType         DebugMetaType `json:"metaType"`
	ParameterKind    string        `json:"parameterKind"`
	Value            string        `json:"value"`
	HexValue         string        `json:"hexValue,omitempty"`
	ReadOnly         bool          `json:"readOnly"`
	TechnicalType    string        `json:"technicalType"`
	Length           int           `json:"length"`
	TableBody        string        `json:"tableBody,omitempty"`
	TableLines       int           `json:"tableLines,omitempty"`
	IsValueIncomplete bool         `json:"isValueIncomplete"`
	IsException      bool          `json:"isException"`
	InheritanceLevel int           `json:"inheritanceLevel,omitempty"`
	InheritanceClass string        `json:"inheritanceClass,omitempty"`
}

// DebugVariableHierarchy represents a parent-child relationship between variables.
type DebugVariableHierarchy struct {
	ParentID  string `json:"parentId"`
	ChildID   string `json:"childId"`
	ChildName string `json:"childName"`
}

// DebugChildVariablesInfo contains child variables and their hierarchy.
type DebugChildVariablesInfo struct {
	Hierarchies []DebugVariableHierarchy `json:"hierarchies"`
	Variables   []DebugVariable          `json:"variables"`
}

// --- Debug Session API ---

// DebuggerAttach attaches to a debuggee that has hit a breakpoint.
// debuggeeId: The ID of the debuggee (from ListenResult.Debuggee.ID)
// user: Optional user for user-mode debugging
func (c *Client) DebuggerAttach(ctx context.Context, debuggeeID string, user string) (*DebugAttachResult, error) {
	query := url.Values{}
	query.Set("method", "attach")
	query.Set("debuggeeId", debuggeeID)
	query.Set("dynproDebugging", "true")
	query.Set("debuggingMode", string(DebuggingModeUser))
	if user != "" {
		query.Set("requestUser", user)
	}

	resp, err := c.transport.Request(ctx, "/sap/bc/adt/debugger", &RequestOptions{
		Method: http.MethodPost,
		Accept: "application/xml",
		Query:  query,
	})
	if err != nil {
		return nil, fmt.Errorf("debugger attach failed: %w", err)
	}

	return parseAttachResponse(resp.Body)
}

// DebuggerDetach terminates the current debug session.
// This releases the debuggee and ends the debugging session.
func (c *Client) DebuggerDetach(ctx context.Context) error {
	_, err := c.DebuggerStep(ctx, DebugTerminate, "")
	return err
}

// DebuggerStep performs a step operation in the debugger.
// stepType: One of stepInto, stepOver, stepReturn, stepContinue, stepRunToLine, stepJumpToLine, terminateDebuggee
// uri: Required for stepRunToLine and stepJumpToLine (target line URI)
func (c *Client) DebuggerStep(ctx context.Context, stepType DebugStepType, uri string) (*DebugStepResult, error) {
	query := url.Values{}
	query.Set("method", string(stepType))
	if uri != "" {
		query.Set("uri", uri)
	}

	resp, err := c.transport.Request(ctx, "/sap/bc/adt/debugger", &RequestOptions{
		Method: http.MethodPost,
		Accept: "application/xml",
		Query:  query,
	})
	if err != nil {
		return nil, fmt.Errorf("debugger step failed: %w", err)
	}

	return parseStepResponse(resp.Body)
}

// DebuggerGetStack retrieves the current call stack.
// semanticURIs: If true, returns semantic URIs that can be used for navigation
func (c *Client) DebuggerGetStack(ctx context.Context, semanticURIs bool) (*DebugStackInfo, error) {
	query := url.Values{}
	query.Set("method", "getStack")
	query.Set("emode", "_")
	if semanticURIs {
		query.Set("semanticURIs", "true")
	}

	resp, err := c.transport.Request(ctx, "/sap/bc/adt/debugger/stack", &RequestOptions{
		Method: http.MethodGet,
		Accept: "application/xml",
		Query:  query,
	})
	if err != nil {
		return nil, fmt.Errorf("debugger get stack failed: %w", err)
	}

	return parseStackResponse(resp.Body)
}

// DebuggerGetVariables retrieves the values of specific variables.
// variableIDs: List of variable IDs to retrieve (e.g., ["@ROOT", "@DATAAGING", "LV_COUNT"])
func (c *Client) DebuggerGetVariables(ctx context.Context, variableIDs []string) ([]DebugVariable, error) {
	if len(variableIDs) == 0 {
		return nil, fmt.Errorf("at least one variable ID required")
	}

	// Build request body
	var varElements []string
	for _, id := range variableIDs {
		varElements = append(varElements, fmt.Sprintf("<STPDA_ADT_VARIABLE><ID>%s</ID></STPDA_ADT_VARIABLE>", xmlEscape(id)))
	}

	body := fmt.Sprintf(`<?xml version="1.0" encoding="UTF-8"?><asx:abap xmlns:asx="http://www.sap.com/abapxml" version="1.0"><asx:values><DATA>%s</DATA></asx:values></asx:abap>`,
		strings.Join(varElements, ""))

	resp, err := c.transport.Request(ctx, "/sap/bc/adt/debugger", &RequestOptions{
		Method:      http.MethodPost,
		ContentType: "application/vnd.sap.as+xml;charset=UTF-8;dataname=com.sap.adt.debugger.Variables",
		Accept:      "application/vnd.sap.as+xml;charset=UTF-8;dataname=com.sap.adt.debugger.Variables",
		Query:       url.Values{"method": []string{"getVariables"}},
		Body:        []byte(body),
	})
	if err != nil {
		return nil, fmt.Errorf("debugger get variables failed: %w", err)
	}

	return parseVariablesResponse(resp.Body)
}

// DebuggerGetChildVariables retrieves child variables (for expanding structures/tables).
// parentIDs: List of parent variable IDs (e.g., ["@ROOT", "@DATAAGING"] for top-level)
func (c *Client) DebuggerGetChildVariables(ctx context.Context, parentIDs []string) (*DebugChildVariablesInfo, error) {
	if len(parentIDs) == 0 {
		parentIDs = []string{"@ROOT", "@DATAAGING"}
	}

	// Build request body
	var hierElements []string
	for _, id := range parentIDs {
		hierElements = append(hierElements, fmt.Sprintf("<STPDA_ADT_VARIABLE_HIERARCHY><PARENT_ID>%s</PARENT_ID></STPDA_ADT_VARIABLE_HIERARCHY>", xmlEscape(id)))
	}

	body := fmt.Sprintf(`<?xml version="1.0" encoding="UTF-8"?><asx:abap xmlns:asx="http://www.sap.com/abapxml" version="1.0"><asx:values><DATA><HIERARCHIES>%s</HIERARCHIES></DATA></asx:values></asx:abap>`,
		strings.Join(hierElements, ""))

	resp, err := c.transport.Request(ctx, "/sap/bc/adt/debugger", &RequestOptions{
		Method:      http.MethodPost,
		ContentType: "application/vnd.sap.as+xml;charset=UTF-8;dataname=com.sap.adt.debugger.ChildVariables",
		Accept:      "application/vnd.sap.as+xml;charset=UTF-8;dataname=com.sap.adt.debugger.ChildVariables",
		Query:       url.Values{"method": []string{"getChildVariables"}},
		Body:        []byte(body),
	})
	if err != nil {
		return nil, fmt.Errorf("debugger get child variables failed: %w", err)
	}

	return parseChildVariablesResponse(resp.Body)
}

// DebuggerSetVariableValue modifies the value of a variable during debugging.
// variableName: The name of the variable to modify
// value: The new value as a string
func (c *Client) DebuggerSetVariableValue(ctx context.Context, variableName, value string) (string, error) {
	query := url.Values{}
	query.Set("method", "setVariableValue")
	query.Set("variableName", variableName)

	resp, err := c.transport.Request(ctx, "/sap/bc/adt/debugger", &RequestOptions{
		Method: http.MethodPost,
		Query:  query,
		Body:   []byte(value),
	})
	if err != nil {
		return "", fmt.Errorf("debugger set variable value failed: %w", err)
	}

	return string(resp.Body), nil
}

// DebuggerGoToStack navigates to a specific stack entry.
// stackURI: The stack URI (e.g., "/sap/bc/adt/debugger/stack/type/ABAP/position/3")
func (c *Client) DebuggerGoToStack(ctx context.Context, stackURI string) error {
	_, err := c.transport.Request(ctx, stackURI, &RequestOptions{
		Method: http.MethodPut,
	})
	if err != nil {
		return fmt.Errorf("debugger go to stack failed: %w", err)
	}
	return nil
}

// --- Parse Functions ---

func parseAttachResponse(data []byte) (*DebugAttachResult, error) {
	if len(data) == 0 {
		return nil, fmt.Errorf("empty attach response")
	}

	// Strip namespace prefixes
	xmlStr := string(data)
	xmlStr = strings.ReplaceAll(xmlStr, "dbg:", "")

	type xmlAction struct {
		Name     string `xml:"name,attr"`
		Style    string `xml:"style,attr"`
		Group    string `xml:"group,attr"`
		Title    string `xml:"title,attr"`
		Link     string `xml:"link,attr"`
		Value    string `xml:"value,attr"`
		Disabled bool   `xml:"disabled,attr"`
	}

	type xmlBreakpoint struct {
		ID                              string `xml:"id,attr"`
		Kind                            string `xml:"kind,attr"`
		UnresolvableCondition           string `xml:"unresolvableCondition,attr"`
		UnresolvableConditionErrorOffset string `xml:"unresolvableConditionErrorOffset,attr"`
	}

	type xmlAttach struct {
		XMLName                    xml.Name        `xml:"attach"`
		IsRFC                      bool            `xml:"isRfc,attr"`
		IsSameSystem               bool            `xml:"isSameSystem,attr"`
		ServerName                 string          `xml:"serverName,attr"`
		DebugSessionID             string          `xml:"debugSessionId,attr"`
		ProcessID                  int             `xml:"processId,attr"`
		IsPostMortem               bool            `xml:"isPostMortem,attr"`
		IsUserAuthorizedForChanges bool            `xml:"isUserAuthorizedForChanges,attr"`
		DebuggeeSessionID          string          `xml:"debuggeeSessionId,attr"`
		AbapTraceState             string          `xml:"abapTraceState,attr"`
		CanAdvancedTableFeatures   bool            `xml:"canAdvancedTableFeatures,attr"`
		IsNonExclusive             bool            `xml:"isNonExclusive,attr"`
		IsNonExclusiveToggled      bool            `xml:"isNonExclusiveToggled,attr"`
		GuiEditorGuid              string          `xml:"guiEditorGuid,attr"`
		SessionTitle               string          `xml:"sessionTitle,attr"`
		IsSteppingPossible         bool            `xml:"isSteppingPossible,attr"`
		IsTerminationPossible      bool            `xml:"isTerminationPossible,attr"`
		Actions                    struct {
			Action []xmlAction `xml:"action"`
		} `xml:"actions"`
		ReachedBreakpoints struct {
			Breakpoint []xmlBreakpoint `xml:"breakpoint"`
		} `xml:"reachedBreakpoints"`
	}

	var resp xmlAttach
	if err := xml.Unmarshal([]byte(xmlStr), &resp); err != nil {
		return nil, fmt.Errorf("parsing attach response: %w", err)
	}

	result := &DebugAttachResult{
		DebugState: DebugState{
			IsRFC:                      resp.IsRFC,
			IsSameSystem:               resp.IsSameSystem,
			ServerName:                 resp.ServerName,
			DebugSessionID:             resp.DebugSessionID,
			ProcessID:                  resp.ProcessID,
			IsPostMortem:               resp.IsPostMortem,
			IsUserAuthorizedForChanges: resp.IsUserAuthorizedForChanges,
			DebuggeeSessionID:          resp.DebuggeeSessionID,
			AbapTraceState:             resp.AbapTraceState,
			CanAdvancedTableFeatures:   resp.CanAdvancedTableFeatures,
			IsNonExclusive:             resp.IsNonExclusive,
			IsNonExclusiveToggled:      resp.IsNonExclusiveToggled,
			GuiEditorGuid:              resp.GuiEditorGuid,
			SessionTitle:               resp.SessionTitle,
			IsSteppingPossible:         resp.IsSteppingPossible,
			IsTerminationPossible:      resp.IsTerminationPossible,
		},
	}

	// Parse actions
	for _, a := range resp.Actions.Action {
		result.Actions = append(result.Actions, DebugAction{
			Name:     a.Name,
			Style:    a.Style,
			Group:    a.Group,
			Title:    a.Title,
			Link:     a.Link,
			Value:    a.Value,
			Disabled: a.Disabled,
		})
	}

	// Parse reached breakpoints
	for _, bp := range resp.ReachedBreakpoints.Breakpoint {
		result.ReachedBreakpoints = append(result.ReachedBreakpoints, DebugReachedBreakpoint{
			ID:                              bp.ID,
			Kind:                            bp.Kind,
			UnresolvableCondition:           bp.UnresolvableCondition,
			UnresolvableConditionErrorOffset: bp.UnresolvableConditionErrorOffset,
		})
	}

	return result, nil
}

func parseStepResponse(data []byte) (*DebugStepResult, error) {
	if len(data) == 0 {
		return nil, fmt.Errorf("empty step response")
	}

	// Strip namespace prefixes
	xmlStr := string(data)
	xmlStr = strings.ReplaceAll(xmlStr, "dbg:", "")

	type xmlAction struct {
		Name     string `xml:"name,attr"`
		Style    string `xml:"style,attr"`
		Group    string `xml:"group,attr"`
		Title    string `xml:"title,attr"`
		Link     string `xml:"link,attr"`
		Value    string `xml:"value,attr"`
		Disabled bool   `xml:"disabled,attr"`
	}

	type xmlSettings struct {
		SystemDebugging       bool `xml:"systemDebugging,attr"`
		CreateExceptionObject bool `xml:"createExceptionObject,attr"`
		BackgroundRFC         bool `xml:"backgroundRFC,attr"`
		SharedObjectDebugging bool `xml:"sharedObjectDebugging,attr"`
		ShowDataAging         bool `xml:"showDataAging,attr"`
		UpdateDebugging       bool `xml:"updateDebugging,attr"`
	}

	type xmlBreakpoint struct {
		ID   string `xml:"id,attr"`
		Kind string `xml:"kind,attr"`
	}

	type xmlStep struct {
		XMLName                    xml.Name     `xml:"step"`
		IsRFC                      bool         `xml:"isRfc,attr"`
		IsSameSystem               bool         `xml:"isSameSystem,attr"`
		ServerName                 string       `xml:"serverName,attr"`
		DebugSessionID             string       `xml:"debugSessionId,attr"`
		ProcessID                  int          `xml:"processId,attr"`
		IsPostMortem               bool         `xml:"isPostMortem,attr"`
		IsUserAuthorizedForChanges bool         `xml:"isUserAuthorizedForChanges,attr"`
		DebuggeeSessionID          string       `xml:"debuggeeSessionId,attr"`
		AbapTraceState             string       `xml:"abapTraceState,attr"`
		CanAdvancedTableFeatures   bool         `xml:"canAdvancedTableFeatures,attr"`
		IsNonExclusive             bool         `xml:"isNonExclusive,attr"`
		IsNonExclusiveToggled      bool         `xml:"isNonExclusiveToggled,attr"`
		GuiEditorGuid              string       `xml:"guiEditorGuid,attr"`
		SessionTitle               string       `xml:"sessionTitle,attr"`
		IsSteppingPossible         bool         `xml:"isSteppingPossible,attr"`
		IsTerminationPossible      bool         `xml:"isTerminationPossible,attr"`
		IsDebuggeeChanged          bool         `xml:"isDebuggeeChanged,attr"`
		Settings                   xmlSettings  `xml:"settings"`
		Actions                    struct {
			Action []xmlAction `xml:"action"`
		} `xml:"actions"`
		ReachedBreakpoints struct {
			Breakpoint []xmlBreakpoint `xml:"breakpoint"`
		} `xml:"reachedBreakpoints"`
	}

	var resp xmlStep
	if err := xml.Unmarshal([]byte(xmlStr), &resp); err != nil {
		return nil, fmt.Errorf("parsing step response: %w", err)
	}

	result := &DebugStepResult{
		DebugState: DebugState{
			IsRFC:                      resp.IsRFC,
			IsSameSystem:               resp.IsSameSystem,
			ServerName:                 resp.ServerName,
			DebugSessionID:             resp.DebugSessionID,
			ProcessID:                  resp.ProcessID,
			IsPostMortem:               resp.IsPostMortem,
			IsUserAuthorizedForChanges: resp.IsUserAuthorizedForChanges,
			DebuggeeSessionID:          resp.DebuggeeSessionID,
			AbapTraceState:             resp.AbapTraceState,
			CanAdvancedTableFeatures:   resp.CanAdvancedTableFeatures,
			IsNonExclusive:             resp.IsNonExclusive,
			IsNonExclusiveToggled:      resp.IsNonExclusiveToggled,
			GuiEditorGuid:              resp.GuiEditorGuid,
			SessionTitle:               resp.SessionTitle,
			IsSteppingPossible:         resp.IsSteppingPossible,
			IsTerminationPossible:      resp.IsTerminationPossible,
		},
		IsDebuggeeChanged: resp.IsDebuggeeChanged,
		Settings: DebugSettings{
			SystemDebugging:       resp.Settings.SystemDebugging,
			CreateExceptionObject: resp.Settings.CreateExceptionObject,
			BackgroundRFC:         resp.Settings.BackgroundRFC,
			SharedObjectDebugging: resp.Settings.SharedObjectDebugging,
			ShowDataAging:         resp.Settings.ShowDataAging,
			UpdateDebugging:       resp.Settings.UpdateDebugging,
		},
	}

	// Parse actions
	for _, a := range resp.Actions.Action {
		result.Actions = append(result.Actions, DebugAction{
			Name:     a.Name,
			Style:    a.Style,
			Group:    a.Group,
			Title:    a.Title,
			Link:     a.Link,
			Value:    a.Value,
			Disabled: a.Disabled,
		})
	}

	// Parse reached breakpoints
	for _, bp := range resp.ReachedBreakpoints.Breakpoint {
		result.ReachedBreakpoints = append(result.ReachedBreakpoints, DebugReachedBreakpoint{
			ID:   bp.ID,
			Kind: bp.Kind,
		})
	}

	return result, nil
}

func parseStackResponse(data []byte) (*DebugStackInfo, error) {
	if len(data) == 0 {
		return nil, fmt.Errorf("empty stack response")
	}

	// Strip namespace prefixes
	xmlStr := string(data)
	xmlStr = strings.ReplaceAll(xmlStr, "dbg:", "")

	type xmlStackEntry struct {
		StackPosition int    `xml:"stackPosition,attr"`
		StackType     string `xml:"stackType,attr"`
		StackURI      string `xml:"stackUri,attr"`
		ProgramName   string `xml:"programName,attr"`
		IncludeName   string `xml:"includeName,attr"`
		Line          int    `xml:"line,attr"`
		EventType     string `xml:"eventType,attr"`
		EventName     string `xml:"eventName,attr"`
		SourceType    string `xml:"sourceType,attr"`
		SystemProgram bool   `xml:"systemProgram,attr"`
		IsVit         bool   `xml:"isVit,attr"`
		URI           string `xml:"uri,attr"`
	}

	type xmlStack struct {
		XMLName               xml.Name        `xml:"stack"`
		IsRFC                 bool            `xml:"isRfc,attr"`
		IsSameSystem          bool            `xml:"isSameSystem,attr"`
		ServerName            string          `xml:"serverName,attr"`
		DebugCursorStackIndex int             `xml:"debugCursorStackIndex,attr"`
		StackEntry            []xmlStackEntry `xml:"stackEntry"`
	}

	var resp xmlStack
	if err := xml.Unmarshal([]byte(xmlStr), &resp); err != nil {
		return nil, fmt.Errorf("parsing stack response: %w", err)
	}

	result := &DebugStackInfo{
		IsRFC:                 resp.IsRFC,
		IsSameSystem:          resp.IsSameSystem,
		ServerName:            resp.ServerName,
		DebugCursorStackIndex: resp.DebugCursorStackIndex,
	}

	for _, e := range resp.StackEntry {
		result.Stack = append(result.Stack, DebugStackEntry{
			StackPosition: e.StackPosition,
			StackType:     e.StackType,
			StackURI:      e.StackURI,
			ProgramName:   e.ProgramName,
			IncludeName:   e.IncludeName,
			Line:          e.Line,
			EventType:     e.EventType,
			EventName:     e.EventName,
			SourceType:    e.SourceType,
			SystemProgram: e.SystemProgram,
			IsVit:         e.IsVit,
			URI:           e.URI,
		})
	}

	return result, nil
}

func parseVariablesResponse(data []byte) ([]DebugVariable, error) {
	if len(data) == 0 {
		return nil, nil
	}

	// Strip namespace prefixes
	xmlStr := string(data)
	xmlStr = strings.ReplaceAll(xmlStr, "asx:", "")

	type xmlVariable struct {
		ID                string `xml:"ID"`
		Name              string `xml:"NAME"`
		DeclaredTypeName  string `xml:"DECLARED_TYPE_NAME"`
		ActualTypeName    string `xml:"ACTUAL_TYPE_NAME"`
		Kind              string `xml:"KIND"`
		InstantiationKind string `xml:"INSTANTIATION_KIND"`
		AccessKind        string `xml:"ACCESS_KIND"`
		MetaType          string `xml:"META_TYPE"`
		ParameterKind     string `xml:"PARAMETER_KIND"`
		Value             string `xml:"VALUE"`
		HexValue          string `xml:"HEX_VALUE"`
		ReadOnly          string `xml:"READ_ONLY"`
		TechnicalType     string `xml:"TECHNICAL_TYPE"`
		Length            int    `xml:"LENGTH"`
		TableBody         string `xml:"TABLE_BODY"`
		TableLines        int    `xml:"TABLE_LINES"`
		IsValueIncomplete string `xml:"IS_VALUE_INCOMPLETE"`
		IsException       string `xml:"IS_EXCEPTION"`
		InheritanceLevel  int    `xml:"INHERITANCE_LEVEL"`
		InheritanceClass  string `xml:"INHERITANCE_CLASS"`
	}

	type xmlAbap struct {
		XMLName xml.Name `xml:"abap"`
		Values  struct {
			Data struct {
				Variables []xmlVariable `xml:"STPDA_ADT_VARIABLE"`
			} `xml:"DATA"`
		} `xml:"values"`
	}

	var resp xmlAbap
	if err := xml.Unmarshal([]byte(xmlStr), &resp); err != nil {
		return nil, fmt.Errorf("parsing variables response: %w", err)
	}

	var result []DebugVariable
	for _, v := range resp.Values.Data.Variables {
		result = append(result, DebugVariable{
			ID:                v.ID,
			Name:              v.Name,
			DeclaredTypeName:  v.DeclaredTypeName,
			ActualTypeName:    v.ActualTypeName,
			Kind:              v.Kind,
			InstantiationKind: v.InstantiationKind,
			AccessKind:        v.AccessKind,
			MetaType:          DebugMetaType(v.MetaType),
			ParameterKind:     v.ParameterKind,
			Value:             v.Value,
			HexValue:          v.HexValue,
			ReadOnly:          v.ReadOnly == "X",
			TechnicalType:     v.TechnicalType,
			Length:            v.Length,
			TableBody:         v.TableBody,
			TableLines:        v.TableLines,
			IsValueIncomplete: v.IsValueIncomplete == "X",
			IsException:       v.IsException == "X",
			InheritanceLevel:  v.InheritanceLevel,
			InheritanceClass:  v.InheritanceClass,
		})
	}

	return result, nil
}

func parseChildVariablesResponse(data []byte) (*DebugChildVariablesInfo, error) {
	if len(data) == 0 {
		return nil, nil
	}

	// Strip namespace prefixes
	xmlStr := string(data)
	xmlStr = strings.ReplaceAll(xmlStr, "asx:", "")

	type xmlHierarchy struct {
		ParentID  string `xml:"PARENT_ID"`
		ChildID   string `xml:"CHILD_ID"`
		ChildName string `xml:"CHILD_NAME"`
	}

	type xmlVariable struct {
		ID                string `xml:"ID"`
		Name              string `xml:"NAME"`
		DeclaredTypeName  string `xml:"DECLARED_TYPE_NAME"`
		ActualTypeName    string `xml:"ACTUAL_TYPE_NAME"`
		Kind              string `xml:"KIND"`
		InstantiationKind string `xml:"INSTANTIATION_KIND"`
		AccessKind        string `xml:"ACCESS_KIND"`
		MetaType          string `xml:"META_TYPE"`
		ParameterKind     string `xml:"PARAMETER_KIND"`
		Value             string `xml:"VALUE"`
		HexValue          string `xml:"HEX_VALUE"`
		ReadOnly          string `xml:"READ_ONLY"`
		TechnicalType     string `xml:"TECHNICAL_TYPE"`
		Length            int    `xml:"LENGTH"`
		TableBody         string `xml:"TABLE_BODY"`
		TableLines        int    `xml:"TABLE_LINES"`
		IsValueIncomplete string `xml:"IS_VALUE_INCOMPLETE"`
		IsException       string `xml:"IS_EXCEPTION"`
		InheritanceLevel  int    `xml:"INHERITANCE_LEVEL"`
		InheritanceClass  string `xml:"INHERITANCE_CLASS"`
	}

	type xmlAbap struct {
		XMLName xml.Name `xml:"abap"`
		Values  struct {
			Data struct {
				Hierarchies struct {
					Hierarchy []xmlHierarchy `xml:"STPDA_ADT_VARIABLE_HIERARCHY"`
				} `xml:"HIERARCHIES"`
				Variables struct {
					Variable []xmlVariable `xml:"STPDA_ADT_VARIABLE"`
				} `xml:"VARIABLES"`
			} `xml:"DATA"`
		} `xml:"values"`
	}

	var resp xmlAbap
	if err := xml.Unmarshal([]byte(xmlStr), &resp); err != nil {
		return nil, fmt.Errorf("parsing child variables response: %w", err)
	}

	result := &DebugChildVariablesInfo{}

	for _, h := range resp.Values.Data.Hierarchies.Hierarchy {
		result.Hierarchies = append(result.Hierarchies, DebugVariableHierarchy{
			ParentID:  h.ParentID,
			ChildID:   h.ChildID,
			ChildName: h.ChildName,
		})
	}

	for _, v := range resp.Values.Data.Variables.Variable {
		result.Variables = append(result.Variables, DebugVariable{
			ID:                v.ID,
			Name:              v.Name,
			DeclaredTypeName:  v.DeclaredTypeName,
			ActualTypeName:    v.ActualTypeName,
			Kind:              v.Kind,
			InstantiationKind: v.InstantiationKind,
			AccessKind:        v.AccessKind,
			MetaType:          DebugMetaType(v.MetaType),
			ParameterKind:     v.ParameterKind,
			Value:             v.Value,
			HexValue:          v.HexValue,
			ReadOnly:          v.ReadOnly == "X",
			TechnicalType:     v.TechnicalType,
			Length:            v.Length,
			TableBody:         v.TableBody,
			TableLines:        v.TableLines,
			IsValueIncomplete: v.IsValueIncomplete == "X",
			IsException:       v.IsException == "X",
			InheritanceLevel:  v.InheritanceLevel,
			InheritanceClass:  v.InheritanceClass,
		})
	}

	return result, nil
}

// IsComplexType returns true if the variable has a complex type that can be expanded.
func (v *DebugVariable) IsComplexType() bool {
	switch v.MetaType {
	case DebugMetaTypeStructure, DebugMetaTypeTable, DebugMetaTypeDataRef,
		DebugMetaTypeObjectRef, DebugMetaTypeClass, DebugMetaTypeObject, DebugMetaTypeBoxRef:
		return true
	default:
		return false
	}
}

// --- Batch Debugger API (Eclipse-compatible) ---

// DebugBatchOperation represents a single operation in a batch request.
type DebugBatchOperation struct {
	Method      string            // HTTP method (POST, GET)
	Path        string            // Path with query params (e.g., "/sap/bc/adt/debugger?method=stepOver")
	ContentType string            // Content-Type header (optional)
	Accept      string            // Accept header
	Body        string            // Request body (optional)
}

// DebugBatchResponse represents a single response from a batch request.
type DebugBatchResponse struct {
	StatusCode  int
	ContentType string
	Body        []byte
}

// DebuggerBatchRequest sends multiple debugger operations in a single batch request.
// This matches the Eclipse ADT debugging protocol.
func (c *Client) DebuggerBatchRequest(ctx context.Context, operations []DebugBatchOperation) ([]DebugBatchResponse, error) {
	if len(operations) == 0 {
		return nil, fmt.Errorf("no operations provided")
	}

	// Generate unique boundary
	boundary := fmt.Sprintf("batch_%s", generateBoundary())

	// Build multipart body
	var body strings.Builder
	for _, op := range operations {
		body.WriteString("--")
		body.WriteString(boundary)
		body.WriteString("\r\n")
		body.WriteString("Content-Type: application/http\r\n")
		body.WriteString("content-transfer-encoding: binary\r\n")
		body.WriteString("\r\n")

		// HTTP request line
		method := op.Method
		if method == "" {
			method = "POST"
		}
		body.WriteString(fmt.Sprintf("%s %s HTTP/1.1\r\n", method, op.Path))

		// Headers
		if op.Accept != "" {
			body.WriteString(fmt.Sprintf("Accept:%s\r\n", op.Accept))
		} else {
			body.WriteString("Accept:application/xml\r\n")
		}
		if op.ContentType != "" {
			body.WriteString(fmt.Sprintf("Content-Type:%s\r\n", op.ContentType))
		}

		body.WriteString("\r\n")

		// Body
		if op.Body != "" {
			body.WriteString(op.Body)
		}

		body.WriteString("\r\n")
	}
	body.WriteString("--")
	body.WriteString(boundary)
	body.WriteString("--")

	// Send batch request
	contentType := fmt.Sprintf("multipart/mixed; boundary=%s", boundary)
	resp, err := c.transport.Request(ctx, "/sap/bc/adt/debugger/batch", &RequestOptions{
		Method:      http.MethodPost,
		ContentType: contentType,
		Accept:      "multipart/mixed",
		Body:        []byte(body.String()),
		Headers: map[string]string{
			"User-Agent":          "arc1/1.0 (compatible; Eclipse ADT)",
			"X-sap-adt-profiling": "server-time",
		},
	})
	if err != nil {
		return nil, fmt.Errorf("batch request failed: %w", err)
	}

	// Parse multipart response
	respContentType := resp.Headers.Get("Content-Type")
	return parseBatchResponse(resp.Body, respContentType)
}

// generateBoundary creates a unique boundary string for multipart requests.
func generateBoundary() string {
	b := make([]byte, 16)
	for i := range b {
		b[i] = byte(time.Now().UnixNano() >> (i * 4) & 0xff)
	}
	return hex.EncodeToString(b)
}

// parseBatchResponse parses a multipart/mixed response from a batch request.
func parseBatchResponse(body []byte, contentType string) ([]DebugBatchResponse, error) {
	// Extract boundary from Content-Type
	boundary := ""
	for _, part := range strings.Split(contentType, ";") {
		part = strings.TrimSpace(part)
		if strings.HasPrefix(part, "boundary=") {
			boundary = strings.TrimPrefix(part, "boundary=")
			break
		}
	}

	if boundary == "" {
		// Not multipart, return single response
		return []DebugBatchResponse{{
			StatusCode: 200,
			Body:       body,
		}}, nil
	}

	// Split by boundary
	parts := strings.Split(string(body), "--"+boundary)
	var responses []DebugBatchResponse

	for _, part := range parts {
		part = strings.TrimSpace(part)
		if part == "" || part == "--" {
			continue
		}

		// Parse HTTP response from part
		resp := DebugBatchResponse{StatusCode: 200}

		// Find headers/body separator
		idx := strings.Index(part, "\r\n\r\n")
		if idx == -1 {
			idx = strings.Index(part, "\n\n")
		}

		if idx != -1 {
			// Skip the content-type/transfer-encoding headers of the multipart part
			remaining := part[idx+4:]

			// Now find the actual HTTP response
			httpIdx := strings.Index(remaining, "\r\n\r\n")
			if httpIdx == -1 {
				httpIdx = strings.Index(remaining, "\n\n")
			}

			if httpIdx != -1 {
				resp.Body = []byte(remaining[httpIdx+4:])
			} else {
				resp.Body = []byte(remaining)
			}
		}

		responses = append(responses, resp)
	}

	return responses, nil
}

// DebuggerStepWithBatch performs a step operation and retrieves stack+variables in one batch.
// This matches Eclipse's behavior of combining multiple operations.
func (c *Client) DebuggerStepWithBatch(ctx context.Context, stepType DebugStepType, uri string) (*DebugStepResult, *DebugStackInfo, []DebugVariable, error) {
	operations := []DebugBatchOperation{
		{
			Path:   fmt.Sprintf("/sap/bc/adt/debugger?method=%s", stepType),
			Accept: "application/xml",
		},
		{
			Path:   "/sap/bc/adt/debugger?emode=_&semanticURIs=true&method=getStack",
			Accept: "application/xml",
		},
		{
			Path:        "/sap/bc/adt/debugger?method=getChildVariables",
			Accept:      "application/vnd.sap.as+xml;charset=UTF-8;dataname=com.sap.adt.debugger.ChildVariables",
			ContentType: "application/vnd.sap.as+xml; charset=UTF-8; dataname=com.sap.adt.debugger.ChildVariables",
			Body: `<?xml version="1.0" encoding="UTF-8" ?><asx:abap version="1.0" xmlns:asx="http://www.sap.com/abapxml"><asx:values><DATA><HIERARCHIES><STPDA_ADT_VARIABLE_HIERARCHY><PARENT_ID>@ROOT</PARENT_ID></STPDA_ADT_VARIABLE_HIERARCHY></HIERARCHIES></DATA></asx:values></asx:abap>`,
		},
		{
			Path:        "/sap/bc/adt/debugger?method=getVariables",
			Accept:      "application/vnd.sap.as+xml;charset=UTF-8;dataname=com.sap.adt.debugger.Variables",
			ContentType: "application/vnd.sap.as+xml; charset=UTF-8; dataname=com.sap.adt.debugger.Variables",
			Body: `<?xml version="1.0" encoding="UTF-8" ?><asx:abap version="1.0" xmlns:asx="http://www.sap.com/abapxml"><asx:values><DATA><STPDA_ADT_VARIABLE><ID>SY-SUBRC</ID></STPDA_ADT_VARIABLE></DATA></asx:values></asx:abap>`,
		},
	}

	if uri != "" {
		operations[0].Path = fmt.Sprintf("/sap/bc/adt/debugger?method=%s&uri=%s", stepType, url.QueryEscape(uri))
	}

	responses, err := c.DebuggerBatchRequest(ctx, operations)
	if err != nil {
		return nil, nil, nil, err
	}

	// Parse responses (best effort)
	var stepResult *DebugStepResult
	var stackInfo *DebugStackInfo
	var variables []DebugVariable

	if len(responses) > 0 && len(responses[0].Body) > 0 {
		stepResult, _ = parseStepResponse(responses[0].Body)
	}
	if len(responses) > 1 && len(responses[1].Body) > 0 {
		stackInfo, _ = parseStackResponse(responses[1].Body)
	}
	// Variables parsing would go here if needed

	return stepResult, stackInfo, variables, nil
}

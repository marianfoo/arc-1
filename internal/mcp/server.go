// Package mcp provides the MCP server implementation for ABAP ADT tools.
package mcp

import (
	"crypto/subtle"
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"

	"github.com/mark3labs/mcp-go/mcp"
	"github.com/mark3labs/mcp-go/server"
	"github.com/marianfoo/arc-1/pkg/adt"
)

const (
	// DefaultStreamableHTTPAddr is the default listen address for streamable HTTP transport.
	DefaultStreamableHTTPAddr = "127.0.0.1:8080"
	// DefaultStreamableHTTPPath is the MCP endpoint path for streamable HTTP transport.
	DefaultStreamableHTTPPath = "/mcp"
)

type streamableHTTPStarter interface {
	http.Handler
	Start(addr string) error
}

var serveStdioFunc = func(mcpServer *server.MCPServer) error {
	return server.ServeStdio(mcpServer)
}

var newStreamableHTTPServerFunc = func(mcpServer *server.MCPServer, opts ...server.StreamableHTTPOption) streamableHTTPStarter {
	return server.NewStreamableHTTPServer(mcpServer, opts...)
}

var listenAndServeFunc = func(addr string, handler http.Handler) error {
	return (&http.Server{Addr: addr, Handler: handler}).ListenAndServe()
}

// Server wraps the MCP server with ADT client.
type Server struct {
	mcpServer     *server.MCPServer
	adtClient     *adt.Client
	config        *Config          // Server configuration
	featureProber *adt.FeatureProber // Feature detection system (safety network)
	featureConfig adt.FeatureConfig  // Feature configuration
}

// Config holds MCP server configuration.
type Config struct {
	// SAP connection settings
	BaseURL            string
	Username           string
	Password           string
	Client             string
	Language           string
	InsecureSkipVerify bool

	// Cookie authentication (alternative to basic auth)
	Cookies map[string]string

	// Verbose output
	Verbose bool

	// Transport mode: stdio (default) or http-streamable
	Transport string

	// HTTPAddr is the listen address for the http-streamable transport (default: 127.0.0.1:8080).
	// Set to 0.0.0.0:8080 when running in Docker or to accept remote connections.
	HTTPAddr string

	// Safety configuration
	ReadOnly         bool
	BlockFreeSQL     bool
	AllowedOps       string
	DisallowedOps    string
	AllowedPackages  []string
	EnableTransports        bool     // Explicitly enable transport management (default: disabled)
	TransportReadOnly       bool     // Only allow read operations on transports (list, get)
	AllowedTransports       []string // Whitelist specific transports (supports wildcards like "A4HK*")
	AllowTransportableEdits bool     // Allow editing objects that require transport requests

	// Feature configuration (safety network)
	// Values: "auto" (default, probe system), "on" (force enabled), "off" (force disabled)
	FeatureHANA      string // HANA database detection (required for some AMDP features)
	FeatureAbapGit   string // abapGit integration
	FeatureRAP       string // RAP/OData development (DDLS, BDEF, SRVD, SRVB)
	FeatureAMDP      string // AMDP/HANA debugger
	FeatureUI5       string // UI5/Fiori BSP management
	FeatureTransport string // CTS transport management (distinct from EnableTransports safety)

	// X.509 client certificate authentication (mTLS)
	ClientCertFile string // Path to PEM client certificate
	ClientKeyFile  string // Path to PEM private key
	CACertFile     string // Path to PEM CA certificate (for custom CAs)

	// OAuth2/XSUAA authentication (for BTP/Cloud systems)
	ServiceKeyFile    string // Path to service key JSON file
	OAuthURL          string // OAuth2 token endpoint URL
	OAuthClientID     string // OAuth2 client ID
	OAuthClientSecret string // OAuth2 client secret

	// OIDC token validation (for incoming MCP HTTP requests)
	OIDCIssuer        string // OIDC issuer URL (e.g., https://login.microsoftonline.com/{tenant}/v2.0)
	OIDCAudience      string // Expected audience claim
	OIDCUsernameClaim string // JWT claim for SAP username (default: preferred_username)
	OIDCUserMapping   string // Path to username mapping YAML file

	// Principal propagation (OIDC identity → ephemeral X.509 cert → SAP mTLS)
	PPCAKeyFile  string // CA private key for signing ephemeral certs
	PPCACertFile string // CA certificate (must be trusted in SAP STRUST)
	PPCertTTL    string // Certificate validity duration (e.g., "5m")

	// API Key authentication (for centralized HTTP Streamable deployment)
	APIKey string // Shared API key for authenticating MCP clients

	// Debugger configuration
	TerminalID string // SAP GUI terminal ID for cross-tool breakpoint sharing

	// BTP connectivity proxy transport (set when using BTP Destination Service)
	CustomTransport http.RoundTripper

}

// NewServer creates a new MCP server for ABAP ADT tools.
func NewServer(cfg *Config) *Server {
	// Create ADT client
	opts := []adt.Option{
		adt.WithClient(cfg.Client),
		adt.WithLanguage(cfg.Language),
	}
	if cfg.InsecureSkipVerify {
		opts = append(opts, adt.WithInsecureSkipVerify())
	}
	if len(cfg.Cookies) > 0 {
		opts = append(opts, adt.WithCookies(cfg.Cookies))
	}
	if cfg.Verbose {
		opts = append(opts, adt.WithVerbose())
	}

	// Configure safety settings
	safety := adt.UnrestrictedSafetyConfig() // Default: unrestricted for backwards compatibility
	if cfg.ReadOnly {
		// readonly mode implies ReadOnly safety (belt-and-suspenders)
		safety.ReadOnly = true
	}
	if cfg.BlockFreeSQL {
		safety.BlockFreeSQL = true
	}
	if cfg.AllowedOps != "" {
		safety.AllowedOps = cfg.AllowedOps
	}
	if cfg.DisallowedOps != "" {
		safety.DisallowedOps = cfg.DisallowedOps
	}
	if len(cfg.AllowedPackages) > 0 {
		safety.AllowedPackages = cfg.AllowedPackages
	}
	if cfg.EnableTransports {
		safety.EnableTransports = true
	}
	if cfg.TransportReadOnly {
		safety.TransportReadOnly = true
	}
	if len(cfg.AllowedTransports) > 0 {
		safety.AllowedTransports = cfg.AllowedTransports
	}
	if cfg.AllowTransportableEdits {
		safety.AllowTransportableEdits = true
	}
	opts = append(opts, adt.WithSafety(safety))

	// Configure X.509 client certificate authentication
	if cfg.ClientCertFile != "" && cfg.ClientKeyFile != "" {
		opts = append(opts, adt.WithClientCert(cfg.ClientCertFile, cfg.ClientKeyFile))
	}
	if cfg.CACertFile != "" {
		opts = append(opts, adt.WithCACert(cfg.CACertFile))
	}

	// Configure BTP connectivity proxy transport
	if cfg.CustomTransport != nil {
		opts = append(opts, adt.WithCustomTransport(cfg.CustomTransport))
	}

	// Configure OAuth/XSUAA authentication
	if cfg.ServiceKeyFile != "" {
		opts = append(opts, adt.WithServiceKey(cfg.ServiceKeyFile))
	} else if cfg.OAuthURL != "" && cfg.OAuthClientID != "" {
		opts = append(opts, adt.WithOAuth(adt.OAuthConfig{
			TokenURL:     cfg.OAuthURL,
			ClientID:     cfg.OAuthClientID,
			ClientSecret: cfg.OAuthClientSecret,
		}))
	}

	// Configure principal propagation (OIDC → ephemeral X.509 → SAP mTLS)
	if cfg.PPCAKeyFile != "" && cfg.PPCACertFile != "" {
		ppConfig := adt.PrincipalPropagationConfig{
			CAKeyFile:  cfg.PPCAKeyFile,
			CACertFile: cfg.PPCACertFile,
		}
		if cfg.PPCertTTL != "" {
			if ttl, err := parseDuration(cfg.PPCertTTL); err == nil {
				ppConfig.CertValidity = ttl
			}
		}
		ppDoer, err := adt.LoadPrincipalPropagation(ppConfig)
		if err != nil {
			fmt.Fprintf(os.Stderr, "[ERROR] Failed to load principal propagation CA: %v\n", err)
		} else {
			if cfg.InsecureSkipVerify {
				ppDoer.SetInsecureSkipVerify(true)
			}
			opts = append(opts, adt.WithPrincipalPropagation(ppDoer))
		}
	}

	adtClient := adt.NewClient(cfg.BaseURL, cfg.Username, cfg.Password, opts...)

	// Configure feature detection (safety network)
	featureConfig := adt.FeatureConfig{
		HANA:      parseFeatureMode(cfg.FeatureHANA),
		AbapGit:   parseFeatureMode(cfg.FeatureAbapGit),
		RAP:       parseFeatureMode(cfg.FeatureRAP),
		AMDP:      parseFeatureMode(cfg.FeatureAMDP),
		UI5:       parseFeatureMode(cfg.FeatureUI5),
		Transport: parseFeatureMode(cfg.FeatureTransport),
	}

	// Create feature prober
	featureProber := adt.NewFeatureProber(adtClient, featureConfig, cfg.Verbose)

	// Create MCP server
	mcpServer := server.NewMCPServer(
		"arc1",
		"1.0.0",
		server.WithResourceCapabilities(true, true),
		server.WithLogging(),
	)

	s := &Server{
		mcpServer:     mcpServer,
		adtClient:     adtClient,
		config:        cfg,
		featureProber: featureProber,
		featureConfig: featureConfig,
	}

	// Register tools based on mode, disabled groups, and granular tool config
	s.registerTools()

	return s
}

// parseFeatureMode converts string to FeatureMode
func parseFeatureMode(s string) adt.FeatureMode {
	switch strings.ToLower(s) {
	case "on", "true", "1", "yes", "enabled":
		return adt.FeatureModeOn
	case "off", "false", "0", "no", "disabled":
		return adt.FeatureModeOff
	default:
		return adt.FeatureModeAuto
	}
}

// Serve starts the MCP server using the selected transport.
// For http-streamable, the listen address is taken from Config.HTTPAddr (falling back to DefaultStreamableHTTPAddr).
func (s *Server) Serve(transport string) error {
	switch strings.ToLower(strings.TrimSpace(transport)) {
	case "", "stdio":
		return s.ServeStdio()
	case "http-streamable":
		addr := s.config.HTTPAddr
		if strings.TrimSpace(addr) == "" {
			addr = DefaultStreamableHTTPAddr
		}
		return s.ServeStreamableHTTP(addr)
	default:
		return fmt.Errorf("unsupported transport: %s (must be 'stdio' or 'http-streamable')", transport)
	}
}

// ServeStdio starts the MCP server on stdin/stdout.
func (s *Server) ServeStdio() error {
	return serveStdioFunc(s.mcpServer)
}

// ServeStreamableHTTP starts the MCP server using streamable HTTP transport.
// It validates the Origin header on all incoming connections to prevent DNS rebinding attacks,
// as required by the MCP specification:
// https://modelcontextprotocol.io/specification/2025-03-26/basic/transports
//
// Authentication middleware chain (outermost first):
//  1. API Key or OIDC middleware (if configured)
//  2. Origin validation middleware
//  3. MCP handler
func (s *Server) ServeStreamableHTTP(addr string) error {
	if strings.TrimSpace(addr) == "" {
		addr = DefaultStreamableHTTPAddr
	}

	mcpHandler := newStreamableHTTPServerFunc(
		s.mcpServer,
		server.WithEndpointPath(DefaultStreamableHTTPPath),
	)

	// Build middleware chain (innermost to outermost)
	var handler http.Handler = originValidationMiddleware(addr, mcpHandler)

	// Add authentication middleware
	if s.config.OIDCIssuer != "" {
		// Phase 2: OIDC JWT validation (extracts user identity)
		validator := adt.NewOIDCValidator(adt.OIDCConfig{
			IssuerURL:       s.config.OIDCIssuer,
			Audience:        s.config.OIDCAudience,
			UsernameClaim:   s.config.OIDCUsernameClaim,
			UsernameMapping: loadUsernameMapping(s.config.OIDCUserMapping),
		})
		handler = adt.OIDCMiddleware(validator, handler)
	} else if s.config.APIKey != "" {
		// Phase 1: API Key authentication
		handler = apiKeyMiddleware(s.config.APIKey, handler)
	}

	mux := http.NewServeMux()
	mux.Handle(DefaultStreamableHTTPPath, handler)

	// Health endpoint (unauthenticated, for load balancer checks)
	mux.HandleFunc("/health", healthHandler)

	// Protected Resource Metadata (MCP OAuth spec, RFC 9728)
	if s.config.OIDCIssuer != "" {
		mux.HandleFunc("/.well-known/oauth-protected-resource",
			protectedResourceMetadataHandler(addr, s.config.OIDCIssuer))
	}

	return listenAndServeFunc(addr, mux)
}

// apiKeyMiddleware validates a shared API key from the Authorization: Bearer header.
// Uses constant-time comparison to prevent timing attacks.
func apiKeyMiddleware(apiKey string, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		auth := r.Header.Get("Authorization")
		if auth == "" {
			w.Header().Set("WWW-Authenticate", "Bearer")
			http.Error(w, `{"error":"missing Authorization header"}`, http.StatusUnauthorized)
			return
		}

		// Extract token from "Bearer <token>"
		token := auth
		if strings.HasPrefix(strings.ToLower(auth), "bearer ") {
			token = auth[7:] // len("Bearer ") == 7
		}

		if subtle.ConstantTimeCompare([]byte(token), []byte(apiKey)) != 1 {
			http.Error(w, `{"error":"invalid API key"}`, http.StatusUnauthorized)
			return
		}

		next.ServeHTTP(w, r)
	})
}

// healthHandler returns a simple health check response (unauthenticated).
func healthHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	w.Write([]byte(`{"status":"ok"}`))
}

// protectedResourceMetadataHandler returns the OAuth Protected Resource Metadata (RFC 9728)
// so MCP clients can discover the authorization server.
func protectedResourceMetadataHandler(serverAddr, issuerURL string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		metadata := map[string]interface{}{
			"resource":                serverAddr,
			"authorization_servers":   []string{issuerURL},
			"bearer_methods_supported": []string{"header"},
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(metadata)
	}
}

// parseDuration parses a duration string like "5m", "1h", "30s".
func parseDuration(s string) (time.Duration, error) {
	return time.ParseDuration(s)
}

// loadUsernameMapping loads a JSON username mapping file.
// Returns nil if path is empty or file cannot be read.
// Format: {"oidc-user": "SAP-USER", ...}
func loadUsernameMapping(path string) map[string]string {
	if path == "" {
		return nil
	}
	data, err := os.ReadFile(path)
	if err != nil {
		fmt.Fprintf(os.Stderr, "[WARN] Failed to load username mapping from %s: %v\n", path, err)
		return nil
	}
	var mapping map[string]string
	if err := json.Unmarshal(data, &mapping); err != nil {
		fmt.Fprintf(os.Stderr, "[WARN] Failed to parse username mapping from %s: %v\n", path, err)
		return nil
	}
	return mapping
}

// originValidationMiddleware returns an HTTP handler that validates the Origin header
// on incoming requests to prevent DNS rebinding attacks per the MCP specification.
// Requests without an Origin header are allowed (same-origin browser requests omit it).
// Requests with an Origin whose host does not match the server's host are rejected with 403.
func originValidationMiddleware(serverAddr string, next http.Handler) http.Handler {
	serverHost, _, err := net.SplitHostPort(serverAddr)
	if err != nil {
		serverHost = serverAddr
	}
	// When bound to all interfaces (0.0.0.0 / ::), skip origin validation.
	// Remote clients (Copilot Studio, etc.) send their own Origin which can
	// never match a wildcard address. API key or OIDC auth protects instead.
	if serverHost == "0.0.0.0" || serverHost == "::" || serverHost == "" {
		return next
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if origin := r.Header.Get("Origin"); origin != "" {
			u, parseErr := url.Parse(origin)
			if parseErr != nil || !isSameOriginHost(u.Hostname(), serverHost) {
				http.Error(w, "Forbidden: invalid Origin header", http.StatusForbidden)
				return
			}
		}
		next.ServeHTTP(w, r)
	})
}

// isSameOriginHost reports whether originHost is the same logical host as serverHost,
// treating 127.0.0.1, ::1 and localhost as equivalent.
func isSameOriginHost(originHost, serverHost string) bool {
	normalize := func(h string) string {
		if h == "127.0.0.1" || h == "::1" {
			return "localhost"
		}
		return h
	}
	return normalize(originHost) == normalize(serverHost)
}

// newToolResultError creates an error result for tool execution failures.
func newToolResultError(message string) *mcp.CallToolResult {
	result := mcp.NewToolResultText(message)
	result.IsError = true
	return result
}

// Tool handlers are in separate files:
// - handlers_read.go: GetTable, GetTableContents, GetPackage, etc.
// - handlers_source.go: GetSource, WriteSource
// - handlers_system.go: GetSystemInfo, GetFeatures, etc.
// - handlers_analysis.go: GetCallGraph, TraceExecution, etc.
// - handlers_codeintel.go: FindDefinition, FindReferences, etc.
// - handlers_devtools.go: SyntaxCheck, Activate, ATC, etc.
// - handlers_crud.go: Lock, Create, Update, Delete, etc.
// - handlers_transport.go: ListTransports, GetTransport, etc.
// - handlers_ui5.go: UI5ListApps, UI5GetApp, etc.
//
// Tool registration is in:
// - tools_register.go: registerTools() and register*Tools() methods
// - tools_groups.go: toolGroups() - group definitions for --disabled-groups
// - tools_focused.go: focusedToolSet() - focused mode whitelist

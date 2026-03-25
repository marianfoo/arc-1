// arc1 is an MCP server providing ABAP Development Tools (ADT) functionality.
package main

import (
	"context"
	"crypto/tls"
	"fmt"
	"net/http"
	"os"
	"strings"

	"github.com/joho/godotenv"
	"github.com/marianfoo/arc-1/internal/mcp"
	"github.com/marianfoo/arc-1/pkg/adt"
	"github.com/spf13/cobra"
	"github.com/spf13/viper"
)

var (
	// Version information (set by build flags)
	Version   = "dev"
	Commit    = "unknown"
	BuildDate = "unknown"
)

var cfg = &mcp.Config{}

var rootCmd = &cobra.Command{
	Use:   "arc1",
	Short: "ARC-1 — ABAP Relay Connector for AI agents and DevOps",
	Long: `arc1 — ARC-1 (ABAP Relay Connector) for AI agents and DevOps.

Single binary, 9 platforms, no dependencies. Download from GitHub releases,
point your MCP config at it, done.

Two modes of operation:

  MCP Server (default)  Connects Claude, Gemini CLI, Copilot, Codex, Qwen Code,
                        and other MCP-compatible agents to SAP systems.
                        11 intent-based tools (ARC-1 architecture).

  CLI Mode              Direct terminal access: search, source, export, debug.
                        Multi-system profiles. Useful for scripts and pipelines.

Quick start:
  # 1. MCP server (reads .env or SAP_* env vars)
  arc1 --url https://host:44300 --user dev --password secret

  # 2. CLI mode with saved system profile
  arc1 -s dev search "ZCL_ORDER*"
  arc1 -s dev source CLAS ZCL_ORDER_PROCESSING
  arc1 -s dev export '$ZPACKAGE' -o backup.zip

  # 3. Enterprise safety (hand to AI without fear)
  arc1 --read-only                                    # no writes at all
  arc1 --allowed-packages 'Z*,$TMP' --block-free-sql  # sandbox AI to custom code
  arc1 --disallowed-ops CDUA                           # block create/delete/update/activate

Configuration files:
  .env          Default SAP connection (MCP server mode). SAP_URL, SAP_USER, etc.
  .arc1.json    Multi-system profiles for CLI mode (vsp -s dev, arc1 -s prod).
  .mcp.json     MCP server entries for Claude Desktop / other MCP clients.

  arc1 config init       Generate example files (.env.example, .arc1.json.example, .mcp.json.example)
  arc1 config show       Display effective configuration
  arc1 config mcp-to-arc1 Import systems from .mcp.json into .arc1.json
  arc1 config arc1-to-mcp Export .arc1.json systems to .mcp.json format

Configuration priority: CLI flags > env vars > .env file > defaults
Ready-to-use configs for 8 AI agents: docs/cli-agents/`,
	Version: fmt.Sprintf("%s (commit: %s, built: %s)", Version, Commit, BuildDate),
	RunE:    runServer,
}

func init() {
	// Load .env file if it exists
	godotenv.Load()

	// Service URL
	rootCmd.Flags().StringVar(&cfg.BaseURL, "url", "", "SAP system URL (e.g., https://host:44300)")
	rootCmd.Flags().StringVar(&cfg.BaseURL, "service", "", "SAP system URL (alias for --url)")

	// Authentication flags
	rootCmd.Flags().StringVarP(&cfg.Username, "user", "u", "", "SAP username")
	rootCmd.Flags().StringVarP(&cfg.Password, "password", "p", "", "SAP password")
	rootCmd.Flags().StringVar(&cfg.Password, "pass", "", "SAP password (alias for --password)")

	// SAP connection options
	rootCmd.Flags().StringVar(&cfg.Client, "client", "001", "SAP client number")
	rootCmd.Flags().StringVar(&cfg.Language, "language", "EN", "SAP language")
	rootCmd.Flags().BoolVar(&cfg.InsecureSkipVerify, "insecure", false, "Skip TLS certificate verification")

	// Cookie authentication
	rootCmd.Flags().String("cookie-file", "", "Path to cookie file in Netscape format")
	rootCmd.Flags().String("cookie-string", "", "Cookie string (key1=val1; key2=val2)")

	// X.509 client certificate authentication (mTLS)
	rootCmd.Flags().String("client-cert", "", "Path to PEM client certificate for X.509 mTLS auth (SAP maps Subject CN to user via CERTRULE)")
	rootCmd.Flags().String("client-key", "", "Path to PEM private key for X.509 mTLS auth")
	rootCmd.Flags().String("ca-cert", "", "Path to PEM CA certificate (for SAP servers using internal/custom CAs)")

	// OAuth2/XSUAA authentication (for BTP/Cloud systems)
	rootCmd.Flags().String("service-key", "", "Path to SAP service key JSON file (BTP/XSUAA authentication)")
	rootCmd.Flags().String("oauth-url", "", "OAuth2/XSUAA token endpoint URL")
	rootCmd.Flags().String("oauth-client-id", "", "OAuth2 client ID")
	rootCmd.Flags().String("oauth-client-secret", "", "OAuth2 client secret")

	// OIDC token validation (for incoming MCP requests in HTTP Streamable mode)
	rootCmd.Flags().String("oidc-issuer", "", "OIDC issuer URL for token validation (e.g., https://login.microsoftonline.com/{tenant}/v2.0)")
	rootCmd.Flags().String("oidc-audience", "", "Expected OIDC token audience claim")
	rootCmd.Flags().String("oidc-username-claim", "preferred_username", "JWT claim to extract SAP username from")
	rootCmd.Flags().String("oidc-user-mapping", "", "Path to YAML file mapping OIDC usernames to SAP usernames")

	// Principal propagation (OIDC identity → ephemeral X.509 cert → SAP mTLS)
	rootCmd.Flags().String("pp-ca-key", "", "CA private key for signing ephemeral certs (PEM)")
	rootCmd.Flags().String("pp-ca-cert", "", "CA certificate matching the key (must be trusted in SAP STRUST)")
	rootCmd.Flags().String("pp-cert-ttl", "5m", "Validity duration for ephemeral certificates (e.g., 5m, 1h)")

	// API Key authentication (for centralized MCP server deployment)
	rootCmd.Flags().String("api-key", "", "Shared API key for authenticating MCP clients (HTTP Streamable only)")

	// Safety options
	rootCmd.Flags().BoolVar(&cfg.ReadOnly, "read-only", false, "Block all write operations (create, update, delete, activate)")
	rootCmd.Flags().BoolVar(&cfg.BlockFreeSQL, "block-free-sql", false, "Block execution of arbitrary SQL queries via RunQuery")
	rootCmd.Flags().StringVar(&cfg.AllowedOps, "allowed-ops", "", "Whitelist of allowed operation types (e.g., \"RSQ\" for Read, Search, Query only)")
	rootCmd.Flags().StringVar(&cfg.DisallowedOps, "disallowed-ops", "", "Blacklist of operation types to block (e.g., \"CDUA\" for Create, Delete, Update, Activate)")
	rootCmd.Flags().StringSliceVar(&cfg.AllowedPackages, "allowed-packages", nil, "Restrict operations to specific packages (comma-separated, supports wildcards like Z*)")
	rootCmd.Flags().BoolVar(&cfg.EnableTransports, "enable-transports", false, "Enable transport management operations (disabled by default for safety)")
	rootCmd.Flags().BoolVar(&cfg.TransportReadOnly, "transport-read-only", false, "Only allow read operations on transports (list, get)")
	rootCmd.Flags().StringSliceVar(&cfg.AllowedTransports, "allowed-transports", nil, "Restrict transport operations to specific transports (comma-separated, supports wildcards like A4HK*)")
	rootCmd.Flags().BoolVar(&cfg.AllowTransportableEdits, "allow-transportable-edits", false, "Allow editing objects in transportable packages (requires transport parameter)")

	// Transport options
	rootCmd.Flags().StringVar(&cfg.Transport, "transport", "stdio", "MCP transport: stdio or http-streamable")
	rootCmd.Flags().StringVar(&cfg.HTTPAddr, "http-addr", "", "Listen address for http-streamable transport (default: 127.0.0.1:8080, use 0.0.0.0:8080 for Docker/remote)")

	// Feature configuration (safety network)
	// Values: "auto" (default), "on", "off"
	rootCmd.Flags().StringVar(&cfg.FeatureHANA, "feature-hana", "auto", "HANA database detection: auto, on, off")
	rootCmd.Flags().StringVar(&cfg.FeatureAbapGit, "feature-abapgit", "auto", "abapGit integration: auto, on, off")
	rootCmd.Flags().StringVar(&cfg.FeatureRAP, "feature-rap", "auto", "RAP/OData development: auto, on, off")
	rootCmd.Flags().StringVar(&cfg.FeatureAMDP, "feature-amdp", "auto", "AMDP/HANA debugger: auto, on, off")
	rootCmd.Flags().StringVar(&cfg.FeatureUI5, "feature-ui5", "auto", "UI5/Fiori BSP management: auto, on, off")
	rootCmd.Flags().StringVar(&cfg.FeatureTransport, "feature-transport", "auto", "CTS transport management: auto, on, off")

	// Debugger configuration
	rootCmd.Flags().StringVar(&cfg.TerminalID, "terminal-id", "", "SAP GUI terminal ID for cross-tool breakpoint sharing")

	// Output options
	rootCmd.Flags().BoolVarP(&cfg.Verbose, "verbose", "v", false, "Enable verbose output to stderr")

	// Bind flags to viper for environment variable support
	viper.BindPFlag("url", rootCmd.Flags().Lookup("url"))
	viper.BindPFlag("user", rootCmd.Flags().Lookup("user"))
	viper.BindPFlag("password", rootCmd.Flags().Lookup("password"))
	viper.BindPFlag("client", rootCmd.Flags().Lookup("client"))
	viper.BindPFlag("language", rootCmd.Flags().Lookup("language"))
	viper.BindPFlag("insecure", rootCmd.Flags().Lookup("insecure"))
	viper.BindPFlag("cookie-file", rootCmd.Flags().Lookup("cookie-file"))
	viper.BindPFlag("cookie-string", rootCmd.Flags().Lookup("cookie-string"))
	viper.BindPFlag("client-cert", rootCmd.Flags().Lookup("client-cert"))
	viper.BindPFlag("client-key", rootCmd.Flags().Lookup("client-key"))
	viper.BindPFlag("ca-cert", rootCmd.Flags().Lookup("ca-cert"))
	viper.BindPFlag("service-key", rootCmd.Flags().Lookup("service-key"))
	viper.BindPFlag("oauth-url", rootCmd.Flags().Lookup("oauth-url"))
	viper.BindPFlag("oauth-client-id", rootCmd.Flags().Lookup("oauth-client-id"))
	viper.BindPFlag("oauth-client-secret", rootCmd.Flags().Lookup("oauth-client-secret"))
	viper.BindPFlag("oidc-issuer", rootCmd.Flags().Lookup("oidc-issuer"))
	viper.BindPFlag("oidc-audience", rootCmd.Flags().Lookup("oidc-audience"))
	viper.BindPFlag("oidc-username-claim", rootCmd.Flags().Lookup("oidc-username-claim"))
	viper.BindPFlag("oidc-user-mapping", rootCmd.Flags().Lookup("oidc-user-mapping"))
	viper.BindPFlag("pp-ca-key", rootCmd.Flags().Lookup("pp-ca-key"))
	viper.BindPFlag("pp-ca-cert", rootCmd.Flags().Lookup("pp-ca-cert"))
	viper.BindPFlag("pp-cert-ttl", rootCmd.Flags().Lookup("pp-cert-ttl"))
	viper.BindPFlag("api-key", rootCmd.Flags().Lookup("api-key"))
	viper.BindPFlag("read-only", rootCmd.Flags().Lookup("read-only"))
	viper.BindPFlag("block-free-sql", rootCmd.Flags().Lookup("block-free-sql"))
	viper.BindPFlag("allowed-ops", rootCmd.Flags().Lookup("allowed-ops"))
	viper.BindPFlag("disallowed-ops", rootCmd.Flags().Lookup("disallowed-ops"))
	viper.BindPFlag("allowed-packages", rootCmd.Flags().Lookup("allowed-packages"))
	viper.BindPFlag("enable-transports", rootCmd.Flags().Lookup("enable-transports"))
	viper.BindPFlag("transport-read-only", rootCmd.Flags().Lookup("transport-read-only"))
	viper.BindPFlag("allowed-transports", rootCmd.Flags().Lookup("allowed-transports"))
	viper.BindPFlag("allow-transportable-edits", rootCmd.Flags().Lookup("allow-transportable-edits"))
	viper.BindPFlag("transport", rootCmd.Flags().Lookup("transport"))
	viper.BindPFlag("http-addr", rootCmd.Flags().Lookup("http-addr"))
	viper.BindPFlag("verbose", rootCmd.Flags().Lookup("verbose"))

	// Feature configuration
	viper.BindPFlag("feature-hana", rootCmd.Flags().Lookup("feature-hana"))
	viper.BindPFlag("feature-abapgit", rootCmd.Flags().Lookup("feature-abapgit"))
	viper.BindPFlag("feature-rap", rootCmd.Flags().Lookup("feature-rap"))
	viper.BindPFlag("feature-amdp", rootCmd.Flags().Lookup("feature-amdp"))
	viper.BindPFlag("feature-ui5", rootCmd.Flags().Lookup("feature-ui5"))
	viper.BindPFlag("feature-transport", rootCmd.Flags().Lookup("feature-transport"))

	// Debugger configuration
	viper.BindPFlag("terminal-id", rootCmd.Flags().Lookup("terminal-id"))

	// Set up environment variable mapping
	viper.SetEnvKeyReplacer(strings.NewReplacer("-", "_"))
	viper.AutomaticEnv()
	viper.SetEnvPrefix("SAP")
}

func runServer(cmd *cobra.Command, args []string) error {
	// Resolve configuration with priority: flags > env vars > defaults
	resolveConfig(cmd)

	// BTP Destination Service: resolve SAP URL + credentials from a named destination.
	// When SAP_BTP_DESTINATION is set and VCAP_SERVICES is present, override SAP_URL/user/pass.
	if destName := os.Getenv("SAP_BTP_DESTINATION"); destName != "" {
		if err := resolveBTPDestination(destName); err != nil {
			return fmt.Errorf("BTP destination resolution failed: %w", err)
		}
	}

	// Validate configuration
	if err := validateConfig(); err != nil {
		return err
	}

	// Process cookie authentication
	if err := processCookieAuth(cmd); err != nil {
		return err
	}

	// Set verbose log output for feature probing
	if cfg.Verbose {
		adt.SetLogOutput(os.Stderr)
	}

	if cfg.Verbose {
		fmt.Fprintf(os.Stderr, "[VERBOSE] Starting vsp server\n")
		fmt.Fprintf(os.Stderr, "[VERBOSE] Transport: %s\n", cfg.Transport)
		fmt.Fprintf(os.Stderr, "[VERBOSE] SAP URL: %s\n", cfg.BaseURL)
		fmt.Fprintf(os.Stderr, "[VERBOSE] SAP Client: %s\n", cfg.Client)
		fmt.Fprintf(os.Stderr, "[VERBOSE] SAP Language: %s\n", cfg.Language)
		if cfg.PPCAKeyFile != "" {
			fmt.Fprintf(os.Stderr, "[VERBOSE] Auth: Principal Propagation (OIDC → ephemeral X.509)\n")
		} else if cfg.ClientCertFile != "" {
			fmt.Fprintf(os.Stderr, "[VERBOSE] Auth: X.509 mTLS (cert: %s)\n", cfg.ClientCertFile)
		} else if cfg.ServiceKeyFile != "" {
			fmt.Fprintf(os.Stderr, "[VERBOSE] Auth: Service Key / OAuth2 XSUAA\n")
		} else if cfg.OAuthURL != "" {
			fmt.Fprintf(os.Stderr, "[VERBOSE] Auth: OAuth2 (url: %s)\n", cfg.OAuthURL)
		} else if cfg.Username != "" {
			fmt.Fprintf(os.Stderr, "[VERBOSE] Auth: Basic (user: %s)\n", cfg.Username)
		} else if len(cfg.Cookies) > 0 {
			fmt.Fprintf(os.Stderr, "[VERBOSE] Auth: Cookie (%d cookies)\n", len(cfg.Cookies))
		}
		if cfg.OIDCIssuer != "" {
			fmt.Fprintf(os.Stderr, "[VERBOSE] OIDC: Issuer=%s, Audience=%s\n", cfg.OIDCIssuer, cfg.OIDCAudience)
		}
		if cfg.APIKey != "" {
			fmt.Fprintf(os.Stderr, "[VERBOSE] MCP Auth: API Key configured (HTTP Streamable only)\n")
		}
		if cfg.CACertFile != "" {
			fmt.Fprintf(os.Stderr, "[VERBOSE] TLS: Custom CA cert: %s\n", cfg.CACertFile)
		}

		// Safety status
		if cfg.ReadOnly {
			fmt.Fprintf(os.Stderr, "[VERBOSE] Safety: READ-ONLY mode enabled\n")
		}
		if cfg.BlockFreeSQL {
			fmt.Fprintf(os.Stderr, "[VERBOSE] Safety: Free SQL queries BLOCKED\n")
		}
		if cfg.AllowedOps != "" {
			fmt.Fprintf(os.Stderr, "[VERBOSE] Safety: Allowed operations: %s\n", cfg.AllowedOps)
		}
		if cfg.DisallowedOps != "" {
			fmt.Fprintf(os.Stderr, "[VERBOSE] Safety: Disallowed operations: %s\n", cfg.DisallowedOps)
		}
		if len(cfg.AllowedPackages) > 0 {
			fmt.Fprintf(os.Stderr, "[VERBOSE] Safety: Allowed packages: %v\n", cfg.AllowedPackages)
		}
		if cfg.EnableTransports {
			fmt.Fprintf(os.Stderr, "[VERBOSE] Safety: Transport management ENABLED\n")
		}
		if cfg.AllowTransportableEdits {
			fmt.Fprintf(os.Stderr, "[VERBOSE] Safety: Transportable edits ENABLED (can modify non-local objects)\n")
		}
		if !cfg.ReadOnly && !cfg.BlockFreeSQL && cfg.AllowedOps == "" && cfg.DisallowedOps == "" && len(cfg.AllowedPackages) == 0 {
			fmt.Fprintf(os.Stderr, "[VERBOSE] Safety: UNRESTRICTED (no safety checks active)\n")
		}
	}

	// Create and start MCP server
	server := mcp.NewServer(cfg)
	if cfg.Verbose && cfg.Transport == "http-streamable" {
		addr := cfg.HTTPAddr
		if addr == "" {
			addr = mcp.DefaultStreamableHTTPAddr
		}
		fmt.Fprintf(os.Stderr, "Starting MCP streamable HTTP server on http://%s%s\n", addr, mcp.DefaultStreamableHTTPPath)
	}
	return server.Serve(cfg.Transport)
}

func resolveConfig(cmd *cobra.Command) {
	// Check if cookie auth is explicitly requested via CLI flags OR env vars
	// If so, we should NOT load user/password from env/.env to avoid conflicts
	// Cookie auth takes precedence over basic auth since it's more explicit
	cookieAuthViaCLI := cmd.Flags().Changed("cookie-file") || cmd.Flags().Changed("cookie-string")
	cookieAuthViaEnv := viper.GetString("COOKIE_FILE") != "" || viper.GetString("COOKIE_STRING") != ""
	hasCookieAuth := cookieAuthViaCLI || cookieAuthViaEnv

	// URL: flag > SAP_URL env
	if cfg.BaseURL == "" {
		cfg.BaseURL = viper.GetString("URL")
	}
	if cfg.BaseURL == "" {
		cfg.BaseURL = viper.GetString("SERVICE_URL")
	}

	// Username: flag > SAP_USER env (skip if cookie auth is present)
	if cfg.Username == "" && !hasCookieAuth {
		cfg.Username = viper.GetString("USER")
	}
	if cfg.Username == "" && !hasCookieAuth {
		cfg.Username = viper.GetString("USERNAME")
	}

	// Password: flag > SAP_PASSWORD env (skip if cookie auth is present)
	if cfg.Password == "" && !hasCookieAuth {
		cfg.Password = viper.GetString("PASSWORD")
	}
	if cfg.Password == "" && !hasCookieAuth {
		cfg.Password = viper.GetString("PASS")
	}

	// Client: flag > SAP_CLIENT env > default
	if !cmd.Flags().Changed("client") {
		if envClient := viper.GetString("CLIENT"); envClient != "" {
			cfg.Client = envClient
		}
	}

	// Language: flag > SAP_LANGUAGE env > default
	if !cmd.Flags().Changed("language") {
		if envLang := viper.GetString("LANGUAGE"); envLang != "" {
			cfg.Language = envLang
		}
	}

	// Insecure: flag > SAP_INSECURE env
	if !cmd.Flags().Changed("insecure") {
		cfg.InsecureSkipVerify = viper.GetBool("INSECURE")
	}

	// Transport: flag > SAP_TRANSPORT env > default (stdio)
	if !cmd.Flags().Changed("transport") {
		if envTransport := viper.GetString("TRANSPORT"); envTransport != "" {
			cfg.Transport = envTransport
		}
	}

	// HTTPAddr: flag > SAP_HTTP_ADDR env > default (empty = 127.0.0.1:8080)
	if !cmd.Flags().Changed("http-addr") {
		if envAddr := viper.GetString("HTTP_ADDR"); envAddr != "" {
			cfg.HTTPAddr = envAddr
		}
	}
	// Cloud Foundry / Heroku / Railway set PORT env var (no SAP_ prefix).
	// When no explicit address is configured, bind to the platform-assigned port.
	if cfg.HTTPAddr == "" || cfg.HTTPAddr == "127.0.0.1:8080" {
		if cfPort := os.Getenv("PORT"); cfPort != "" {
			cfg.HTTPAddr = "0.0.0.0:" + cfPort
		}
	}

	// Verbose: flag > SAP_VERBOSE env
	if !cmd.Flags().Changed("verbose") {
		cfg.Verbose = viper.GetBool("VERBOSE")
	}

	// Safety options: flag > SAP_* env
	if !cmd.Flags().Changed("read-only") {
		cfg.ReadOnly = viper.GetBool("READ_ONLY")
	}
	if !cmd.Flags().Changed("block-free-sql") {
		cfg.BlockFreeSQL = viper.GetBool("BLOCK_FREE_SQL")
	}
	if !cmd.Flags().Changed("allowed-ops") {
		cfg.AllowedOps = viper.GetString("ALLOWED_OPS")
	}
	if !cmd.Flags().Changed("disallowed-ops") {
		cfg.DisallowedOps = viper.GetString("DISALLOWED_OPS")
	}
	if !cmd.Flags().Changed("allowed-packages") {
		// Use GetString and split manually - GetStringSlice doesn't split comma-separated env vars
		if pkgStr := viper.GetString("ALLOWED_PACKAGES"); pkgStr != "" {
			cfg.AllowedPackages = splitCommaSeparated(pkgStr)
		}
	}
	if !cmd.Flags().Changed("enable-transports") {
		cfg.EnableTransports = viper.GetBool("ENABLE_TRANSPORTS")
	}
	if !cmd.Flags().Changed("transport-read-only") {
		cfg.TransportReadOnly = viper.GetBool("TRANSPORT_READ_ONLY")
	}
	if !cmd.Flags().Changed("allowed-transports") {
		// Use GetString and split manually - GetStringSlice doesn't split comma-separated env vars
		if transportStr := viper.GetString("ALLOWED_TRANSPORTS"); transportStr != "" {
			cfg.AllowedTransports = splitCommaSeparated(transportStr)
		}
	}
	if !cmd.Flags().Changed("allow-transportable-edits") {
		cfg.AllowTransportableEdits = viper.GetBool("ALLOW_TRANSPORTABLE_EDITS")
	}

	// Feature configuration: flag > SAP_FEATURE_* env
	if !cmd.Flags().Changed("feature-hana") {
		if v := viper.GetString("FEATURE_HANA"); v != "" {
			cfg.FeatureHANA = v
		}
	}
	if !cmd.Flags().Changed("feature-abapgit") {
		if v := viper.GetString("FEATURE_ABAPGIT"); v != "" {
			cfg.FeatureAbapGit = v
		}
	}
	if !cmd.Flags().Changed("feature-rap") {
		if v := viper.GetString("FEATURE_RAP"); v != "" {
			cfg.FeatureRAP = v
		}
	}
	if !cmd.Flags().Changed("feature-amdp") {
		if v := viper.GetString("FEATURE_AMDP"); v != "" {
			cfg.FeatureAMDP = v
		}
	}
	if !cmd.Flags().Changed("feature-ui5") {
		if v := viper.GetString("FEATURE_UI5"); v != "" {
			cfg.FeatureUI5 = v
		}
	}
	if !cmd.Flags().Changed("feature-transport") {
		if v := viper.GetString("FEATURE_TRANSPORT"); v != "" {
			cfg.FeatureTransport = v
		}
	}

	// Terminal ID for debugger: flag > SAP_TERMINAL_ID env
	if !cmd.Flags().Changed("terminal-id") {
		if v := viper.GetString("TERMINAL_ID"); v != "" {
			cfg.TerminalID = v
		}
	}
}

// resolveBTPDestination uses the BTP Destination Service to resolve the SAP system
// URL, username, and password from a named destination. It also configures the
// connectivity proxy transport for routing through Cloud Connector.
func resolveBTPDestination(destName string) error {
	btpCfg, err := adt.ParseVCAPServices()
	if err != nil {
		return fmt.Errorf("parsing VCAP_SERVICES: %w", err)
	}
	if btpCfg == nil {
		return fmt.Errorf("SAP_BTP_DESTINATION=%q set but VCAP_SERVICES not found (not running on BTP?)", destName)
	}

	if cfg.Verbose {
		fmt.Fprintf(os.Stderr, "[VERBOSE] BTP: Resolving destination %q via Destination Service\n", destName)
	}

	// Look up destination
	lookup := adt.NewDestinationLookup(btpCfg)
	destObj, err := lookup.GetDestination(context.Background(), destName)
	if err != nil {
		return fmt.Errorf("getting destination %q: %w", destName, err)
	}

	// Override config with destination values
	cfg.BaseURL = destObj.URL
	if cfg.Username == "" && destObj.User != "" {
		cfg.Username = destObj.User
		cfg.Password = destObj.Password
	}
	if destObj.SAPClient != "" && cfg.Client == "" {
		cfg.Client = destObj.SAPClient
	}

	if cfg.Verbose {
		fmt.Fprintf(os.Stderr, "[VERBOSE] BTP: Destination %q → URL=%s, User=%s, ProxyType=%s\n",
			destName, destObj.URL, destObj.User, destObj.ProxyType)
	}

	// For OnPremise destinations, configure connectivity proxy transport
	if destObj.ProxyType == "OnPremise" && btpCfg.ConnectivityProxyHost != "" {
		if cfg.Verbose {
			fmt.Fprintf(os.Stderr, "[VERBOSE] BTP: Configuring connectivity proxy %s:%s\n",
				btpCfg.ConnectivityProxyHost, btpCfg.ConnectivityProxyPort)
		}
		baseTransport := &http.Transport{
			TLSClientConfig: &tls.Config{
				InsecureSkipVerify: cfg.InsecureSkipVerify,
			},
		}
		proxyRT, err := btpCfg.ConnectivityProxyTransport(baseTransport)
		if err != nil {
			return fmt.Errorf("configuring connectivity proxy: %w", err)
		}
		cfg.CustomTransport = proxyRT
	}

	return nil
}

func validateConfig() error {
	if cfg.BaseURL == "" {
		return fmt.Errorf("SAP URL is required. Use --url flag or SAP_URL environment variable")
	}

	// Validate transport
	cfg.Transport = strings.ToLower(strings.TrimSpace(cfg.Transport))
	if cfg.Transport == "" {
		cfg.Transport = "stdio"
	}
	if cfg.Transport != "stdio" && cfg.Transport != "http-streamable" {
		return fmt.Errorf("invalid transport: %s (must be 'stdio' or 'http-streamable')", cfg.Transport)
	}

	// Check if we have either basic auth or cookies will be processed
	// Cookies are checked later in processCookieAuth
	return nil
}

func processCookieAuth(cmd *cobra.Command) error {
	cookieFile, _ := cmd.Flags().GetString("cookie-file")
	cookieString, _ := cmd.Flags().GetString("cookie-string")

	// Check environment variables if flags not provided
	if cookieFile == "" {
		cookieFile = viper.GetString("COOKIE_FILE")
	}
	if cookieString == "" {
		cookieString = viper.GetString("COOKIE_STRING")
	}

	// Process X.509 client certificate auth
	clientCert := viper.GetString("CLIENT_CERT")
	if cc, _ := cmd.Flags().GetString("client-cert"); cc != "" {
		clientCert = cc
	}
	clientKey := viper.GetString("CLIENT_KEY")
	if ck, _ := cmd.Flags().GetString("client-key"); ck != "" {
		clientKey = ck
	}
	caCert := viper.GetString("CA_CERT")
	if ca, _ := cmd.Flags().GetString("ca-cert"); ca != "" {
		caCert = ca
	}

	if clientCert != "" {
		cfg.ClientCertFile = clientCert
	}
	if clientKey != "" {
		cfg.ClientKeyFile = clientKey
	}
	if caCert != "" {
		cfg.CACertFile = caCert
	}

	// Process OIDC configuration
	oidcIssuer := viper.GetString("OIDC_ISSUER")
	if v, _ := cmd.Flags().GetString("oidc-issuer"); v != "" {
		oidcIssuer = v
	}
	oidcAudience := viper.GetString("OIDC_AUDIENCE")
	if v, _ := cmd.Flags().GetString("oidc-audience"); v != "" {
		oidcAudience = v
	}
	oidcUsernameClaim := viper.GetString("OIDC_USERNAME_CLAIM")
	if v, _ := cmd.Flags().GetString("oidc-username-claim"); v != "" {
		oidcUsernameClaim = v
	}
	oidcUserMapping := viper.GetString("OIDC_USER_MAPPING")
	if v, _ := cmd.Flags().GetString("oidc-user-mapping"); v != "" {
		oidcUserMapping = v
	}

	cfg.OIDCIssuer = oidcIssuer
	cfg.OIDCAudience = oidcAudience
	cfg.OIDCUsernameClaim = oidcUsernameClaim
	cfg.OIDCUserMapping = oidcUserMapping

	// Process principal propagation configuration
	ppCAKey := viper.GetString("PP_CA_KEY")
	if v, _ := cmd.Flags().GetString("pp-ca-key"); v != "" {
		ppCAKey = v
	}
	ppCACert := viper.GetString("PP_CA_CERT")
	if v, _ := cmd.Flags().GetString("pp-ca-cert"); v != "" {
		ppCACert = v
	}
	ppCertTTL := viper.GetString("PP_CERT_TTL")
	if v, _ := cmd.Flags().GetString("pp-cert-ttl"); v != "" {
		ppCertTTL = v
	}

	cfg.PPCAKeyFile = ppCAKey
	cfg.PPCACertFile = ppCACert
	cfg.PPCertTTL = ppCertTTL

	// Process API key (uses ARC1_ prefix, not SAP_, since it authenticates MCP clients to vsp)
	apiKey := os.Getenv("ARC1_API_KEY")
	if ak, _ := cmd.Flags().GetString("api-key"); ak != "" {
		apiKey = ak
	}
	cfg.APIKey = apiKey

	// Process OAuth/service key
	serviceKeyFile := viper.GetString("SERVICE_KEY")
	if sk, _ := cmd.Flags().GetString("service-key"); sk != "" {
		serviceKeyFile = sk
	}
	oauthURL := viper.GetString("OAUTH_URL")
	if ou, _ := cmd.Flags().GetString("oauth-url"); ou != "" {
		oauthURL = ou
	}
	oauthClientID := viper.GetString("OAUTH_CLIENT_ID")
	if oci, _ := cmd.Flags().GetString("oauth-client-id"); oci != "" {
		oauthClientID = oci
	}
	oauthClientSecret := viper.GetString("OAUTH_CLIENT_SECRET")
	if ocs, _ := cmd.Flags().GetString("oauth-client-secret"); ocs != "" {
		oauthClientSecret = ocs
	}

	if serviceKeyFile != "" {
		cfg.ServiceKeyFile = serviceKeyFile
	}
	if oauthURL != "" {
		cfg.OAuthURL = oauthURL
	}
	if oauthClientID != "" {
		cfg.OAuthClientID = oauthClientID
	}
	if oauthClientSecret != "" {
		cfg.OAuthClientSecret = oauthClientSecret
	}

	// Count authentication methods
	authMethods := 0
	if cfg.Username != "" && cfg.Password != "" {
		authMethods++
	}
	if cookieFile != "" {
		authMethods++
	}
	if cookieString != "" {
		authMethods++
	}
	if clientCert != "" && clientKey != "" {
		authMethods++
	}
	if serviceKeyFile != "" {
		authMethods++
	}
	if oauthURL != "" && oauthClientID != "" {
		authMethods++
	}
	if ppCAKey != "" && ppCACert != "" {
		// Principal propagation is its own auth method (OIDC identity → ephemeral cert)
		authMethods++
	}

	if authMethods > 1 {
		return fmt.Errorf("only one authentication method can be used at a time (basic auth, cookie-file, cookie-string, client-cert, service-key, oauth, or principal-propagation)")
	}

	if authMethods == 0 {
		return fmt.Errorf("authentication required. Use --user/--password, --cookie-file, --cookie-string, --client-cert/--client-key, --service-key, --oauth-url/--oauth-client-id/--oauth-client-secret, or --pp-ca-key/--pp-ca-cert")
	}

	// Process cookie file
	if cookieFile != "" {
		if _, err := os.Stat(cookieFile); os.IsNotExist(err) {
			return fmt.Errorf("cookie file not found: %s", cookieFile)
		}

		cookies, err := adt.LoadCookiesFromFile(cookieFile)
		if err != nil {
			return fmt.Errorf("failed to load cookies from file: %w", err)
		}

		if len(cookies) == 0 {
			return fmt.Errorf("no cookies found in file: %s", cookieFile)
		}

		cfg.Cookies = cookies
		if cfg.Verbose {
			fmt.Fprintf(os.Stderr, "[VERBOSE] Loaded %d cookies from file: %s\n", len(cookies), cookieFile)
		}
	}

	// Process cookie string
	if cookieString != "" {
		cookies := adt.ParseCookieString(cookieString)
		if len(cookies) == 0 {
			return fmt.Errorf("failed to parse cookie string")
		}

		cfg.Cookies = cookies
		if cfg.Verbose {
			fmt.Fprintf(os.Stderr, "[VERBOSE] Parsed %d cookies from string\n", len(cookies))
		}
	}

	return nil
}

// splitCommaSeparated splits a comma-separated string into a slice, trimming whitespace.
// This is needed because viper.GetStringSlice doesn't properly split comma-separated env vars.
func splitCommaSeparated(s string) []string {
	if s == "" {
		return nil
	}
	parts := strings.Split(s, ",")
	result := make([]string, 0, len(parts))
	for _, p := range parts {
		p = strings.TrimSpace(p)
		if p != "" {
			result = append(result, p)
		}
	}
	return result
}

func main() {
	if err := rootCmd.Execute(); err != nil {
		fmt.Fprintf(os.Stderr, "Error: %v\n", err)
		os.Exit(1)
	}
}

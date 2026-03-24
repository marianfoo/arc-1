package adt

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"strings"
	"sync"
	"time"
)

// OAuthConfig holds OAuth2/XSUAA configuration for BTP authentication.
type OAuthConfig struct {
	// TokenURL is the XSUAA token endpoint (e.g., "https://tenant.authentication.eu10.hana.ondemand.com/oauth/token")
	TokenURL string
	// ClientID is the OAuth2 client ID from the service key
	ClientID string
	// ClientSecret is the OAuth2 client secret from the service key
	ClientSecret string
}

// OAuthToken represents an OAuth2 access token with expiry.
type OAuthToken struct {
	AccessToken string    `json:"access_token"`
	TokenType   string    `json:"token_type"`
	ExpiresIn   int       `json:"expires_in"`
	ExpiresAt   time.Time `json:"-"`
}

// IsExpired returns true if the token has expired or will expire within 60 seconds.
func (t *OAuthToken) IsExpired() bool {
	if t == nil {
		return true
	}
	return time.Now().After(t.ExpiresAt.Add(-60 * time.Second))
}

// OAuthTokenProvider handles OAuth2 client_credentials flow for XSUAA.
type OAuthTokenProvider struct {
	config     OAuthConfig
	httpClient *http.Client
	token      *OAuthToken
	mu         sync.RWMutex
}

// NewOAuthTokenProvider creates a new OAuth2 token provider.
func NewOAuthTokenProvider(config OAuthConfig) *OAuthTokenProvider {
	return &OAuthTokenProvider{
		config:     config,
		httpClient: &http.Client{Timeout: 30 * time.Second},
	}
}

// GetToken returns a valid access token, refreshing if necessary.
func (p *OAuthTokenProvider) GetToken(ctx context.Context) (string, error) {
	p.mu.RLock()
	if p.token != nil && !p.token.IsExpired() {
		token := p.token.AccessToken
		p.mu.RUnlock()
		return token, nil
	}
	p.mu.RUnlock()

	// Need to refresh
	p.mu.Lock()
	defer p.mu.Unlock()

	// Double-check after acquiring write lock
	if p.token != nil && !p.token.IsExpired() {
		return p.token.AccessToken, nil
	}

	token, err := p.fetchToken(ctx)
	if err != nil {
		return "", err
	}

	p.token = token
	return token.AccessToken, nil
}

func (p *OAuthTokenProvider) fetchToken(ctx context.Context) (*OAuthToken, error) {
	data := url.Values{
		"grant_type":    {"client_credentials"},
		"client_id":     {p.config.ClientID},
		"client_secret": {p.config.ClientSecret},
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, p.config.TokenURL,
		strings.NewReader(data.Encode()))
	if err != nil {
		return nil, fmt.Errorf("creating token request: %w", err)
	}

	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	resp, err := p.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("executing token request: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("reading token response: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("token request failed: HTTP %d: %s", resp.StatusCode, string(body))
	}

	var token OAuthToken
	if err := json.Unmarshal(body, &token); err != nil {
		return nil, fmt.Errorf("parsing token response: %w", err)
	}

	token.ExpiresAt = time.Now().Add(time.Duration(token.ExpiresIn) * time.Second)

	return &token, nil
}

// --- Service Key Parsing ---

// ServiceKey represents a parsed SAP service key file.
type ServiceKey struct {
	URL          string      `json:"url"`
	SystemID     string      `json:"systemid,omitempty"`
	UAA          *UAAConfig  `json:"uaa,omitempty"`
	// Direct XSUAA fields (BTP format)
	ClientID     string      `json:"clientid,omitempty"`
	ClientSecret string      `json:"clientsecret,omitempty"`
}

// UAAConfig represents the UAA section of a service key.
type UAAConfig struct {
	URL          string `json:"url"`
	ClientID     string `json:"clientid"`
	ClientSecret string `json:"clientsecret"`
}

// ParseServiceKey reads and parses a service key JSON file.
// Supports both ABAP service key format (with nested "uaa" object)
// and direct BTP/XSUAA format.
func ParseServiceKey(path string) (*ServiceKey, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("reading service key file: %w", err)
	}

	return ParseServiceKeyJSON(data)
}

// ParseServiceKeyJSON parses service key JSON data.
func ParseServiceKeyJSON(data []byte) (*ServiceKey, error) {
	var sk ServiceKey
	if err := json.Unmarshal(data, &sk); err != nil {
		return nil, fmt.Errorf("parsing service key: %w", err)
	}

	// Normalize: if direct BTP format (no nested UAA), create UAA from top-level fields
	if sk.UAA == nil && sk.ClientID != "" && sk.ClientSecret != "" {
		// Detect XSUAA URL from the base URL
		tokenURL := sk.URL
		if !strings.Contains(tokenURL, "authentication") {
			// Not an auth URL, skip
		} else {
			sk.UAA = &UAAConfig{
				URL:          tokenURL,
				ClientID:     sk.ClientID,
				ClientSecret: sk.ClientSecret,
			}
		}
	}

	if sk.UAA == nil {
		return nil, fmt.Errorf("service key missing UAA configuration: expected 'uaa' object or direct 'clientid'/'clientsecret' fields")
	}

	return &sk, nil
}

// ToOAuthConfig converts a service key to an OAuthConfig.
func (sk *ServiceKey) ToOAuthConfig() OAuthConfig {
	tokenURL := sk.UAA.URL
	if !strings.HasSuffix(tokenURL, "/oauth/token") {
		tokenURL = strings.TrimSuffix(tokenURL, "/") + "/oauth/token"
	}

	return OAuthConfig{
		TokenURL:     tokenURL,
		ClientID:     sk.UAA.ClientID,
		ClientSecret: sk.UAA.ClientSecret,
	}
}

// GetADTBaseURL returns the SAP system URL for ADT API calls.
func (sk *ServiceKey) GetADTBaseURL() string {
	return sk.URL
}

// --- OAuth-aware HTTP Doer ---

// OAuthHTTPDoer wraps an HTTP client with OAuth2 token injection.
type OAuthHTTPDoer struct {
	inner         HTTPDoer
	tokenProvider *OAuthTokenProvider
}

// NewOAuthHTTPDoer creates an HTTP client wrapper that automatically adds OAuth2 bearer tokens.
func NewOAuthHTTPDoer(inner HTTPDoer, tokenProvider *OAuthTokenProvider) *OAuthHTTPDoer {
	return &OAuthHTTPDoer{
		inner:         inner,
		tokenProvider: tokenProvider,
	}
}

// Do executes the HTTP request with an OAuth2 bearer token.
func (d *OAuthHTTPDoer) Do(req *http.Request) (*http.Response, error) {
	token, err := d.tokenProvider.GetToken(req.Context())
	if err != nil {
		return nil, fmt.Errorf("getting OAuth token: %w", err)
	}

	req.Header.Set("Authorization", "Bearer "+token)
	return d.inner.Do(req)
}

// WithOAuth sets up OAuth2/XSUAA authentication.
// This replaces basic auth — the token provider handles bearer tokens automatically.
func WithOAuth(oauthConfig OAuthConfig) Option {
	return func(c *Config) {
		// Store OAuth config for later use by transport
		c.OAuthConfig = &oauthConfig
	}
}

// WithServiceKey configures authentication from a service key file.
func WithServiceKey(path string) Option {
	return func(c *Config) {
		sk, err := ParseServiceKey(path)
		if err != nil {
			// Store error to be surfaced during client creation
			c.OAuthError = err
			return
		}

		c.BaseURL = sk.GetADTBaseURL()
		oauthConfig := sk.ToOAuthConfig()
		c.OAuthConfig = &oauthConfig
	}
}

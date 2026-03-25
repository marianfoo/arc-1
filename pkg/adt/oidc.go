package adt

import (
	"context"
	"crypto"
	"crypto/rsa"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"hash"
	"io"
	"math/big"
	"net/http"
	"strings"
	"sync"
	"time"
)

// OIDCConfig holds OIDC token validation configuration.
// Used to validate incoming MCP requests when vsp runs in HTTP Streamable mode.
type OIDCConfig struct {
	// IssuerURL is the OIDC issuer (e.g., "https://login.microsoftonline.com/{tenant}/v2.0")
	IssuerURL string

	// Audience is the expected audience claim in the JWT (e.g., "api://vsp-connector")
	Audience string

	// UsernameClaim is the JWT claim to extract the SAP username from.
	// Common values: "preferred_username", "upn", "email", "sub"
	// Default: "preferred_username"
	UsernameClaim string

	// UsernameMapping maps OIDC usernames to SAP usernames.
	// Key: OIDC claim value (e.g., "alice@company.com"), Value: SAP username (e.g., "ALICE")
	// If empty, the claim value is used as-is (uppercased).
	UsernameMapping map[string]string
}

// OIDCValidator validates OIDC/JWT tokens and extracts user identity.
// It caches JWKS keys and supports RS256 signature verification.
type OIDCValidator struct {
	config     OIDCConfig
	httpClient *http.Client

	// JWKS cache
	jwksKeys map[string]*rsa.PublicKey
	jwksMu   sync.RWMutex
	jwksExp  time.Time
}

// NewOIDCValidator creates a new OIDC token validator.
func NewOIDCValidator(config OIDCConfig) *OIDCValidator {
	if config.UsernameClaim == "" {
		config.UsernameClaim = "preferred_username"
	}
	return &OIDCValidator{
		config:     config,
		httpClient: &http.Client{Timeout: 10 * time.Second},
		jwksKeys:   make(map[string]*rsa.PublicKey),
	}
}

// ValidateToken validates a JWT Bearer token and returns the SAP username.
// The token is validated against the OIDC issuer's JWKS endpoint.
func (v *OIDCValidator) ValidateToken(ctx context.Context, tokenString string) (string, error) {
	// Strip "Bearer " prefix if present
	tokenString = strings.TrimPrefix(tokenString, "Bearer ")
	tokenString = strings.TrimPrefix(tokenString, "bearer ")

	// Parse JWT without verification first (to get kid)
	parts := strings.Split(tokenString, ".")
	if len(parts) != 3 {
		return "", errors.New("invalid JWT format: expected 3 parts")
	}

	// Decode header
	headerBytes, err := base64URLDecode(parts[0])
	if err != nil {
		return "", fmt.Errorf("decoding JWT header: %w", err)
	}

	var header jwtHeader
	if err := json.Unmarshal(headerBytes, &header); err != nil {
		return "", fmt.Errorf("parsing JWT header: %w", err)
	}

	if header.Alg != "RS256" {
		return "", fmt.Errorf("unsupported JWT algorithm: %s (only RS256 is supported)", header.Alg)
	}

	// Get the signing key
	key, err := v.getKey(ctx, header.Kid)
	if err != nil {
		return "", fmt.Errorf("getting signing key: %w", err)
	}

	// Verify signature
	signingInput := parts[0] + "." + parts[1]
	signatureBytes, err := base64URLDecode(parts[2])
	if err != nil {
		return "", fmt.Errorf("decoding JWT signature: %w", err)
	}

	if err := verifyRS256(key, []byte(signingInput), signatureBytes); err != nil {
		return "", fmt.Errorf("JWT signature verification failed: %w", err)
	}

	// Decode and validate claims
	claimsBytes, err := base64URLDecode(parts[1])
	if err != nil {
		return "", fmt.Errorf("decoding JWT claims: %w", err)
	}

	var claims jwtClaims
	if err := json.Unmarshal(claimsBytes, &claims); err != nil {
		return "", fmt.Errorf("parsing JWT claims: %w", err)
	}

	// Validate expiry
	if claims.Exp > 0 && time.Now().Unix() > claims.Exp {
		return "", errors.New("JWT token has expired")
	}

	// Validate not-before
	if claims.Nbf > 0 && time.Now().Unix() < claims.Nbf {
		return "", errors.New("JWT token is not yet valid")
	}

	// Validate issuer
	if v.config.IssuerURL != "" && claims.Iss != v.config.IssuerURL {
		return "", fmt.Errorf("JWT issuer mismatch: got %q, expected %q", claims.Iss, v.config.IssuerURL)
	}

	// Validate audience
	if v.config.Audience != "" {
		if !claims.hasAudience(v.config.Audience) {
			return "", fmt.Errorf("JWT audience mismatch: token audience %v does not contain %q", claims.Aud, v.config.Audience)
		}
	}

	// Extract username from configured claim
	username := v.extractUsername(claimsBytes)
	if username == "" {
		return "", fmt.Errorf("JWT claim %q is empty or missing", v.config.UsernameClaim)
	}

	// Apply username mapping
	if mapped, ok := v.config.UsernameMapping[username]; ok {
		username = mapped
	} else {
		// Default: uppercase the username for SAP compatibility
		username = strings.ToUpper(username)
	}

	return username, nil
}

// extractUsername gets the SAP username from the JWT claims using the configured claim name.
func (v *OIDCValidator) extractUsername(claimsJSON []byte) string {
	// Parse as generic map to access any claim
	var claims map[string]interface{}
	if err := json.Unmarshal(claimsJSON, &claims); err != nil {
		return ""
	}

	// Priority chain for username extraction (same as AWS accelerator)
	claimNames := []string{v.config.UsernameClaim}
	if v.config.UsernameClaim != "preferred_username" {
		claimNames = append(claimNames, "preferred_username")
	}
	claimNames = append(claimNames, "upn", "unique_name", "email", "sub")

	for _, claim := range claimNames {
		if val, ok := claims[claim]; ok {
			if str, ok := val.(string); ok && str != "" {
				// For email-like claims, extract the username part before @
				if strings.Contains(str, "@") && (claim == "email" || claim == "upn" || claim == "preferred_username") {
					str = strings.Split(str, "@")[0]
				}
				return str
			}
		}
	}

	return ""
}

// getKey retrieves the RSA public key for the given key ID from the JWKS cache.
// If the cache is empty or expired, it fetches from the OIDC issuer's JWKS endpoint.
func (v *OIDCValidator) getKey(ctx context.Context, kid string) (*rsa.PublicKey, error) {
	v.jwksMu.RLock()
	if key, ok := v.jwksKeys[kid]; ok && time.Now().Before(v.jwksExp) {
		v.jwksMu.RUnlock()
		return key, nil
	}
	v.jwksMu.RUnlock()

	// Fetch fresh JWKS
	if err := v.refreshJWKS(ctx); err != nil {
		return nil, err
	}

	v.jwksMu.RLock()
	defer v.jwksMu.RUnlock()

	key, ok := v.jwksKeys[kid]
	if !ok {
		return nil, fmt.Errorf("key ID %q not found in JWKS", kid)
	}
	return key, nil
}

// refreshJWKS fetches the JWKS from the OIDC discovery endpoint.
func (v *OIDCValidator) refreshJWKS(ctx context.Context) error {
	v.jwksMu.Lock()
	defer v.jwksMu.Unlock()

	// Double-check after acquiring write lock
	if time.Now().Before(v.jwksExp) {
		return nil
	}

	// Discover JWKS URI from OpenID Configuration
	jwksURI, err := v.discoverJWKSURI(ctx)
	if err != nil {
		return err
	}

	// Fetch JWKS
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, jwksURI, nil)
	if err != nil {
		return fmt.Errorf("creating JWKS request: %w", err)
	}

	resp, err := v.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("fetching JWKS: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return fmt.Errorf("reading JWKS response: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("JWKS endpoint returned HTTP %d: %s", resp.StatusCode, string(body))
	}

	var jwks jwksResponse
	if err := json.Unmarshal(body, &jwks); err != nil {
		return fmt.Errorf("parsing JWKS: %w", err)
	}

	// Parse RSA keys
	keys := make(map[string]*rsa.PublicKey)
	for _, jwk := range jwks.Keys {
		if jwk.Kty != "RSA" || jwk.Use != "sig" {
			continue
		}

		key, err := jwkToRSAPublicKey(jwk)
		if err != nil {
			continue // Skip invalid keys
		}
		keys[jwk.Kid] = key
	}

	if len(keys) == 0 {
		return errors.New("no valid RSA signing keys found in JWKS")
	}

	v.jwksKeys = keys
	v.jwksExp = time.Now().Add(1 * time.Hour) // Cache for 1 hour
	return nil
}

// discoverJWKSURI fetches the jwks_uri from the OpenID Configuration document.
func (v *OIDCValidator) discoverJWKSURI(ctx context.Context) (string, error) {
	discoveryURL := strings.TrimSuffix(v.config.IssuerURL, "/") + "/.well-known/openid-configuration"

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, discoveryURL, nil)
	if err != nil {
		return "", fmt.Errorf("creating discovery request: %w", err)
	}

	resp, err := v.httpClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("fetching OpenID configuration: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", fmt.Errorf("reading discovery response: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("OpenID configuration endpoint returned HTTP %d: %s", resp.StatusCode, string(body))
	}

	var config struct {
		JwksURI string `json:"jwks_uri"`
		Issuer  string `json:"issuer"`
	}
	if err := json.Unmarshal(body, &config); err != nil {
		return "", fmt.Errorf("parsing OpenID configuration: %w", err)
	}

	if config.JwksURI == "" {
		return "", errors.New("jwks_uri not found in OpenID configuration")
	}

	return config.JwksURI, nil
}

// --- JWT Types ---

type jwtHeader struct {
	Alg string `json:"alg"`
	Kid string `json:"kid"`
	Typ string `json:"typ"`
}

type jwtClaims struct {
	Iss string   `json:"iss"`
	Sub string   `json:"sub"`
	Aud jwtAud   `json:"aud"`
	Exp int64    `json:"exp"`
	Nbf int64    `json:"nbf"`
	Iat int64    `json:"iat"`
}

// jwtAud handles both string and []string audience formats.
type jwtAud []string

func (a *jwtAud) UnmarshalJSON(data []byte) error {
	// Try string first
	var s string
	if err := json.Unmarshal(data, &s); err == nil {
		*a = []string{s}
		return nil
	}
	// Try string array
	var arr []string
	if err := json.Unmarshal(data, &arr); err != nil {
		return err
	}
	*a = arr
	return nil
}

func (c *jwtClaims) hasAudience(aud string) bool {
	for _, a := range c.Aud {
		if a == aud {
			return true
		}
	}
	return false
}

// --- JWKS Types ---

type jwksResponse struct {
	Keys []jwkKey `json:"keys"`
}

type jwkKey struct {
	Kty string `json:"kty"`
	Kid string `json:"kid"`
	Use string `json:"use"`
	N   string `json:"n"`
	E   string `json:"e"`
	Alg string `json:"alg"`
}

// --- Crypto helpers ---

func base64URLDecode(s string) ([]byte, error) {
	// Pad if necessary
	switch len(s) % 4 {
	case 2:
		s += "=="
	case 3:
		s += "="
	}
	return base64.URLEncoding.DecodeString(s)
}

func jwkToRSAPublicKey(jwk jwkKey) (*rsa.PublicKey, error) {
	nBytes, err := base64URLDecode(jwk.N)
	if err != nil {
		return nil, fmt.Errorf("decoding modulus: %w", err)
	}

	eBytes, err := base64URLDecode(jwk.E)
	if err != nil {
		return nil, fmt.Errorf("decoding exponent: %w", err)
	}

	n := new(big.Int).SetBytes(nBytes)
	e := 0
	for _, b := range eBytes {
		e = e<<8 + int(b)
	}

	return &rsa.PublicKey{N: n, E: e}, nil
}

func newSHA256() hash.Hash {
	return sha256.New()
}

func verifyRS256(key *rsa.PublicKey, signingInput, signature []byte) error {
	hasher := newSHA256()
	hasher.Write(signingInput)
	hashed := hasher.Sum(nil)

	return rsa.VerifyPKCS1v15(key, crypto.SHA256, hashed, signature)
}

// --- OIDC HTTP Middleware ---

// OIDCMiddleware creates an HTTP middleware that validates OIDC Bearer tokens.
// It extracts the SAP username and stores it in the request context.
// Requests without a Bearer token are rejected with 401 Unauthorized.
func OIDCMiddleware(validator *OIDCValidator, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		auth := r.Header.Get("Authorization")
		if auth == "" {
			http.Error(w, `{"error":"missing Authorization header"}`, http.StatusUnauthorized)
			return
		}

		if !strings.HasPrefix(strings.ToLower(auth), "bearer ") {
			http.Error(w, `{"error":"expected Bearer token"}`, http.StatusUnauthorized)
			return
		}

		username, err := validator.ValidateToken(r.Context(), auth)
		if err != nil {
			http.Error(w, fmt.Sprintf(`{"error":"token validation failed: %s"}`, err.Error()), http.StatusUnauthorized)
			return
		}

		// Store username in context for downstream use
		ctx := context.WithValue(r.Context(), oidcUsernameKey, username)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// contextKey is a private type for context keys to avoid collisions.
type contextKey string

const oidcUsernameKey contextKey = "oidc_username"

// OIDCUsernameFromContext retrieves the OIDC-validated SAP username from the request context.
func OIDCUsernameFromContext(ctx context.Context) (string, bool) {
	username, ok := ctx.Value(oidcUsernameKey).(string)
	return username, ok
}

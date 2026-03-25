package adt

import (
	"context"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"math/big"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

// --- Test JWT Helpers ---

// createTestJWT creates a signed JWT for testing purposes.
func createTestJWT(t *testing.T, key *rsa.PrivateKey, kid string, claims map[string]interface{}) string {
	t.Helper()

	header := map[string]string{
		"alg": "RS256",
		"kid": kid,
		"typ": "JWT",
	}

	headerJSON, _ := json.Marshal(header)
	claimsJSON, _ := json.Marshal(claims)

	headerB64 := base64.RawURLEncoding.EncodeToString(headerJSON)
	claimsB64 := base64.RawURLEncoding.EncodeToString(claimsJSON)

	signingInput := headerB64 + "." + claimsB64

	h := sha256.Sum256([]byte(signingInput))
	signature, err := rsa.SignPKCS1v15(rand.Reader, key, 0x05, h[:]) // crypto.SHA256 = 0x05
	if err != nil {
		t.Fatalf("signing JWT: %v", err)
	}

	signatureB64 := base64.RawURLEncoding.EncodeToString(signature)
	return signingInput + "." + signatureB64
}

// createTestJWKSServer creates an httptest server that serves JWKS and OIDC discovery.
func createTestJWKSServer(t *testing.T, key *rsa.PublicKey, kid string) *httptest.Server {
	t.Helper()

	nBytes := key.N.Bytes()
	eBytes := big.NewInt(int64(key.E)).Bytes()

	mux := http.NewServeMux()

	// JWKS endpoint
	mux.HandleFunc("/jwks", func(w http.ResponseWriter, r *http.Request) {
		jwks := map[string]interface{}{
			"keys": []map[string]string{
				{
					"kty": "RSA",
					"kid": kid,
					"use": "sig",
					"alg": "RS256",
					"n":   base64.RawURLEncoding.EncodeToString(nBytes),
					"e":   base64.RawURLEncoding.EncodeToString(eBytes),
				},
			},
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(jwks)
	})

	server := httptest.NewServer(mux)

	// Add discovery endpoint (must know server URL)
	mux.HandleFunc("/.well-known/openid-configuration", func(w http.ResponseWriter, r *http.Request) {
		config := map[string]string{
			"issuer":   server.URL,
			"jwks_uri": server.URL + "/jwks",
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(config)
	})

	return server
}

// --- OIDC Validation Tests ---

func TestOIDCValidateToken(t *testing.T) {
	key, _ := rsa.GenerateKey(rand.Reader, 2048)
	kid := "test-key-1"

	server := createTestJWKSServer(t, &key.PublicKey, kid)
	defer server.Close()

	validator := NewOIDCValidator(OIDCConfig{
		IssuerURL:     server.URL,
		Audience:      "api://vsp-test",
		UsernameClaim: "preferred_username",
	})

	token := createTestJWT(t, key, kid, map[string]interface{}{
		"iss":                server.URL,
		"aud":                "api://vsp-test",
		"exp":                time.Now().Add(1 * time.Hour).Unix(),
		"iat":                time.Now().Unix(),
		"preferred_username": "developer",
	})

	username, err := validator.ValidateToken(context.Background(), "Bearer "+token)
	if err != nil {
		t.Fatalf("ValidateToken failed: %v", err)
	}

	if username != "DEVELOPER" {
		t.Errorf("expected username DEVELOPER, got %q", username)
	}
}

func TestOIDCExpiredToken(t *testing.T) {
	key, _ := rsa.GenerateKey(rand.Reader, 2048)
	kid := "test-key-1"

	server := createTestJWKSServer(t, &key.PublicKey, kid)
	defer server.Close()

	validator := NewOIDCValidator(OIDCConfig{
		IssuerURL: server.URL,
	})

	token := createTestJWT(t, key, kid, map[string]interface{}{
		"iss":                server.URL,
		"exp":                time.Now().Add(-1 * time.Hour).Unix(),
		"preferred_username": "test",
	})

	_, err := validator.ValidateToken(context.Background(), token)
	if err == nil {
		t.Error("expected error for expired token")
	}
	if !strings.Contains(err.Error(), "expired") {
		t.Errorf("expected 'expired' in error, got: %v", err)
	}
}

func TestOIDCWrongAudience(t *testing.T) {
	key, _ := rsa.GenerateKey(rand.Reader, 2048)
	kid := "test-key-1"

	server := createTestJWKSServer(t, &key.PublicKey, kid)
	defer server.Close()

	validator := NewOIDCValidator(OIDCConfig{
		IssuerURL: server.URL,
		Audience:  "api://expected",
	})

	token := createTestJWT(t, key, kid, map[string]interface{}{
		"iss":                server.URL,
		"aud":                "api://wrong",
		"exp":                time.Now().Add(1 * time.Hour).Unix(),
		"preferred_username": "test",
	})

	_, err := validator.ValidateToken(context.Background(), token)
	if err == nil {
		t.Error("expected error for wrong audience")
	}
	if !strings.Contains(err.Error(), "audience") {
		t.Errorf("expected 'audience' in error, got: %v", err)
	}
}

func TestOIDCWrongIssuer(t *testing.T) {
	key, _ := rsa.GenerateKey(rand.Reader, 2048)
	kid := "test-key-1"

	server := createTestJWKSServer(t, &key.PublicKey, kid)
	defer server.Close()

	// Test a valid token where the issuer doesn't match config
	validatorWithIssuer := NewOIDCValidator(OIDCConfig{
		IssuerURL: server.URL,
		Audience:  "",
	})

	token := createTestJWT(t, key, kid, map[string]interface{}{
		"iss":                "https://wrong-issuer.example.com",
		"exp":                time.Now().Add(1 * time.Hour).Unix(),
		"preferred_username": "test",
	})

	_, err := validatorWithIssuer.ValidateToken(context.Background(), token)
	if err == nil {
		t.Error("expected error for wrong issuer")
	}
	if !strings.Contains(err.Error(), "issuer") {
		t.Errorf("expected 'issuer' in error, got: %v", err)
	}
}

func TestOIDCExtractUsernameEmail(t *testing.T) {
	key, _ := rsa.GenerateKey(rand.Reader, 2048)
	kid := "test-key-1"

	server := createTestJWKSServer(t, &key.PublicKey, kid)
	defer server.Close()

	validator := NewOIDCValidator(OIDCConfig{
		IssuerURL:     server.URL,
		UsernameClaim: "email",
	})

	token := createTestJWT(t, key, kid, map[string]interface{}{
		"iss":   server.URL,
		"exp":   time.Now().Add(1 * time.Hour).Unix(),
		"email": "alice@company.com",
	})

	username, err := validator.ValidateToken(context.Background(), token)
	if err != nil {
		t.Fatalf("ValidateToken failed: %v", err)
	}

	// Should extract "alice" from "alice@company.com" and uppercase
	if username != "ALICE" {
		t.Errorf("expected ALICE, got %q", username)
	}
}

func TestOIDCUsernameMapping(t *testing.T) {
	key, _ := rsa.GenerateKey(rand.Reader, 2048)
	kid := "test-key-1"

	server := createTestJWKSServer(t, &key.PublicKey, kid)
	defer server.Close()

	validator := NewOIDCValidator(OIDCConfig{
		IssuerURL:     server.URL,
		UsernameClaim: "preferred_username",
		UsernameMapping: map[string]string{
			"alice": "ALICE_DEV",
			"bob":   "BOB_ADMIN",
		},
	})

	token := createTestJWT(t, key, kid, map[string]interface{}{
		"iss":                server.URL,
		"exp":                time.Now().Add(1 * time.Hour).Unix(),
		"preferred_username": "alice",
	})

	username, err := validator.ValidateToken(context.Background(), token)
	if err != nil {
		t.Fatalf("ValidateToken failed: %v", err)
	}

	if username != "ALICE_DEV" {
		t.Errorf("expected ALICE_DEV, got %q", username)
	}
}

func TestOIDCAudienceStringAndArray(t *testing.T) {
	// Test that audience works for both string "aud" and array ["aud1","aud2"] formats
	var aud jwtAud

	// String format
	err := json.Unmarshal([]byte(`"single-audience"`), &aud)
	if err != nil {
		t.Fatalf("unmarshal string aud: %v", err)
	}
	if len(aud) != 1 || aud[0] != "single-audience" {
		t.Errorf("expected [single-audience], got %v", aud)
	}

	// Array format
	err = json.Unmarshal([]byte(`["aud1","aud2"]`), &aud)
	if err != nil {
		t.Fatalf("unmarshal array aud: %v", err)
	}
	if len(aud) != 2 {
		t.Errorf("expected 2 audiences, got %d", len(aud))
	}
}

func TestOIDCInvalidJWTFormat(t *testing.T) {
	validator := NewOIDCValidator(OIDCConfig{})

	_, err := validator.ValidateToken(context.Background(), "not-a-jwt")
	if err == nil {
		t.Error("expected error for invalid JWT format")
	}
}

func TestOIDCMiddleware(t *testing.T) {
	key, _ := rsa.GenerateKey(rand.Reader, 2048)
	kid := "test-key-1"

	jwksServer := createTestJWKSServer(t, &key.PublicKey, kid)
	defer jwksServer.Close()

	validator := NewOIDCValidator(OIDCConfig{
		IssuerURL:     jwksServer.URL,
		UsernameClaim: "preferred_username",
	})

	// Handler that reads the OIDC username from context
	var capturedUsername string
	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		u, ok := OIDCUsernameFromContext(r.Context())
		if ok {
			capturedUsername = u
		}
		w.WriteHeader(http.StatusOK)
	})

	// Wrap with OIDC middleware
	protected := OIDCMiddleware(validator, handler)

	// Test: no auth header → 401
	t.Run("missing auth header", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/", nil)
		w := httptest.NewRecorder()
		protected.ServeHTTP(w, req)
		if w.Code != http.StatusUnauthorized {
			t.Errorf("expected 401, got %d", w.Code)
		}
	})

	// Test: valid token → 200 with username in context
	t.Run("valid token", func(t *testing.T) {
		token := createTestJWT(t, key, kid, map[string]interface{}{
			"iss":                jwksServer.URL,
			"exp":                time.Now().Add(1 * time.Hour).Unix(),
			"preferred_username": "developer",
		})

		req := httptest.NewRequest("GET", "/", nil)
		req.Header.Set("Authorization", "Bearer "+token)
		w := httptest.NewRecorder()
		protected.ServeHTTP(w, req)

		if w.Code != http.StatusOK {
			t.Errorf("expected 200, got %d: %s", w.Code, w.Body.String())
		}
		if capturedUsername != "DEVELOPER" {
			t.Errorf("expected DEVELOPER in context, got %q", capturedUsername)
		}
	})

	// Test: expired token → 401
	t.Run("expired token", func(t *testing.T) {
		token := createTestJWT(t, key, kid, map[string]interface{}{
			"iss":                jwksServer.URL,
			"exp":                time.Now().Add(-1 * time.Hour).Unix(),
			"preferred_username": "developer",
		})

		req := httptest.NewRequest("GET", "/", nil)
		req.Header.Set("Authorization", "Bearer "+token)
		w := httptest.NewRecorder()
		protected.ServeHTTP(w, req)

		if w.Code != http.StatusUnauthorized {
			t.Errorf("expected 401 for expired token, got %d", w.Code)
		}
	})
}

func TestOIDCUsernameFromContextMissing(t *testing.T) {
	ctx := context.Background()
	_, ok := OIDCUsernameFromContext(ctx)
	if ok {
		t.Error("expected false for context without OIDC username")
	}
}

func TestOIDCJWKSCaching(t *testing.T) {
	key, _ := rsa.GenerateKey(rand.Reader, 2048)
	kid := "test-key-1"

	fetchCount := 0
	mux := http.NewServeMux()
	server := httptest.NewServer(mux)
	defer server.Close()

	nBytes := key.PublicKey.N.Bytes()
	eBytes := big.NewInt(int64(key.PublicKey.E)).Bytes()

	mux.HandleFunc("/jwks", func(w http.ResponseWriter, r *http.Request) {
		fetchCount++
		jwks := map[string]interface{}{
			"keys": []map[string]string{
				{
					"kty": "RSA", "kid": kid, "use": "sig", "alg": "RS256",
					"n": base64.RawURLEncoding.EncodeToString(nBytes),
					"e": base64.RawURLEncoding.EncodeToString(eBytes),
				},
			},
		}
		json.NewEncoder(w).Encode(jwks)
	})
	mux.HandleFunc("/.well-known/openid-configuration", func(w http.ResponseWriter, r *http.Request) {
		json.NewEncoder(w).Encode(map[string]string{
			"issuer":   server.URL,
			"jwks_uri": server.URL + "/jwks",
		})
	})

	validator := NewOIDCValidator(OIDCConfig{IssuerURL: server.URL})

	// Validate two tokens — JWKS should only be fetched once (cached)
	for i := 0; i < 3; i++ {
		token := createTestJWT(t, key, kid, map[string]interface{}{
			"iss":                server.URL,
			"exp":                time.Now().Add(1 * time.Hour).Unix(),
			"preferred_username": fmt.Sprintf("user%d", i),
		})
		_, err := validator.ValidateToken(context.Background(), token)
		if err != nil {
			t.Fatalf("iteration %d: %v", i, err)
		}
	}

	if fetchCount != 1 {
		t.Errorf("expected 1 JWKS fetch (cached), got %d", fetchCount)
	}
}

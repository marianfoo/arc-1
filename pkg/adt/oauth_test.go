package adt

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestOAuthTokenIsExpired(t *testing.T) {
	// Nil token
	var nilToken *OAuthToken
	if !nilToken.IsExpired() {
		t.Error("nil token should be expired")
	}

	// Expired token
	expired := &OAuthToken{
		AccessToken: "expired",
		ExpiresAt:   time.Now().Add(-1 * time.Minute),
	}
	if !expired.IsExpired() {
		t.Error("past token should be expired")
	}

	// Almost expired (within 60s buffer)
	almostExpired := &OAuthToken{
		AccessToken: "almost",
		ExpiresAt:   time.Now().Add(30 * time.Second),
	}
	if !almostExpired.IsExpired() {
		t.Error("token expiring within 60s should be considered expired")
	}

	// Valid token
	valid := &OAuthToken{
		AccessToken: "valid",
		ExpiresAt:   time.Now().Add(5 * time.Minute),
	}
	if valid.IsExpired() {
		t.Error("future token should not be expired")
	}
}

func TestOAuthTokenProviderFetchToken(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			t.Errorf("expected POST, got %s", r.Method)
		}
		if ct := r.Header.Get("Content-Type"); ct != "application/x-www-form-urlencoded" {
			t.Errorf("expected form-urlencoded, got %s", ct)
		}

		r.ParseForm()
		if r.FormValue("grant_type") != "client_credentials" {
			t.Errorf("expected grant_type=client_credentials, got %s", r.FormValue("grant_type"))
		}
		if r.FormValue("client_id") != "test-client-id" {
			t.Errorf("expected client_id=test-client-id, got %s", r.FormValue("client_id"))
		}

		json.NewEncoder(w).Encode(map[string]interface{}{
			"access_token": "test-jwt-token-12345",
			"token_type":   "bearer",
			"expires_in":   3600,
		})
	}))
	defer ts.Close()

	provider := NewOAuthTokenProvider(OAuthConfig{
		TokenURL:     ts.URL + "/oauth/token",
		ClientID:     "test-client-id",
		ClientSecret: "test-client-secret",
	})

	token, err := provider.GetToken(context.Background())
	if err != nil {
		t.Fatalf("GetToken failed: %v", err)
	}
	if token != "test-jwt-token-12345" {
		t.Errorf("expected 'test-jwt-token-12345', got %q", token)
	}
}

func TestOAuthTokenProviderCachesToken(t *testing.T) {
	callCount := 0
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		callCount++
		json.NewEncoder(w).Encode(map[string]interface{}{
			"access_token": "cached-token",
			"token_type":   "bearer",
			"expires_in":   3600,
		})
	}))
	defer ts.Close()

	provider := NewOAuthTokenProvider(OAuthConfig{
		TokenURL: ts.URL, ClientID: "id", ClientSecret: "secret",
	})

	provider.GetToken(context.Background())
	provider.GetToken(context.Background())

	if callCount != 1 {
		t.Errorf("expected 1 fetch (token cached), got %d", callCount)
	}
}

func TestOAuthTokenProviderRefreshesExpired(t *testing.T) {
	callCount := 0
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		callCount++
		json.NewEncoder(w).Encode(map[string]interface{}{
			"access_token": "token",
			"token_type":   "bearer",
			"expires_in":   1, // Expires within 60s buffer
		})
	}))
	defer ts.Close()

	provider := NewOAuthTokenProvider(OAuthConfig{
		TokenURL: ts.URL, ClientID: "id", ClientSecret: "secret",
	})

	provider.GetToken(context.Background())
	provider.GetToken(context.Background())

	if callCount != 2 {
		t.Errorf("expected 2 fetches (token expired), got %d", callCount)
	}
}

func TestParseServiceKeyABAPFormat(t *testing.T) {
	skJSON := `{
		"url": "https://sap-system.example.com:443",
		"systemid": "DEV",
		"uaa": {
			"url": "https://tenant.authentication.eu10.hana.ondemand.com",
			"clientid": "sb-clone-abc123",
			"clientsecret": "secret-xyz"
		}
	}`

	sk, err := ParseServiceKeyJSON([]byte(skJSON))
	if err != nil {
		t.Fatalf("ParseServiceKeyJSON failed: %v", err)
	}

	if sk.URL != "https://sap-system.example.com:443" {
		t.Errorf("expected system URL, got %q", sk.URL)
	}
	if sk.UAA.ClientID != "sb-clone-abc123" {
		t.Errorf("expected clientid, got %q", sk.UAA.ClientID)
	}

	oauth := sk.ToOAuthConfig()
	if oauth.TokenURL != "https://tenant.authentication.eu10.hana.ondemand.com/oauth/token" {
		t.Errorf("expected /oauth/token suffix, got %q", oauth.TokenURL)
	}
}

func TestParseServiceKeyBTPFormat(t *testing.T) {
	skJSON := `{
		"url": "https://tenant.authentication.eu10.hana.ondemand.com",
		"clientid": "sb-direct-abc",
		"clientsecret": "direct-secret"
	}`

	sk, err := ParseServiceKeyJSON([]byte(skJSON))
	if err != nil {
		t.Fatalf("ParseServiceKeyJSON failed: %v", err)
	}

	if sk.UAA == nil {
		t.Fatal("UAA should be auto-created from direct fields")
	}
	if sk.UAA.ClientID != "sb-direct-abc" {
		t.Errorf("expected clientid, got %q", sk.UAA.ClientID)
	}
}

func TestParseServiceKeyMissingUAA(t *testing.T) {
	skJSON := `{"url": "https://sap.example.com", "systemid": "DEV"}`

	_, err := ParseServiceKeyJSON([]byte(skJSON))
	if err == nil {
		t.Fatal("expected error for missing UAA config")
	}
}

func TestOAuthHTTPDoerInjectsToken(t *testing.T) {
	tokenServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		json.NewEncoder(w).Encode(map[string]interface{}{
			"access_token": "bearer-token-123",
			"token_type":   "bearer",
			"expires_in":   3600,
		})
	}))
	defer tokenServer.Close()

	var capturedAuth string
	adtServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		capturedAuth = r.Header.Get("Authorization")
		w.WriteHeader(http.StatusOK)
	}))
	defer adtServer.Close()

	provider := NewOAuthTokenProvider(OAuthConfig{
		TokenURL: tokenServer.URL, ClientID: "id", ClientSecret: "secret",
	})
	doer := NewOAuthHTTPDoer(http.DefaultClient, provider)

	req, _ := http.NewRequest("GET", adtServer.URL+"/test", nil)
	_, err := doer.Do(req)
	if err != nil {
		t.Fatalf("Do failed: %v", err)
	}

	if capturedAuth != "Bearer bearer-token-123" {
		t.Errorf("expected 'Bearer bearer-token-123', got %q", capturedAuth)
	}
}

func TestWithServiceKeyOption(t *testing.T) {
	skJSON := `{
		"url": "https://sap.example.com:443",
		"uaa": {
			"url": "https://auth.example.com",
			"clientid": "test-id",
			"clientsecret": "test-secret"
		}
	}`

	dir := t.TempDir()
	path := filepath.Join(dir, "servicekey.json")
	os.WriteFile(path, []byte(skJSON), 0644)

	cfg := NewConfig("", "", "", WithServiceKey(path))

	if cfg.BaseURL != "https://sap.example.com:443" {
		t.Errorf("expected BaseURL from service key, got %q", cfg.BaseURL)
	}
	if cfg.OAuthConfig == nil {
		t.Fatal("OAuthConfig should be set from service key")
	}
	if cfg.OAuthConfig.ClientID != "test-id" {
		t.Errorf("expected clientid 'test-id', got %q", cfg.OAuthConfig.ClientID)
	}
}

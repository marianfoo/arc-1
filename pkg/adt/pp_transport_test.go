package adt

import (
	"context"
	"crypto/tls"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/pem"
	"math/big"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"time"
	"crypto/rand"
	"crypto/rsa"
)

// writeTestCAPEM writes the existing test CA to PEM files for PP config.
func writeTestCAPEM(t *testing.T, caCert *x509.Certificate, caKey *rsa.PrivateKey) (caKeyPath, caCertPath string) {
	t.Helper()
	dir := t.TempDir()

	// Write CA key PEM
	caKeyPath = filepath.Join(dir, "ca.key")
	keyPEM := pem.EncodeToMemory(&pem.Block{
		Type:  "RSA PRIVATE KEY",
		Bytes: x509.MarshalPKCS1PrivateKey(caKey),
	})
	if err := os.WriteFile(caKeyPath, keyPEM, 0600); err != nil {
		t.Fatalf("writing CA key: %v", err)
	}

	// Write CA cert PEM
	caCertPath = filepath.Join(dir, "ca.crt")
	// Re-create DER from the cert
	certDER, err := x509.CreateCertificate(rand.Reader, caCert, caCert, &caKey.PublicKey, caKey)
	if err != nil {
		// Fallback: use the raw cert bytes
		certDER = caCert.Raw
	}
	certPEM := pem.EncodeToMemory(&pem.Block{
		Type:  "CERTIFICATE",
		Bytes: certDER,
	})
	if err := os.WriteFile(caCertPath, certPEM, 0644); err != nil {
		t.Fatalf("writing CA cert: %v", err)
	}

	return caKeyPath, caCertPath
}

// createTestCAForPP creates a CA and writes it to temp PEM files.
func createTestCAForPP(t *testing.T) (caKeyPath, caCertPath string, caCert *x509.Certificate, caKey *rsa.PrivateKey) {
	t.Helper()
	dir := t.TempDir()

	caKey, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatalf("generating CA key: %v", err)
	}

	caTemplate := &x509.Certificate{
		SerialNumber:          big.NewInt(1),
		Subject:               pkix.Name{CommonName: "PP Test CA"},
		NotBefore:             time.Now().Add(-1 * time.Minute),
		NotAfter:              time.Now().Add(24 * time.Hour),
		KeyUsage:              x509.KeyUsageCertSign | x509.KeyUsageCRLSign,
		BasicConstraintsValid: true,
		IsCA:                  true,
	}

	caCertDER, err := x509.CreateCertificate(rand.Reader, caTemplate, caTemplate, &caKey.PublicKey, caKey)
	if err != nil {
		t.Fatalf("creating CA cert: %v", err)
	}

	caCert, _ = x509.ParseCertificate(caCertDER)

	caKeyPath = filepath.Join(dir, "ca.key")
	os.WriteFile(caKeyPath, pem.EncodeToMemory(&pem.Block{
		Type: "RSA PRIVATE KEY", Bytes: x509.MarshalPKCS1PrivateKey(caKey),
	}), 0600)

	caCertPath = filepath.Join(dir, "ca.crt")
	os.WriteFile(caCertPath, pem.EncodeToMemory(&pem.Block{
		Type: "CERTIFICATE", Bytes: caCertDER,
	}), 0644)

	return
}

func TestTransportPrincipalPropagation_UsesEphemeralCert(t *testing.T) {
	caKeyPath, caCertPath, caCert, _ := createTestCAForPP(t)

	ppConfig := PrincipalPropagationConfig{
		CAKeyFile:    caKeyPath,
		CACertFile:   caCertPath,
		CertValidity: 5 * time.Minute,
	}
	ppDoer, err := LoadPrincipalPropagation(ppConfig)
	if err != nil {
		t.Fatalf("LoadPrincipalPropagation: %v", err)
	}

	// Create a TLS test server that requires client certs signed by our CA
	caCertPool := x509.NewCertPool()
	caCertPool.AddCert(caCert)

	var receivedCN string
	testServer := httptest.NewUnstartedServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.TLS != nil && len(r.TLS.PeerCertificates) > 0 {
			receivedCN = r.TLS.PeerCertificates[0].Subject.CommonName
		}
		w.Header().Set("X-CSRF-Token", "test-csrf-token")
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("ok"))
	}))

	testServer.TLS = &tls.Config{
		ClientCAs:  caCertPool,
		ClientAuth: tls.RequireAndVerifyClientCert,
	}
	testServer.StartTLS()
	defer testServer.Close()

	ppDoer.SetInsecureSkipVerify(true)

	cfg := NewConfig(testServer.URL, "", "", WithInsecureSkipVerify())
	transport := NewTransport(cfg)
	transport.SetPrincipalPropagation(ppDoer)

	ctx := context.WithValue(context.Background(), oidcUsernameKey, "TESTUSER")

	resp, err := transport.Request(ctx, "/sap/bc/adt/core/discovery", &RequestOptions{
		Method: http.MethodGet,
	})
	if err != nil {
		t.Fatalf("Request with PP failed: %v", err)
	}

	if receivedCN != "TESTUSER" {
		t.Errorf("expected cert CN=TESTUSER, got %q", receivedCN)
	}

	if resp.StatusCode != http.StatusOK {
		t.Errorf("expected 200, got %d", resp.StatusCode)
	}
}

func TestTransportPrincipalPropagation_FallsBackToBasicAuth(t *testing.T) {
	caKeyPath, caCertPath, _, _ := createTestCAForPP(t)

	ppConfig := PrincipalPropagationConfig{
		CAKeyFile:    caKeyPath,
		CACertFile:   caCertPath,
		CertValidity: 5 * time.Minute,
	}
	ppDoer, err := LoadPrincipalPropagation(ppConfig)
	if err != nil {
		t.Fatalf("LoadPrincipalPropagation: %v", err)
	}

	var receivedAuthHeader string
	testServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		receivedAuthHeader = r.Header.Get("Authorization")
		w.Header().Set("X-CSRF-Token", "test-csrf")
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("ok"))
	}))
	defer testServer.Close()

	cfg := NewConfig(testServer.URL, "ADMIN", "password123")
	transport := NewTransport(cfg)
	transport.SetPrincipalPropagation(ppDoer)

	// Context WITHOUT OIDC username — should fall back to basic auth
	ctx := context.Background()

	_, err = transport.Request(ctx, "/sap/bc/adt/core/discovery", &RequestOptions{
		Method: http.MethodGet,
	})
	if err != nil {
		t.Fatalf("Request without PP context failed: %v", err)
	}

	if receivedAuthHeader == "" {
		t.Error("expected basic auth header when no OIDC username in context")
	}
}

func TestTransportSetPrincipalPropagation(t *testing.T) {
	cfg := NewConfig("https://example.com", "user", "pass")
	transport := NewTransport(cfg)

	if transport.ppDoer != nil {
		t.Error("expected nil ppDoer initially")
	}

	caKeyPath, caCertPath, _, _ := createTestCAForPP(t)
	ppConfig := PrincipalPropagationConfig{
		CAKeyFile:  caKeyPath,
		CACertFile: caCertPath,
	}
	ppDoer, err := LoadPrincipalPropagation(ppConfig)
	if err != nil {
		t.Fatalf("LoadPrincipalPropagation: %v", err)
	}

	transport.SetPrincipalPropagation(ppDoer)

	if transport.ppDoer == nil {
		t.Error("expected ppDoer to be set")
	}
}

func TestWithPrincipalPropagation_Option(t *testing.T) {
	caKeyPath, caCertPath, _, _ := createTestCAForPP(t)
	ppConfig := PrincipalPropagationConfig{
		CAKeyFile:  caKeyPath,
		CACertFile: caCertPath,
	}
	ppDoer, err := LoadPrincipalPropagation(ppConfig)
	if err != nil {
		t.Fatalf("LoadPrincipalPropagation: %v", err)
	}

	cfg := NewConfig("https://example.com", "", "", WithPrincipalPropagation(ppDoer))
	if cfg.PPDoer == nil {
		t.Error("expected PPDoer to be set via WithPrincipalPropagation option")
	}
}

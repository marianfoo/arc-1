package adt

import (
	"crypto/rand"
	"crypto/rsa"
	"crypto/tls"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/pem"
	"math/big"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"time"
)

// --- Test Helpers ---

// generateTestCA creates a self-signed CA certificate and key for testing.
func generateTestCA(t *testing.T) (*x509.Certificate, *rsa.PrivateKey) {
	t.Helper()
	caKey, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatalf("generating CA key: %v", err)
	}

	caTemplate := &x509.Certificate{
		SerialNumber: big.NewInt(1),
		Subject: pkix.Name{
			CommonName:   "vsp-test-ca",
			Organization: []string{"vsp test"},
		},
		NotBefore:             time.Now().Add(-1 * time.Hour),
		NotAfter:              time.Now().Add(24 * time.Hour),
		KeyUsage:              x509.KeyUsageCertSign | x509.KeyUsageCRLSign,
		BasicConstraintsValid: true,
		IsCA:                  true,
	}

	caCertDER, err := x509.CreateCertificate(rand.Reader, caTemplate, caTemplate, &caKey.PublicKey, caKey)
	if err != nil {
		t.Fatalf("creating CA certificate: %v", err)
	}

	caCert, err := x509.ParseCertificate(caCertDER)
	if err != nil {
		t.Fatalf("parsing CA certificate: %v", err)
	}

	return caCert, caKey
}

// generateTestClientCert creates a client certificate signed by the given CA.
func generateTestClientCert(t *testing.T, caCert *x509.Certificate, caKey *rsa.PrivateKey, username string) (*x509.Certificate, *rsa.PrivateKey) {
	t.Helper()
	clientKey, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatalf("generating client key: %v", err)
	}

	clientTemplate := &x509.Certificate{
		SerialNumber: big.NewInt(2),
		Subject: pkix.Name{
			CommonName: username,
		},
		NotBefore:   time.Now().Add(-1 * time.Minute),
		NotAfter:    time.Now().Add(1 * time.Hour),
		KeyUsage:    x509.KeyUsageDigitalSignature,
		ExtKeyUsage: []x509.ExtKeyUsage{x509.ExtKeyUsageClientAuth},
	}

	clientCertDER, err := x509.CreateCertificate(rand.Reader, clientTemplate, caCert, &clientKey.PublicKey, caKey)
	if err != nil {
		t.Fatalf("creating client certificate: %v", err)
	}

	clientCert, err := x509.ParseCertificate(clientCertDER)
	if err != nil {
		t.Fatalf("parsing client certificate: %v", err)
	}

	return clientCert, clientKey
}

// writePEM writes a certificate and key to PEM files in the given directory.
func writePEM(t *testing.T, dir string, cert *x509.Certificate, key *rsa.PrivateKey, prefix string) (certPath, keyPath string) {
	t.Helper()
	certPath = filepath.Join(dir, prefix+".crt")
	keyPath = filepath.Join(dir, prefix+".key")

	certPEM := pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: cert.Raw})
	keyPEM := pem.EncodeToMemory(&pem.Block{Type: "RSA PRIVATE KEY", Bytes: x509.MarshalPKCS1PrivateKey(key)})

	if err := os.WriteFile(certPath, certPEM, 0600); err != nil {
		t.Fatalf("writing cert PEM: %v", err)
	}
	if err := os.WriteFile(keyPath, keyPEM, 0600); err != nil {
		t.Fatalf("writing key PEM: %v", err)
	}

	return certPath, keyPath
}

// --- X.509 mTLS Tests ---

func TestHasCertAuth(t *testing.T) {
	cfg := &Config{}
	if cfg.HasCertAuth() {
		t.Error("empty config should not have cert auth")
	}

	cfg.ClientCertFile = "/path/to/cert.pem"
	if cfg.HasCertAuth() {
		t.Error("cert without key should not have cert auth")
	}

	cfg.ClientKeyFile = "/path/to/key.pem"
	if !cfg.HasCertAuth() {
		t.Error("cert + key should have cert auth")
	}
}

func TestWithClientCert(t *testing.T) {
	cfg := NewConfig("https://example.com", "", "",
		WithClientCert("/path/cert.pem", "/path/key.pem"),
	)
	if cfg.ClientCertFile != "/path/cert.pem" {
		t.Errorf("expected cert path, got %q", cfg.ClientCertFile)
	}
	if cfg.ClientKeyFile != "/path/key.pem" {
		t.Errorf("expected key path, got %q", cfg.ClientKeyFile)
	}
}

func TestWithCACert(t *testing.T) {
	cfg := NewConfig("https://example.com", "", "",
		WithCACert("/path/ca.pem"),
	)
	if cfg.CACertFile != "/path/ca.pem" {
		t.Errorf("expected CA path, got %q", cfg.CACertFile)
	}
}

func TestLoadClientCertificate(t *testing.T) {
	dir := t.TempDir()
	caCert, caKey := generateTestCA(t)
	clientCert, clientKey := generateTestClientCert(t, caCert, caKey, "DEVELOPER")
	certPath, keyPath := writePEM(t, dir, clientCert, clientKey, "client")

	cfg := NewConfig("https://example.com", "", "",
		WithClientCert(certPath, keyPath),
	)

	httpClient := cfg.NewHTTPClient()
	if cfg.OAuthError != nil {
		t.Fatalf("unexpected error: %v", cfg.OAuthError)
	}

	// Verify the HTTP client's TLS config has the certificate
	transport, ok := httpClient.Transport.(*http.Transport)
	if !ok {
		t.Fatal("expected *http.Transport")
	}
	if len(transport.TLSClientConfig.Certificates) != 1 {
		t.Fatalf("expected 1 certificate, got %d", len(transport.TLSClientConfig.Certificates))
	}
}

func TestLoadClientCertificateInvalid(t *testing.T) {
	dir := t.TempDir()

	// Write invalid PEM content
	certPath := filepath.Join(dir, "bad.crt")
	keyPath := filepath.Join(dir, "bad.key")
	os.WriteFile(certPath, []byte("not a cert"), 0600)
	os.WriteFile(keyPath, []byte("not a key"), 0600)

	cfg := NewConfig("https://example.com", "", "",
		WithClientCert(certPath, keyPath),
	)
	cfg.NewHTTPClient()

	if cfg.OAuthError == nil {
		t.Error("expected error for invalid certificate files")
	}
}

func TestLoadClientCertificateMissing(t *testing.T) {
	cfg := NewConfig("https://example.com", "", "",
		WithClientCert("/nonexistent/cert.pem", "/nonexistent/key.pem"),
	)
	cfg.NewHTTPClient()

	if cfg.OAuthError == nil {
		t.Error("expected error for missing certificate files")
	}
}

func TestLoadCACertificate(t *testing.T) {
	dir := t.TempDir()
	caCert, _ := generateTestCA(t)

	caPath := filepath.Join(dir, "ca.crt")
	caPEM := pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: caCert.Raw})
	os.WriteFile(caPath, caPEM, 0600)

	cfg := NewConfig("https://example.com", "", "",
		WithCACert(caPath),
	)

	httpClient := cfg.NewHTTPClient()
	if cfg.OAuthError != nil {
		t.Fatalf("unexpected error: %v", cfg.OAuthError)
	}

	transport, ok := httpClient.Transport.(*http.Transport)
	if !ok {
		t.Fatal("expected *http.Transport")
	}
	if transport.TLSClientConfig.RootCAs == nil {
		t.Error("expected RootCAs to be set")
	}
}

func TestLoadCACertificateInvalid(t *testing.T) {
	dir := t.TempDir()
	caPath := filepath.Join(dir, "bad-ca.crt")
	os.WriteFile(caPath, []byte("not a ca cert"), 0600)

	cfg := NewConfig("https://example.com", "", "",
		WithCACert(caPath),
	)
	cfg.NewHTTPClient()

	if cfg.OAuthError == nil {
		t.Error("expected error for invalid CA certificate")
	}
}

func TestLoadCACertificateMissing(t *testing.T) {
	cfg := NewConfig("https://example.com", "", "",
		WithCACert("/nonexistent/ca.pem"),
	)
	cfg.NewHTTPClient()

	if cfg.OAuthError == nil {
		t.Error("expected error for missing CA certificate")
	}
}

func TestMTLSAgainstTestServer(t *testing.T) {
	// Generate CA
	caCert, caKey := generateTestCA(t)

	// Generate server cert signed by CA
	serverKey, _ := rsa.GenerateKey(rand.Reader, 2048)
	serverTemplate := &x509.Certificate{
		SerialNumber: big.NewInt(3),
		Subject:      pkix.Name{CommonName: "localhost"},
		NotBefore:    time.Now().Add(-1 * time.Minute),
		NotAfter:     time.Now().Add(1 * time.Hour),
		KeyUsage:     x509.KeyUsageDigitalSignature,
		ExtKeyUsage:  []x509.ExtKeyUsage{x509.ExtKeyUsageServerAuth},
		DNSNames:     []string{"localhost"},
		IPAddresses:  []net.IP{net.ParseIP("127.0.0.1"), net.ParseIP("::1")},
	}
	serverCertDER, _ := x509.CreateCertificate(rand.Reader, serverTemplate, caCert, &serverKey.PublicKey, caKey)
	serverTLSCert := tls.Certificate{
		Certificate: [][]byte{serverCertDER},
		PrivateKey:  serverKey,
	}

	// Generate client cert signed by same CA
	clientCert, clientKey := generateTestClientCert(t, caCert, caKey, "TESTUSER")

	// Create CA pool for server to verify client certs
	caPool := x509.NewCertPool()
	caPool.AddCert(caCert)

	// Capture the client cert CN the server receives
	var receivedCN string
	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.TLS != nil && len(r.TLS.PeerCertificates) > 0 {
			receivedCN = r.TLS.PeerCertificates[0].Subject.CommonName
		}
		w.Header().Set("X-CSRF-Token", "test-token")
		w.WriteHeader(http.StatusOK)
	})

	// Start mTLS test server
	server := httptest.NewUnstartedServer(handler)
	server.TLS = &tls.Config{
		Certificates: []tls.Certificate{serverTLSCert},
		ClientAuth:   tls.RequireAndVerifyClientCert,
		ClientCAs:    caPool,
	}
	server.StartTLS()
	defer server.Close()

	// Write client cert/key and CA to temp files
	dir := t.TempDir()
	certPath, keyPath := writePEM(t, dir, clientCert, clientKey, "client")
	caPath := filepath.Join(dir, "ca.crt")
	caPEM := pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: caCert.Raw})
	os.WriteFile(caPath, caPEM, 0600)

	// Create ADT config with mTLS
	cfg := NewConfig(server.URL, "", "",
		WithClientCert(certPath, keyPath),
		WithCACert(caPath),
	)

	httpClient := cfg.NewHTTPClient()
	if cfg.OAuthError != nil {
		t.Fatalf("config error: %v", cfg.OAuthError)
	}

	// Make a request through the mTLS connection
	resp, err := httpClient.Get(server.URL + "/test")
	if err != nil {
		t.Fatalf("mTLS request failed: %v", err)
	}
	resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Errorf("expected 200, got %d", resp.StatusCode)
	}

	// Verify the server received the correct client certificate CN
	if receivedCN != "TESTUSER" {
		t.Errorf("server received CN=%q, expected TESTUSER", receivedCN)
	}
}

func TestCertAuthNoBasicAuthHeaders(t *testing.T) {
	// When using cert auth, no basic auth headers should be sent
	cfg := NewConfig("https://example.com", "", "",
		WithClientCert("/path/cert.pem", "/path/key.pem"),
	)

	if cfg.HasBasicAuth() {
		t.Error("cert-only config should not have basic auth")
	}
	if !cfg.HasCertAuth() {
		t.Error("config with cert should have cert auth")
	}
}

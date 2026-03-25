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

func TestGenerateEphemeralCert(t *testing.T) {
	caCert, caKey := generateTestCA(t)

	cert, err := GenerateEphemeralCert(caKey, caCert, "DEVELOPER", 5*time.Minute)
	if err != nil {
		t.Fatalf("GenerateEphemeralCert failed: %v", err)
	}

	// Parse the generated certificate
	if len(cert.Certificate) != 1 {
		t.Fatalf("expected 1 certificate, got %d", len(cert.Certificate))
	}

	parsed, err := x509.ParseCertificate(cert.Certificate[0])
	if err != nil {
		t.Fatalf("parsing generated cert: %v", err)
	}

	// Verify CN
	if parsed.Subject.CommonName != "DEVELOPER" {
		t.Errorf("expected CN=DEVELOPER, got %q", parsed.Subject.CommonName)
	}

	// Verify validity
	if parsed.NotAfter.Before(time.Now()) {
		t.Error("certificate should not be expired")
	}
	if parsed.NotAfter.After(time.Now().Add(6 * time.Minute)) {
		t.Error("certificate validity should be ~5 minutes")
	}

	// Verify key usage
	if parsed.KeyUsage&x509.KeyUsageDigitalSignature == 0 {
		t.Error("expected DigitalSignature key usage")
	}

	// Verify extended key usage
	found := false
	for _, usage := range parsed.ExtKeyUsage {
		if usage == x509.ExtKeyUsageClientAuth {
			found = true
			break
		}
	}
	if !found {
		t.Error("expected ClientAuth extended key usage")
	}

	// Verify signed by CA
	caPool := x509.NewCertPool()
	caPool.AddCert(caCert)
	_, err = parsed.Verify(x509.VerifyOptions{
		Roots:     caPool,
		KeyUsages: []x509.ExtKeyUsage{x509.ExtKeyUsageClientAuth},
	})
	if err != nil {
		t.Errorf("certificate verification failed: %v", err)
	}
}

func TestGenerateEphemeralCertDifferentUsers(t *testing.T) {
	caCert, caKey := generateTestCA(t)

	users := []string{"ALICE", "BOB", "DEVELOPER", "ADMIN_USER"}

	for _, username := range users {
		cert, err := GenerateEphemeralCert(caKey, caCert, username, 5*time.Minute)
		if err != nil {
			t.Fatalf("GenerateEphemeralCert(%s) failed: %v", username, err)
		}

		parsed, _ := x509.ParseCertificate(cert.Certificate[0])
		if parsed.Subject.CommonName != username {
			t.Errorf("expected CN=%s, got %q", username, parsed.Subject.CommonName)
		}
	}
}

func TestLoadPrincipalPropagation(t *testing.T) {
	dir := t.TempDir()
	caCert, caKey := generateTestCA(t)
	_, _ = writePEM(t, dir, caCert, caKey, "ca")

	pp, err := LoadPrincipalPropagation(PrincipalPropagationConfig{
		CAKeyFile:    filepath.Join(dir, "ca.key"),
		CACertFile:   filepath.Join(dir, "ca.crt"),
		CertValidity: 5 * time.Minute,
	})
	if err != nil {
		t.Fatalf("LoadPrincipalPropagation failed: %v", err)
	}

	if pp.caKey == nil {
		t.Error("CA key should be loaded")
	}
	if pp.caCert == nil {
		t.Error("CA cert should be loaded")
	}
	if pp.validity != 5*time.Minute {
		t.Errorf("expected 5m validity, got %v", pp.validity)
	}
}

func TestLoadPrincipalPropagationDefaultValidity(t *testing.T) {
	dir := t.TempDir()
	caCert, caKey := generateTestCA(t)
	_, _ = writePEM(t, dir, caCert, caKey, "ca")

	pp, err := LoadPrincipalPropagation(PrincipalPropagationConfig{
		CAKeyFile:  filepath.Join(dir, "ca.key"),
		CACertFile: filepath.Join(dir, "ca.crt"),
	})
	if err != nil {
		t.Fatalf("LoadPrincipalPropagation failed: %v", err)
	}

	if pp.validity != 5*time.Minute {
		t.Errorf("expected default 5m validity, got %v", pp.validity)
	}
}

func TestLoadPrincipalPropagationMissingFiles(t *testing.T) {
	_, err := LoadPrincipalPropagation(PrincipalPropagationConfig{
		CAKeyFile:  "/nonexistent/ca.key",
		CACertFile: "/nonexistent/ca.crt",
	})
	if err == nil {
		t.Error("expected error for missing files")
	}
}

func TestPrincipalPropagationMTLS(t *testing.T) {
	// Generate CA
	caCert, caKey := generateTestCA(t)

	// Generate server cert signed by CA
	serverKey, _ := rsa.GenerateKey(rand.Reader, 2048)
	serverTemplate := &x509.Certificate{
		SerialNumber: big.NewInt(10),
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

	// Create CA pool for server to verify client certs
	caPool := x509.NewCertPool()
	caPool.AddCert(caCert)

	// Track what CN the server sees
	var receivedCN string
	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.TLS != nil && len(r.TLS.PeerCertificates) > 0 {
			receivedCN = r.TLS.PeerCertificates[0].Subject.CommonName
		}
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

	// Write CA files to temp dir
	dir := t.TempDir()
	_, _ = writePEM(t, dir, caCert, caKey, "ca")
	caPath := filepath.Join(dir, "ca.crt")

	// Load principal propagation
	pp, err := LoadPrincipalPropagation(PrincipalPropagationConfig{
		CAKeyFile:    filepath.Join(dir, "ca.key"),
		CACertFile:   caPath,
		CertValidity: 5 * time.Minute,
	})
	if err != nil {
		t.Fatalf("LoadPrincipalPropagation failed: %v", err)
	}

	// Set CA cert pool for verifying server cert
	clientCAPool := x509.NewCertPool()
	caCertPEM, _ := os.ReadFile(caPath)
	clientCAPool.AppendCertsFromPEM(caCertPEM)
	pp.SetCACertPool(clientCAPool)

	// Create a user-specific doer
	userDoer := pp.ForUser("ALICE")

	// Make a request
	req, _ := http.NewRequest("GET", server.URL+"/test", nil)
	resp, err := userDoer.Do(req)
	if err != nil {
		t.Fatalf("principal propagation request failed: %v", err)
	}
	resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Errorf("expected 200, got %d", resp.StatusCode)
	}

	// Verify the server received CN=ALICE
	if receivedCN != "ALICE" {
		t.Errorf("server received CN=%q, expected ALICE", receivedCN)
	}
}

func TestPrincipalPropagationNoUsername(t *testing.T) {
	caCert, caKey := generateTestCA(t)

	dir := t.TempDir()
	_, _ = writePEM(t, dir, caCert, caKey, "ca")

	pp, _ := LoadPrincipalPropagation(PrincipalPropagationConfig{
		CAKeyFile:  filepath.Join(dir, "ca.key"),
		CACertFile: filepath.Join(dir, "ca.crt"),
	})

	// No username set, no context username
	req, _ := http.NewRequest("GET", "https://example.com", nil)
	_, err := pp.Do(req)
	if err == nil {
		t.Error("expected error when no username is available")
	}
}

func TestParsePrivateKeyFormats(t *testing.T) {
	// Generate a key and encode in different formats
	key, _ := rsa.GenerateKey(rand.Reader, 2048)

	// PKCS1 format
	pkcs1PEM := pem.EncodeToMemory(&pem.Block{
		Type:  "RSA PRIVATE KEY",
		Bytes: x509.MarshalPKCS1PrivateKey(key),
	})
	parsed, err := parsePrivateKey(pkcs1PEM)
	if err != nil {
		t.Fatalf("PKCS1 parse failed: %v", err)
	}
	if parsed == nil {
		t.Error("PKCS1 key should not be nil")
	}

	// PKCS8 format
	pkcs8Bytes, _ := x509.MarshalPKCS8PrivateKey(key)
	pkcs8PEM := pem.EncodeToMemory(&pem.Block{
		Type:  "PRIVATE KEY",
		Bytes: pkcs8Bytes,
	})
	parsed, err = parsePrivateKey(pkcs8PEM)
	if err != nil {
		t.Fatalf("PKCS8 parse failed: %v", err)
	}
	if parsed == nil {
		t.Error("PKCS8 key should not be nil")
	}
}

func TestParsePrivateKeyInvalid(t *testing.T) {
	_, err := parsePrivateKey([]byte("not a pem"))
	if err == nil {
		t.Error("expected error for invalid PEM")
	}
}

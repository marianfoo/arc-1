package adt

import (
	"crypto"
	"crypto/rand"
	"crypto/rsa"
	"crypto/tls"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/pem"
	"fmt"
	"math/big"
	"net/http"
	"net/http/cookiejar"
	"os"
	"time"
)

// PrincipalPropagationConfig holds configuration for OIDC → ephemeral X.509 principal propagation.
//
// How it works:
//  1. An incoming MCP request carries a validated OIDC Bearer token (via OIDCMiddleware)
//  2. The middleware extracts the SAP username from the token
//  3. PrincipalPropagationDoer generates a short-lived X.509 certificate with CN=username
//  4. The certificate is signed by a CA that SAP trusts (configured in STRUST)
//  5. The ephemeral certificate is used for the SAP ADT connection (mTLS)
//  6. SAP maps the certificate's Subject CN to the SAP user via CERTRULE
//
// Result: each MCP request authenticates to SAP as the end user, with full audit trail.
// No SAP credentials are stored anywhere.
type PrincipalPropagationConfig struct {
	// CAKeyFile is the path to the PEM-encoded CA private key for signing ephemeral certs.
	CAKeyFile string
	// CACertFile is the path to the PEM-encoded CA certificate.
	// This CA must be imported into SAP STRUST so SAP trusts the ephemeral certs.
	CACertFile string
	// CertValidity is the lifetime of ephemeral certificates.
	// Default: 5 minutes. Keep short for security.
	CertValidity time.Duration
}

// PrincipalPropagationDoer wraps HTTP requests with per-user ephemeral X.509 certificates.
// It generates a new client certificate for each user, signed by the configured CA.
type PrincipalPropagationDoer struct {
	caKey         crypto.PrivateKey
	caCert        *x509.Certificate
	validity      time.Duration
	insecureSkip  bool
	caCertPool    *x509.CertPool // CA pool for verifying SAP server cert
	timeout       time.Duration
	currentUser   string // Current user for this doer instance
}

// LoadPrincipalPropagation loads the CA key and certificate from PEM files
// and returns a PrincipalPropagationDoer ready to generate ephemeral certificates.
func LoadPrincipalPropagation(config PrincipalPropagationConfig) (*PrincipalPropagationDoer, error) {
	// Load CA private key
	keyPEM, err := os.ReadFile(config.CAKeyFile)
	if err != nil {
		return nil, fmt.Errorf("reading CA key file: %w", err)
	}

	caKey, err := parsePrivateKey(keyPEM)
	if err != nil {
		return nil, fmt.Errorf("parsing CA key: %w", err)
	}

	// Load CA certificate
	certPEM, err := os.ReadFile(config.CACertFile)
	if err != nil {
		return nil, fmt.Errorf("reading CA cert file: %w", err)
	}

	block, _ := pem.Decode(certPEM)
	if block == nil {
		return nil, fmt.Errorf("CA cert file contains no PEM data")
	}

	caCert, err := x509.ParseCertificate(block.Bytes)
	if err != nil {
		return nil, fmt.Errorf("parsing CA certificate: %w", err)
	}

	validity := config.CertValidity
	if validity == 0 {
		validity = 5 * time.Minute
	}

	return &PrincipalPropagationDoer{
		caKey:    caKey,
		caCert:   caCert,
		validity: validity,
		timeout:  60 * time.Second,
	}, nil
}

// SetInsecureSkipVerify controls whether the ephemeral HTTP client skips TLS verification.
func (d *PrincipalPropagationDoer) SetInsecureSkipVerify(skip bool) {
	d.insecureSkip = skip
}

// SetCACertPool sets a custom CA pool for verifying the SAP server's TLS certificate.
func (d *PrincipalPropagationDoer) SetCACertPool(pool *x509.CertPool) {
	d.caCertPool = pool
}

// SetTimeout sets the HTTP client timeout.
func (d *PrincipalPropagationDoer) SetTimeout(timeout time.Duration) {
	d.timeout = timeout
}

// ForUser creates a new PrincipalPropagationDoer bound to a specific username.
// The returned doer generates ephemeral certs with CN=username for each request.
func (d *PrincipalPropagationDoer) ForUser(username string) *PrincipalPropagationDoer {
	return &PrincipalPropagationDoer{
		caKey:        d.caKey,
		caCert:       d.caCert,
		validity:     d.validity,
		insecureSkip: d.insecureSkip,
		caCertPool:   d.caCertPool,
		timeout:      d.timeout,
		currentUser:  username,
	}
}

// Do executes the HTTP request with an ephemeral X.509 certificate for the configured user.
// Implements the HTTPDoer interface.
func (d *PrincipalPropagationDoer) Do(req *http.Request) (*http.Response, error) {
	username := d.currentUser
	if username == "" {
		// Try to get username from request context (set by OIDC middleware)
		if u, ok := OIDCUsernameFromContext(req.Context()); ok {
			username = u
		}
	}
	if username == "" {
		return nil, fmt.Errorf("principal propagation: no username available (configure OIDC middleware or use ForUser)")
	}

	// Generate ephemeral certificate for this user
	cert, err := GenerateEphemeralCert(d.caKey, d.caCert, username, d.validity)
	if err != nil {
		return nil, fmt.Errorf("generating ephemeral cert for %s: %w", username, err)
	}

	// Create per-request TLS config with the ephemeral cert
	tlsConfig := &tls.Config{
		Certificates:       []tls.Certificate{cert},
		InsecureSkipVerify: d.insecureSkip,
	}
	if d.caCertPool != nil {
		tlsConfig.RootCAs = d.caCertPool
	}

	// Create per-request HTTP client
	jar, _ := cookiejar.New(nil)
	client := &http.Client{
		Jar: jar,
		Transport: &http.Transport{
			TLSClientConfig: tlsConfig,
		},
		Timeout: d.timeout,
	}

	return client.Do(req)
}

// GenerateEphemeralCert creates a short-lived X.509 client certificate with CN=username,
// signed by the given CA. The certificate is suitable for SAP mTLS authentication via CERTRULE.
//
// Parameters:
//   - caKey: CA private key for signing
//   - caCert: CA certificate (issuer)
//   - username: SAP username to embed as Subject CN
//   - validity: how long the certificate is valid
//
// The generated certificate:
//   - Uses RSA-2048 key pair
//   - Has KeyUsage: DigitalSignature
//   - Has ExtKeyUsage: ClientAuth
//   - Has NotBefore set to now-1min (clock skew tolerance)
//   - Has NotAfter set to now+validity
func GenerateEphemeralCert(caKey crypto.PrivateKey, caCert *x509.Certificate,
	username string, validity time.Duration) (tls.Certificate, error) {

	// Generate a new RSA-2048 key pair for this ephemeral cert
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		return tls.Certificate{}, fmt.Errorf("generating key pair: %w", err)
	}

	// Create certificate template
	serialNumber, err := rand.Int(rand.Reader, new(big.Int).Lsh(big.NewInt(1), 128))
	if err != nil {
		return tls.Certificate{}, fmt.Errorf("generating serial number: %w", err)
	}

	template := &x509.Certificate{
		SerialNumber: serialNumber,
		Subject: pkix.Name{
			CommonName: username,
		},
		NotBefore:   time.Now().Add(-1 * time.Minute), // Clock skew tolerance
		NotAfter:    time.Now().Add(validity),
		KeyUsage:    x509.KeyUsageDigitalSignature,
		ExtKeyUsage: []x509.ExtKeyUsage{x509.ExtKeyUsageClientAuth},
	}

	// Sign the certificate with the CA
	certDER, err := x509.CreateCertificate(rand.Reader, template, caCert, &key.PublicKey, caKey)
	if err != nil {
		return tls.Certificate{}, fmt.Errorf("creating certificate: %w", err)
	}

	return tls.Certificate{
		Certificate: [][]byte{certDER},
		PrivateKey:  key,
	}, nil
}

// parsePrivateKey attempts to parse a PEM-encoded private key.
// Supports PKCS1 (RSA), PKCS8, and EC private keys.
func parsePrivateKey(pemData []byte) (crypto.PrivateKey, error) {
	block, _ := pem.Decode(pemData)
	if block == nil {
		return nil, fmt.Errorf("no PEM data found")
	}

	// Try PKCS1 (RSA PRIVATE KEY)
	if key, err := x509.ParsePKCS1PrivateKey(block.Bytes); err == nil {
		return key, nil
	}

	// Try PKCS8 (PRIVATE KEY)
	if key, err := x509.ParsePKCS8PrivateKey(block.Bytes); err == nil {
		return key, nil
	}

	// Try EC (EC PRIVATE KEY)
	if key, err := x509.ParseECPrivateKey(block.Bytes); err == nil {
		return key, nil
	}

	return nil, fmt.Errorf("failed to parse private key (tried PKCS1, PKCS8, EC)")
}

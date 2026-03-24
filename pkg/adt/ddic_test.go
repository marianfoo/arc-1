package adt

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// --- Domain Tests ---

func TestParseDomain(t *testing.T) {
	xml := `<?xml version="1.0" encoding="UTF-8"?>
<doma:domain xmlns:doma="http://www.sap.com/dictionary/domain" xmlns:adtcore="http://www.sap.com/adt/core"
  doma:name="ZMATNR" doma:description="Material Number Domain"
  doma:dataType="CHAR" doma:length="40" doma:decimals="0"
  doma:conversionExit="MATN1" doma:lowercase="false"
  doma:valueTable="MARA">
  <adtcore:packageRef adtcore:name="$TMP"/>
  <doma:fixedValue doma:low="MAT1" doma:description="Material 1"/>
  <doma:fixedValue doma:low="MAT2" doma:high="MAT9" doma:description="Material Range"/>
</doma:domain>`

	domain, err := parseDomain([]byte(xml))
	if err != nil {
		t.Fatalf("parseDomain failed: %v", err)
	}

	if domain.Name != "ZMATNR" {
		t.Errorf("expected name ZMATNR, got %q", domain.Name)
	}
	if domain.DataType != "CHAR" {
		t.Errorf("expected dataType CHAR, got %q", domain.DataType)
	}
	if domain.Length != 40 {
		t.Errorf("expected length 40, got %d", domain.Length)
	}
	if domain.ConversionExit != "MATN1" {
		t.Errorf("expected conversionExit MATN1, got %q", domain.ConversionExit)
	}
	if domain.Package != "$TMP" {
		t.Errorf("expected package $TMP, got %q", domain.Package)
	}
	if domain.ValueTable != "MARA" {
		t.Errorf("expected valueTable MARA, got %q", domain.ValueTable)
	}
	if len(domain.FixedValues) != 2 {
		t.Fatalf("expected 2 fixed values, got %d", len(domain.FixedValues))
	}
	if domain.FixedValues[0].Low != "MAT1" {
		t.Errorf("expected first fixed value MAT1, got %q", domain.FixedValues[0].Low)
	}
	if domain.FixedValues[1].High != "MAT9" {
		t.Errorf("expected second fixed value high MAT9, got %q", domain.FixedValues[1].High)
	}
}

func TestGetDomainEndToEnd(t *testing.T) {
	domainXML := `<?xml version="1.0" encoding="UTF-8"?>
<doma:domain xmlns:doma="http://www.sap.com/dictionary/domain" xmlns:adtcore="http://www.sap.com/adt/core"
  doma:name="ZTEST_DOM" doma:description="Test Domain" doma:dataType="NUMC" doma:length="10">
  <adtcore:packageRef adtcore:name="$TMP"/>
</doma:domain>`

	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodHead {
			w.Header().Set("X-CSRF-Token", "test-token")
			w.WriteHeader(http.StatusOK)
			return
		}
		if strings.Contains(r.URL.Path, "/ddic/domains/ZTEST_DOM") {
			w.Write([]byte(domainXML))
		} else {
			w.WriteHeader(http.StatusNotFound)
		}
	}))
	defer ts.Close()

	client := NewClient(ts.URL, "user", "pass")
	domain, err := client.GetDomain(context.Background(), "ZTEST_DOM")
	if err != nil {
		t.Fatalf("GetDomain failed: %v", err)
	}

	if domain.Name != "ZTEST_DOM" {
		t.Errorf("expected name ZTEST_DOM, got %q", domain.Name)
	}
	if domain.DataType != "NUMC" {
		t.Errorf("expected dataType NUMC, got %q", domain.DataType)
	}
}

func TestCreateDomainSafetyCheck(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-CSRF-Token", "test-token")
		w.WriteHeader(http.StatusOK)
	}))
	defer ts.Close()

	// Read-only client should block creation
	client := NewClient(ts.URL, "user", "pass", WithReadOnly())
	err := client.CreateDomain(context.Background(), "ZTEST", "Test", "$TMP", "CHAR", 10, 0, "")
	if err == nil {
		t.Fatal("expected safety error for read-only mode")
	}
	if !strings.Contains(err.Error(), "blocked") && !strings.Contains(err.Error(), "read-only") {
		t.Errorf("expected safety error, got: %v", err)
	}
}

func TestCreateDomainEndToEnd(t *testing.T) {
	var capturedBody string
	var capturedPath string
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodHead {
			w.Header().Set("X-CSRF-Token", "test-token")
			w.WriteHeader(http.StatusOK)
			return
		}
		capturedPath = r.URL.Path
		body := make([]byte, r.ContentLength)
		r.Body.Read(body)
		capturedBody = string(body)
		w.WriteHeader(http.StatusCreated)
	}))
	defer ts.Close()

	client := NewClient(ts.URL, "user", "pass")
	err := client.CreateDomain(context.Background(), "ZTEST_DOM", "Test Domain", "$TMP", "CHAR", 20, 0, "")
	if err != nil {
		t.Fatalf("CreateDomain failed: %v", err)
	}

	if capturedPath != "/sap/bc/adt/ddic/domains" {
		t.Errorf("expected path /sap/bc/adt/ddic/domains, got %q", capturedPath)
	}
	if !strings.Contains(capturedBody, "ZTEST_DOM") {
		t.Error("body should contain domain name")
	}
	if !strings.Contains(capturedBody, `dataType="CHAR"`) {
		t.Error("body should contain data type")
	}
}

// --- DataElement Tests ---

func TestParseDataElement(t *testing.T) {
	xml := `<?xml version="1.0" encoding="UTF-8"?>
<blue:wbobj xmlns:blue="http://www.sap.com/wbobj/dictionary/dtel" xmlns:dtel="http://www.sap.com/adt/dictionary/dataelements" xmlns:adtcore="http://www.sap.com/adt/core">
  <dtel:dataElement adtcore:name="ZMATNR_DTEL" adtcore:description="Material Number Element"
    dtel:typeKind="domain" dtel:typeName="MATNR" dtel:length="40">
    <adtcore:packageRef adtcore:name="$TMP"/>
    <dtel:shortLabel dtel:text="MatNr" dtel:length="5"/>
    <dtel:mediumLabel dtel:text="Material" dtel:length="8"/>
    <dtel:longLabel dtel:text="Material Number" dtel:length="15"/>
    <dtel:heading dtel:text="Material Number" dtel:length="15"/>
  </dtel:dataElement>
</blue:wbobj>`

	de, err := parseDataElement([]byte(xml))
	if err != nil {
		t.Fatalf("parseDataElement failed: %v", err)
	}

	if de.Name != "ZMATNR_DTEL" {
		t.Errorf("expected name ZMATNR_DTEL, got %q", de.Name)
	}
	if de.TypeKind != "domain" {
		t.Errorf("expected typeKind domain, got %q", de.TypeKind)
	}
	if de.TypeName != "MATNR" {
		t.Errorf("expected typeName MATNR, got %q", de.TypeName)
	}
	if de.Labels.Short != "MatNr" {
		t.Errorf("expected short label MatNr, got %q", de.Labels.Short)
	}
	if de.Labels.Long != "Material Number" {
		t.Errorf("expected long label 'Material Number', got %q", de.Labels.Long)
	}
}

func TestGetDataElementEndToEnd(t *testing.T) {
	dtelXML := `<?xml version="1.0" encoding="UTF-8"?>
<blue:wbobj xmlns:blue="http://www.sap.com/wbobj/dictionary/dtel" xmlns:dtel="http://www.sap.com/adt/dictionary/dataelements" xmlns:adtcore="http://www.sap.com/adt/core">
  <dtel:dataElement adtcore:name="ZTEST_DTEL" adtcore:description="Test Element"
    dtel:typeKind="predefinedAbapType" dtel:typeName="CHAR" dtel:length="10">
    <adtcore:packageRef adtcore:name="$TMP"/>
  </dtel:dataElement>
</blue:wbobj>`

	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodHead {
			w.Header().Set("X-CSRF-Token", "test-token")
			w.WriteHeader(http.StatusOK)
			return
		}
		w.Write([]byte(dtelXML))
	}))
	defer ts.Close()

	client := NewClient(ts.URL, "user", "pass")
	de, err := client.GetDataElement(context.Background(), "ZTEST_DTEL")
	if err != nil {
		t.Fatalf("GetDataElement failed: %v", err)
	}

	if de.Name != "ZTEST_DTEL" {
		t.Errorf("expected name ZTEST_DTEL, got %q", de.Name)
	}
	if de.TypeKind != "predefinedAbapType" {
		t.Errorf("expected typeKind predefinedAbapType, got %q", de.TypeKind)
	}
}

func TestCreateDataElementSafetyCheck(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-CSRF-Token", "test-token")
		w.WriteHeader(http.StatusOK)
	}))
	defer ts.Close()

	client := NewClient(ts.URL, "user", "pass", WithReadOnly())
	err := client.CreateDataElement(context.Background(), "ZTEST", "Test", "$TMP", "MATNR", "")
	if err == nil {
		t.Fatal("expected safety error for read-only mode")
	}
}

// --- DDLX / Metadata Extension Tests ---

func TestParseMetadataExtension(t *testing.T) {
	xml := `<?xml version="1.0" encoding="UTF-8"?>
<ddlxsources:ddlxSource xmlns:ddlxsources="http://www.sap.com/adt/ddic/ddlxsources" xmlns:adtcore="http://www.sap.com/adt/core"
  adtcore:name="ZC_TRAVEL_METADATA" adtcore:description="Travel Metadata Extension">
  <adtcore:packageRef adtcore:name="ZTRAVEL"/>
  <ddlxsources:source>@Metadata.layer: #CUSTOMER
annotate view ZC_TRAVEL with {
  @UI.lineItem: [{ position: 10 }]
  TravelID;
}</ddlxsources:source>
</ddlxsources:ddlxSource>`

	ext, err := parseMetadataExtension([]byte(xml))
	if err != nil {
		t.Fatalf("parseMetadataExtension failed: %v", err)
	}

	if ext.Name != "ZC_TRAVEL_METADATA" {
		t.Errorf("expected name ZC_TRAVEL_METADATA, got %q", ext.Name)
	}
	if ext.Package != "ZTRAVEL" {
		t.Errorf("expected package ZTRAVEL, got %q", ext.Package)
	}
	if !strings.Contains(ext.Source, "@Metadata.layer") {
		t.Error("expected source to contain @Metadata.layer annotation")
	}
	if !strings.Contains(ext.Source, "annotate view") {
		t.Error("expected source to contain 'annotate view'")
	}
}

func TestGetMetadataExtensionEndToEnd(t *testing.T) {
	ddlxXML := `<?xml version="1.0" encoding="UTF-8"?>
<ddlxsources:ddlxSource xmlns:ddlxsources="http://www.sap.com/adt/ddic/ddlxsources" xmlns:adtcore="http://www.sap.com/adt/core"
  adtcore:name="ZTEST_MDE" adtcore:description="Test MDE">
  <adtcore:packageRef adtcore:name="$TMP"/>
  <ddlxsources:source>@Metadata.layer: #CORE
annotate view ZTEST with { }</ddlxsources:source>
</ddlxsources:ddlxSource>`

	var capturedPath string
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodHead {
			w.Header().Set("X-CSRF-Token", "test-token")
			w.WriteHeader(http.StatusOK)
			return
		}
		capturedPath = r.URL.Path
		w.Write([]byte(ddlxXML))
	}))
	defer ts.Close()

	client := NewClient(ts.URL, "user", "pass")
	ext, err := client.GetMetadataExtension(context.Background(), "ZTEST_MDE")
	if err != nil {
		t.Fatalf("GetMetadataExtension failed: %v", err)
	}

	if ext.Name != "ZTEST_MDE" {
		t.Errorf("expected name ZTEST_MDE, got %q", ext.Name)
	}

	expectedPath := "/sap/bc/adt/ddic/ddlx/sources/ZTEST_MDE"
	if capturedPath != expectedPath {
		t.Errorf("expected path %q, got %q", expectedPath, capturedPath)
	}
}

func TestGetMetadataExtensionSourceEndToEnd(t *testing.T) {
	source := `@Metadata.layer: #CUSTOMER
annotate view ZC_TRAVEL with {
  @UI.lineItem: [{ position: 10 }]
  TravelID;
}`

	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodHead {
			w.Header().Set("X-CSRF-Token", "test-token")
			w.WriteHeader(http.StatusOK)
			return
		}
		w.Header().Set("Content-Type", "text/plain")
		w.Write([]byte(source))
	}))
	defer ts.Close()

	client := NewClient(ts.URL, "user", "pass")
	result, err := client.GetMetadataExtensionSource(context.Background(), "ZC_TRAVEL_MDE")
	if err != nil {
		t.Fatalf("GetMetadataExtensionSource failed: %v", err)
	}

	if result != source {
		t.Errorf("expected source to match, got %q", result)
	}
}

func TestCreateMetadataExtensionSafetyCheck(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-CSRF-Token", "test-token")
		w.WriteHeader(http.StatusOK)
	}))
	defer ts.Close()

	client := NewClient(ts.URL, "user", "pass", WithReadOnly())
	err := client.CreateMetadataExtension(context.Background(), "ZTEST", "Test", "$TMP", "source", "")
	if err == nil {
		t.Fatal("expected safety error for read-only mode")
	}
}

package adt

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestParseEnhancementSpot(t *testing.T) {
	xml := `<?xml version="1.0" encoding="UTF-8"?>
<enh:enhancementSpot xmlns:enh="http://www.sap.com/adt/enhancements" xmlns:adtcore="http://www.sap.com/adt/core"
  enh:name="BADI_MATERIAL_CHECK" enh:description="Material Validation">
  <adtcore:packageRef adtcore:name="MM"/>
  <enh:badi enh:name="BADI_MATERIAL_MAT_CHECK" enh:interfaceName="IF_EX_MATERIAL_CHECK" enh:description="Material Check BAdI"/>
  <enh:badi enh:name="BADI_MATERIAL_BATCH" enh:interfaceName="IF_EX_MATERIAL_BATCH" enh:description="Batch Check BAdI"/>
</enh:enhancementSpot>`

	spot, err := parseEnhancementSpot([]byte(xml), "BADI_MATERIAL_CHECK")
	if err != nil {
		t.Fatalf("parseEnhancementSpot failed: %v", err)
	}

	if spot.Name != "BADI_MATERIAL_CHECK" {
		t.Errorf("expected name BADI_MATERIAL_CHECK, got %q", spot.Name)
	}
	if spot.Description != "Material Validation" {
		t.Errorf("expected description 'Material Validation', got %q", spot.Description)
	}
	if spot.Package != "MM" {
		t.Errorf("expected package MM, got %q", spot.Package)
	}

	if len(spot.BAdIs) != 2 {
		t.Fatalf("expected 2 BAdIs, got %d", len(spot.BAdIs))
	}
	if spot.BAdIs[0].Name != "BADI_MATERIAL_MAT_CHECK" {
		t.Errorf("expected BAdI name BADI_MATERIAL_MAT_CHECK, got %q", spot.BAdIs[0].Name)
	}
	if spot.BAdIs[0].InterfaceName != "IF_EX_MATERIAL_CHECK" {
		t.Errorf("expected interface IF_EX_MATERIAL_CHECK, got %q", spot.BAdIs[0].InterfaceName)
	}
}

func TestParseEnhancementElements(t *testing.T) {
	xml := `<?xml version="1.0" encoding="UTF-8"?>
<enh:elements xmlns:enh="http://www.sap.com/adt/enhancements" xmlns:adtcore="http://www.sap.com/adt/core">
  <enh:element enh:name="ZENH_MAT_CHECK" enh:type="ENHS/ENHO" enh:description="Custom Material Check">
    <enh:source>DATA lv_material TYPE matnr.</enh:source>
  </enh:element>
  <enh:element enh:name="ZENH_MAT_LOG" enh:type="ENHS/ENHO" enh:description="Custom Material Log"/>
</enh:elements>`

	elements, err := parseEnhancementElements([]byte(xml))
	if err != nil {
		t.Fatalf("parseEnhancementElements failed: %v", err)
	}

	if len(elements) != 2 {
		t.Fatalf("expected 2 elements, got %d", len(elements))
	}

	if elements[0].Name != "ZENH_MAT_CHECK" {
		t.Errorf("expected name ZENH_MAT_CHECK, got %q", elements[0].Name)
	}
	if elements[0].Source != "DATA lv_material TYPE matnr." {
		t.Errorf("unexpected source: %q", elements[0].Source)
	}
	if elements[1].Source != "" {
		t.Errorf("expected empty source for second element, got %q", elements[1].Source)
	}
}

func TestGetEnhancementSpotEndToEnd(t *testing.T) {
	spotXML := `<?xml version="1.0" encoding="UTF-8"?>
<enh:enhancementSpot xmlns:enh="http://www.sap.com/adt/enhancements" xmlns:adtcore="http://www.sap.com/adt/core"
  enh:name="BADI_TEST" enh:description="Test Enhancement Spot">
  <adtcore:packageRef adtcore:name="$TMP"/>
  <enh:badi enh:name="BADI_TEST_IMPL" enh:interfaceName="IF_EX_TEST" enh:description="Test BAdI"/>
</enh:enhancementSpot>`

	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodHead {
			w.Header().Set("X-CSRF-Token", "test-token")
			w.WriteHeader(http.StatusOK)
			return
		}
		if strings.Contains(r.URL.Path, "/enhancements/enhsxsb/BADI_TEST") {
			w.Header().Set("Content-Type", "application/xml")
			w.Write([]byte(spotXML))
		} else {
			w.WriteHeader(http.StatusNotFound)
		}
	}))
	defer ts.Close()

	client := NewClient(ts.URL, "user", "pass")
	spot, err := client.GetEnhancementSpot(context.Background(), "BADI_TEST")
	if err != nil {
		t.Fatalf("GetEnhancementSpot failed: %v", err)
	}

	if spot.Name != "BADI_TEST" {
		t.Errorf("expected name BADI_TEST, got %q", spot.Name)
	}
	if len(spot.BAdIs) != 1 {
		t.Fatalf("expected 1 BAdI, got %d", len(spot.BAdIs))
	}
}

func TestGetEnhancementsEndToEnd(t *testing.T) {
	elementsXML := `<?xml version="1.0" encoding="UTF-8"?>
<enh:elements xmlns:enh="http://www.sap.com/adt/enhancements">
  <enh:element enh:name="ZENH_1" enh:type="ENHS/ENHO" enh:description="Enhancement 1"/>
</enh:elements>`

	var capturedPath string
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodHead {
			w.Header().Set("X-CSRF-Token", "test-token")
			w.WriteHeader(http.StatusOK)
			return
		}
		capturedPath = r.URL.Path
		w.Write([]byte(elementsXML))
	}))
	defer ts.Close()

	client := NewClient(ts.URL, "user", "pass")
	elements, err := client.GetEnhancements(context.Background(), "/sap/bc/adt/programs/programs/ZTEST")
	if err != nil {
		t.Fatalf("GetEnhancements failed: %v", err)
	}

	if len(elements) != 1 {
		t.Fatalf("expected 1 element, got %d", len(elements))
	}

	expectedPath := "/sap/bc/adt/programs/programs/ZTEST/source/main/enhancements/elements"
	if capturedPath != expectedPath {
		t.Errorf("expected path %q, got %q", expectedPath, capturedPath)
	}
}

func TestGetEnhancementImplEndToEnd(t *testing.T) {
	source := `METHOD if_ex_test~check.
  " Custom implementation
  rv_result = abap_true.
ENDMETHOD.`

	var capturedPath string
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodHead {
			w.Header().Set("X-CSRF-Token", "test-token")
			w.WriteHeader(http.StatusOK)
			return
		}
		capturedPath = r.URL.Path
		w.Header().Set("Content-Type", "text/plain")
		w.Write([]byte(source))
	}))
	defer ts.Close()

	client := NewClient(ts.URL, "user", "pass")
	result, err := client.GetEnhancementImpl(context.Background(), "BADI_TEST", "ZENH_IMPL")
	if err != nil {
		t.Fatalf("GetEnhancementImpl failed: %v", err)
	}

	if result != source {
		t.Errorf("expected source to match, got %q", result)
	}

	expectedPath := "/sap/bc/adt/enhancements/BADI_TEST/ZENH_IMPL/source/main"
	if capturedPath != expectedPath {
		t.Errorf("expected path %q, got %q", expectedPath, capturedPath)
	}
}

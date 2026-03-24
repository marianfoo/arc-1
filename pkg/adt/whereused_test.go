package adt

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestObjectTypeToURI(t *testing.T) {
	tests := []struct {
		objectType string
		objectName string
		want       string
	}{
		{"CLAS", "ZCL_TEST", "/sap/bc/adt/oo/classes/ZCL_TEST"},
		{"CLASS", "zcl_test", "/sap/bc/adt/oo/classes/ZCL_TEST"},
		{"INTF", "ZIF_TEST", "/sap/bc/adt/oo/interfaces/ZIF_TEST"},
		{"PROG", "ZTEST", "/sap/bc/adt/programs/programs/ZTEST"},
		{"TABL", "MARA", "/sap/bc/adt/ddic/tables/MARA"},
		{"DOMA", "MATNR", "/sap/bc/adt/ddic/domains/MATNR"},
		{"DTEL", "MATNR", "/sap/bc/adt/ddic/dataelements/MATNR"},
		{"DDLS", "I_PRODUCT", "/sap/bc/adt/ddic/ddl/sources/I_PRODUCT"},
		{"STRU", "ZTEST_S", "/sap/bc/adt/ddic/structures/ZTEST_S"},
		{"DEVC", "$TMP", "/sap/bc/adt/packages/$TMP"},
		{"FUGR", "ZTEST_FG", "/sap/bc/adt/functions/groups/ZTEST_FG"},
	}

	for _, tt := range tests {
		t.Run(tt.objectType+"_"+tt.objectName, func(t *testing.T) {
			got := objectTypeToURI(tt.objectType, tt.objectName)
			if got != tt.want {
				t.Errorf("objectTypeToURI(%q, %q) = %q, want %q", tt.objectType, tt.objectName, got, tt.want)
			}
		})
	}
}

func TestParseWhereUsedScope(t *testing.T) {
	scopeXML := `<?xml version="1.0" encoding="UTF-8"?>
<usagereferences:usageScopeResponse xmlns:usagereferences="http://www.sap.com/adt/ris/usageReferences">
  <usagereferences:objectType usagereferences:name="PROG/P" usagereferences:isSelected="true"/>
  <usagereferences:objectType usagereferences:name="CLAS/OC" usagereferences:isSelected="true"/>
  <usagereferences:objectType usagereferences:name="FUGR/F" usagereferences:isSelected="false"/>
</usagereferences:usageScopeResponse>`

	scope, err := parseWhereUsedScope([]byte(scopeXML))
	if err != nil {
		t.Fatalf("parseWhereUsedScope failed: %v", err)
	}

	if len(scope.ObjectTypes) != 3 {
		t.Fatalf("expected 3 object types, got %d", len(scope.ObjectTypes))
	}

	if scope.ObjectTypes[0].Name != "PROG/P" {
		t.Errorf("expected first type PROG/P, got %q", scope.ObjectTypes[0].Name)
	}
	if !scope.ObjectTypes[0].IsSelected {
		t.Error("PROG/P should be selected")
	}
	if scope.ObjectTypes[2].IsSelected {
		t.Error("FUGR/F should not be selected")
	}
}

func TestParseWhereUsedResults(t *testing.T) {
	resultsXML := `<?xml version="1.0" encoding="UTF-8"?>
<usageReferences:usageReferenceResult xmlns:usageReferences="http://www.sap.com/adt/ris/usageReferences" xmlns:adtcore="http://www.sap.com/adt/core">
  <usageReferences:referencedObjects>
    <usageReferences:referencedObject usageReferences:uri="/sap/bc/adt/oo/classes/ZCL_CALLER/source/main#start=15,5"
      usageReferences:objectIdentifier="ZCL_CALLER"
      usageReferences:parentUri="/sap/bc/adt/oo/classes/ZCL_CALLER"
      usageReferences:isResult="true"
      usageReferences:canHaveChildren="false"
      usageReferences:usageInformation="METHOD_CALL">
      <adtcore:adtObject adtcore:uri="/sap/bc/adt/oo/classes/ZCL_CALLER"
        adtcore:type="CLAS/OC"
        adtcore:name="ZCL_CALLER"
        adtcore:responsible="DEVELOPER"
        adtcore:description="Caller class">
        <adtcore:packageRef adtcore:uri="/sap/bc/adt/packages/%24TMP" adtcore:name="$TMP"/>
      </adtcore:adtObject>
    </usageReferences:referencedObject>
    <usageReferences:referencedObject usageReferences:uri="/sap/bc/adt/programs/programs/ZTEST_PROG/source/main#start=42,10"
      usageReferences:objectIdentifier="ZTEST_PROG"
      usageReferences:parentUri="/sap/bc/adt/programs/programs/ZTEST_PROG"
      usageReferences:isResult="true"
      usageReferences:canHaveChildren="false"
      usageReferences:usageInformation="READ">
      <adtcore:adtObject adtcore:uri="/sap/bc/adt/programs/programs/ZTEST_PROG"
        adtcore:type="PROG/P"
        adtcore:name="ZTEST_PROG"
        adtcore:responsible="DEVELOPER"
        adtcore:description="Test program">
        <adtcore:packageRef adtcore:uri="/sap/bc/adt/packages/%24TMP" adtcore:name="$TMP"/>
      </adtcore:adtObject>
    </usageReferences:referencedObject>
  </usageReferences:referencedObjects>
</usageReferences:usageReferenceResult>`

	results, err := parseWhereUsedResults([]byte(resultsXML))
	if err != nil {
		t.Fatalf("parseWhereUsedResults failed: %v", err)
	}

	if len(results) != 2 {
		t.Fatalf("expected 2 results, got %d", len(results))
	}

	// Check first result
	r1 := results[0]
	if r1.Name != "ZCL_CALLER" {
		t.Errorf("expected name ZCL_CALLER, got %q", r1.Name)
	}
	if r1.Type != "CLAS/OC" {
		t.Errorf("expected type CLAS/OC, got %q", r1.Type)
	}
	if r1.UsageInformation != "METHOD_CALL" {
		t.Errorf("expected usage METHOD_CALL, got %q", r1.UsageInformation)
	}
	if r1.PackageName != "$TMP" {
		t.Errorf("expected package $TMP, got %q", r1.PackageName)
	}
	if !r1.IsResult {
		t.Error("expected isResult to be true")
	}

	// Check second result
	r2 := results[1]
	if r2.Name != "ZTEST_PROG" {
		t.Errorf("expected name ZTEST_PROG, got %q", r2.Name)
	}
	if r2.Type != "PROG/P" {
		t.Errorf("expected type PROG/P, got %q", r2.Type)
	}
}

func TestBuildWhereUsedScopeXML(t *testing.T) {
	scope := &WhereUsedScope{
		ObjectTypes: []WhereUsedObjectType{
			{Name: "PROG/P", IsSelected: true},
			{Name: "CLAS/OC", IsSelected: true},
			{Name: "FUGR/F", IsSelected: false},
		},
	}

	// Without enableAllTypes — should preserve original selection
	xml1 := buildWhereUsedScopeXML(scope, false)
	if !strings.Contains(xml1, `name="PROG/P"`) {
		t.Error("should contain PROG/P")
	}
	if !strings.Contains(xml1, `name="FUGR/F"`) {
		t.Error("should contain FUGR/F")
	}
	// FUGR/F was not selected and enableAllTypes is false
	if strings.Count(xml1, `isSelected="true"`) != 2 {
		t.Errorf("expected 2 selected types, got XML: %s", xml1)
	}

	// With enableAllTypes — all should be selected
	xml2 := buildWhereUsedScopeXML(scope, true)
	if strings.Count(xml2, `isSelected="true"`) != 3 {
		t.Errorf("expected 3 selected types with enableAllTypes, got XML: %s", xml2)
	}
}

func TestGetWhereUsedEndToEnd(t *testing.T) {
	scopeResponse := `<?xml version="1.0" encoding="UTF-8"?>
<usagereferences:usageScopeResponse xmlns:usagereferences="http://www.sap.com/adt/ris/usageReferences">
  <usagereferences:objectType usagereferences:name="PROG/P" usagereferences:isSelected="true"/>
  <usagereferences:objectType usagereferences:name="CLAS/OC" usagereferences:isSelected="true"/>
</usagereferences:usageScopeResponse>`

	resultsResponse := `<?xml version="1.0" encoding="UTF-8"?>
<usageReferences:usageReferenceResult xmlns:usageReferences="http://www.sap.com/adt/ris/usageReferences" xmlns:adtcore="http://www.sap.com/adt/core">
  <usageReferences:referencedObjects>
    <usageReferences:referencedObject usageReferences:uri="/sap/bc/adt/oo/classes/ZCL_USER/source/main#start=10,1"
      usageReferences:objectIdentifier="ZCL_USER"
      usageReferences:isResult="true"
      usageReferences:canHaveChildren="false"
      usageReferences:usageInformation="TYPE_REF">
      <adtcore:adtObject adtcore:uri="/sap/bc/adt/oo/classes/ZCL_USER"
        adtcore:type="CLAS/OC" adtcore:name="ZCL_USER"
        adtcore:description="User class">
        <adtcore:packageRef adtcore:uri="/sap/bc/adt/packages/ZTEST" adtcore:name="ZTEST"/>
      </adtcore:adtObject>
    </usageReferences:referencedObject>
  </usageReferences:referencedObjects>
</usageReferences:usageReferenceResult>`

	requestCount := 0
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requestCount++
		// CSRF token fetch
		if r.Method == http.MethodHead {
			w.Header().Set("X-CSRF-Token", "test-token")
			w.WriteHeader(http.StatusOK)
			return
		}

		path := r.URL.Path
		if strings.Contains(path, "usageReferences/scope") {
			w.Header().Set("Content-Type", "application/xml")
			w.Write([]byte(scopeResponse))
		} else if strings.Contains(path, "usageReferences") {
			w.Header().Set("Content-Type", "application/xml")
			w.Write([]byte(resultsResponse))
		}
	}))
	defer ts.Close()

	client := NewClient(ts.URL, "user", "pass")
	results, err := client.GetWhereUsed(context.Background(), "/sap/bc/adt/oo/classes/ZCL_TEST", true)
	if err != nil {
		t.Fatalf("GetWhereUsed failed: %v", err)
	}

	if len(results) != 1 {
		t.Fatalf("expected 1 result, got %d", len(results))
	}

	if results[0].Name != "ZCL_USER" {
		t.Errorf("expected name ZCL_USER, got %q", results[0].Name)
	}
	if results[0].Type != "CLAS/OC" {
		t.Errorf("expected type CLAS/OC, got %q", results[0].Type)
	}
}

func TestGetWhereUsedByType(t *testing.T) {
	scopeResponse := `<?xml version="1.0" encoding="UTF-8"?>
<usagereferences:usageScopeResponse xmlns:usagereferences="http://www.sap.com/adt/ris/usageReferences">
  <usagereferences:objectType usagereferences:name="PROG/P" usagereferences:isSelected="true"/>
</usagereferences:usageScopeResponse>`

	resultsResponse := `<?xml version="1.0" encoding="UTF-8"?>
<usageReferences:usageReferenceResult xmlns:usageReferences="http://www.sap.com/adt/ris/usageReferences" xmlns:adtcore="http://www.sap.com/adt/core">
  <usageReferences:referencedObjects/>
</usageReferences:usageReferenceResult>`

	var capturedURI string
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodHead {
			w.Header().Set("X-CSRF-Token", "test-token")
			w.WriteHeader(http.StatusOK)
			return
		}

		// Capture the URI parameter
		if uri := r.URL.Query().Get("uri"); uri != "" {
			capturedURI = uri
		}

		if strings.Contains(r.URL.Path, "usageReferences/scope") {
			w.Write([]byte(scopeResponse))
		} else {
			w.Write([]byte(resultsResponse))
		}
	}))
	defer ts.Close()

	client := NewClient(ts.URL, "user", "pass")
	_, err := client.GetWhereUsedByType(context.Background(), "TABL", "MARA", false)
	if err != nil {
		t.Fatalf("GetWhereUsedByType failed: %v", err)
	}

	if !strings.Contains(capturedURI, "/sap/bc/adt/ddic/tables/MARA") {
		t.Errorf("expected URI to contain /sap/bc/adt/ddic/tables/MARA, got %q", capturedURI)
	}
}

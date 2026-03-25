package adt

import (
	"strings"
	"testing"
)

// ============================================================================
// Quick Win Feature Tests
// ============================================================================

func TestParseReleaseInfo(t *testing.T) {
	tests := []struct {
		name       string
		xmlData    string
		wantState  string
		wantDepr   bool
		wantCloud  bool
		wantVis    string
	}{
		{
			name:      "released object",
			xmlData:   `<class releaseState="released" visibility="public"/>`,
			wantState: "released",
			wantVis:   "public",
		},
		{
			name:      "deprecated object",
			xmlData:   `<class releaseState="deprecated" deprecated="X"/>`,
			wantState: "deprecated",
			wantDepr:  true,
		},
		{
			name:      "cloud compatible",
			xmlData:   `<class releaseState="released" useInCloudDevelopment="X"/>`,
			wantState: "released",
			wantCloud: true,
		},
		{
			name:      "not released (no attributes)",
			xmlData:   `<class name="ZCL_TEST"/>`,
			wantState: "notReleased",
		},
		{
			name:      "released via released attribute",
			xmlData:   `<class released="useInCloudDevelopment"/>`,
			wantState: "useInCloudDevelopment",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			info, err := parseReleaseInfo([]byte(tt.xmlData), "CLAS", "ZCL_TEST")
			if err != nil {
				t.Fatalf("parseReleaseInfo failed: %v", err)
			}
			if info.ReleaseState != tt.wantState {
				t.Errorf("releaseState = %q, want %q", info.ReleaseState, tt.wantState)
			}
			if info.Deprecated != tt.wantDepr {
				t.Errorf("deprecated = %v, want %v", info.Deprecated, tt.wantDepr)
			}
			if info.UseInCloudDev != tt.wantCloud {
				t.Errorf("useInCloudDev = %v, want %v", info.UseInCloudDev, tt.wantCloud)
			}
			if info.Visibility != tt.wantVis {
				t.Errorf("visibility = %q, want %q", info.Visibility, tt.wantVis)
			}
			if info.ObjectName != "ZCL_TEST" {
				t.Errorf("objectName = %q, want ZCL_TEST", info.ObjectName)
			}
			if info.ObjectType != "CLAS" {
				t.Errorf("objectType = %q, want CLAS", info.ObjectType)
			}
		})
	}
}

func TestBuildObjectURL(t *testing.T) {
	tests := []struct {
		objectType string
		objectName string
		wantURL    string
	}{
		{"CLAS", "ZCL_TEST", "/sap/bc/adt/oo/classes/ZCL_TEST"},
		{"INTF", "ZIF_TEST", "/sap/bc/adt/oo/interfaces/ZIF_TEST"},
		{"PROG", "ZTEST", "/sap/bc/adt/programs/programs/ZTEST"},
		{"FUGR", "ZFGRP", "/sap/bc/adt/functions/groups/ZFGRP"},
		{"TABL", "MARA", "/sap/bc/adt/ddic/tables/MARA"},
		{"DDLS", "ZI_TEST", "/sap/bc/adt/ddic/ddl/sources/ZI_TEST"},
		{"DTEL", "MATNR", "/sap/bc/adt/ddic/dataelements/MATNR"},
		{"DOMA", "MATNR", "/sap/bc/adt/ddic/domains/MATNR"},
		{"UNKNOWN", "TEST", "/sap/bc/adt/programs/programs/TEST"},
	}

	for _, tt := range tests {
		t.Run(tt.objectType+"_"+tt.objectName, func(t *testing.T) {
			got := buildObjectURL(tt.objectType, tt.objectName)
			if got != tt.wantURL {
				t.Errorf("buildObjectURL(%q, %q) = %q, want %q", tt.objectType, tt.objectName, got, tt.wantURL)
			}
		})
	}
}

func TestBuildObjectURL_Namespaced(t *testing.T) {
	got := buildObjectURL("CLAS", "/UI5/CL_TEST")
	// url.PathEscape encodes / as %2F
	if !strings.Contains(got, "%2F") {
		t.Errorf("namespaced object URL should contain encoded slash, got %q", got)
	}
}

func TestParseTransportReferences_Empty(t *testing.T) {
	refs, err := parseTransportReferences([]byte{})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(refs) != 0 {
		t.Errorf("expected empty result, got %d refs", len(refs))
	}
}

func TestParseTransportReferences_InvalidXML(t *testing.T) {
	refs, err := parseTransportReferences([]byte("not xml"))
	if err != nil {
		t.Fatalf("should not error on invalid XML (graceful degradation): %v", err)
	}
	if len(refs) != 0 {
		t.Errorf("expected empty result for invalid XML, got %d", len(refs))
	}
}

func TestParsePackageNodeStructure_WithSubPackages(t *testing.T) {
	xmlData := `<?xml version="1.0" encoding="UTF-8"?>
<asx:abap xmlns:asx="http://www.sap.com/abapxml" version="1.0">
  <asx:values>
    <DATA>
      <TREE_CONTENT>
        <SEU_ADT_REPOSITORY_OBJ_NODE>
          <OBJECT_TYPE>DEVC/K</OBJECT_TYPE>
          <OBJECT_NAME>$ZADT_01</OBJECT_NAME>
          <OBJECT_URI>/sap/bc/adt/packages/$ZADT_01</OBJECT_URI>
          <DESCRIPTION>Sub package 01</DESCRIPTION>
        </SEU_ADT_REPOSITORY_OBJ_NODE>
        <SEU_ADT_REPOSITORY_OBJ_NODE>
          <OBJECT_TYPE>CLAS/OC</OBJECT_TYPE>
          <OBJECT_NAME>ZCL_TEST</OBJECT_NAME>
          <OBJECT_URI>/sap/bc/adt/oo/classes/zcl_test</OBJECT_URI>
          <DESCRIPTION>Test class</DESCRIPTION>
        </SEU_ADT_REPOSITORY_OBJ_NODE>
      </TREE_CONTENT>
    </DATA>
  </asx:values>
</asx:abap>`

	pkg, err := parsePackageNodeStructure([]byte(xmlData), "$ZADT")
	if err != nil {
		t.Fatalf("parsePackageNodeStructure failed: %v", err)
	}
	if len(pkg.SubPackages) != 1 {
		t.Fatalf("expected 1 subpackage, got %d", len(pkg.SubPackages))
	}
	if pkg.SubPackages[0] != "$ZADT_01" {
		t.Errorf("subpackage = %q, want $ZADT_01", pkg.SubPackages[0])
	}
	if len(pkg.Objects) != 1 {
		t.Fatalf("expected 1 object, got %d", len(pkg.Objects))
	}
	if pkg.Objects[0].Name != "ZCL_TEST" {
		t.Errorf("object name = %q, want ZCL_TEST", pkg.Objects[0].Name)
	}
}

func TestPackageContentHasSubPackageContents(t *testing.T) {
	pkg := &PackageContent{
		Name:        "$ZADT",
		SubPackages: []string{"$ZADT_01"},
		SubPackageContents: []*PackageContent{
			{
				Name: "$ZADT_01",
				Objects: []PackageObject{
					{Type: "CLAS/OC", Name: "ZCL_TEST"},
				},
			},
		},
	}

	if len(pkg.SubPackageContents) != 1 {
		t.Fatalf("expected 1 sub package content, got %d", len(pkg.SubPackageContents))
	}
	if pkg.SubPackageContents[0].Name != "$ZADT_01" {
		t.Errorf("sub package name = %q, want $ZADT_01", pkg.SubPackageContents[0].Name)
	}
}

func TestPackageContentErrorField(t *testing.T) {
	pkg := &PackageContent{
		Name:  "$FAIL",
		Error: "failed to read: connection refused",
	}
	if pkg.Error == "" {
		t.Error("expected error field to be set")
	}
}

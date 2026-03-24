package adt

import (
	"context"
	"encoding/xml"
	"fmt"
	"net/http"
	"net/url"
	"strings"
)

// WhereUsedScope represents the available scope for where-used analysis.
type WhereUsedScope struct {
	ObjectTypes []WhereUsedObjectType `json:"objectTypes"`
}

// WhereUsedObjectType represents an object type available for where-used filtering.
type WhereUsedObjectType struct {
	Name       string `json:"name"`
	IsSelected bool   `json:"isSelected"`
}

// WhereUsedResult represents a single where-used reference.
type WhereUsedResult struct {
	URI              string `json:"uri"`
	ObjectIdentifier string `json:"objectIdentifier"`
	ParentURI        string `json:"parentUri"`
	IsResult         bool   `json:"isResult"`
	CanHaveChildren  bool   `json:"canHaveChildren"`
	UsageInformation string `json:"usageInformation"`
	Name             string `json:"name"`
	Type             string `json:"type"`
	Description      string `json:"description"`
	Responsible      string `json:"responsible"`
	PackageURI       string `json:"packageUri"`
	PackageName      string `json:"packageName"`
}

// objectTypeToURI maps friendly object type names to ADT URI paths.
func objectTypeToURI(objectType, objectName string) string {
	objectName = strings.ToUpper(objectName)
	switch strings.ToUpper(objectType) {
	case "CLAS", "CLASS":
		return fmt.Sprintf("/sap/bc/adt/oo/classes/%s", url.PathEscape(objectName))
	case "INTF", "INTERFACE":
		return fmt.Sprintf("/sap/bc/adt/oo/interfaces/%s", url.PathEscape(objectName))
	case "PROG", "PROGRAM":
		return fmt.Sprintf("/sap/bc/adt/programs/programs/%s", url.PathEscape(objectName))
	case "TABL", "TABLE":
		return fmt.Sprintf("/sap/bc/adt/ddic/tables/%s", url.PathEscape(objectName))
	case "DOMA", "DOMAIN":
		return fmt.Sprintf("/sap/bc/adt/ddic/domains/%s", url.PathEscape(objectName))
	case "DTEL", "DATAELEMENT":
		return fmt.Sprintf("/sap/bc/adt/ddic/dataelements/%s", url.PathEscape(objectName))
	case "DDLS", "CDS", "VIEW":
		return fmt.Sprintf("/sap/bc/adt/ddic/ddl/sources/%s", url.PathEscape(objectName))
	case "STRU", "STRUCTURE":
		return fmt.Sprintf("/sap/bc/adt/ddic/structures/%s", url.PathEscape(objectName))
	case "DEVC", "PACKAGE":
		return fmt.Sprintf("/sap/bc/adt/packages/%s", url.PathEscape(objectName))
	case "FUGR", "FUNCTIONGROUP":
		return fmt.Sprintf("/sap/bc/adt/functions/groups/%s", url.PathEscape(objectName))
	default:
		// If it looks like a full URI already, use it directly
		if strings.HasPrefix(objectType, "/sap/bc/adt/") {
			return objectType
		}
		// Fall back to using the name as a class
		return fmt.Sprintf("/sap/bc/adt/oo/classes/%s", url.PathEscape(objectName))
	}
}

// GetWhereUsedScope retrieves the available object type scope for where-used analysis.
// This is step 1 of the 2-step where-used process (Eclipse ADT compatible).
func (c *Client) GetWhereUsedScope(ctx context.Context, objectURI string) (*WhereUsedScope, error) {
	endpoint := fmt.Sprintf("/sap/bc/adt/repository/informationsystem/usageReferences/scope?uri=%s",
		url.QueryEscape(objectURI))

	body := `<?xml version="1.0" encoding="ASCII"?>
<usagereferences:usageScopeRequest xmlns:usagereferences="http://www.sap.com/adt/ris/usageReferences">
  <usagereferences:affectedObjects/>
</usagereferences:usageScopeRequest>`

	resp, err := c.transport.Request(ctx, endpoint, &RequestOptions{
		Method:      http.MethodPost,
		Body:        []byte(body),
		ContentType: "application/vnd.sap.adt.repository.usagereferences.scope.request.v1+xml",
		Accept:      "application/vnd.sap.adt.repository.usagereferences.scope.response.v1+xml",
	})
	if err != nil {
		return nil, fmt.Errorf("get where-used scope failed: %w", err)
	}

	return parseWhereUsedScope(resp.Body)
}

func parseWhereUsedScope(data []byte) (*WhereUsedScope, error) {
	// Strip namespace prefixes for easier parsing
	xmlStr := string(data)
	xmlStr = strings.ReplaceAll(xmlStr, "usagereferences:", "")
	xmlStr = strings.ReplaceAll(xmlStr, "adtcore:", "")

	type objectType struct {
		Name       string `xml:"name,attr"`
		IsSelected string `xml:"isSelected,attr"`
	}
	type scopeResponse struct {
		Types []objectType `xml:"objectType"`
	}

	var resp scopeResponse
	if err := xml.Unmarshal([]byte(xmlStr), &resp); err != nil {
		return nil, fmt.Errorf("parsing where-used scope: %w", err)
	}

	scope := &WhereUsedScope{}
	for _, t := range resp.Types {
		scope.ObjectTypes = append(scope.ObjectTypes, WhereUsedObjectType{
			Name:       t.Name,
			IsSelected: t.IsSelected == "true",
		})
	}
	return scope, nil
}

// GetWhereUsed performs a where-used analysis on an ABAP object.
// objectURI is the ADT URI of the object (e.g., "/sap/bc/adt/oo/classes/ZCL_TEST").
// enableAllTypes: if true, searches across all object types; otherwise uses SAP defaults.
//
// This uses the 2-step Eclipse ADT approach:
// 1. Get scope (available object types)
// 2. Execute search with scope filter
func (c *Client) GetWhereUsed(ctx context.Context, objectURI string, enableAllTypes bool) ([]WhereUsedResult, error) {
	// Step 1: Get scope
	scope, err := c.GetWhereUsedScope(ctx, objectURI)
	if err != nil {
		return nil, fmt.Errorf("getting where-used scope: %w", err)
	}

	// Step 2: Build scope XML for the search request
	scopeXML := buildWhereUsedScopeXML(scope, enableAllTypes)

	endpoint := fmt.Sprintf("/sap/bc/adt/repository/informationsystem/usageReferences?uri=%s",
		url.QueryEscape(objectURI))

	resp, err := c.transport.Request(ctx, endpoint, &RequestOptions{
		Method:      http.MethodPost,
		Body:        []byte(scopeXML),
		ContentType: "application/vnd.sap.adt.repository.usagereferences.request.v1+xml",
		Accept:      "application/vnd.sap.adt.repository.usagereferences.result.v1+xml",
	})
	if err != nil {
		return nil, fmt.Errorf("get where-used failed: %w", err)
	}

	return parseWhereUsedResults(resp.Body)
}

// GetWhereUsedByType performs a where-used analysis using a friendly object type name.
// objectType: CLAS, INTF, PROG, TABL, DOMA, DTEL, DDLS, STRU, DEVC, FUGR
// objectName: Name of the ABAP object
func (c *Client) GetWhereUsedByType(ctx context.Context, objectType, objectName string, enableAllTypes bool) ([]WhereUsedResult, error) {
	uri := objectTypeToURI(objectType, objectName)
	return c.GetWhereUsed(ctx, uri, enableAllTypes)
}

func buildWhereUsedScopeXML(scope *WhereUsedScope, enableAllTypes bool) string {
	var typeElements strings.Builder
	for _, t := range scope.ObjectTypes {
		selected := "false"
		if t.IsSelected || enableAllTypes {
			selected = "true"
		}
		typeElements.WriteString(fmt.Sprintf(
			`<usagereferences:objectType usagereferences:name="%s" usagereferences:isSelected="%s"/>`,
			t.Name, selected))
	}

	return fmt.Sprintf(`<?xml version="1.0" encoding="ASCII"?>
<usagereferences:usageReferenceRequest xmlns:usagereferences="http://www.sap.com/adt/ris/usageReferences">
  <usagereferences:affectedObjects/>
  <usagereferences:objectScope>%s</usagereferences:objectScope>
</usagereferences:usageReferenceRequest>`, typeElements.String())
}

func parseWhereUsedResults(data []byte) ([]WhereUsedResult, error) {
	// Strip namespace prefixes
	xmlStr := string(data)
	xmlStr = strings.ReplaceAll(xmlStr, "usageReferences:", "")
	xmlStr = strings.ReplaceAll(xmlStr, "usagereferences:", "")
	xmlStr = strings.ReplaceAll(xmlStr, "adtcore:", "")

	type packageRef struct {
		URI  string `xml:"uri,attr"`
		Name string `xml:"name,attr"`
	}
	type adtObject struct {
		URI         string     `xml:"uri,attr"`
		Type        string     `xml:"type,attr"`
		Name        string     `xml:"name,attr"`
		Responsible string     `xml:"responsible,attr"`
		Description string     `xml:"description,attr"`
		PackageRef  packageRef `xml:"packageRef"`
	}
	type referencedObject struct {
		URI              string    `xml:"uri,attr"`
		ObjectIdentifier string    `xml:"objectIdentifier,attr"`
		ParentURI        string    `xml:"parentUri,attr"`
		IsResult         bool      `xml:"isResult,attr"`
		CanHaveChildren  bool      `xml:"canHaveChildren,attr"`
		UsageInformation string    `xml:"usageInformation,attr"`
		AdtObject        adtObject `xml:"adtObject"`
	}
	type referencedObjects struct {
		Objects []referencedObject `xml:"referencedObject"`
	}
	type response struct {
		ReferencedObjects referencedObjects `xml:"referencedObjects"`
	}

	var resp response
	if err := xml.Unmarshal([]byte(xmlStr), &resp); err != nil {
		return nil, fmt.Errorf("parsing where-used results: %w", err)
	}

	var results []WhereUsedResult
	for _, obj := range resp.ReferencedObjects.Objects {
		ref := WhereUsedResult{
			URI:              obj.URI,
			ObjectIdentifier: obj.ObjectIdentifier,
			ParentURI:        obj.ParentURI,
			IsResult:         obj.IsResult,
			CanHaveChildren:  obj.CanHaveChildren,
			UsageInformation: obj.UsageInformation,
			Name:             obj.AdtObject.Name,
			Type:             obj.AdtObject.Type,
			Description:      obj.AdtObject.Description,
			Responsible:      obj.AdtObject.Responsible,
			PackageURI:       obj.AdtObject.PackageRef.URI,
			PackageName:      obj.AdtObject.PackageRef.Name,
		}
		if ref.Type == "" && ref.URI != "" {
			ref.Type = extractTypeFromURI(ref.URI)
		}
		results = append(results, ref)
	}

	return results, nil
}

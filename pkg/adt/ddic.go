package adt

import (
	"context"
	"encoding/xml"
	"fmt"
	"net/http"
	"net/url"
	"strings"
)

// --- Domain Operations ---

// Domain represents an ABAP domain.
type Domain struct {
	Name           string        `json:"name"`
	Description    string        `json:"description"`
	Package        string        `json:"package"`
	DataType       string        `json:"dataType"`
	Length         int           `json:"length,omitempty"`
	Decimals      int           `json:"decimals,omitempty"`
	ConversionExit string        `json:"conversionExit,omitempty"`
	Lowercase     bool          `json:"lowercase,omitempty"`
	ValueTable    string        `json:"valueTable,omitempty"`
	FixedValues   []FixedValue  `json:"fixedValues,omitempty"`
}

// FixedValue represents a fixed value in a domain.
type FixedValue struct {
	Low         string `json:"low"`
	High        string `json:"high,omitempty"`
	Description string `json:"description,omitempty"`
}

// GetDomain retrieves an ABAP domain.
func (c *Client) GetDomain(ctx context.Context, name string) (*Domain, error) {
	name = strings.ToUpper(name)
	endpoint := fmt.Sprintf("/sap/bc/adt/ddic/domains/%s", url.PathEscape(name))

	resp, err := c.transport.Request(ctx, endpoint, &RequestOptions{
		Method: http.MethodGet,
		Accept: "application/vnd.sap.adt.domains.v2+xml, application/vnd.sap.adt.domains.v1+xml",
	})
	if err != nil {
		return nil, fmt.Errorf("get domain failed: %w", err)
	}

	return parseDomain(resp.Body)
}

func parseDomain(data []byte) (*Domain, error) {
	xmlStr := string(data)
	xmlStr = strings.ReplaceAll(xmlStr, "doma:", "")
	xmlStr = strings.ReplaceAll(xmlStr, "adtcore:", "")

	type fixedVal struct {
		Low         string `xml:"low,attr"`
		High        string `xml:"high,attr"`
		Description string `xml:"description,attr"`
	}
	type packageRef struct {
		Name string `xml:"name,attr"`
	}
	type domain struct {
		Name           string     `xml:"name,attr"`
		Description    string     `xml:"description,attr"`
		DataType       string     `xml:"dataType,attr"`
		Length         int        `xml:"length,attr"`
		Decimals       int        `xml:"decimals,attr"`
		ConversionExit string     `xml:"conversionExit,attr"`
		Lowercase      bool       `xml:"lowercase,attr"`
		ValueTable     string     `xml:"valueTable,attr"`
		PackageRef     packageRef `xml:"packageRef"`
		FixedValues    []fixedVal `xml:"fixedValue"`
	}

	var resp domain
	if err := xml.Unmarshal([]byte(xmlStr), &resp); err != nil {
		return nil, fmt.Errorf("parsing domain: %w", err)
	}

	d := &Domain{
		Name:           resp.Name,
		Description:    resp.Description,
		Package:        resp.PackageRef.Name,
		DataType:       resp.DataType,
		Length:         resp.Length,
		Decimals:       resp.Decimals,
		ConversionExit: resp.ConversionExit,
		Lowercase:      resp.Lowercase,
		ValueTable:     resp.ValueTable,
	}

	for _, fv := range resp.FixedValues {
		d.FixedValues = append(d.FixedValues, FixedValue{
			Low:         fv.Low,
			High:        fv.High,
			Description: fv.Description,
		})
	}

	return d, nil
}

// CreateDomain creates a new ABAP domain.
func (c *Client) CreateDomain(ctx context.Context, name, description, packageName, dataType string, length, decimals int, transport string) error {
	if err := c.checkSafety(OpCreate, "CreateDomain"); err != nil {
		return err
	}
	if err := c.checkPackageSafety(packageName); err != nil {
		return err
	}
	if transport != "" {
		if err := c.checkTransportableEdit(transport, "CreateDomain"); err != nil {
			return err
		}
	}

	name = strings.ToUpper(name)

	body := fmt.Sprintf(`<?xml version="1.0" encoding="UTF-8"?>
<doma:domain xmlns:doma="http://www.sap.com/dictionary/domain" xmlns:adtcore="http://www.sap.com/adt/core"
  adtcore:name="%s" adtcore:description="%s" adtcore:type="DOMA/DD"
  doma:dataType="%s" doma:length="%d" doma:decimals="%d">
  <adtcore:packageRef adtcore:name="%s"/>
</doma:domain>`, name, description, dataType, length, decimals, packageName)

	endpoint := "/sap/bc/adt/ddic/domains"
	params := url.Values{}
	if transport != "" {
		params.Set("corrNr", transport)
	}

	_, err := c.transport.Request(ctx, endpoint, &RequestOptions{
		Method:      http.MethodPost,
		Body:        []byte(body),
		ContentType: "application/vnd.sap.adt.domains.v2+xml",
		Accept:      "application/vnd.sap.adt.domains.v2+xml",
		Query:       params,
	})
	if err != nil {
		return fmt.Errorf("create domain failed: %w", err)
	}

	return nil
}

// ValidateDomain validates a domain before creation.
func (c *Client) ValidateDomain(ctx context.Context, name, packageName, description string) error {
	name = strings.ToUpper(name)
	endpoint := "/sap/bc/adt/ddic/domains/validation"

	params := url.Values{}
	params.Set("objtype", "doma")
	params.Set("objname", name)
	params.Set("packagename", packageName)
	params.Set("description", description)

	_, err := c.transport.Request(ctx, endpoint, &RequestOptions{
		Method: http.MethodPost,
		Query:  params,
	})
	if err != nil {
		return fmt.Errorf("validate domain failed: %w", err)
	}

	return nil
}

// --- DataElement Operations ---

// DataElement represents an ABAP data element.
type DataElement struct {
	Name        string          `json:"name"`
	Description string          `json:"description"`
	Package     string          `json:"package"`
	TypeKind    string          `json:"typeKind"`    // domain, predefinedAbapType, refToDictionaryType, etc.
	TypeName    string          `json:"typeName"`    // Domain name or predefined type
	Length      int             `json:"length,omitempty"`
	Decimals    int             `json:"decimals,omitempty"`
	Labels      DataElementLabels `json:"labels,omitempty"`
}

// DataElementLabels represents the field labels for a data element.
type DataElementLabels struct {
	Short   string `json:"short,omitempty"`
	Medium  string `json:"medium,omitempty"`
	Long    string `json:"long,omitempty"`
	Heading string `json:"heading,omitempty"`
}

// GetDataElement retrieves an ABAP data element.
func (c *Client) GetDataElement(ctx context.Context, name string) (*DataElement, error) {
	name = strings.ToUpper(name)
	endpoint := fmt.Sprintf("/sap/bc/adt/ddic/dataelements/%s", url.PathEscape(name))

	resp, err := c.transport.Request(ctx, endpoint, &RequestOptions{
		Method: http.MethodGet,
		Accept: "application/vnd.sap.adt.dataelements.v2+xml, application/vnd.sap.adt.dataelements.v1+xml",
	})
	if err != nil {
		return nil, fmt.Errorf("get data element failed: %w", err)
	}

	return parseDataElement(resp.Body)
}

type xmlLabel struct {
	Text   string `xml:"text,attr"`
	Length int    `xml:"length,attr"`
}

type xmlPackageRef struct {
	Name string `xml:"name,attr"`
}

type xmlDataElement struct {
	Name        string        `xml:"name,attr"`
	Description string        `xml:"description,attr"`
	TypeKind    string        `xml:"typeKind,attr"`
	TypeName    string        `xml:"typeName,attr"`
	Length      int           `xml:"length,attr"`
	Decimals    int           `xml:"decimals,attr"`
	PackageRef  xmlPackageRef `xml:"packageRef"`
	ShortLabel  xmlLabel      `xml:"shortLabel"`
	MediumLabel xmlLabel      `xml:"mediumLabel"`
	LongLabel   xmlLabel      `xml:"longLabel"`
	Heading     xmlLabel      `xml:"heading"`
}

func xmlDataElementToDataElement(x *xmlDataElement) *DataElement {
	return &DataElement{
		Name:        x.Name,
		Description: x.Description,
		Package:     x.PackageRef.Name,
		TypeKind:    x.TypeKind,
		TypeName:    x.TypeName,
		Length:      x.Length,
		Decimals:    x.Decimals,
		Labels: DataElementLabels{
			Short:   x.ShortLabel.Text,
			Medium:  x.MediumLabel.Text,
			Long:    x.LongLabel.Text,
			Heading: x.Heading.Text,
		},
	}
}

func parseDataElement(data []byte) (*DataElement, error) {
	xmlStr := string(data)
	xmlStr = strings.ReplaceAll(xmlStr, "dtel:", "")
	xmlStr = strings.ReplaceAll(xmlStr, "blue:", "")
	xmlStr = strings.ReplaceAll(xmlStr, "adtcore:", "")

	// Try parsing as wrapper (wbobj > dataElement) first
	type wrapper struct {
		Inner xmlDataElement `xml:"dataElement"`
	}
	var w wrapper
	if err := xml.Unmarshal([]byte(xmlStr), &w); err == nil && w.Inner.Name != "" {
		return xmlDataElementToDataElement(&w.Inner), nil
	}

	// Fall back to direct parsing (some systems return without wrapper)
	var resp xmlDataElement
	if err := xml.Unmarshal([]byte(xmlStr), &resp); err != nil {
		return nil, fmt.Errorf("parsing data element: %w", err)
	}

	return xmlDataElementToDataElement(&resp), nil
}

// CreateDataElement creates a new ABAP data element.
func (c *Client) CreateDataElement(ctx context.Context, name, description, packageName, domainName, transport string) error {
	if err := c.checkSafety(OpCreate, "CreateDataElement"); err != nil {
		return err
	}
	if err := c.checkPackageSafety(packageName); err != nil {
		return err
	}
	if transport != "" {
		if err := c.checkTransportableEdit(transport, "CreateDataElement"); err != nil {
			return err
		}
	}

	name = strings.ToUpper(name)

	body := fmt.Sprintf(`<?xml version="1.0" encoding="UTF-8"?>
<blue:wbobj xmlns:blue="http://www.sap.com/wbobj/dictionary/dtel" xmlns:dtel="http://www.sap.com/adt/dictionary/dataelements" xmlns:adtcore="http://www.sap.com/adt/core">
  <dtel:dataElement adtcore:name="%s" adtcore:description="%s" adtcore:type="DTEL/DE"
    dtel:typeKind="domain" dtel:typeName="%s">
    <adtcore:packageRef adtcore:name="%s"/>
  </dtel:dataElement>
</blue:wbobj>`, name, description, domainName, packageName)

	endpoint := "/sap/bc/adt/ddic/dataelements"
	params := url.Values{}
	if transport != "" {
		params.Set("corrNr", transport)
	}

	_, err := c.transport.Request(ctx, endpoint, &RequestOptions{
		Method:      http.MethodPost,
		Body:        []byte(body),
		ContentType: "application/vnd.sap.adt.dataelements.v2+xml",
		Accept:      "application/vnd.sap.adt.dataelements.v2+xml",
		Query:       params,
	})
	if err != nil {
		return fmt.Errorf("create data element failed: %w", err)
	}

	return nil
}

// ValidateDataElement validates a data element before creation.
func (c *Client) ValidateDataElement(ctx context.Context, name, packageName, description string) error {
	name = strings.ToUpper(name)
	endpoint := "/sap/bc/adt/ddic/dataelements/validation"

	params := url.Values{}
	params.Set("objtype", "dtel")
	params.Set("objname", name)
	params.Set("packagename", packageName)
	params.Set("description", description)

	_, err := c.transport.Request(ctx, endpoint, &RequestOptions{
		Method: http.MethodPost,
		Query:  params,
	})
	if err != nil {
		return fmt.Errorf("validate data element failed: %w", err)
	}

	return nil
}

// --- Structure Operations ---

// GetStructure retrieves an ABAP structure definition from DDIC.
func (c *Client) GetStructureDefinition(ctx context.Context, name string) (*TableStructure, error) {
	name = strings.ToUpper(name)
	endpoint := fmt.Sprintf("/sap/bc/adt/ddic/structures/%s", url.PathEscape(name))

	resp, err := c.transport.Request(ctx, endpoint, &RequestOptions{
		Method: http.MethodGet,
		Accept: "application/*",
	})
	if err != nil {
		return nil, fmt.Errorf("get structure failed: %w", err)
	}

	var result TableStructure
	if err := xml.Unmarshal(resp.Body, &result); err != nil {
		return nil, fmt.Errorf("parsing structure: %w", err)
	}

	return &result, nil
}

// --- DDLX (Metadata Extension) Operations ---

// MetadataExtension represents a CDS metadata extension.
type MetadataExtension struct {
	Name        string `json:"name"`
	Description string `json:"description"`
	Package     string `json:"package"`
	Source      string `json:"source"`
}

// GetMetadataExtension retrieves a CDS metadata extension (DDLX).
func (c *Client) GetMetadataExtension(ctx context.Context, name string) (*MetadataExtension, error) {
	name = strings.ToUpper(name)
	endpoint := fmt.Sprintf("/sap/bc/adt/ddic/ddlx/sources/%s", url.PathEscape(name))

	resp, err := c.transport.Request(ctx, endpoint, &RequestOptions{
		Method: http.MethodGet,
		Accept: "application/vnd.sap.adt.ddic.ddlx.v1+xml",
	})
	if err != nil {
		return nil, fmt.Errorf("get metadata extension failed: %w", err)
	}

	return parseMetadataExtension(resp.Body)
}

func parseMetadataExtension(data []byte) (*MetadataExtension, error) {
	xmlStr := string(data)
	xmlStr = strings.ReplaceAll(xmlStr, "ddlxsources:", "")
	xmlStr = strings.ReplaceAll(xmlStr, "adtcore:", "")

	type packageRef struct {
		Name string `xml:"name,attr"`
	}
	type ddlx struct {
		Name        string     `xml:"name,attr"`
		Description string     `xml:"description,attr"`
		PackageRef  packageRef `xml:"packageRef"`
		Source      string     `xml:"source"`
	}

	var resp ddlx
	if err := xml.Unmarshal([]byte(xmlStr), &resp); err != nil {
		return nil, fmt.Errorf("parsing metadata extension: %w", err)
	}

	return &MetadataExtension{
		Name:        resp.Name,
		Description: resp.Description,
		Package:     resp.PackageRef.Name,
		Source:      resp.Source,
	}, nil
}

// GetMetadataExtensionSource retrieves just the source code of a DDLX.
func (c *Client) GetMetadataExtensionSource(ctx context.Context, name string) (string, error) {
	name = strings.ToUpper(name)
	endpoint := fmt.Sprintf("/sap/bc/adt/ddic/ddlx/sources/%s/source/main", url.PathEscape(name))

	resp, err := c.transport.Request(ctx, endpoint, &RequestOptions{
		Method: http.MethodGet,
		Accept: "text/plain",
	})
	if err != nil {
		return "", fmt.Errorf("get metadata extension source failed: %w", err)
	}

	return string(resp.Body), nil
}

// CreateMetadataExtension creates a new CDS metadata extension (DDLX).
func (c *Client) CreateMetadataExtension(ctx context.Context, name, description, packageName, source, transport string) error {
	if err := c.checkSafety(OpCreate, "CreateMetadataExtension"); err != nil {
		return err
	}
	if err := c.checkPackageSafety(packageName); err != nil {
		return err
	}
	if transport != "" {
		if err := c.checkTransportableEdit(transport, "CreateMetadataExtension"); err != nil {
			return err
		}
	}

	name = strings.ToUpper(name)

	body := fmt.Sprintf(`<?xml version="1.0" encoding="UTF-8"?>
<ddlxsources:ddlxSource xmlns:ddlxsources="http://www.sap.com/adt/ddic/ddlxsources" xmlns:adtcore="http://www.sap.com/adt/core"
  adtcore:name="%s" adtcore:description="%s" adtcore:type="DDLX/EX">
  <adtcore:packageRef adtcore:name="%s"/>
  <ddlxsources:source>%s</ddlxsources:source>
</ddlxsources:ddlxSource>`, name, description, packageName, source)

	endpoint := "/sap/bc/adt/ddic/ddlx/sources"
	params := url.Values{}
	if transport != "" {
		params.Set("corrNr", transport)
	}

	_, err := c.transport.Request(ctx, endpoint, &RequestOptions{
		Method:      http.MethodPost,
		Body:        []byte(body),
		ContentType: "application/vnd.sap.adt.ddic.ddlx.v1+xml",
		Accept:      "application/vnd.sap.adt.ddic.ddlx.v1+xml",
		Query:       params,
	})
	if err != nil {
		return fmt.Errorf("create metadata extension failed: %w", err)
	}

	return nil
}

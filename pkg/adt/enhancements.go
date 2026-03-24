package adt

import (
	"context"
	"encoding/xml"
	"fmt"
	"net/http"
	"net/url"
	"strings"
)

// EnhancementSpot represents an enhancement spot (BAdI container).
type EnhancementSpot struct {
	Name        string              `json:"name"`
	Description string              `json:"description"`
	Package     string              `json:"package"`
	URI         string              `json:"uri"`
	BAdIs       []BAdIDefinition    `json:"badis,omitempty"`
}

// BAdIDefinition represents a BAdI within an enhancement spot.
type BAdIDefinition struct {
	Name          string `json:"name"`
	InterfaceName string `json:"interfaceName"`
	Description   string `json:"description"`
}

// EnhancementElement represents an enhancement in source code.
type EnhancementElement struct {
	Name        string `json:"name"`
	Type        string `json:"type"`        // e.g., "ENHS/ENHO" for enhancement implementation
	Description string `json:"description"`
	Source      string `json:"source,omitempty"`
}

// GetEnhancementSpot retrieves metadata for an enhancement spot.
// spotName is the name of the enhancement spot (e.g., "BADI_MATERIAL_CHECK")
func (c *Client) GetEnhancementSpot(ctx context.Context, spotName string) (*EnhancementSpot, error) {
	spotName = strings.ToUpper(spotName)
	endpoint := fmt.Sprintf("/sap/bc/adt/enhancements/enhsxsb/%s", url.PathEscape(spotName))

	resp, err := c.transport.Request(ctx, endpoint, &RequestOptions{
		Method: http.MethodGet,
		Accept: "application/vnd.sap.adt.enhancements.v1+xml",
	})
	if err != nil {
		return nil, fmt.Errorf("get enhancement spot failed: %w", err)
	}

	return parseEnhancementSpot(resp.Body, spotName)
}

func parseEnhancementSpot(data []byte, spotName string) (*EnhancementSpot, error) {
	// Strip namespace prefixes
	xmlStr := string(data)
	xmlStr = strings.ReplaceAll(xmlStr, "enh:", "")
	xmlStr = strings.ReplaceAll(xmlStr, "adtcore:", "")

	type badi struct {
		Name          string `xml:"name,attr"`
		InterfaceName string `xml:"interfaceName,attr"`
		Description   string `xml:"description,attr"`
	}
	type packageRef struct {
		Name string `xml:"name,attr"`
	}
	type enhSpot struct {
		Name        string     `xml:"name,attr"`
		Description string     `xml:"description,attr"`
		BAdIs       []badi     `xml:"badi"`
		PackageRef  packageRef `xml:"packageRef"`
	}

	var resp enhSpot
	if err := xml.Unmarshal([]byte(xmlStr), &resp); err != nil {
		return nil, fmt.Errorf("parsing enhancement spot: %w", err)
	}

	spot := &EnhancementSpot{
		Name:        resp.Name,
		Description: resp.Description,
		Package:     resp.PackageRef.Name,
		URI:         fmt.Sprintf("/sap/bc/adt/enhancements/enhsxsb/%s", url.PathEscape(spotName)),
	}

	for _, b := range resp.BAdIs {
		spot.BAdIs = append(spot.BAdIs, BAdIDefinition{
			Name:          b.Name,
			InterfaceName: b.InterfaceName,
			Description:   b.Description,
		})
	}

	return spot, nil
}

// GetEnhancements retrieves enhancement elements for an ABAP object's source.
// objectURL is the ADT URL of the object (e.g., "/sap/bc/adt/programs/programs/ZTEST")
func (c *Client) GetEnhancements(ctx context.Context, objectURL string) ([]EnhancementElement, error) {
	endpoint := fmt.Sprintf("%s/source/main/enhancements/elements", objectURL)

	resp, err := c.transport.Request(ctx, endpoint, &RequestOptions{
		Method: http.MethodGet,
		Accept: "application/*",
	})
	if err != nil {
		return nil, fmt.Errorf("get enhancements failed: %w", err)
	}

	return parseEnhancementElements(resp.Body)
}

func parseEnhancementElements(data []byte) ([]EnhancementElement, error) {
	// Strip namespace prefixes
	xmlStr := string(data)
	xmlStr = strings.ReplaceAll(xmlStr, "enh:", "")
	xmlStr = strings.ReplaceAll(xmlStr, "adtcore:", "")

	type element struct {
		Name        string `xml:"name,attr"`
		Type        string `xml:"type,attr"`
		Description string `xml:"description,attr"`
		Source      string `xml:"source"`
	}
	type elements struct {
		Elements []element `xml:"element"`
	}

	var resp elements
	if err := xml.Unmarshal([]byte(xmlStr), &resp); err != nil {
		return nil, fmt.Errorf("parsing enhancement elements: %w", err)
	}

	var results []EnhancementElement
	for _, e := range resp.Elements {
		results = append(results, EnhancementElement{
			Name:        e.Name,
			Type:        e.Type,
			Description: e.Description,
			Source:      e.Source,
		})
	}

	return results, nil
}

// GetEnhancementImpl retrieves the source code of an enhancement implementation.
// spotName is the enhancement spot name
// implName is the enhancement implementation name
func (c *Client) GetEnhancementImpl(ctx context.Context, spotName, implName string) (string, error) {
	spotName = strings.ToUpper(spotName)
	implName = strings.ToUpper(implName)
	endpoint := fmt.Sprintf("/sap/bc/adt/enhancements/%s/%s/source/main",
		url.PathEscape(spotName), url.PathEscape(implName))

	resp, err := c.transport.Request(ctx, endpoint, &RequestOptions{
		Method: http.MethodGet,
		Accept: "text/plain",
	})
	if err != nil {
		return "", fmt.Errorf("get enhancement implementation failed: %w", err)
	}

	return string(resp.Body), nil
}

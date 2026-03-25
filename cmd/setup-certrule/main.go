package main

import (
	"context"
	"fmt"
	"log"
	"os"

	"github.com/oisee/vibing-steampunk/pkg/adt"
)

func main() {
	sapURL := getenv("TEST_SAP_URL", "http://a4h.marianzeis.de:50000")
	sapUser := getenv("TEST_SAP_USER", "DEVELOPER")
	sapPass := getenv("TEST_SAP_PASSWORD", "ABAPtr2023#00")
	sapClient := getenv("TEST_SAP_CLIENT", "001")

	safety := adt.SafetyConfig{ReadOnly: false, BlockFreeSQL: false}
	client := adt.NewClient(sapURL, sapUser, sapPass,
		adt.WithClient(sapClient),
		adt.WithLanguage("EN"),
		adt.WithSafety(safety),
	)
	ctx := context.Background()
	fmt.Printf("Connecting to %s...\n\n", sapURL)

	// Check SIW_USER_FROM_CERTIFICATE interface
	runAbap(ctx, client, "SIW_USER_FROM_CERTIFICATE check", `
DATA lv_info TYPE string.
TRY.
    DATA lv_user TYPE sy-uname.
    CALL FUNCTION 'SIW_USER_FROM_CERTIFICATE'
      EXPORTING
        subject   = 'CN=DEVELOPER'
        issuer    = 'O=vsp-testing, CN=vsp-test-ca'
      IMPORTING
        user      = lv_user
      EXCEPTIONS
        not_found = 1
        OTHERS    = 2.
    IF sy-subrc = 0.
      lv_info = |User=[{ lv_user }]|.
    ELSE.
      lv_info = |SIW failed subrc={ sy-subrc }|.
      lv_info = lv_info && | msg={ sy-msgid }/{ sy-msgno }|.
      lv_info = lv_info && | { sy-msgv1 } { sy-msgv2 }|.
    ENDIF.
  CATCH cx_root INTO DATA(lx).
    lv_info = |Error: { lx->get_text( ) }|.
ENDTRY.
lv_result = lv_info.
`, "harmless")

	// Check CERTRULE_EVALUATE_RULES
	runAbap(ctx, client, "CERTRULE_EVALUATE_RULES check", `
DATA lv_info TYPE string.
TRY.
    DATA lv_user TYPE sy-uname.
    DATA lv_logon_attr TYPE c LENGTH 1.
    DATA lv_rule_index TYPE i.
    CALL FUNCTION 'CERTRULE_EVALUATE_RULES'
      EXPORTING
        subject      = 'CN=DEVELOPER'
        issuer       = 'O=vsp-testing, CN=vsp-test-ca'
      IMPORTING
        loginattrib  = lv_logon_attr
        loginvalue   = lv_user
        rulenumber   = lv_rule_index
      EXCEPTIONS
        no_rule_found = 1
        OTHERS        = 2.
    IF sy-subrc = 0.
      lv_info = |Rule={ lv_rule_index } attr={ lv_logon_attr } user=[{ lv_user }]|.
    ELSE.
      lv_info = |CERTRULE failed subrc={ sy-subrc }|.
      lv_info = lv_info && | msg={ sy-msgid }/{ sy-msgno }|.
    ENDIF.
  CATCH cx_root INTO DATA(lx).
    lv_info = |Error: { lx->get_text( ) }|.
ENDTRY.
lv_result = lv_info.
`, "harmless")

	// Verify profile params are correct
	runAbap(ctx, client, "Verify all cert params", `
DATA lv_info TYPE string.
DATA lv_val TYPE pfepvalue.
DATA lt_params TYPE TABLE OF string.
APPEND 'login/certificate' TO lt_params.
APPEND 'login/certificate_mapping' TO lt_params.
APPEND 'login/certificate_mapping_rulebased' TO lt_params.
APPEND 'icm/HTTPS/verify_client' TO lt_params.
APPEND 'login/system_client' TO lt_params.
APPEND 'login/accept_sso2_ticket' TO lt_params.
APPEND 'login/create_sso2_ticket' TO lt_params.
LOOP AT lt_params INTO DATA(lv_name).
  CALL 'C_SAPGPARAM'
    ID 'NAME' FIELD lv_name
    ID 'VALUE' FIELD lv_val.
  lv_info = lv_info && |{ lv_name }=[{ lv_val }] |.
ENDLOOP.
lv_result = lv_info.
`, "harmless")

	// Direct USREXTID check with exact format matching
	runAbap(ctx, client, "USREXTID format check", `
DATA lv_info TYPE string.
" Show all USREXTID entries for any DN type
SELECT * FROM usrextid
  INTO TABLE @DATA(lt)
  WHERE type = 'DN'.
LOOP AT lt INTO DATA(ls).
  DATA lv_hex TYPE string.
  DATA(lv_len) = strlen( ls-extid ).
  lv_info = lv_info && |MANDT={ ls-mandt }|.
  lv_info = lv_info && | USER={ ls-bname }|.
  lv_info = lv_info && | STATUS={ ls-status }|.
  lv_info = lv_info && | EXTID=[{ ls-extid }]|.
  lv_info = lv_info && | LEN={ lv_len }|.
  lv_info = lv_info && cl_abap_char_utilities=>newline.
ENDLOOP.
IF lines( lt ) = 0.
  lv_info = |No USREXTID entries|.
ENDIF.
lv_result = lv_info.
`, "harmless")
}

func runAbap(ctx context.Context, client *adt.Client, label, code string, riskLevel ...string) {
	risk := "harmless"
	if len(riskLevel) > 0 {
		risk = riskLevel[0]
	}
	fmt.Printf("=== %s ===\n", label)
	result, err := client.ExecuteABAP(ctx, code, &adt.ExecuteABAPOptions{RiskLevel: risk})
	if err != nil {
		log.Printf("  ERROR: %v\n\n", err)
		return
	}
	fmt.Printf("  Message: %s\n", result.Message)
	fmt.Printf("  Success: %v, Outputs: %d, Alerts: %d\n", result.Success, len(result.Output), len(result.RawAlerts))
	for _, o := range result.Output {
		fmt.Printf("  → %s\n", o)
	}
	for _, a := range result.RawAlerts {
		fmt.Printf("  [%s] %s\n", a.Severity, a.Title)
	}
	fmt.Println()
}

func getenv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

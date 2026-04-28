REPORT zarc1_e2e_act_broken.

" Deliberate compile-time error — ARC-1 PR #179 regression fixture.
" Activating this REPORT MUST surface the error via SAPActivate;
" anything else means parseActivationOutcome / inactiveSyntaxDiagnostic
" silently swallowed the failure (the original phantom-success bug).
"
" Reference to an undefined symbol — the ABAP compiler cannot resolve this
" at activation time on any release (NW 7.50, S/4, BTP).
DATA(lv_value) = zcl_arc1_does_not_exist=>get_unknown_value( ).
WRITE: / lv_value.

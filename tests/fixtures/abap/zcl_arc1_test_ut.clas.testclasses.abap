CLASS ltc_test DEFINITION FINAL FOR TESTING
  DURATION SHORT RISK LEVEL HARMLESS.
  PRIVATE SECTION.
    METHODS test_get_value FOR TESTING.
ENDCLASS.

CLASS ltc_test IMPLEMENTATION.
  METHOD test_get_value.
    DATA(lo_cut) = NEW zcl_arc1_test_ut( ).
    cl_abap_unit_assert=>assert_equals( act = lo_cut->get_value( ) exp = 42 ).
  ENDMETHOD.
ENDCLASS.

CLASS zcl_arc1_test DEFINITION PUBLIC FINAL CREATE PUBLIC.
  PUBLIC SECTION.
    INTERFACES zif_arc1_test.
    METHODS get_name RETURNING VALUE(rv_name) TYPE string.
    TYPES: BEGIN OF ty_result,
             success TYPE abap_bool,
             message TYPE string,
           END OF ty_result.
  PROTECTED SECTION.
  PRIVATE SECTION.
    DATA mv_name TYPE string.
ENDCLASS.

CLASS zcl_arc1_test IMPLEMENTATION.
  METHOD get_name.
    rv_name = mv_name.
  ENDMETHOD.
  METHOD zif_arc1_test~do_something.
    rv_result = abap_true.
  ENDMETHOD.
ENDCLASS.

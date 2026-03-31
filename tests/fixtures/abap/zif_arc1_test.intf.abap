INTERFACE zif_arc1_test PUBLIC.
  METHODS do_something RETURNING VALUE(rv_result) TYPE abap_bool.
  TYPES: BEGIN OF ty_config,
           key   TYPE string,
           value TYPE string,
         END OF ty_config.
ENDINTERFACE.

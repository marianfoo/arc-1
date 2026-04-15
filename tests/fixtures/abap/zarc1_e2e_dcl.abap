@EndUserText.label: 'E2E Test Access Control'
@MappingRole: true
define role {OBJECT_NAME} {
  grant select on {VIEW_NAME}
    where inheriting conditions from super;
}

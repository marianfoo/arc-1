/**
 * Unit tests for CDS DDL dependency and element extraction.
 */

import { describe, expect, it } from 'vitest';
import { extractCdsDependencies, extractCdsElements } from '../../../src/context/cds-deps.js';

describe('extractCdsDependencies', () => {
  it('extracts data source from select from', () => {
    const ddl = `define view entity ZI_ORDER as select from zsalesorder { key order_id }`;
    const deps = extractCdsDependencies(ddl);
    expect(deps).toEqual([{ name: 'zsalesorder', kind: 'data_source' }]);
  });

  it('extracts projection base', () => {
    const ddl = `define view entity ZC_ORDER as projection on ZI_ORDER { key OrderId }`;
    const deps = extractCdsDependencies(ddl);
    expect(deps).toEqual([{ name: 'ZI_ORDER', kind: 'projection_base' }]);
  });

  it('extracts joined tables', () => {
    const ddl = `
define view entity ZI_ORDERITEM as select from zsalesorder
  inner join zorderitem on zsalesorder.order_id = zorderitem.order_id
  left outer join zproduct on zorderitem.product_id = zproduct.product_id
{
  key zsalesorder.order_id,
  zorderitem.item_id
}`;
    const deps = extractCdsDependencies(ddl);
    const names = deps.map((d) => d.name);
    expect(names).toContain('zsalesorder');
    expect(names).toContain('zorderitem');
    expect(names).toContain('zproduct');
    expect(deps.find((d) => d.name === 'zorderitem')?.kind).toBe('data_source');
    expect(deps.find((d) => d.name === 'zproduct')?.kind).toBe('data_source');
  });

  it('extracts association targets', () => {
    const ddl = `
define view entity ZI_ORDER as select from zsalesorder
  association [0..*] to ZI_ORDERITEM as _Items on _Items.OrderId = $projection.OrderId
  association [1] to ZI_CUSTOMER as _Customer on _Customer.CustomerId = $projection.CustomerId
{
  key order_id as OrderId,
  _Items,
  _Customer
}`;
    const deps = extractCdsDependencies(ddl);
    const names = deps.map((d) => d.name);
    expect(names).toContain('zsalesorder');
    expect(names).toContain('ZI_ORDERITEM');
    expect(names).toContain('ZI_CUSTOMER');
    expect(deps.find((d) => d.name === 'ZI_ORDERITEM')?.kind).toBe('association');
    expect(deps.find((d) => d.name === 'ZI_CUSTOMER')?.kind).toBe('association');
  });

  it('extracts composition targets', () => {
    const ddl = `
define root view entity ZR_TRAVEL as select from ztravel
  composition [0..*] of ZR_BOOKING as _Booking
{
  key travel_id as TravelId,
  _Booking
}`;
    const deps = extractCdsDependencies(ddl);
    expect(deps.find((d) => d.name === 'ZR_BOOKING')?.kind).toBe('composition');
  });

  it('handles namespaced objects', () => {
    const ddl = `
define view entity /DMO/I_TRAVEL as select from /dmo/travel
  association [0..*] to /DMO/I_BOOKING as _Booking on _Booking.TravelId = $projection.TravelId
{
  key travel_id as TravelId,
  _Booking
}`;
    const deps = extractCdsDependencies(ddl);
    const names = deps.map((d) => d.name);
    expect(names).toContain('/dmo/travel');
    expect(names).toContain('/DMO/I_BOOKING');
  });

  it('ignores line comments', () => {
    const ddl = `
define view entity ZI_TEST as select from ztable
// association [0..*] to ZI_COMMENTED as _Commented on ...
{
  key field1
}`;
    const deps = extractCdsDependencies(ddl);
    const names = deps.map((d) => d.name);
    expect(names).toContain('ztable');
    expect(names).not.toContain('ZI_COMMENTED');
  });

  it('ignores block comments', () => {
    const ddl = `
define view entity ZI_TEST as select from ztable
/* association [0..*] to ZI_COMMENTED as _Commented
   on _Commented.Id = $projection.Id */
{
  key field1
}`;
    const deps = extractCdsDependencies(ddl);
    const names = deps.map((d) => d.name);
    expect(names).not.toContain('ZI_COMMENTED');
  });

  it('deduplicates dependencies', () => {
    const ddl = `
define view entity ZI_TEST as select from ztable
  inner join ztable on ztable.id = ztable.id
{
  key field1
}`;
    const deps = extractCdsDependencies(ddl);
    const tableEntries = deps.filter((d) => d.name.toUpperCase() === 'ZTABLE');
    expect(tableEntries).toHaveLength(1);
  });

  it('handles define view (old syntax without entity keyword)', () => {
    const ddl = `
@AbapCatalog.sqlViewName: 'ZSQLVIEW'
define view ZI_OLD as select from ztable
{
  key field1,
  field2
}`;
    const deps = extractCdsDependencies(ddl);
    expect(deps.map((d) => d.name)).toContain('ztable');
  });

  it('handles define root view entity', () => {
    const ddl = `define root view entity ZR_TRAVEL as select from ztravel { key travel_id }`;
    const deps = extractCdsDependencies(ddl);
    expect(deps.map((d) => d.name)).toContain('ztravel');
  });

  it('handles association with wildcard cardinality', () => {
    const ddl = `
define view entity ZI_TEST as select from ztable
  association [*] to ZI_OTHER as _Other on _Other.Id = $projection.Id
{
  key field1,
  _Other
}`;
    const deps = extractCdsDependencies(ddl);
    expect(deps.find((d) => d.name === 'ZI_OTHER')?.kind).toBe('association');
  });

  it('returns empty array for source with no dependencies (abstract entity)', () => {
    const ddl = `define abstract entity ZA_PARAMS { param1 : abap.char(10); }`;
    const deps = extractCdsDependencies(ddl);
    expect(deps).toEqual([]);
  });

  it('handles multiple associations on same line-ish patterns', () => {
    const ddl = `
define view entity ZI_ORDER as select from zsalesorder
  association [0..1] to ZI_STATUS as _Status on _Status.Code = $projection.StatusCode
  association [0..*] to ZI_ITEM as _Items on _Items.OrderId = $projection.OrderId
{
  key order_id as OrderId,
  status_code as StatusCode,
  _Status,
  _Items
}`;
    const deps = extractCdsDependencies(ddl);
    const names = deps.map((d) => d.name);
    expect(names).toContain('ZI_STATUS');
    expect(names).toContain('ZI_ITEM');
  });

  it('does not extract alias names as dependencies', () => {
    const ddl = `
define view entity ZI_TEST as select from ztable as MyAlias
{
  key MyAlias.field1
}`;
    const deps = extractCdsDependencies(ddl);
    expect(deps.map((d) => d.name)).not.toContain('MyAlias');
    expect(deps.map((d) => d.name)).toContain('ztable');
  });
});

describe('extractCdsElements', () => {
  it('extracts key fields', () => {
    const ddl = `
define view entity ZI_ORDER as select from zsalesorder
{
  key order_id as OrderId,
  customer as Customer
}`;
    const result = extractCdsElements(ddl, 'ZI_ORDER');
    expect(result).toContain('=== ZI_ORDER elements ===');
    expect(result).toContain('key');
    expect(result).toContain('OrderId');
    expect(result).toContain('Customer');
  });

  it('extracts aliased fields', () => {
    const ddl = `
define view entity ZI_ORDER as select from zsalesorder
{
  key order_id as OrderId,
  customer_name as CustomerName
}`;
    const result = extractCdsElements(ddl, 'ZI_ORDER');
    expect(result).toContain('OrderId');
    expect(result).toContain('CustomerName');
  });

  it('extracts bare fields (no alias)', () => {
    const ddl = `
define view entity ZI_ORDER as select from zsalesorder
{
  key order_id,
  customer
}`;
    const result = extractCdsElements(ddl, 'ZI_ORDER');
    expect(result).toContain('order_id');
    expect(result).toContain('customer');
  });

  it('identifies associations', () => {
    const ddl = `
define view entity ZI_ORDER as select from zsalesorder
  association [0..*] to ZI_ITEM as _Items on _Items.OrderId = $projection.OrderId
{
  key order_id as OrderId,
  _Items
}`;
    const result = extractCdsElements(ddl, 'ZI_ORDER');
    expect(result).toContain('_Items');
    expect(result).toContain('association');
  });

  it('identifies calculated fields', () => {
    const ddl = `
define view entity ZI_ORDER as select from zsalesorder
{
  key order_id as OrderId,
  gross_amount - discount as NetAmount,
  case status when 'O' then 'Open' when 'C' then 'Closed' end as StatusText
}`;
    const result = extractCdsElements(ddl, 'ZI_ORDER');
    expect(result).toContain('NetAmount');
    expect(result).toContain('calculated');
    expect(result).toContain('StatusText');
    expect(result).toContain('case');
  });

  it('identifies cast expressions', () => {
    const ddl = `
define view entity ZI_ORDER as select from zsalesorder
{
  key order_id as OrderId,
  cast(amount as abap.curr(15,2)) as Amount
}`;
    const result = extractCdsElements(ddl, 'ZI_ORDER');
    expect(result).toContain('Amount');
    expect(result).toContain('cast');
  });

  it('returns header-only for abstract entity with no projection', () => {
    const ddl = `define abstract entity ZA_PARAMS { param1 : abap.char(10); }`;
    const result = extractCdsElements(ddl, 'ZA_PARAMS');
    expect(result).toContain('=== ZA_PARAMS elements ===');
  });

  it('handles multiline field expressions', () => {
    const ddl = `
define view entity ZI_ORDER as select from zsalesorder
{
  key order_id as OrderId,
  case status
    when 'O' then 'Open'
    when 'C' then 'Closed'
    else 'Unknown'
  end as StatusText,
  customer as Customer
}`;
    const result = extractCdsElements(ddl, 'ZI_ORDER');
    expect(result).toContain('StatusText');
    expect(result).toContain('Customer');
  });
});

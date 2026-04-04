# Change Package Refactoring

> **Priority**: Medium
> **Source**: abap-adt-api commit a55c8f8 (v7.0.0, 2025-10-05)
> **ARC-1 component**: `src/adt/crud.ts` (new feature)

## What abap-adt-api added

Three-step refactoring pattern:
1. `changePackagePreview(objectUrl, newPackage)` — dry-run, returns what would change
2. `changePackageExecute(refactoring)` — actually moves the object

Uses ADT refactoring endpoints: `/sap/bc/adt/refactorings/changepackage`

## ARC-1 current state

- No package reassignment/move support
- Objects created in a package stay there
- Would need the 3-step refactoring pattern (evaluate → preview → execute)

## Assessment

Useful for code organization — moving objects between packages (e.g., from $TMP to a proper package, or reorganizing package structures). Common development workflow that an AI could help with.

However, this is a refactoring operation with transport implications. Lower priority than basic CRUD improvements.

## Decision

**Consider future** — Bundle with other refactoring operations (FEAT-05: rename, extract method). All use the same ADT refactoring pattern.

**Effort**: S (1d — follows same pattern as rename/extract method)

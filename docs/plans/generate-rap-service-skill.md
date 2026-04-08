# Generate RAP Service Skill — Implementation Plan

## Overview

Add the `generate-rap-service.md` skill to ARC-1's skills library. This skill orchestrates existing ARC-1 tools (SAPWrite, SAPActivate, SAPRead, SAPDiagnose, SAPManage) to generate a complete RAP OData UI service from a natural language description — replicating SAP Joule's "OData UI Service from Scratch" wizard.

The skill itself is a prompt template (already written at `skills/generate-rap-service.md`). This plan covers the supporting changes: updating the skills README, adding the skill as a Claude Code command, and creating backend improvements that make the skill more reliable (BDEF/DDLS/SRVD-specific `buildCreateXml` templates, SRVB write support investigation).

## Context

### Current State
- ARC-1 has 11 intent-based tools including SAPWrite (create/update/delete/edit_method) and SAPActivate (single + batch)
- SAPWrite supports: PROG, CLAS, INTF, FUNC, INCL, DDLS, DDLX, BDEF, SRVD (on BTP: CLAS, INTF, DDLS, DDLX, BDEF, SRVD)
- `buildCreateXml()` in `src/handlers/intent.ts:697` only has specific XML templates for PROG, CLAS, INTF, INCL — all other types (DDLS, BDEF, SRVD, DDLX) fall through to a generic `objectReferences` body that may fail
- SAPActivate supports batch activation — essential for RAP stacks
- SRVB (service binding) is read-only — not in SAPWrite types
- One existing skill: `generate-cds-unit-test.md`
- Skills README at `skills/README.md` lists available skills

### Target State
- `skills/generate-rap-service.md` — comprehensive RAP service generation skill (already written)
- `skills/README.md` — updated with new skill entry
- `.claude/commands/generate-rap-service.md` — symlink/copy for Claude Code slash command access
- `buildCreateXml()` — type-specific XML templates for DDLS, BDEF, SRVD, DDLX to ensure reliable object creation
- Unit tests for the new `buildCreateXml` templates

### Key Files

| File | Role |
|------|------|
| `skills/generate-rap-service.md` | The skill prompt template (already created) |
| `skills/README.md` | Skills index — needs new entry |
| `.claude/commands/generate-rap-service.md` | Claude Code slash command (copy of skill) |
| `src/handlers/intent.ts` | `buildCreateXml()` at line ~697, `objectUrlForType()` at line ~764 |
| `src/handlers/tools.ts` | SAPWrite type lists at lines ~95-96, SAPActivate description at line ~367 |
| `tests/unit/handlers/intent.test.ts` | Unit tests for handler logic |

### Design Principles

1. The skill is a prompt template — it orchestrates existing tools, not new backend code
2. Backend changes improve reliability of `SAPWrite(action="create")` for CDS/BDEF/SRVD types
3. No new MCP tools needed — the 11 existing tools are sufficient
4. Each `buildCreateXml` template must match the SAP ADT API's expected XML format for that object type
5. Tests must verify the XML body structure for each new template

## Development Approach

Tasks are ordered: documentation first (no code risk), then backend reliability improvements, then tests. Each task runs `npm test` to verify no regressions.

## Validation Commands

- `npm test`
- `npm run typecheck`
- `npm run lint`

### Task 1: Update skills README and add Claude Code command

**Files:**
- Modify: `skills/README.md`
- Create: `.claude/commands/generate-rap-service.md`

Add the new skill to the skills README table so users can discover it. Also copy the skill file to `.claude/commands/` so it's available as a Claude Code slash command.

- [ ] In `skills/README.md`, add a new row to the "Available Skills" table after the existing `generate-cds-unit-test` entry: `| [generate-rap-service](generate-rap-service.md) | Generate complete RAP OData UI service from natural language description |`
- [ ] Copy `skills/generate-rap-service.md` to `.claude/commands/generate-rap-service.md` (Claude Code reads commands from `.claude/commands/`)
- [ ] Run `npm test` — all tests must pass

### Task 2: Add type-specific buildCreateXml templates for DDLS, BDEF, SRVD, DDLX

**Files:**
- Modify: `src/handlers/intent.ts`
- Modify: `tests/unit/handlers/intent.test.ts`

The `buildCreateXml()` function at `src/handlers/intent.ts:697` only has specific XML templates for PROG, CLAS, INTF, INCL. All other types fall through to a generic `objectReferences` body that uses an incorrect URI pattern (`/sap/bc/adt/programs/programs/`). This causes `SAPWrite(action="create")` to fail for DDLS, BDEF, SRVD, DDLX. Add proper XML templates for each.

The ADT API requires type-specific XML root elements:
- DDLS: `<ddl:ddlSource>` with namespace `http://www.sap.com/adt/ddic/ddlsources`
- BDEF: `<bo:behaviorDefinition>` with namespace `http://www.sap.com/adt/bo/behaviordefinitions`
- SRVD: `<srvd:serviceDefinition>` with namespace `http://www.sap.com/adt/ddic/srvd/sources` (or similar — verify with existing ADT XML patterns in `tests/fixtures/xml/`)
- DDLX: `<ddlx:metadataExtension>` with namespace `http://www.sap.com/adt/ddic/ddlx/sources` (or similar)

All follow the same pattern as existing PROG/CLAS/INTF templates:
```xml
<type:element xmlns:type="..." xmlns:adtcore="http://www.sap.com/adt/core"
              adtcore:description="..." adtcore:name="..." adtcore:type="TYPE/SUBTYPE"
              adtcore:masterLanguage="EN" adtcore:masterSystem="H00"
              adtcore:responsible="DEVELOPER">
  <adtcore:packageRef adtcore:name="..."/>
</type:element>
```

The `adtcore:type` values are:
- DDLS: `DDLS/DF`
- BDEF: `BDEF/BDO`
- SRVD: `SRVD/SRV`
- DDLX: `DDLX/EX`

Steps:

- [ ] In `src/handlers/intent.ts`, find `buildCreateXml()` (starts at line ~697). Add a `case 'DDLS':` before the `default:` that returns XML with root element `<ddl:ddlSource xmlns:ddl="http://www.sap.com/adt/ddic/ddlsources" ...>`. Use `adtcore:type="DDLS/DF"`. Follow the exact pattern of the `case 'CLAS':` template.
- [ ] Add `case 'BDEF':` returning XML with root element using namespace `http://www.sap.com/adt/bo/behaviordefinitions` and `adtcore:type="BDEF/BDO"`. The ADT URL for BDEF is `/sap/bc/adt/bo/behaviordefinitions/` (see `objectUrlForType` at line ~782).
- [ ] Add `case 'SRVD':` returning XML with namespace `http://www.sap.com/adt/ddic/srvd/sources` and `adtcore:type="SRVD/SRV"`
- [ ] Add `case 'DDLX':` returning XML with namespace `http://www.sap.com/adt/ddic/ddlx/sources` and `adtcore:type="DDLX/EX"`
- [ ] Also fix the `default:` case's generic fallback to use `objectUrlForType(type, name)` instead of the hardcoded `/sap/bc/adt/programs/programs/` URI, so that any future type that doesn't have a specific template at least gets the correct URL
- [ ] Add unit tests (~8 tests): Test that `buildCreateXml` returns correct XML for DDLS, BDEF, SRVD, DDLX types — verify root element name, namespace, adtcore:type attribute, name attribute, package reference. Test that the default fallback uses the correct URL pattern. Test that existing PROG/CLAS/INTF templates still work.
- [ ] Run `npm test` — all tests must pass
- [ ] Run `npm run typecheck` — no errors

### Task 3: Improve SAPActivate batch description for RAP stack workflow

**Files:**
- Modify: `src/handlers/tools.ts`

The SAPActivate tool description at `src/handlers/tools.ts:367` already mentions batch activation for RAP stacks, but the example only shows DDLS + BDEF + SRVD. Update the example to include the full RAP stack (table entity DDLS, interface DDLS, BDEF, projection DDLS, projection BDEF, DDLX, SRVD) so the LLM has a better template for RAP service generation.

- [ ] In `src/handlers/tools.ts`, find the SAPActivate `objects` property description (line ~385). Update the example array to: `[{type:"DDLS",name:"ZTRAVEL_D"},{type:"DDLS",name:"ZI_TRAVEL"},{type:"BDEF",name:"ZI_TRAVEL"},{type:"DDLS",name:"ZC_TRAVEL"},{type:"BDEF",name:"ZC_TRAVEL"},{type:"DDLX",name:"ZC_TRAVEL"},{type:"SRVD",name:"ZSD_TRAVEL"}]`
- [ ] Run `npm test` — all tests must pass

### Task 4: Final verification

**Files:**
- All modified files from Tasks 1-3

- [ ] Run full test suite: `npm test` — all tests pass
- [ ] Run typecheck: `npm run typecheck` — no errors
- [ ] Run lint: `npm run lint` — no errors
- [ ] Verify `skills/generate-rap-service.md` exists and is well-formed (read it)
- [ ] Verify `skills/README.md` lists both skills
- [ ] Verify `.claude/commands/generate-rap-service.md` exists
- [ ] Move this plan to `docs/plans/completed/`

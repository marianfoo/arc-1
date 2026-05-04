# Setup ABAP Mirror

Create a local abapGit-style mirror of an SAP package or object set. Reads are authoritative from the SAP system; local files give you IDE context, `git diff`, and fast searching without round-tripping every time.

This skill works today with ARC-1's existing `SAPRead` + `DEVC` primitives. When dedicated abapGit export tooling lands in ARC-1, the skill can be simplified — the file layout it produces is the target format either way.

## Smart Defaults (apply silently, do NOT ask)

| Setting | Default | Rationale |
|---|---|---|
| Mirror root | `./mirror/<SID>/src/<package>/` | Groups by system to support multi-system work |
| File naming | abapGit conventions | Standard; future-proof |
| Recurse sub-packages | Yes | Matches abapGit behaviour |
| Include test classes | Yes | Tests belong with the class |
| Include metadata XML | Skip for now | ARC-1 does not yet emit abapGit-format XML; source-only is useful and safe |

## Input

One of the following scopes:
- **Single object** — `name` + `type` (e.g., `ZCL_TRAVEL_HANDLER`, `CLAS`)
- **Object list** — array of `{ type, name }` pairs
- **Package** — `package` name; pulls everything inside

Optionally:
- **Mirror root** (default: `./mirror/<SID>/src/<package>/`)
- **Skip test classes** (default: include them)

## Prerequisites

Before running, ensure `system-info.md` exists. If it doesn't:

```
→ Run the bootstrap-system-context skill first
```

The mirror header references SID, system type, and release from `system-info.md`.

## Step 1: Resolve Scope Into An Object List

### 1a. For a package scope

```
SAPRead(type="DEVC", name="<PACKAGE>")
```

Returns `[{ type, name, description, uri }, ...]` where `type` is slash-form (`CLAS/OC`, `DDLS/DF`, `PROG/P`, `DEVC/K`, etc.).

For each `DEVC/K` entry (sub-package): recurse — call `SAPRead(type="DEVC", name=<sub>)` and append its contents.

Normalize slash-form types to the ARC-1 `SAPRead` short codes:

| Slash form | SAPRead type | abapGit extension |
|---|---|---|
| `CLAS/OC` | `CLAS` | `.clas.abap` (+ `.clas.testclasses.abap`) |
| `INTF/OI` | `INTF` | `.intf.abap` |
| `PROG/P` | `PROG` | `.prog.abap` |
| `FUGR/F` | `FUGR` | `.fugr.abap` (expanded includes) |
| `FUNC/FF` | `FUNC` | `.func.abap` |
| `DDLS/DF` | `DDLS` | `.ddls.asddls` |
| `DCLS/DL` | `DCLS` | `.dcls.asdcls` |
| `DDLX/EX` | `DDLX` | `.ddlx.asddlxs` |
| `BDEF/BO` | `BDEF` | `.bdef.asbdef` |
| `SRVD/SRV` | `SRVD` | `.srvd.asrvd` |
| `SRVB/SVB` | `SRVB` | `.srvb.xml` |
| `TABL/DT` | `TABL` | `.tabl.xml` |
| `STRU/DS` | `STRU` | `.stru.xml` |
| `DOMA/DD` | `DOMA` | `.doma.xml` |
| `DTEL/DE` | `DTEL` | `.dtel.xml` |
| `MSAG/N` | `MSAG` | `.msag.xml` |
| `ENHO/EO` | `ENHO` | `.enho.xml` |

Skip types not in this table; log them in a `skipped.md` in the mirror root.

### 1b. For a single object or object list

Skip enumeration; proceed directly with the provided list.

## Step 2: Read Each Object

For every resolved `{ type, name }`:

```
SAPRead(type="<type>", name="<name>")
```

For classes, also fetch test classes (unless skipped):

```
SAPRead(type="CLAS", name="<name>", include="testclasses")
```

For function groups (on-prem only), expand includes:

```
SAPRead(type="FUGR", name="<name>", expand_includes=true)
```

For DDLS, CLAS (structured), DCLS, DDLX — the plain source form is sufficient for mirroring; richer structured forms are for reading, not storage.

Catch and continue on per-object errors — log failures in `skipped.md` with the error class (not-found / forbidden / not-released / connectivity) and move on.

## Step 3: Write Files In abapGit Layout

Directory structure:

```
mirror/<SID>/
  README.md               ← written in Step 4
  system-info.md          ← copied or symlinked from bootstrap-system-context
  src/
    <package_lower>/
      zcl_foo.clas.abap
      zcl_foo.clas.testclasses.abap
      zif_foo.intf.abap
      z_report.prog.abap
      zi_view.ddls.asddls
      zi_view_dcl.dcls.asdcls
      zc_view.ddlx.asddlxs
      zi_travel.bdef.asbdef
      ztable.tabl.xml
      zdomain.doma.xml
      zdtel.dtel.xml
    <subpackage_lower>/
      ...
  skipped.md              ← per-object errors and unsupported types
```

Rules:
- Object names in filenames are **lowercased**.
- Package names in path segments are lowercased.
- Source files are written verbatim from SAP — do not reformat.
- Overwrite existing files without prompting (SAP is the source of truth).

## Step 4: Write mirror/<SID>/README.md

```markdown
# Mirror: <SID>

_Generated: <ISO timestamp>_ · _Source: ARC-1_

This directory is a **read-only mirror** of selected ABAP objects from **<SID>**. The SAP system is the source of truth — edits here will NOT be pushed back automatically. To deploy local changes, use `SAPWrite` or a dedicated abapGit export/deploy tool.

See [system-info.md](./system-info.md) for system identity and feature availability.

## Scope

- Mode: <single / list / package>
- <If package: **Package**: ZPKG — recursed into N sub-packages>
- <If list: **Objects**: M explicit>
- Objects mirrored: <count by type>
- Objects skipped: see [skipped.md](./skipped.md)

## Layout

- `src/<package>/` — abapGit-style object files
- `skipped.md` — objects that failed to read or aren't supported yet

## Refreshing

Re-run the `setup-abap-mirror` skill with the same scope. Files are overwritten.
```

## Step 5: Summarize To The User

Report in 4-6 lines:
- SID mirrored, scope (single/list/package)
- Object counts by type (e.g., `5 CLAS, 12 DDLS, 3 BDEF`)
- Skipped/failed count with pointer to `skipped.md`
- Mirror root path

## Error Handling

| Error | Cause | Fix |
|---|---|---|
| DEVC read returns 404 | Package does not exist | Ask user to verify the package name via `SAPSearch` |
| Per-object read fails | Auth / not-released / not-found | Log in `skipped.md`, continue with the rest |
| Sub-package recursion loops | Circular reference (rare) | Track visited package names; skip duplicates |
| FUGR `expand_includes` fails | On-prem feature, endpoint unavailable | Fall back to `expand_includes=false`; log as partial |
| Source body empty | Generated proxy or inactive object | Write empty file with a comment header; log in `skipped.md` |
| `system-info.md` missing | Skill dependency | Run `bootstrap-system-context` first, then retry |

## Notes

### What This Skill Does NOT Do

- **No deploy** — local edits are not pushed back. Use `SAPWrite` or a future abapGit deploy action.
- **No metadata XML in abapGit format** — ARC-1 currently returns source text; XML-based object metadata (TABL definitions, DOMA fixed values, class attributes) is emitted as JSON or XML from SAP's native form, not the abapGit `object.xml` convention. That's enough for reading and `git diff`, not enough for a full abapGit pull-push round trip.
- **No concurrency** — object reads are sequential to stay within SAP work-process budgets.

### When To Use This Skill

- Onboarding a new team member to an existing codebase
- Preparing for a migration where you need to grep locally across many objects
- Snapshotting a system before a support package upgrade
- Feeding local context into an AI assistant that cannot call MCP tools for every read

### When NOT To Use This Skill

- For single ad-hoc reads — just call `SAPRead` directly
- When you need a full abapGit round-trip (mirror + deploy back) — wait for native abapGit support
- On production systems where SAP read load is a concern — large package mirrors issue hundreds of requests

### BTP vs On-Premise

- **BTP**: fewer object types will appear in DEVC listings (no PROG, INCL, FUGR). The normalization table above handles this — unsupported types are just absent.
- **On-prem**: the full type range applies; legacy types not in the table are logged in `skipped.md` and can be added to ARC-1 over time.

### Future-Proofing

This skill produces abapGit-compatible layout today using existing primitives. When ARC-1 gains a dedicated abapGit export action, the internals change but the output directory remains recognizable to any abapGit-aware tool.

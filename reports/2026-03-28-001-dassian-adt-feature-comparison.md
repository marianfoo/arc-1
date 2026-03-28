# Dassian ADT vs ARC-1: Feature Gap Analysis

**Date:** 2026-03-28
**Repo:** https://github.com/DassianInc/dassian-adt (v2.0.0)
**Compared against:** ARC-1 v3.0.0-alpha.1

---

## Executive Summary

Dassian ADT is a fork of Mario Andreschak's `mcp-abap-abap-adt-api` that wraps Marcello Urbani's `abap-adt-api` npm library. It exposes **25 individual tools** (one per operation) vs ARC-1's **11 intent-based tools**. It was used internally at Dassian before open-sourcing.

ARC-1 is architecturally more mature (custom HTTP layer, safety system, BTP integration, caching, OIDC/XSUAA auth, feature detection, ABAP lint), while Dassian ADT has several **practitioner-focused features** that emerged from daily internal use with Claude Code.

---

## Category A: High-Value Features Missing from ARC-1

These are features worth adopting - they solve real developer pain points.

### 1. ABAP Code Execution (`abap_run`)
**Priority: HIGH**

Dassian's standout feature. Creates a temporary `ZCL_TMP_ADT_RUN` class implementing `IF_OO_ADT_CLASSRUN`, executes arbitrary ABAP code, captures `out->write()` output, and auto-deletes the class afterward.

Key details:
- Auto-detects SAP release to choose `~run` (<=2023) vs `~main` (2024+) by reading the interface source
- Handles "class already exists" from failed prior runs via user confirmation
- Proper session management: ends stateful session before classrun POST (needed on some systems where activation isn't committed until session close)
- Sets `Accept: text/plain` header explicitly (library's `runClass()` omits it, causing silent failures)
- `keepClass` option for debugging the generated source
- Guaranteed cleanup in `finally` block

**Why it matters:** This lets an AI agent probe live SAP data, test ABAP logic, and validate assumptions without permanent artifacts. Extremely powerful for iterative development.

**ARC-1 status:** Not implemented. ARC-1 has no code execution capability.

### 2. MCP Elicitation (Interactive Prompts)
**Priority: HIGH**

Dassian uses the MCP SDK's `elicitInput` capability extensively via three methods in `BaseHandler`:
- `confirmWithUser(message, details)` - yes/no confirmation (transport release, object deletion)
- `elicitForm(schema)` - structured input collection (package selection, transport assignment)
- `elicitChoice(options)` - dropdown selection

Used in practice for:
- Prompting for package when creating objects without one specified
- Confirming destructive operations (delete, transport release)
- Asking whether to clean up leftover temp classes from failed `abap_run`

**Why it matters:** Instead of failing on missing parameters, the server interactively asks the user. This creates a much smoother workflow, especially for multi-step operations.

**ARC-1 status:** Not implemented. ARC-1 returns errors for missing parameters.

### 3. Error Classification with Actionable Hints
**Priority: HIGH**

`lib/errors.ts` classifies SAP errors and annotates them with remediation guidance:

| Error Pattern | Hint |
|--------------|------|
| Object locked | "Check SM12 for lock entries" |
| Adjustment/upgrade mode | "Use SPAU_ENH in SAP GUI" |
| Session timeout | Auto-retries via `withSession()` |
| Incorrect URL path | "Message X::NNN usually means wrong object type in URL" |
| L-prefix include (read-only) | "Write to the parent function module instead" |
| String template pipe issues | "Escape literal pipes with \\| or use CONCATENATE" |
| Activation failures | Cross-references `abap_syntax_check` |
| Inactive dependencies | "Activate dependencies first" |

**Why it matters:** SAP error messages are notoriously cryptic. These hints help the AI agent self-correct without human intervention.

**ARC-1 status:** Has `AdtApiError` with status codes and response bodies, but no semantic classification or actionable hints.

### 4. Automatic Session Recovery (`withSession`)
**Priority: MEDIUM-HIGH**

Every ADT call in Dassian is wrapped in `withSession()`, which:
1. Detects session timeouts (HTTP 401, "session not found", "not logged on")
2. Automatically re-logs in
3. Retries the failed operation transparently

**ARC-1 status:** Has `isSessionExpiredError()` detection but no automatic retry. The caller must handle session recovery manually.

### 5. Transport Assignment (`transport_assign`)
**Priority: MEDIUM-HIGH**

Assigns an existing object to a transport via a clever no-op save cycle: lock -> read source -> write unchanged source with transport -> unlock. For metadata-only types (VIEW, TABL, DOMA), uses `transportReference` instead to avoid creating inactive sub-objects.

**ARC-1 status:** ARC-1 has transport create/list/get/release but no `transport_assign` equivalent.

### 6. Transport Contents (`transport_contents`)
**Priority: MEDIUM**

Queries table E071 to list all objects on a transport request (PGMID, object type, name).

**ARC-1 status:** `getTransport` returns transport metadata but doesn't list contained objects.

---

## Category B: Useful Features Worth Considering

These solve real problems but are lower priority or partially covered by existing ARC-1 functionality.

### 7. ABAP Dump Retrieval (`abap_get_dump`)
**Priority: MEDIUM**

Retrieves recent ST22 short dumps with error text, program name, and timestamp. Supports filtering by query string. Essential companion to `abap_run` (check what went wrong when code crashes).

**ARC-1 status:** `SAPDiagnose` tool has `dumps` and `dump_detail` actions, so this is **already covered**.

### 8. Raw HTTP Tool (`raw_http`)
**Priority: MEDIUM**

Executes arbitrary HTTP requests to SAP ADT endpoints not covered by dedicated tools. Useful for SITO objects, SICF path management, and as an escape hatch for edge cases.

**Why it matters:** Covers the long tail of ADT operations without needing dedicated tool implementations.

**ARC-1 status:** Not implemented. Every operation requires a dedicated handler.

### 9. gCTS Integration (`git_repos`, `git_pull`)
**Priority: MEDIUM**

Lists gCTS repositories and pulls from them. Used in cherry-pick pipelines to import transports across systems.

**ARC-1 status:** Feature detection has `abapGit` flag but no gCTS tools are exposed. Could be added behind the existing feature toggle.

### 10. Object Info Tool (`abap_object_info`)
**Priority: MEDIUM**

Returns metadata: package, transport layer, active/inactive status, and upgrade flags. Warns when objects are in SPAU adjustment mode.

**ARC-1 status:** Partially covered by `SAPRead` (DEVC type returns package info), but no dedicated object metadata endpoint that returns transport layer and activation status.

### 11. Per-User Browser Login (HTTP Mode)
**Priority: MEDIUM**

Dassian's HTTP mode includes a browser-based login page (`/login`) where users enter SAP credentials. Sessions start in "pending" state and activate after login. Elegant for team deployments where each developer uses their own SAP user.

**ARC-1 status:** Has more sophisticated auth (OIDC, XSUAA, API keys, Principal Propagation) but no simple browser login flow. ARC-1's approach is better for enterprise, Dassian's is better for quick team setups.

### 12. Comprehensive Object Type Mapping (30+ types)
**Priority: MEDIUM**

`urlBuilder.ts` maps 30+ ABAP types to ADT paths including: DDLX (CDS metadata extensions), DCLS (access control), ENHO/ENHS (enhancements), SRVB (service bindings), DTEL (data elements), DOMA (domains), SQLT (table types), SHLP (search helps).

**ARC-1 status:** Supports ~15 types. Missing: DDLX, DCLS, ENHO, ENHS, SRVB, DTEL, DOMA, SQLT, SHLP.

### 13. SAP Release Auto-Detection
**Priority: MEDIUM**

For `abap_run`, reads the `IF_OO_ADT_CLASSRUN` interface source to determine whether the system uses `~run` (older) or `~main` (2024+). Falls back safely.

**ARC-1 status:** No release detection mechanism. Would be needed if code execution is implemented.

---

## Category C: Nice-to-Have / Lower Priority

Features that are useful but either niche or already handled differently in ARC-1.

### 14. Explicit `login` / `healthcheck` Tools
**Priority: LOW**

Explicit login establishes a stateful session; healthcheck verifies connectivity and returns system ID.

**ARC-1 status:** Login is implicit. System info via `SAPRead(type=SYSTEM)` partially covers healthcheck. Could add a lightweight connectivity check but not critical.

### 15. Smart Parameter Redirects
**Priority: LOW**

When users pass wrong parameters (e.g., a transport number to `transport_info` instead of an object name), the error message redirects them to the correct tool.

**ARC-1 status:** Not implemented. Would be a nice UX improvement but minor.

### 16. ATC CI-Mode Workaround
**Priority: LOW**

On systems with CI-scoped ATC checks, skips the standard run and fetches existing worklists directly, matching Eclipse behavior.

**ARC-1 status:** `runAtcCheck` uses the standard variant approach. CI-mode workaround not implemented.

### 17. DELETE Request Fix (no `corrNr` param)
**Priority: LOW**

Some ADT endpoints (especially DDLS) reject the `corrNr` query parameter on DELETE. Dassian bypasses the library to send DELETE without it.

**ARC-1 status:** Uses custom HTTP layer, so this can be handled per-endpoint as needed.

### 18. Metadata-Only Transport Handling
**Priority: LOW**

For metadata types (TABL, DOMA, VIEW), uses `transportReference` instead of lock-write-unlock to avoid creating inactive program versions.

**ARC-1 status:** Not implemented. Would be important if transport_assign is added.

---

## Category D: Features Where ARC-1 Is Already Superior

For completeness - areas where ARC-1 is ahead and Dassian has nothing equivalent.

| ARC-1 Feature | Dassian Equivalent |
|---|---|
| **Safety system** (read-only, op filtering, pkg filtering, transport whitelisting) | None - no write protection |
| **BTP integration** (Destination Service, Cloud Connector, Principal Propagation) | None |
| **OIDC / XSUAA / API key auth** | Basic browser login only |
| **Feature detection** (auto-probe SAP capabilities) | None |
| **ABAP Lint** (local @abaplint/core) | None |
| **Code intelligence** (find definition, references, completion) | None |
| **Cache system** (memory + SQLite) | None |
| **Intent-based tool architecture** (11 vs 25 tools) | 25 individual tools (more LLM context overhead) |
| **Custom HTTP layer** (no dependency on abap-adt-api) | Depends on abap-adt-api library |
| **npm package + Docker image** distribution | Clone-and-build only |
| **Cookie authentication** | None |
| **Per-user Principal Propagation** | None |
| **Custom XML parser** (fast-xml-parser v5) | Uses library's built-in parsing |
| **Comprehensive test suite** (320 tests) | 165 tests |
| **Structured logging** (JSON to stderr) | Basic console.error |
| **Scope-based tool filtering** (read/write/admin per auth) | None |

---

## Recommended Implementation Priority

### Quick Wins (1-2 days each)
1. **Error classification with hints** - Add a `classifyError()` layer to `AdtApiError` with SAP-specific hints
2. **Session auto-recovery** - Wrap `withSession()` pattern around ADT calls with automatic retry on timeout
3. **Object type expansion** - Add DDLX, DCLS, ENHO, ENHS, SRVB, DTEL, DOMA, SQLT, SHLP to URL mapping

### Medium Effort (3-5 days each)
4. **MCP Elicitation** - Add `elicitInput` support to the MCP server for interactive prompts
5. **Transport assign/contents** - New actions under `SAPTransport` tool
6. **Object info** - New type under `SAPRead` for activation status + transport layer metadata
7. **Raw HTTP escape hatch** - New tool or action for arbitrary ADT requests

### Major Feature (1-2 weeks)
8. **ABAP Code Execution** - Implement `abap_run` equivalent with release detection, cleanup, and session management. This is the single most impactful feature from Dassian.

---

## Architecture Notes

### Dependency Approach
Dassian wraps `abap-adt-api` (Marcello Urbani's library) which handles HTTP, CSRF, sessions, and XML parsing internally. This means Dassian inherits the library's limitations and must work around them (e.g., missing Content-Type headers, DELETE with `corrNr`).

ARC-1 has a custom HTTP layer (`ts-src/adt/http.ts`) with direct control over CSRF, cookies, sessions, and request construction. This gives more flexibility but requires more implementation work per feature.

### Tool Architecture
Dassian: 25 separate tools, one per operation. Each tool has a focused description that helps the LLM understand exactly what it does. Downside: more tools = more token overhead in tool listings.

ARC-1: 11 intent-based tools with `type`/`action` routing. More compact tool listing but requires the LLM to understand the routing parameters. Better for large deployments with many tools.

### Stability Considerations
Dassian's reliance on `abap-adt-api` means it inherits fixes and features from the library, but also its bugs. Several workarounds in the codebase (direct `h.request()` calls, skipping library methods) suggest friction points with the library API.

ARC-1's custom implementation avoids these issues but requires maintaining the HTTP/XML/auth stack independently.

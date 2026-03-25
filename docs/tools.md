# ARC-1 Tool Reference

Complete documentation for all MCP tools available in ARC-1.

ARC-1 exposes 11 intent-based tools designed for AI agents.

---

## Unified Tools (2 tools)

These tools replace 11 granular read/write operations with intelligent parameter-based routing:

| Tool | Description |
|------|-------------|------|
| `GetSource` | Unified read for any ABAP source. Parameters: `type` (PROG/CLAS/INTF/FUNC/FUGR/INCL/DDLS/VIEW/BDEF/SRVD/SRVB/MSAG), `name`, optional `parent` (for FUNC), optional `include` (for CLAS). |
| `WriteSource` | Unified write with auto-upsert. Parameters: `type` (PROG/CLAS/INTF/DDLS/BDEF/SRVD), `name`, `source`, `mode`, `options`. Supports create and update for classic ABAP and RAP types. |

**Benefits:** 70% token reduction, simplified tool selection, extensible for new types.

**RAP Support (NEW):** WriteSource now supports creating and updating CDS views (DDLS), behavior definitions (BDEF), and service definitions (SRVD).

---

## Search & Grep Tools (4 tools)

| Tool | Description |
|------|-------------|------|
| `SearchObject` | Quick search for ABAP objects by name pattern |
| `GrepObjects` | Regex search across multiple objects (array of URLs) |
| `GrepPackages` | Regex search across packages with recursive subpackage support |
| `GrepObject` | Regex search in single object |
| `GrepPackage` | Regex search in single package |

**Grep Features:**
- Full regex support (Go regexp syntax)
- Case-sensitive or case-insensitive matching
- Context lines (like `grep -C`)
- Object type filtering
- Max results limit

---

## Read Operations (15 tools)

| Tool | Description |
|------|-------------|------|
| `GetProgram` | Get ABAP program source |
| `GetClass` | Get ABAP class source |
| `GetInterface` | Get ABAP interface source |
| `GetFunction` | Get function module source |
| `GetFunctionGroup` | Get function group structure |
| `GetInclude` | Get ABAP include source |
| `GetTable` | Get table structure definition |
| `GetTableContents` | Get table data (supports SQL filtering) |
| `GetStructure` | Get structure definition |
| `GetPackage` | Get package contents |
| `GetTransaction` | Get transaction details |
| `GetTypeInfo` | Get data type information |
| `GetCDSDependencies` | Get CDS view dependency tree |
| `RunQuery` | Execute freestyle SQL query |

---

## System Information (2 tools) - NEW

| Tool | Description |
|------|-------------|------|
| `GetSystemInfo` | Get SAP system information (SID, release, kernel, database) |
| `GetInstalledComponents` | List installed software components with versions |

---

## Code Analysis (7 tools) - NEW

| Tool | Description |
|------|-------------|------|
| `GetCallGraph` | Get call hierarchy (callers/callees) for methods/functions |
| `GetObjectStructure` | Get object explorer tree structure |
| `GetCallersOf` | Get who calls this object (static call graph - up traversal) |
| `GetCalleesOf` | Get what this object calls (static call graph - down traversal) |
| `AnalyzeCallGraph` | Get statistics about call graph (nodes, edges, depth, types) |
| `CompareCallGraphs` | Compare static vs actual execution for test coverage analysis |
| `TraceExecution` | **COMPOSITE RCA TOOL**: Static graph + trace + comparison for root cause analysis |

---

## Development Tools (10 tools)

| Tool | Description |
|------|-------------|------|
| `SyntaxCheck` | Check source code for syntax errors |
| `Activate` | Activate an ABAP object |
| `ActivatePackage` | Batch activate all inactive objects in package |
| `RunUnitTests` | Execute ABAP Unit tests |
| `RunATCCheck` | Run ATC code quality checks |
| `CompareSource` | Unified diff between any two ABAP objects |
| `CloneObject` | Copy PROG/CLAS/INTF to new name |
| `GetClassInfo` | Quick class metadata (methods, attrs, interfaces) |
| `CreateTable` | Create DDIC table from JSON definition |
| `CreatePackage` | Create local package ($...) |

---

## ATC (Code Quality) Tools (2 tools)

| Tool | Description |
|------|-------------|------|
| `RunATCCheck` | Run ATC check, returns findings with priority (1=Error, 2=Warning, 3=Info) |
| `GetATCCustomizing` | Get ATC system configuration |

**Example ATC Output:**
```json
{
  "summary": { "totalFindings": 3, "errors": 1, "warnings": 2 },
  "worklist": {
    "objects": [{
      "name": "ZCL_TEST",
      "findings": [{ "priority": 1, "checkTitle": "Syntax Check", "line": 42 }]
    }]
  }
}
```

---

## CRUD Operations (5 tools)

| Tool | Description |
|------|-------------|------|
| `LockObject` | Acquire edit lock |
| `UnlockObject` | Release edit lock |
| `CreateObject` | Create new object (program, class, interface, include, function group, function module, package, **DDLS, BDEF, SRVD, SRVB**) |
| `UpdateSource` | Write source code |
| `DeleteObject` | Delete an object |

**RAP Object Creation (NEW):** CreateObject now supports:
- `DDLS/DF` - CDS DDL Source (view definitions)
- `BDEF/BDO` - Behavior Definition
- `SRVD/SRV` - Service Definition
- `SRVB/SVB` - Service Binding (requires `service_definition`, optional `binding_version`, `binding_category`)

---

## Service Binding Operations (2 tools) - NEW

| Tool | Description |
|------|-------------|------|
| `PublishServiceBinding` | Publish a service binding to make it available as OData service |
| `UnpublishServiceBinding` | Unpublish a service binding |

**Parameters:**
- `service_name` (required) - Service binding name
- `service_version` (default: "0001")

---

## Class Include Operations (3 tools)

| Tool | Description |
|------|-------------|------|
| `GetClassInclude` | Get class include (definitions, implementations, macros, testclasses) |
| `CreateTestInclude` | Create test classes include |
| `UpdateClassInclude` | Update class include source |

---

## Workflow Tools (5 tools)

Composite operations that combine multiple ADT API calls:

| Tool | Description | Steps |
|------|-------------|-------|------|
| `EditSource` | **Surgical string replacement** (matches Edit tool pattern) | GetSource → FindReplace → SyntaxCheck → Lock → Update → Unlock → Activate |
| `WriteProgram` | Update program with activation | Lock → SyntaxCheck → Update → Unlock → Activate |
| `WriteClass` | Update class with activation | Lock → SyntaxCheck → Update → Unlock → Activate |
| `CreateAndActivateProgram` | Create new program | Create → UpdateSource → Activate |
| `CreateClassWithTests` | Create class with unit tests | Create → Lock → Update → CreateTestInclude → WriteTests → Unlock → Activate → RunUnitTests |

---

## File-Based Deployment Tools (5 tools)

Solves token limit problem for large files:

| Tool | Description |
|------|-------------|------|
| `ImportFromFile` | **File → SAP** - Smart deploy with auto create/update detection |
| `ExportToFile` | **SAP → File** - Save object source to local file |
| `DeployFromFile` | Legacy name for ImportFromFile |
| `SaveToFile` | Legacy name for ExportToFile |
| `RenameObject` | Rename object by creating copy |

**Supported Extensions:**
- `.clas.abap` - Classes
- `.prog.abap` - Programs
- `.intf.abap` - Interfaces
- `.fugr.abap` - Function Groups
- `.func.abap` - Function Modules
- `.ddls.asddls` - CDS DDL Sources (ABAPGit format)
- `.bdef.asbdef` - Behavior Definitions (ABAPGit format)
- `.srvd.srvdsrv` - Service Definitions (ABAPGit format)

---

## Code Intelligence Tools (7 tools)

| Tool | Description |
|------|-------------|------|
| `FindDefinition` | Navigate to symbol definition |
| `FindReferences` | Find all references to symbol |
| `CodeCompletion` | Get code completion suggestions |
| `PrettyPrint` | Format ABAP source code |
| `GetPrettyPrinterSettings` | Get formatter settings |
| `SetPrettyPrinterSettings` | Update formatter settings |
| `GetTypeHierarchy` | Get type hierarchy (supertypes/subtypes) |

---

## Transport Tools (3 tools)

| Tool | Description |
|------|-------------|------|
| `CreateTransport` | Create transport request |
| `GetTransportInfo` | Get transport details |
| `ReleaseTransport` | Release transport |
| `GetUserTransports` | List user's transports |
| `GetInactiveObjects` | List inactive objects |

---

## ExecuteABAP

Execute arbitrary ABAP code via unit test wrapper:

| Tool | Description |
|------|-------------|------|
| `ExecuteABAP` | Run ABAP code and capture output |

**Risk Levels:**
- `harmless` - Read-only, no external calls
- `dangerous` - Can write to DB, call external
- `critical` - Full system access

See the [repository source](https://github.com/marianfoo/arc-1) for implementation details.

---

## Runtime Errors / Short Dumps (2 tools) - RABAX

| Tool | Description |
|------|-------------|------|
| `GetDumps` | List runtime errors with filters (user, exception type, program, date range) |
| `GetDump` | Get full details of a specific dump including stack trace |

**Use Cases:**
- Monitor system health by checking recent dumps
- Debug production issues by examining dump details
- Track error patterns by exception type

---

## ABAP Profiler / Traces (2 tools) - ATRA

| Tool | Description |
|------|-------------|------|
| `ListTraces` | List ABAP runtime traces (profiler results) |
| `GetTrace` | Get trace analysis (hitlist, statements, dbAccesses) |

**Analysis Types:**
- `hitlist` - Hot spots by execution time
- `statements` - Statement-level trace
- `dbAccesses` - Database access analysis

---

## SQL Trace (2 tools) - ST05

| Tool | Description |
|------|-------------|------|
| `GetSQLTraceState` | Check if SQL trace is currently active |
| `ListSQLTraces` | List SQL trace files |

---

## Git / abapGit Tools (2 tools) - NEW v2.16.0

Exports ABAP objects using abapGit's native serialization. **Requires abapGit installed on SAP system.**

| Tool | Description |
|------|-------------|------|
| `GitTypes` | Get list of 158 supported abapGit object types |
| `GitExport` | Export packages/objects as abapGit-compatible ZIP (base64) |

**GitExport Parameters:**
- `packages` - Comma-separated package names (e.g., "$ZRAY,$TMP")
- `objects` - JSON array of objects: `[{"type":"CLAS","name":"ZCL_TEST"}]`
- `include_subpackages` - Include subpackages (default: true)

**Returns:** Base64-encoded ZIP with abapGit file structure:
```
src/
├── zcl_example.clas.abap      # Class source
├── zcl_example.clas.xml       # Class metadata
├── zif_example.intf.abap      # Interface source
└── ...
```

**SAP Requirements:**
- `ZCL_ABAPGIT_OBJECTS` - Core serialization class
- `ZCL_ABAPGIT_FACTORY` - TADIR access factory
- Install via [abapGit standalone](https://github.com/abapGit/abapGit) or S/4HANA Developer Edition

---

## Install/Setup Tools (3 tools) - NEW v2.17.0

Deploy ARC-1 components and dependencies to SAP systems via ADT.

| Tool | Description |
|------|-------------|------|
| `InstallZADTVSP` | Deploy ZADT_VSP WebSocket handler (6 ABAP objects) |
| `InstallAbapGit` | Deploy abapGit from embedded ZIP (standalone or dev edition) |
| `ListDependencies` | List available dependencies for installation |

**InstallZADTVSP Parameters:**
- `package` - Target package name (default: `$ZADT_VSP`)
- `skip_git_service` - Skip Git service if no abapGit (default: auto-detected)
- `check_only` - Only check prerequisites, don't deploy

**InstallAbapGit Parameters:**
- `edition` - `standalone` (single program) or `dev` (full packages)
- `package` - Target package (default: `$ABAPGIT` or `$ZGIT_DEV`)
- `check_only` - Only show deployment plan

**Architecture:**
```
embedded/
├── abap/           # ZADT_VSP source (raw ABAP, go:embed)
│   ├── zif_vsp_service.intf.abap
│   ├── zcl_vsp_*.clas.abap
│   └── embed.go
│
└── deps/           # Dependencies (abapGit ZIP format)
    ├── abapgit-standalone.zip  # Placeholder
    ├── abapgit-dev.zip         # Placeholder
    └── embed.go                # Unzip + deploy logic
```

---

## Report Execution Tools (6 tools) - NEW v2.19.0

Execute ABAP reports with parameters and capture ALV output. Includes async pattern for long-running reports.

| Tool | Description |
|------|-------------|------|
| `RunReport` | Execute report with params/variant, capture ALV output |
| `RunReportAsync` | Start report in background, returns task_id |
| `GetAsyncResult` | Poll or wait for async task completion |
| `GetVariants` | List available variants for a report |
| `GetTextElements` | Get selection texts and text symbols |
| `SetTextElements` | Update selection texts and text symbols |

**Async Pattern:**
```
1. RunReportAsync(report="RFITEMGL", params={...})
   → {"task_id": "report_1736034567_1", "status": "started"}

2. GetAsyncResult(task_id="...", wait=true)
   → Blocks up to 60s, returns full result when complete
```

**Requires:** ZADT_VSP WebSocket handler deployed to SAP system.

---

## Tool Count Summary

| Tools | Description |
|------|-------|-------------|
| **Hyperfocused** | 1 | Single universal `SAP()` tool, minimal context |
| **Focused** | 81 | Essential tools for AI-assisted development (default) |
| **Expert** | 122 | All tools including low-level operations and RAP creation |

**Token Savings with Focused Mode:**
- Tool definitions: ~50% reduction vs expert mode
- Typical workflow: 60% reduction
- Decision clarity: 81 choices instead of 122

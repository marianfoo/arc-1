# ARC-1 CLI Guide

**arc1** provides a complete ABAP development toolchain from the terminal. Single binary, 28+ commands, 50+ Lua scripting functions. No SAP GUI, no Eclipse, no IDE required.

## Quick Start

```bash
# Option 1: Environment variables
export SAP_URL=https://host:44300 SAP_USER=dev SAP_PASSWORD=secret
arc1 search "ZCL_*"

# Option 2: Saved system profiles (.arc1.json)
arc1 -s dev search "ZCL_*"
arc1 -s prod query T000 --top 3
```

## Command Reference

### Source Code

```bash
# Read source
arc1 source read CLAS ZCL_MY_CLASS
arc1 source read PROG ZTEST_REPORT

# Read with compressed dependency context (7-30x compression)
arc1 context CLAS ZCL_MY_CLASS
arc1 context CLAS ZCL_MY_CLASS --max-deps 30
arc1 context CLAS ZCL_DEEP --depth 2             # deps of deps
arc1 context CLAS ZCL_COMPLEX --depth 3           # 3 levels deep

# Write source (pipe-friendly)
arc1 source write CLAS ZCL_MY_CLASS < new_source.abap
cat source.abap | arc1 source write PROG ZTEST

# Surgical edit (find & replace, auto lock/unlock/activate)
arc1 source edit CLAS ZCL_MY_CLASS --old "old_code" --new "new_code"
arc1 source edit CLAS ZCL_MY_CLASS --old "ADD 1 TO lv_x" --new "lv_x = lv_x + 1" --replace-all
```

**Requirements:** Standard ADT. No ZADT_VSP needed.

### Search & Discovery

```bash
# Search objects by name pattern
arc1 search "ZCL_ORDER*"
arc1 search "Z*" --type CLAS --max 50

# Search source code across entire packages
arc1 grep "SELECT.*FROM.*mara" --package '$TMP'
arc1 grep "TYPE REF TO" --package 'ZFINANCE' -i
arc1 grep "cl_abap_unit" --package '$ZADT' --type CLAS

# System information + ZADT_VSP availability check
arc1 system info
```

**Requirements:** Standard ADT. No ZADT_VSP needed.

### Call Graph & Dependency Analysis

```bash
# What does a class use? (callees)
arc1 graph CLAS ZCL_MY_CLASS
arc1 graph CLAS ZCL_MY_CLASS --depth 2

# Who uses this interface? (callers / where-used)
arc1 graph INTF ZIF_MY_INTERFACE --direction callers

# Both directions
arc1 graph CLAS ZCL_MY_CLASS --direction both

# All object types — classes, interfaces, programs, function groups, transactions
arc1 graph INTF ZIF_MY_INTERFACE --direction callers
arc1 graph PROG ZREPORT
arc1 graph TRAN SE80           # resolves transaction → program via TSTC automatically

# Package dependency analysis + transport readiness
arc1 deps '$ZADT_VSP'
arc1 deps '$ZADT_VSP' --format summary
arc1 deps '$ZFINANCE' --include-subpackages
arc1 deps '$TMP' --object ZCL_MY_CLASS
```

**How `graph` works:**
1. Tries ADT call graph API (`/sap/bc/adt/cai/callgraph`) first
2. If unavailable (404), falls back to **WBCROSSGT + CROSS** table queries
3. Same data as SAP's where-used list — works on every SAP system

**How `deps` works:**
1. Loads all objects from TADIR for the package
2. Queries WBCROSSGT + CROSS for each object's references
3. Classifies each reference:
   - **Internal** — within the same package (safe for transport)
   - **External custom** — Z/Y objects in other packages (must transport first)
   - **SAP standard** — always available on target system

**Requirements:** Standard ADT. No ZADT_VSP needed.

### Database Queries

```bash
# Simple table query
arc1 query T000
arc1 query T000 --top 5

# Filtered queries
arc1 query USR02 --where "BNAME = 'DEVELOPER'" --top 10
arc1 query TADIR --where "DEVCLASS = '\$TMP' AND OBJECT = 'CLAS'" --top 20 --order "OBJ_NAME"

# Data dictionary exploration
arc1 query DD03L --where "TABNAME = 'T000'" --fields "FIELDNAME,DATATYPE,LENG"
arc1 query DD02L --where "TABNAME LIKE 'Z%'" --fields "TABNAME,TABCLASS" --top 20

# Cross-reference tables (who uses what)
arc1 query WBCROSSGT --where "NAME = 'ZCL_MY_CLASS'" --fields "INCLUDE,OTYPE,NAME" --top 20
```

**Requirements:** Standard ADT. No ZADT_VSP needed.
**Safety:** Use `--block-free-sql` to prevent arbitrary SQL execution in production.

### Testing & Quality

```bash
# Unit tests
arc1 test CLAS ZCL_MY_CLASS
arc1 test --package '$TMP'

# ATC checks (ABAP Test Cockpit)
arc1 atc CLAS ZCL_MY_CLASS
arc1 atc PROG ZTEST --variant MY_VARIANT

# ABAP Lint — offline, no SAP needed!
arc1 lint CLAS ZCL_MY_CLASS              # fetch from SAP, lint locally
arc1 lint --file myclass.clas.abap       # local file
echo "DATA x." | arc1 lint --stdin       # piped input
arc1 lint --file src.abap --max-length 100
```

**Lint rules (8):** `line_length`, `empty_statement`, `obsolete_statement`, `max_one_statement`, `preferred_compare_operator`, `colon_missing_space`, `double_space`, `local_variable_names`.

Output format: `file:row:col: severity [rule] message` — compatible with gcc, editors, and CI parsers.

Oracle-verified: 100% match against TypeScript abaplint on 4 rules, 29 files.

**Requirements:** `lint` works fully offline. `test`/`atc` need standard ADT.

### Compile & Transpile

```bash
# WASM → ABAP (fully offline)
arc1 compile wasm program.wasm                          # stdout
arc1 compile wasm program.wasm --class ZCL_MY_WASM      # custom class name
arc1 compile wasm program.wasm -o ./src/                # write to file
arc1 compile wasm program.wasm -o ./src/ --deploy '$TMP' # compile + deploy

# TypeScript → ABAP (needs Node.js for TS parsing)
arc1 compile ts lexer.ts --prefix zcl_
arc1 compile ts lexer.ts -o ./src/ --deploy '$TMP'

# Parse ABAP into structured statements (fully offline)
arc1 parse --file myclass.clas.abap --format summary    # statement type counts
arc1 parse --file source.abap --format json             # machine-readable
echo "DATA lv_x TYPE i. lv_x = 42." | arc1 parse --stdin
arc1 parse CLAS ZCL_TEST --format json                  # fetch from SAP + parse
```

**WASM compiler verified:** 3-way correctness proof on 12 functions (add, factorial, fibonacci, gcd, is_prime, abs, max, min, pow, sum_to, collatz, select) — Native WASM, Go compiler, and ABAP self-host on SAP all produce identical results.

**Requirements:** `compile wasm` and `parse` are fully offline. `compile ts` needs Node.js.

### Lua Scripting

ARC-1 embeds a complete Lua 5.1 engine with 50+ SAP bindings. Use it for automation, analysis, debugging, and scripting.

**Interactive REPL:**
```bash
arc1 -s dev lua
```
```lua
lua> objs = searchObject("ZCL_VSP*")
lua> for _, o in ipairs(objs) do print(o.name, o.package) end

lua> rows = query("SELECT MANDT, MTEXT FROM T000")
lua> for _, r in ipairs(rows) do print(r.MANDT, r.MTEXT) end

lua> source = getSource("CLAS", "ZCL_VSP_UTILS")
lua> issues = lint(source)
lua> print(#issues .. " lint issues")

lua> stmts = parse(source)
lua> for _, s in ipairs(stmts) do print(s.type, s.text) end

lua> ctx = context("CLAS", "ZCL_VSP_APC_HANDLER", 10)
lua> print(#ctx .. " chars with dependency context")

lua> info = systemInfo()
lua> print(info.systemId, info.sapRelease)
```

**Run scripts:**
```bash
# Package audit — lint + parse + structure analysis
arc1 -s dev lua examples/scripts/package-audit.lua

# Table explorer — interactive SQL queries
arc1 -s dev lua examples/scripts/table-explorer.lua

# Dependency check — transport readiness via WBCROSSGT
arc1 -s dev lua examples/scripts/dependency-check.lua

# Debug session — set breakpoints, step through code
arc1 -s dev lua examples/scripts/debug-session.lua

# Record execution — capture variable changes over time
arc1 -s dev lua examples/scripts/record-debug-session.lua
```

**Complete Lua API (50+ functions):**

| Category | Functions |
|----------|-----------|
| **Search & Source** | `searchObject(query, [type])`, `grepObjects(pattern, [type])`, `getSource(type, name)`, `writeSource(type, name, src)`, `editSource(type, name, old, new)` |
| **Query & Analysis** | `query(sql, [maxRows])`, `lint(source)`, `parse(source)`, `context(type, name, [maxDeps])`, `systemInfo()` |
| **Debugging** | `setBreakpoint(prog, line)`, `listen([timeout])`, `attach(id)`, `detach()`, `stepOver()`, `stepInto()`, `stepReturn()`, `continue_()`, `getStack()`, `getVariables([scope])`, `setVariable(name, value)` |
| **Breakpoint Types** | `setStatementBP(stmt)`, `setExceptionBP(ex)`, `setMessageBP(class, num)`, `setBadiBP(name)`, `setEnhancementBP(spot)`, `setWatchpoint(var)`, `setMethodBP(class, method)` |
| **Recording** | `startRecording()`, `stopRecording()`, `getRecording()`, `saveRecording([path])`, `loadRecording(id)`, `listRecordings()`, `compareRecordings(id1, id2)` |
| **Time Travel** | `getStateAtStep(n)`, `findWhenChanged(var, value)`, `findChanges(var)`, `saveCheckpoint(name)`, `injectCheckpoint(name)`, `forceReplay(id)`, `replayFromStep(n)` |
| **Diagnostics** | `listDumps([count])`, `getDump(id)`, `getMessages()`, `runUnitTests(type, name)`, `syntaxCheck(type, name)` |
| **Call Graph** | `getCallGraph(uri)`, `getCallersOf(uri, depth)`, `getCalleesOf(uri, depth)` |
| **Utilities** | `print(...)`, `sleep(seconds)`, `json.encode(value)`, `json.decode(str)` |

**Requirements:** Standard ADT for SAP functions. `lint()`, `parse()`, `json.*` work offline within scripts.

### YAML Workflows

Declarative automation via YAML files with variable substitution, step chaining, and error handling.

```bash
# CI pipeline: discover → syntax check → test → fail on errors
arc1 -s dev workflow run examples/workflows/ci-pipeline.yaml

# Quality gate with variables
arc1 -s dev workflow run examples/workflows/quality-gate.yaml --var PACKAGE='$ZADT_VSP'

# Dry run (preview without executing)
arc1 -s dev workflow run pipeline.yaml --dry-run
```

**Example workflow:**
```yaml
name: ci-pipeline
description: CI pipeline — syntax check and unit tests
variables:
  PACKAGE: "$ZRAY*"
steps:
  - name: discover
    action: search
    parameters: { query: "${PACKAGE}", types: [CLAS], maxResults: 200 }
    saveAs: classes

  - name: syntax-check
    action: syntax_check
    parameters: { objects: classes }
    saveAs: syntaxResults

  - name: fail-on-errors
    action: fail_if
    parameters: { condition: "syntax_errors:syntaxResults", message: "Syntax errors!" }

  - name: unit-tests
    action: test
    parameters: { objects: classes }
    onFailure: continue

  - name: done
    action: print
    parameters: { message: "CI pipeline completed!" }
```

**Built-in actions (9):** `search`, `test`, `syntax_check`, `transform`, `save`, `activate`, `print`, `fail_if`, `foreach`.

**Go fluent API** (for embedding in Go code):
```go
// Search + Test
objects, _ := dsl.Search(client).Query("ZCL_*").Classes().InPackage("$TMP").Execute(ctx)
summary, _ := dsl.Test(client).Objects(objects...).Parallel(4).Run(ctx)

// Batch transform
dsl.Batch(client).Objects(objects...).Transform(myTransform).Activate().Execute(ctx)

// Pipeline
pipeline := dsl.DeployPipeline(client, "./src/", "$ZRAY")
```

**Requirements:** Standard ADT.

### Deploy & Transport

```bash
# Deploy source files (supports abapGit-compatible extensions)
arc1 deploy zcl_test.clas.abap '$TMP'
arc1 deploy zreport.prog.abap '$TMP' --transport A4HK900001

# Transport management
arc1 transport list
arc1 transport list --user DEVELOPER
arc1 transport get A4HK900001

# Install components to SAP
arc1 install zadt-vsp          # deploy ZADT_VSP service classes
arc1 install abapgit           # deploy abapGit
arc1 install list              # check what's installed
```

**Requirements:** Standard ADT for deploy. `install` creates objects in `$TMP` or specified package.

### Execute ABAP

```bash
# Run code on SAP
arc1 execute "WRITE sy-datum."
arc1 execute --file script.abap
echo "WRITE 'hello'." | arc1 execute --stdin
```

**Requirements:** Write permissions. Uses ExecuteABAP (unit test wrapper).
If blocked: `arc1 install zadt-vsp` for WebSocket-based execution.

### Export & Import

```bash
# Export packages to ZIP (abapGit format)
arc1 export '$ZPACKAGE' -o backup.zip
arc1 export '$ZORK' '$ZLLM' -o combined.zip --subpackages

# Import from ZIP
arc1 copy backup.zip '$TMP'
```

**Requirements:** Export needs ZADT_VSP WebSocket. Standard ADT for import via deploy.

---

## Feature Requirements Matrix

| Command | Standard ADT | ZADT_VSP | Node.js | Offline |
|---------|:---:|:---:|:---:|:---:|
| `source read/write/edit` | ✅ | — | — | — |
| `context` (+ `--depth`) | ✅ | — | — | — |
| `graph` (+ WBCROSSGT fallback) | ✅ | — | — | — |
| `deps` | ✅ | — | — | — |
| `search` | ✅ | — | — | — |
| `query` | ✅ | — | — | — |
| `grep` | ✅ | — | — | — |
| `system info` | ✅ | — | — | — |
| `test` | ✅ | — | — | — |
| `atc` | ✅ | — | — | — |
| `deploy` | ✅ | — | — | — |
| `transport` | ✅ | — | — | — |
| `lua` (REPL + scripts) | ✅ | — | — | — |
| `workflow` (YAML) | ✅ | — | — | — |
| `lint` | — | — | — | ✅ |
| `parse` | — | — | — | ✅ |
| `compile wasm` | — | — | — | ✅ |
| `compile ts` | — | — | ✅ | — |
| `execute` | ✅ | optional | — | — |
| `export` | — | ✅ | — | — |
| `install` | ✅ | — | — | — |

**Legend:**
- **Standard ADT** — works with any SAP system that has ADT enabled (default since 7.50)
- **ZADT_VSP** — enhanced features via `arc1 install zadt-vsp` (WebSocket, RFC, Git export)
- **Node.js** — required for TypeScript parsing only
- **Offline** — no SAP connection needed at all

---

## Fallback Behavior

ARC-1 is designed to work with what's available:

1. **No SAP connection?** → `lint`, `parse`, `compile wasm` work fully offline
2. **Standard ADT only?** → `source`, `search`, `query`, `grep`, `graph`, `deps`, `lua`, `workflow`, `test`, `atc`, `deploy` all work
3. **ZADT_VSP installed?** → `export`, `execute` (via WebSocket), `debug` (via RFC) become available
4. **Missing component?** → Clear error messages tell you what to install and how
5. **ADT call graph unavailable?** → `graph` falls back to WBCROSSGT/CROSS tables automatically

```
$ arc1 execute "WRITE 'hello'."
Error: ExecuteABAP requires write permissions.
Check --read-only and --allowed-ops settings.

$ arc1 export '$TMP'
Error: WebSocket connect failed.
Ensure ZADT_VSP is deployed: arc1 install zadt-vsp
```

---

## Multi-System Profiles

Save system configs in `.arc1.json`:

```json
{
  "systems": {
    "dev": {
      "url": "https://dev-host:44300",
      "user": "DEVELOPER",
      "client": "001"
    },
    "prod": {
      "url": "https://prod-host:44300",
      "user": "READER",
      "client": "100"
    }
  }
}
```

```bash
arc1 -s dev query T000
arc1 -s prod search "ZCL_*"
arc1 -s dev deploy myclass.clas.abap '$TMP'
```

Passwords via env vars: `ARC1_DEV_PASSWORD`, `ARC1_PROD_PASSWORD`.

---

## Pipeline Integration

```bash
# CI/CD: test all custom code
arc1 -s dev test --package '$ZCUSTOM' || exit 1

# Lint local files before commit (git pre-commit hook)
find src/ -name "*.abap" -exec arc1 lint --file {} \;

# Export for backup
arc1 -s prod export '$ZPRODUCTION' -o "backup-$(date +%F).zip"

# Compile WASM and deploy
arc1 compile wasm calculator.wasm -o ./build/
arc1 -s dev deploy ./build/zcl_wasm_calculator.clas.abap '$TMP'

# Query and filter with Unix pipes
arc1 -s dev query TADIR --where "DEVCLASS = '\$TMP'" --top 50 | grep CLAS

# Check transport readiness before release
arc1 -s dev deps '$ZFINANCE' --format summary

# Who uses our interface? Impact analysis before change
arc1 -s dev graph INTF ZIF_ORDER_SERVICE --direction callers

# Automated quality gate via YAML
arc1 -s dev workflow run quality-gate.yaml --var PACKAGE='$ZFINANCE'

# Scripted audit via Lua
arc1 -s dev lua audit-package.lua
```

# ARC-1 Reviewer Guide

> A hands-on checklist for anyone who wants to kick the tires.
> No SAP system required for most tasks — 6 of 11 tasks are fully offline.

## Build It (30 seconds)

```bash
git clone https://github.com/marianfoo/arc-1.git
cd arc-1
go build -o arc1 ./cmd/arc1
./arc1 --version
```

Single binary, zero dependencies beyond Go 1.23+.

---

## Task 1: Read the --help

```bash
./arc1 --help
```

**What to spotlight:**
- Two modes: MCP Server (AI agents) + CLI (terminal DevOps)
- 28 CLI commands, 11 intent-based MCP tools
- Enterprise safety flags (`--read-only`, `--allowed-packages`, `--disallowed-ops`)
- Subcommands: search, source, query, grep, graph, deps, lint, compile, parse, test, atc, deploy, export, system, install...

**Questions:**
- Does the help make clear this is both an MCP server AND a CLI tool?
- Would you know how to get started?

---

## Task 2: Run the Tests (no SAP needed)

```bash
go test ./...
```

250+ unit tests, all pass without any SAP connection.

**Dig deeper:**

```bash
# Safety system (25 tests)
go test -v -run TestSafety ./pkg/adt/

# ABAP lexer — oracle-verified against TypeScript abaplint
go test -v -run TestLexer_OracleDifferential ./pkg/abaplint/

# Statement parser — 100% match on 3,254 statements
go test -v -run TestStatementMatcher_OracleDifferential ./pkg/abaplint/

# ABAP linter — 100% match on 4 oracle-verified rules
go test -v -run TestLinter_OracleDifferential ./pkg/abaplint/

# WASM compiler
go test -v -run TestWASMSuite ./pkg/wasmcomp/

# Cache, DSL, scripting
go test -v ./pkg/cache/ ./pkg/dsl/ ./pkg/scripting/

# Race detection
go test -race ./...
```

---

## Task 3: ABAP Linter — Fully Offline

No SAP, no Node.js, no network. Just pipe ABAP:

```bash
echo 'REPORT ztest.
DATA bad_name TYPE i.
.
COMPUTE bad_name = 42.
IF bad_name EQ 10. WRITE bad_name. ENDIF.' | ./arc1 lint --stdin
```

Expected: finds `empty_statement`, `obsolete_statement`, `preferred_compare_operator`, `max_one_statement`.

**Lint a real file:**
```bash
./arc1 lint --file embedded/abap/zcl_vsp_utils.clas.abap
```

**What to spotlight:**
- gcc-style output (`file:row:col: severity [rule] message`)
- 8 rules: line_length, empty_statement, obsolete_statement, max_one_statement, preferred_compare_operator, colon_missing_space, double_space, local_variable_names
- Oracle-verified against TypeScript abaplint (100% match)

---

## Task 4: ABAP Parser — Fully Offline

```bash
echo 'CLASS zcl_demo DEFINITION PUBLIC.
  PUBLIC SECTION.
    METHODS run IMPORTING iv_name TYPE string.
ENDCLASS.
CLASS zcl_demo IMPLEMENTATION.
  METHOD run.
    DATA lv_result TYPE string.
    lv_result = iv_name.
    IF lv_result IS NOT INITIAL.
      WRITE lv_result.
    ENDIF.
  ENDMETHOD.
ENDCLASS.' | ./arc1 parse --stdin --format summary
```

Expected: 13 statements, types: ClassDefinition, ClassImplementation, MethodDef, etc.

**JSON output for tooling:**
```bash
echo "DATA lv_x TYPE i. lv_x = 42." | ./arc1 parse --stdin --format json
```

---

## Task 5: WASM→ABAP Compiler — Fully Offline

```bash
# Compile a WASM binary to ABAP (if you have one)
./arc1 compile wasm pkg/wasmcomp/testdata/quickjs_eval.wasm --class ZCL_QUICKJS 2>/dev/null | head -20

# Or build the test suite WASM and compile it
go test -v -run TestWASMSuite_CompileGo ./pkg/wasmcomp/
cat /tmp/wasm_suite_go.abap | head -20
```

**What to spotlight:**
- 225 bytes WASM → 117 lines ABAP
- 3-way verified: Native WASM (51/51), Go compiler, ABAP self-host on SAP (11/11)
- Functions: add, factorial, fibonacci, gcd, is_prime, abs, max, min, pow, sum_to, collatz, select

---

## Task 6: Config & Safety (no SAP needed)

```bash
# Generate example configs
./arc1 config init
cat .env.example
cat .arc1.json.example

# Test safety flags
SAP_READ_ONLY=true ./arc1 config show
SAP_ALLOWED_PACKAGES='Z*,$TMP' ./arc1 config show
```

**Multi-system profiles:**
```bash
cp .arc1.json.example .arc1.json
./arc1 systems
```

**Safety review:** Read `pkg/adt/safety.go` + `safety_test.go` (25 tests).

| Flag | What It Does |
|------|-------------|
| `--read-only` | Blocks all write operations |
| `--block-free-sql` | Blocks `RunQuery` (arbitrary SQL) |
| `--allowed-packages 'Z*,$TMP'` | Restricts to matching packages |
| `--allowed-ops RSQ` | Whitelist: only Read, Search, Query |
| `--disallowed-ops CDUA` | Blacklist: block Create, Delete, Update, Activate |

---

## Task 7: With SAP Access — Quick Smoke Test

If you have an SAP system with ADT enabled:

```bash
export SAP_URL=https://host:44300 SAP_USER=dev SAP_PASSWORD=secret
# Or: ./arc1 -s dev ...

# System info
./arc1 system info

# Search
./arc1 search "ZCL_*" --max 10

# Query a table
./arc1 query T000 --top 3

# Grep source code
./arc1 grep "SELECT" --package '$TMP' --max 5

# Read source with dependency context
./arc1 context CLAS ZCL_SOMETHING --depth 2
```

**What to spotlight:** Everything works with standard ADT. No ZADT_VSP needed.

---

## Task 8: Graph & Dependency Analysis (with SAP)

```bash
# What does a class use?
./arc1 graph CLAS ZCL_MY_CLASS

# Who uses an interface?
./arc1 graph INTF ZIF_MY_INTERFACE --direction callers

# Transaction → resolve to program → graph
./arc1 graph TRAN SE80

# Package transport readiness
./arc1 deps '$MY_PACKAGE' --format summary
```

**What to spotlight:**
- `graph` falls back to WBCROSSGT/CROSS tables when ADT call graph API is unavailable
- `deps` classifies: internal (safe) / external custom (need transport) / SAP standard (always there)
- Transaction resolution via TSTC table

---

## Task 9: Lua Scripting & YAML Workflows (with SAP)

ARC-1 includes a Lua scripting engine (50+ SAP bindings) and a YAML workflow engine for automation.

**Lua REPL:**
```bash
./arc1 -s dev lua
# lua> objs = searchObject("ZCL_VSP*")
# lua> for _, o in ipairs(objs) do print(o.name) end
# lua> rows = query("SELECT MANDT, MTEXT FROM T000")
# lua> source = getSource("CLAS", "ZCL_VSP_UTILS")
# lua> issues = lint(source)
# lua> stmts = parse(source)
```

**Run example scripts:**
```bash
# Package audit — lint + parse all classes
./arc1 -s dev lua examples/scripts/package-audit.lua

# Table explorer — interactive SQL queries
./arc1 -s dev lua examples/scripts/table-explorer.lua

# Dependency check — transport readiness via WBCROSSGT
./arc1 -s dev lua examples/scripts/dependency-check.lua

# Debug session recording
./arc1 -s dev lua examples/scripts/record-debug-session.lua
```

**YAML workflows:**
```bash
# CI pipeline: search → syntax check → unit tests
./arc1 -s dev workflow run examples/workflows/ci-pipeline.yaml

# Pre-transport quality gate
./arc1 -s dev workflow run examples/workflows/quality-gate.yaml --var PACKAGE='$ZADT_VSP'
```

**What to spotlight:**
- Lua has full SAP access: search, query, grep, source, debug, lint, parse
- `query()` returns Lua tables — native data processing
- `lint()` and `parse()` work on any string — no SAP needed
- YAML workflows with variable substitution, step chaining, error handling
- Debugger scripting: set breakpoints, step, inspect, record, replay

**Lua API categories (50+ functions):**

| Category | Functions |
|----------|-----------|
| Search & Source | `searchObject`, `grepObjects`, `getSource`, `writeSource`, `editSource` |
| Query & Analysis | `query`, `lint`, `parse`, `context`, `systemInfo` |
| Debugging | `setBreakpoint`, `listen`, `attach`, `stepOver/Into/Return`, `getStack`, `getVariables` |
| Breakpoints | line, statement, exception, message, BAdi, enhancement, watchpoint, method |
| Recording | `startRecording`, `stopRecording`, `saveRecording`, `loadRecording` |
| Time Travel | `getStateAtStep`, `findWhenChanged`, `findChanges`, `forceReplay` |
| Diagnostics | `listDumps`, `getDump`, `runUnitTests`, `syntaxCheck` |
| Utilities | `print`, `sleep`, `json.encode/decode` |

---

## Task 10: MCP Integration

If you have Claude Desktop, Gemini CLI, Copilot, or any MCP client:

```bash
./arc1 config init
cat .mcp.json.example
```

Ready-to-use configs for 8 AI agents in `docs/cli-agents/`.

**What to spotlight:**
- 11 intent-based tools, ~200 tokens schema
- Context compression: dependencies auto-appended to GetSource
- Method-level surgery: 95% token reduction

---

## Task 11: Code Quality (for Go developers)

```bash
go vet ./...
go test -race ./...
ls -lh arc1                    # binary size
go mod graph | wc -l          # dependency count
```

**Key files:**

| File | What | Lines |
|------|------|------:|
| `internal/mcp/server.go` | 122 MCP tool handlers | ~250 |
| `pkg/adt/client.go` | ADT HTTP client | ~1800 |
| `pkg/adt/safety.go` | Enterprise safety | ~200 |
| `pkg/abaplint/lexer.go` | ABAP lexer (abaplint port) | ~340 |
| `pkg/abaplint/rules.go` | 8 lint rules | ~320 |
| `pkg/scripting/bindings.go` | 50+ Lua→SAP bindings | ~1600 |
| `pkg/dsl/workflow.go` | YAML workflow engine | ~600 |
| `pkg/wasmcomp/compile.go` | WASM→ABAP compiler | ~500 |
| `pkg/ts2go/ts2go.go` | TypeScript→Go transpiler | ~500 |
| `cmd/arc1/devops.go` | CLI command handlers | ~1100 |

---

## Quick Reference

| What | Command | SAP? |
|------|---------|:----:|
| Build | `go build -o arc1 ./cmd/arc1` | — |
| Unit tests | `go test ./...` | — |
| Lint ABAP | `./arc1 lint --file x.abap` | — |
| Parse ABAP | `./arc1 parse --stdin` | — |
| Compile WASM | `./arc1 compile wasm x.wasm` | — |
| Config | `./arc1 config init/show` | — |
| System info | `./arc1 system info` | ✅ |
| Search | `./arc1 search "Z*"` | ✅ |
| Query table | `./arc1 query T000 --top 5` | ✅ |
| Grep source | `./arc1 grep "pattern" --package PKG` | ✅ |
| Call graph | `./arc1 graph CLAS ZCL_X` | ✅ |
| Package deps | `./arc1 deps '$PKG' --format summary` | ✅ |
| Read source | `./arc1 source read CLAS ZCL_X` | ✅ |
| Context | `./arc1 context CLAS ZCL_X --depth 2` | ✅ |
| Lua REPL | `./arc1 lua` | ✅ |
| Lua script | `./arc1 lua script.lua` | ✅ |
| YAML workflow | `./arc1 workflow run pipeline.yaml` | ✅ |
| Unit tests | `./arc1 test CLAS ZCL_X` | ✅ |
| Deploy | `./arc1 deploy x.clas.abap '$TMP'` | ✅ |
| Export | `./arc1 export '$PKG' -o backup.zip` | ✅+ |

✅+ = needs ZADT_VSP WebSocket

---

## Found Something?

- Open an issue: https://github.com/marianfoo/arc-1/issues
- PRs welcome — especially for: test coverage, error messages, documentation, new lint rules, MCP agent configs

# Roadmap: vsp Development Plan

> Last Updated: 2025-12-21

## Current Status: v2.15.0

| Metric | Value |
|--------|-------|
| MCP Tools | 94 |
| Unit Tests | 244 |
| Platforms | Linux, macOS, Windows (x64, ARM64) |
| Phase | 5 - TAS-Style Debugging ✅ |

---

## Completed Phases

### Phase 1: Foundation (v1.x) ✅
- [x] ADT client library in Go
- [x] MCP server implementation
- [x] Basic CRUD operations (read, write, lock, unlock)
- [x] Syntax check and activation
- [x] Unit test execution
- [x] Cookie and basic authentication

### Phase 2: Code Intelligence (v2.0-2.6) ✅
- [x] Find definition and references
- [x] Code completion
- [x] Call graph analysis
- [x] CDS dependency analysis
- [x] Object structure exploration
- [x] RAP OData E2E (DDLS, SRVD, SRVB)

### Phase 3: Debugging & Diagnostics (v2.7-2.10) ✅
- [x] External breakpoints (line, statement, exception)
- [x] Debug listener (long-polling)
- [x] Debugger attach/detach
- [x] Stack inspection
- [x] Variable inspection
- [x] Step commands (into, over, return, continue)
- [x] Short dumps (RABAX/ST22)
- [x] ABAP Profiler (ATRA)
- [x] SQL Traces (ST05)

### Phase 4: Advanced Analysis (v2.11-2.13) ✅
- [x] Transport management (5 tools)
- [x] UI5/BSP management (7 tools)
- [x] AMDP debugger (experimental - interface issue pending)
- [x] WebSocket handler (ZADT_VSP v2.1.0)
  - [x] RFC/FM domain - call function modules via WebSocket
  - [x] Debug domain - stateful ABAP debugging
  - [x] AMDP domain - HANA/SQLScript debugging (WIP)
  - [x] SUBMIT domain - execute any ABAP program via WebSocket
- [x] Call graph traversal (GetCallersOf, GetCalleesOf)
- [x] TraceExecution composite RCA tool
- [x] Static vs actual call graph comparison

### Phase 5: TAS-Style Debugging (v2.14-2.15) ✅

**Goal:** Scriptable, replayable debugging inspired by Tool-Assisted Speedruns.

#### 5.1 Lua Scripting Integration
- [x] Integrate gopher-lua into vsp
- [x] Expose all MCP tools to Lua
- [x] Create Lua REPL for interactive debugging
- [x] Document scripting API (examples + reports)

```lua
-- Target API
while true do
    local event = waitForBreakpoint(30)
    if not event then break end
    saveState("checkpoint_" .. event.hit_count)
    stepOver()
end
```

**Effort:** 2 weeks
**Files:** `pkg/scripting/lua.go`, `internal/mcp/lua_bindings.go`

#### 5.2 Variable History Recording
- [x] Design execution frame structure
- [x] Implement frame capture at each debug step
- [x] Delta compression for storage efficiency
- [x] "Show state at step N" command

```go
type ExecutionFrame struct {
    StepNumber int
    Location   CodeLocation
    Variables  map[string]Variable
    DBOps      []DBOperation
    RFCCalls   []RFCCall
}
```

**Effort:** 2 weeks
**Files:** `pkg/adt/recorder.go`, `pkg/adt/history.go`

#### 5.3 Checkpoint System
- [x] Serialize variable state to JSON
- [x] Store checkpoints locally (in-memory + file)
- [x] Restore checkpoint (variable inspection)
- [x] Checkpoint management commands (save/get/list)

#### 5.4 Watchpoint Scripting
- [x] Scriptable watchpoint conditions
- [x] All breakpoint types: line, statement, exception, message, BAdi, enhancement, watchpoint, method
- [x] 8 breakpoint type functions in Lua

#### 5.5 Force Replay (State Injection)
- [x] SetVariable API (modify variables in live session)
- [x] InjectCheckpoint (restore all variables from checkpoint)
- [x] ForceReplay (inject state from recording at specific step)
- [x] ReplayFromStep (inject state from current recording)

```lua
-- The killer feature: Inject production state into dev session
forceReplay("production_dump_001")  -- Inject and debug!
```

#### 5.6 Testing & Documentation
- [x] 59 unit tests (recorder, history, Lua bindings)
- [x] E2E test script (`examples/scripts/phase5-experiment.lua`)
- [x] Testing methodology report
- [x] Data extraction examples report
- [x] Live experiment documentation

---

## Next: Phase 6

### Phase 6: Test Case Extraction (Q2 2026)

**Goal:** Automatically generate reproducible tests from recorded executions.

#### 6.1 Recording Storage
- [ ] Design recording file format (JSON)
- [ ] Implement recording index/search
- [ ] Recording metadata (tags, date, object)
- [ ] Storage management (cleanup, export)

**Effort:** 1 week

#### 6.2 Test Case Extractor
- [ ] Extract inputs from entry frame
- [ ] Extract outputs from exit frame
- [ ] Identify external dependencies (DB, RFC, HTTP)
- [ ] Generate mock specifications

**Effort:** 2 weeks
**Files:** `pkg/extraction/extractor.go`

#### 6.3 ABAP Test Generator
- [ ] Generate ABAP Unit test class
- [ ] Generate mock setup code
- [ ] Generate assertions from outputs
- [ ] Handle table parameters

**Effort:** 2 weeks
**Files:** `pkg/extraction/abap_generator.go`

#### 6.4 Mock Framework (ABAP-side)
- [ ] Design ZCL_VSP_MOCK base class
- [ ] DB mock implementation
- [ ] RFC mock implementation
- [ ] Mock verification

**Effort:** 2 weeks
**Files:** `embedded/abap/zcl_vsp_mock*.abap`

---

## Planned: Phase 7

### Phase 7: Isolated Playground (Q3 2026)

**Goal:** Fast, isolated test execution with mocked dependencies.

#### 7.1 Playground Runtime
- [ ] Load test case and mocks
- [ ] Inject mock endpoints
- [ ] Execute code unit
- [ ] Collect results

**Effort:** 2 weeks

#### 7.2 Patch & Re-run
- [ ] Apply code patches in-memory
- [ ] Re-execute without save
- [ ] Compare results
- [ ] Commit patch when ready

**Effort:** 1 week

#### 7.3 Mock Strategies
- [ ] VCR-style (exact replay)
- [ ] Smart mocking (pattern-based)
- [ ] AI-generated mocks

**Effort:** 2 weeks

#### 7.4 CLI Experience
- [ ] Interactive playground REPL
- [ ] `run`, `patch`, `diff`, `commit` commands
- [ ] Execution time tracking
- [ ] Coverage reporting

**Effort:** 1 week

---

## Planned: Phase 8

### Phase 8: Time-Travel Debugging (Q4 2026)

**Goal:** Navigate backwards through execution history.

#### 8.1 History Navigation
- [ ] "Show state at step N" (view only)
- [ ] "Find when X changed"
- [ ] "Find when X became Y"
- [ ] Jump to step

**Effort:** 2 weeks

#### 8.2 Temporal Queries
- [ ] Query interface for execution history
- [ ] Filter by variable, value, condition
- [ ] Aggregate queries (count, first, last)

**Effort:** 2 weeks

#### 8.3 Branch Exploration (Experimental)
- [ ] Fork execution at decision point
- [ ] Explore alternate path
- [ ] Compare outcomes

**Effort:** 3 weeks

---

## Future: Phase 9+

### WebSocket Enhancements (Ongoing)

**ZADT_VSP APC Handler** provides stateful WebSocket capabilities not available via REST:

#### Completed Domains
- **RFC Domain**: Call any function module via WebSocket
- **Debug Domain**: Stateful ABAP debugging with session persistence
- **AMDP Domain**: HANA/SQLScript debugging (interface issue pending)
- **Submit Domain**: Execute any ABAP program (SUBMIT)

#### Planned Domains
- [ ] **abapGit Domain**: Package export/import via chunked transfer
  - Challenge: Large ZIP files may need splitting for WebSocket
  - Alternative: Use OData handler for large transfers
- [ ] **Transport Domain**: Transport operations via WebSocket
- [ ] **Batch Domain**: Bulk operations with progress tracking

### Phase 9: AI Integration (2027)
- [ ] AI-suggested breakpoints
- [ ] Anomaly detection in traces
- [ ] Automated hypothesis generation
- [ ] Multi-agent debugging

### Phase 10: Advanced Testing (2027)
- [ ] Mutation testing
- [ ] Property-based testing
- [ ] Differential testing
- [ ] Fuzzing integration

### Phase 11: Production Features (2027+)
- [ ] Self-healing workflows
- [ ] Production trace analysis
- [ ] Performance regression detection
- [ ] Security vulnerability scanning

---

## Milestones

| Milestone | Target | Description |
|-----------|--------|-------------|
| v2.14 | Jan 2026 | Lua scripting MVP |
| v2.15 | Feb 2026 | Variable history recording |
| v2.16 | Mar 2026 | Checkpoint/restore |
| v3.0 | Apr 2026 | Test case extraction |
| v3.1 | May 2026 | ABAP mock framework |
| v3.2 | Jun 2026 | Isolated playground MVP |
| v3.5 | Sep 2026 | Playground REPL |
| v4.0 | Dec 2026 | Time-travel debugging |

---

## How to Contribute

### Good First Issues
- Add more MCP tools for existing ADT APIs
- Improve error messages
- Add integration tests
- Documentation improvements

### Medium Effort
- Lua binding for specific tools
- Recording format design
- Mock framework design

### Major Features
- Scripting engine integration
- Test extractor implementation
- Playground runtime

---

## Design Documents

| Phase | Document |
|-------|----------|
| 5-8 | [TAS-Style Debugging Vision](reports/2025-12-21-001-tas-scripting-time-travel-vision.md) |
| 5 | [Force Replay & State Injection](reports/2025-12-21-003-force-replay-state-injection.md) |
| 6-7 | [Test Extraction & Replay](reports/2025-12-21-002-test-extraction-isolated-replay.md) |
| 4 | [Call Graph & RCA Tools](reports/2025-12-05-013-ai-powered-rca-workflows.md) |
| 3 | [Debugger Deep Dive](reports/2025-12-11-002-adt-abap-debugger-deep-dive.md) |

---

*This roadmap is a living document. Priorities may shift based on community feedback and technical discoveries.*

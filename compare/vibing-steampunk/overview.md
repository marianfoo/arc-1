# oisee/vibing-steampunk — Commit & Issue Tracker

> Tracking commits and issues from [oisee/vibing-steampunk](https://github.com/oisee/vibing-steampunk) (ARC-1's upstream) for features and bug fixes worth adopting.

_Last updated: 2026-04-02_

## Approach

- **Commits**: Grouped by release in `commits.json`. Auto-triaged by commit prefix.
- **Issues**: All 38 issues evaluated in `issues.json`
- **Evaluations**: Detailed write-ups for high/medium priority items in `evaluations/`
- **Scope**: Tracking from v2.22.0 (2026-02-01) onwards
- **Key difference from fr0ster**: VSP is ARC-1's upstream — same safety system design, shared heritage. ~70% of commits are experimental (WASM/LLVM compilers, Lua, JS evaluator) and not relevant.

## Stats

| Metric | Commits | Issues |
|--------|---------|--------|
| Total | 377 | 38 |
| Tracked | 42 | 38 |
| Evaluated | 42 | 38 |
| Pending evaluation | 0 | 0 |
| Skipped (not relevant) | 30 | 20 |
| Evaluation files | 12 | 7 |

## Priority Summary

### High Priority (implement in ARC-1)

| Source | ID | Description | ARC-1 Matrix Ref |
|--------|----|-------------|-------------------|
| issue | #9 | Transport 406 Accept header (same class as fr0ster 415) | Critical #3 |

### Medium Priority (evaluate/verify)

| Source | ID | Description | ARC-1 Matrix Ref |
|--------|----|-------------|-------------------|
| commit | ca02f47 | S/4HANA 757 transport endpoint compat | Verify transport.ts |
| commit | 6d1f00a | Namespaced class URI in syntax check | Verify devtools.ts |
| commit | d73460a | 401 auto-retry after idle timeout | Verify http.ts |
| commit | 59b4b90 | Namespace URL encoding for ADT ops | Verify http.ts |
| commit | 7fbfbba | ignore_warnings for EditSource | Consider for edit_method |
| commit | ba83e22 + 558a300 | Package deps + call graph analysis | Medium #31 in matrix |
| commit | 0756e94 | ABAP parser + deps as MCP tools | Consider for SAPContext |
| issue | #78 | 423 lock handle on ECC 6.0 | Verify crud.ts |
| issue | #40 | i18n/translation tools | New feature consideration |
| issue | #39 | gCTS tools | Medium #15 in matrix |
| issue | #34 | Table contents pagination | Enhance RunQuery |
| issue | #33 | Syntax warnings blocking saves | Verify edit_method |

### Low / Skip (no action needed)

- WASM/LLVM/JS compiler experiments (30+ commits) — experimental, not MCP tooling
- Lua scripting — Go-specific
- ABAP LSP — niche
- CLI mode — ARC-1 is MCP-only
- Debugger — requires ZADT_VSP deployment
- GetAbapHelp — requires ZADT_VSP WebSocket

## How to Update

Run `/update-competitor-tracker` from Claude Code (covers both fr0ster and vibing-steampunk).

## Relationship to Existing Analysis

This tracker **complements** [../01-vibing-steampunk.md](../01-vibing-steampunk.md) which has:
- High-level project comparison
- Feature gap analysis (what upstream has vs ARC-1)
- Changelog & Relevance Tracker (release-level)

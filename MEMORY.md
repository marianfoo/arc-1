# LLM Eval Harness — Session Context

## What was built

A Vitest-based LLM evaluation framework for testing whether LLMs correctly select and parameterize ARC-1's 11 MCP tools. Pushed to branch `claude/llm-testing-sap-mcp-w5mSN`.

## Files created

```
tests/evals/
├── types.ts                        # Type definitions (scenarios, scoring, providers)
├── harness.ts                      # Agentic loop + tiered scoring engine
├── llm-eval.test.ts                # Vitest test runner (26 test cases)
├── providers/
│   ├── ollama.ts                   # Ollama provider (OpenAI-compatible /v1/chat/completions)
│   └── anthropic.ts                # Claude API provider (Messages API)
└── scenarios/
    └── tool-selection.ts           # 26 scenarios across all 11 tools
vitest.eval.config.ts               # Vitest config (120s timeout, sequential)
package.json                        # Added "test:eval" script
```

## Architecture decisions

1. **Zero new dependencies** — uses native `fetch()` for LLM APIs, no AI SDK
2. **Reuses production `getToolDefinitions()`** — evals test the exact schemas LLMs see
3. **Tiered scoring**: optimal (1.0) / acceptable (0.5) / forbidden (0.0) — handles "different but valid" tool calls
4. **Graceful skip** — if Ollama isn't running, tests pass as skipped (CI-safe)
5. **Two providers**: Ollama (local models) and Anthropic (Claude API)

## How to run

```bash
# Ollama (default)
EVAL_MODEL=qwen3:8b npm run test:eval

# Larger model (128GB M5 Max can handle this)
EVAL_MODEL=llama3.1:70b npm run test:eval

# Claude API
EVAL_PROVIDER=anthropic EVAL_MODEL=claude-sonnet-4-20250514 ANTHROPIC_API_KEY=sk-... npm run test:eval

# Filter by category or scenario
EVAL_CATEGORY=read npm run test:eval
EVAL_SCENARIO=context-dependencies npm run test:eval
```

## 26 Scenarios by category

| Category | Count | Scenarios |
|----------|-------|-----------|
| read | 10 | read-program, read-class, read-interface, read-function-module, read-cds-view, read-table-structure, read-domain, read-table-contents, read-class-method, read-class-unit-tests |
| search | 2 | search-objects, search-source-code |
| context | 2 | context-dependencies, context-cds-deps |
| write | 2 | write-edit-method, write-create-program |
| diagnose | 3 | diagnose-syntax-check, diagnose-unit-tests, diagnose-dumps |
| query | 1 | query-sql |
| activate | 2 | activate-single, activate-rap-batch |
| manage | 1 | manage-check-features |
| navigate | 1 | navigate-where-used |
| lint | 1 | lint-local-check |
| transport | 1 | transport-list |

## Key scoring dimensions

- **Tool Selection Score** (60% weight): Did the LLM pick the right tool?
- **Parameter Score** (40% weight): Were the arguments correct?
- **Pass threshold**: 0.5 (configurable via EVAL_PASS_THRESHOLD)

## Interesting comparisons to run

1. **SAPContext vs SAPRead** — do weaker models use the token-efficient tool?
2. **edit_method vs full update** — do they pick surgical editing?
3. **RAP batch activation** — do they use the objects array?
4. **SAPLint vs SAPDiagnose** — can they distinguish local from server-side?
5. **Standard mode (11 tools) vs hyperfocused mode (1 tool)** — does simplifying help weaker models?

## Next steps / future work

- Add hyperfocused mode scenarios (single SAP tool with action param)
- Add multi-step scenarios (search → read → write → activate)
- Add BTP-specific scenarios (test type restrictions)
- Add model comparison output (markdown table / JSON)
- Add live SAP mode (use real server responses instead of mocks)
- Consider promptfoo integration for richer CI reporting
- Add token efficiency scoring (penalize unnecessary calls)
- Test with more Ollama models: Mistral, Gemma 3, Phi-4, DeepSeek

## Research findings

- **Strands Evals** (Python): Has ToolSelectionAccuracyEvaluator — real, mature, but wrong language
- **PydanticAI**: Can connect to MCP servers over stdio/SSE/HTTP — real but Python
- **promptfoo** (TypeScript): Production-grade, has trajectory assertions — potential future integration
- **evalite** (Vitest-native): Has toolCallAccuracy scorer — early but promising
- **Neon's MCP eval blog**: Improved 60% → 100% just by improving tool descriptions
- **GitHub MCP Server eval**: Uses classification scores (accuracy, precision, recall, F1)
- **Ollama tool calling**: Llama 3.1, Qwen 3, Mistral support it well; use ai-sdk-ollama if empty responses occur

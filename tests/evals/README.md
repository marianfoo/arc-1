# LLM Evals

End-to-end tool-selection evals for the ARC-1 MCP tool surface. The harness
feeds a natural-language prompt to an LLM (Ollama or Anthropic), lets it loop
through tool calls, and scores the trace against expected tool choice + args.

The point is to catch regressions in **how LLMs route intent through our tool
descriptions** — the same class of bug we found in FEAT-33 where LLMs
text-scanned `DDDDLSRC` via SAPQuery instead of calling
`SAPContext(action="impact")`.

---

## TL;DR

```bash
# Default: run everything against a local Ollama model with mock responses
npm run test:eval

# Just the FEAT-33 CDS impact scenarios, mocked
EVAL_FILE=context-impact npm run test:eval

# Same scenarios against the real SAP test system
# (requires a running MCP server — see "Live backend" below)
EVAL_FILE=context-impact npm run test:eval:live

# Anthropic Sonnet against the full suite
EVAL_PROVIDER=anthropic EVAL_MODEL=claude-sonnet-4-20250514 \
  ANTHROPIC_API_KEY=sk-... npm run test:eval
```

---

## Directory layout

```
tests/evals/
├── README.md                  ← you are here
├── llm-eval.test.ts           ← vitest entry — loops scenarios + prints/persists results
├── harness.ts                 ← agentic loop + tiered scoring (optimal/acceptable/forbidden)
├── live-backend.ts            ← optional — routes tool calls to a real MCP server
├── types.ts                   ← EvalScenario, LLMProvider, result shapes
├── providers/
│   ├── ollama.ts              ← /v1/chat/completions (OpenAI-compatible)
│   └── anthropic.ts           ← /v1/messages
└── scenarios/
    ├── index.ts               ← aggregator — SCENARIO_FILES, ALL_SCENARIOS
    ├── read-basic.ts          ← PROG/CLAS/INTF/FUNC/CDS/STRU/DOMA/table-contents
    ├── search.ts              ← SAPSearch object + source-code
    ├── context-deps.ts        ← SAPContext(action="deps") forward dependencies
    ├── context-impact.ts      ← SAPContext(action="impact") — FEAT-33 blast radius
    ├── write.ts               ← SAPWrite edit_method/create
    ├── diagnose.ts            ← SAPDiagnose syntax/unittest/dumps
    ├── query.ts               ← SAPQuery free SQL
    ├── activate.ts            ← SAPActivate single + RAP batch
    ├── manage.ts              ← SAPManage features/probe
    ├── navigate.ts            ← SAPNavigate where-used
    ├── lint.ts                ← SAPLint local abaplint
    └── transport.ts           ← SAPTransport list/get/release
```

One file per feature bucket. Scenario ids are globally unique (enforced by
`scenarios/index.ts` at import time) so every filter knob is unambiguous.

---

## Filtering (precedence: high → low)

| Env var           | Example                                 | Effect                                             |
| ----------------- | --------------------------------------- | -------------------------------------------------- |
| `EVAL_SCENARIO`   | `cds-impact-blast-radius-natural`       | Run a single scenario by id                        |
| `EVAL_FILE`       | `context-impact,read-basic`             | Run scenarios from these buckets (comma-separated) |
| `EVAL_TAG`        | `feat-33,cds-impact`                    | Run scenarios that carry ANY of these tags         |
| `EVAL_CATEGORY`   | `context`                               | Legacy category filter (one value)                 |
| _(none)_          | —                                       | Run everything                                     |

Filters combine with AND: a scenario must pass every filter you set.

---

## Backends

The harness can feed the LLM either static mocks or real ADT responses.

### `EVAL_BACKEND=mock` (default)

- Each scenario supplies `mockResponses: { "SAPRead": "...", "*": "..." }`.
- Zero network calls — fast, deterministic, offline-friendly.
- Can't catch handler/schema drift, only LLM routing.

### `EVAL_BACKEND=live`

- Routes each tool call to a real MCP server at `EVAL_MCP_URL`
  (default `http://localhost:3000/mcp`, same as `E2E_MCP_URL`).
- Catches exactly the class of bug we shipped FEAT-33 with:
  the LLM-observable gap between the tool description, the Zod schema, and
  what the handler actually requires.
- Requires the server to be running and the ADT backend to be reachable.
  Skips gracefully if `/health` can't be reached.
- Use read-only scenarios whenever possible — writes are non-deterministic
  (order, names, transport) and produce flake.

Bring up the server the same way E2E tests do:

```bash
# Local stdio? No — evals use HTTP streamable. Either:
#   a) npm run test:e2e:deploy   (starts the server in the background)
#   b) npm run dev:http          (foreground)
EVAL_BACKEND=live EVAL_FILE=context-impact npm run test:eval
```

---

## Providers

### Ollama (default)

```bash
# Make sure the model supports tool calling
ollama pull qwen3:8b

EVAL_MODEL=qwen3:8b npm run test:eval
```

Honours `OLLAMA_BASE_URL` (default `http://localhost:11434`).

Tested models:

| Model          | Tool calling | Notes                                            |
| -------------- | ------------ | ------------------------------------------------ |
| `qwen3:8b`     | ✅           | Solid default. Fast.                             |
| `qwen3:14b`    | ✅           | Better routing, noticeably slower.               |
| `llama3.1:8b`  | ✅           | Weaker at disambiguating our 11 tools.           |
| `llama3.1:70b` | ✅           | Best local, but requires serious hardware.       |
| `mistral:7b`   | ⚠️           | Sometimes ignores schemas — treat as a weak baseline. |

### Anthropic

```bash
EVAL_PROVIDER=anthropic \
  EVAL_MODEL=claude-sonnet-4-20250514 \
  ANTHROPIC_API_KEY=sk-ant-... \
  npm run test:eval
```

---

## Scoring

Per scenario:

- **Tool selection** (weight 0.6):
  - 1.0 if the first tool call matches `optimal`
  - 0.5 if it matches `acceptable`
  - 0.0 if it matches `forbidden` or none of the above
- **Parameters** (weight 0.4): fraction of `requiredArgs` / `requiredArgKeys`
  satisfied. Case-insensitive on string values to tolerate ABAP-name
  casing drift.
- **Overall**: `0.6 * tool + 0.4 * params`.
- **Passed**: `overall ≥ EVAL_PASS_THRESHOLD` (default 0.5).

Aggregate results (per model/backend/run) go to
`test-results/evals/<timestamp>-<provider>-<model>-<backend>.json`.

---

## Adding a scenario

1. **Pick the right file** in `scenarios/`. If the feature is new (e.g. a new
   tool or a new action enum), add a new file and register it in
   `scenarios/index.ts`.
2. **Give it a stable id** — globally unique, kebab-case, feature-prefixed
   (`cds-impact-*`, `rap-lifecycle-*`). The id appears in results JSON and in
   `EVAL_SCENARIO` — never rename.
3. **Write the prompt the way a user would phrase it.** Don't hint at the
   tool name. For real-world coverage, lift prompts from actual transcripts
   (PR reviews, Cursor logs, Copilot Studio traces).
4. **Declare expectations:**
   - `optimal` — the one or two "best" first tool calls.
   - `acceptable` — reasonable alternatives (scores 0.5).
   - `forbidden` — tools that must NOT be called. This is how you lock in
     anti-patterns (e.g. SAPQuery against DDDDLSRC for CDS impact questions).
5. **Tag it.** Stable feature tags (`feat-33`, `cds-impact`, `rap`,
   `discoverability`, `anti-pattern`) make `EVAL_TAG` useful.
6. **Mock responses.** Keep them short but shaped like the real tool output —
   if you lie about the shape, the LLM will over-fit to fake data.

Template:

```ts
import type { EvalScenario } from '../types.js';

export const SCENARIOS: EvalScenario[] = [
  {
    id: 'my-feature-happy-path',
    description: 'One-line summary',
    prompt: 'Natural-language user prompt',
    category: 'read', // coarse bucket for legacy EVAL_CATEGORY
    tags: ['feat-XX', 'my-feature', 'single-step'],
    optimal: [{ tool: 'SAPRead', requiredArgs: { type: 'PROG', name: 'Z_EXAMPLE' } }],
    acceptable: [{ tool: 'SAPSearch', requiredArgKeys: ['query'] }],
    forbidden: ['SAPQuery'],
    mockResponses: {
      SAPRead: 'REPORT z_example.',
      SAPSearch: JSON.stringify([{ objectName: 'Z_EXAMPLE', objectType: 'PROG/P' }]),
    },
  },
];
```

---

## Output

Console (abridged):

```
  ✅ [context-impact] cds-impact-blast-radius-natural — tool:100% params:100% calls:1 2100ms
  ❌ [context-impact] cds-impact-who-consumes — tool:0% params:0% calls:1 1890ms
     Wrong tool: SAPQuery({"sql":"SELECT..."}). Expected: SAPContext
  ...
  Summary: 5/7 passed | Tool Selection: 71% | Params: 85% | Overall: 76%
```

Persisted JSON (`test-results/evals/…`):

```jsonc
{
  "model": "qwen3:8b",
  "toolMode": "standard",
  "timestamp": "2026-04-17T12:34:56.789Z",
  "scores": [{ "scenarioId": "...", "trace": [...], "explanation": "..." }],
  "summary": { "totalScenarios": 7, "passed": 5, "avgOverallScore": 0.76 }
}
```

Commit these files (or not) per your regression-tracking policy — they are
under `test-results/` which is gitignored alongside other test artefacts.

/**
 * LLM Eval Test Suite
 *
 * Tests whether LLMs correctly select and parameterize ARC-1 MCP tools.
 * Scenarios live under `tests/evals/scenarios/<feature>.ts` and are
 * aggregated by `scenarios/index.ts`. See `tests/evals/README.md` for the
 * full filter matrix and the rules for adding a new scenario.
 *
 * All configuration is read from environment (loaded from `.env` on startup).
 *
 * Filtering (precedence: high → low):
 *   EVAL_SCENARIO=<id>        — single scenario by id (most specific)
 *   EVAL_FILE=<name>[,<name>] — feature bucket(s); name matches key in SCENARIO_FILES
 *   EVAL_TAG=<tag>[,<tag>]    — scenarios with ANY of the listed tags
 *   EVAL_CATEGORY=<category>  — legacy category filter
 *
 * Backend:
 *   EVAL_BACKEND=mock (default) — scenario.mockResponses feed the LLM
 *   EVAL_BACKEND=live           — real MCP server at EVAL_MCP_URL (default
 *                                 http://localhost:3000/mcp). Fails hard if
 *                                 the server is unreachable.
 *
 * Provider:
 *   EVAL_PROVIDER=ollama (default) | anthropic
 *   EVAL_MODEL=<model-id>        (default: qwen3.5:9b for ollama,
 *                                 claude-haiku-4-5-20251001 for anthropic)
 *   OLLAMA_BASE_URL=<url>        (default: http://localhost:11434)
 *   ANTHROPIC_API_KEY=<key>      (required for anthropic provider)
 *
 * Scoring:
 *   EVAL_PASS_THRESHOLD=0.5 (default)
 *
 * Results are printed to the console and persisted under
 *   test-results/evals/<ISO-timestamp>-<provider>-<model>-<backend>.json
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { config as loadDotenv } from 'dotenv';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// Load .env before reading any provider / model / URL config. Matches the
// convention used by tests/integration/helpers.ts and src/cli.ts so users only
// configure Ollama / Anthropic once and `npm run test:eval` picks it up.
loadDotenv();

import { getToolDefinitions } from '../../src/handlers/tools.js';
import { DEFAULT_CONFIG } from '../../src/server/types.js';
import { formatResults, runScenario, toOpenAITools } from './harness.js';
import { checkLiveBackendAvailable, connectLiveBackend, type LiveBackend } from './live-backend.js';
import { checkAnthropicAvailable, createAnthropicProvider, DEFAULT_ANTHROPIC_MODEL } from './providers/anthropic.js';
import { checkOllamaAvailable, createOllamaProvider, DEFAULT_OLLAMA_MODEL } from './providers/ollama.js';
import { ALL_SCENARIOS, FILE_OF_SCENARIO, SCENARIO_FILES } from './scenarios/index.js';
import type { EvalRunResult, EvalScenario, LLMProvider, ScenarioScore, ToolDefinitionForLLM } from './types.js';

// ─── Configuration ──────────────────────────────────────────────────

const PROVIDER_NAME = (process.env.EVAL_PROVIDER ?? 'ollama').toLowerCase();
if (PROVIDER_NAME !== 'ollama' && PROVIDER_NAME !== 'anthropic') {
  throw new Error(`Unknown EVAL_PROVIDER: "${PROVIDER_NAME}". Only "ollama" and "anthropic" are supported.`);
}
const MODEL = process.env.EVAL_MODEL ?? (PROVIDER_NAME === 'ollama' ? DEFAULT_OLLAMA_MODEL : DEFAULT_ANTHROPIC_MODEL);

const BACKEND = (process.env.EVAL_BACKEND ?? 'mock').toLowerCase();
const SCENARIO_FILTER = process.env.EVAL_SCENARIO;
const FILE_FILTER = parseList(process.env.EVAL_FILE);
const TAG_FILTER = parseList(process.env.EVAL_TAG ?? process.env.EVAL_TAGS);
const CATEGORY_FILTER = process.env.EVAL_CATEGORY;
const PASS_THRESHOLD = Number(process.env.EVAL_PASS_THRESHOLD ?? '0.5');

function parseList(value: string | undefined): string[] | undefined {
  if (!value) return undefined;
  const items = value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return items.length > 0 ? items : undefined;
}

function matchesFilters(scenario: EvalScenario): boolean {
  if (SCENARIO_FILTER && scenario.id !== SCENARIO_FILTER) return false;
  if (FILE_FILTER) {
    const file = FILE_OF_SCENARIO[scenario.id];
    if (!file || !FILE_FILTER.includes(file)) return false;
  }
  if (TAG_FILTER) {
    const tags = scenario.tags ?? [];
    if (!tags.some((tag) => TAG_FILTER.includes(tag))) return false;
  }
  if (CATEGORY_FILTER && scenario.category !== CATEGORY_FILTER) return false;
  return true;
}

// ─── Results Persistence ────────────────────────────────────────────

function persistResults(result: EvalRunResult): string | null {
  try {
    const timestamp = result.timestamp.replace(/[:.]/g, '-');
    const safeModel = MODEL.replace(/[^a-zA-Z0-9.-]/g, '_');
    const outPath = resolve(
      process.cwd(),
      `test-results/evals/${timestamp}-${PROVIDER_NAME}-${safeModel}-${BACKEND}.json`,
    );
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, JSON.stringify(result, null, 2));
    return outPath;
  } catch (err) {
    console.warn(`    [eval] Failed to persist results: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

// ─── Test Setup ─────────────────────────────────────────────────────

let provider: LLMProvider | undefined;
let tools: ToolDefinitionForLLM[];
let live: LiveBackend | undefined;
const allScores: ScenarioScore[] = [];

describe(`LLM Eval — ${PROVIDER_NAME}/${MODEL} [${BACKEND}]`, () => {
  beforeAll(async () => {
    // Provider setup — we intentionally throw (not skip) when the configured
    // provider is unavailable. A silent skip would hide a real misconfiguration
    // and turn the whole suite into a green pass-through.
    if (PROVIDER_NAME === 'ollama') {
      const check = await checkOllamaAvailable(MODEL);
      if (!check.available) {
        throw new Error(
          `Ollama is not reachable or model not installed: ${check.reason}\n` +
            '  Check OLLAMA_BASE_URL and EVAL_MODEL in .env, or start Ollama: `ollama serve`.',
        );
      }
      provider = createOllamaProvider(MODEL);
    } else {
      const check = checkAnthropicAvailable();
      if (!check.available) {
        throw new Error(
          `Anthropic provider unavailable: ${check.reason}\n` + '  Add ANTHROPIC_API_KEY=sk-ant-... to .env.',
        );
      }
      provider = createAnthropicProvider(MODEL);
    }

    // Live backend (optional) — also fail hard if the server is unreachable
    // while EVAL_BACKEND=live is set, otherwise we'd silently fall back to
    // mock-like noop and miss the schema/handler drift we're trying to catch.
    if (BACKEND === 'live') {
      const check = await checkLiveBackendAvailable();
      if (!check.available) {
        throw new Error(
          `EVAL_BACKEND=live but MCP server unavailable: ${check.reason}\n` +
            '  Start the server with `npm run test:e2e:deploy` (background)\n' +
            '  or `npm run dev:http` (foreground), then re-run.',
        );
      }
      live = await connectLiveBackend();
      console.log(`  Live backend: ${live.url}`);
    }

    // Tool definitions (same as production MCP server surface)
    const arcTools = getToolDefinitions({ ...DEFAULT_CONFIG, readOnly: false, blockFreeSQL: false });
    tools = toOpenAITools(arcTools);

    console.log(`\n  Provider: ${PROVIDER_NAME}/${MODEL}`);
    console.log(`  Backend:  ${BACKEND}`);
    console.log(`  Tools:    ${arcTools.map((t) => t.name).join(', ')}`);
    console.log(`  Files available: ${Object.keys(SCENARIO_FILES).join(', ')}`);
    console.log(`  Threshold: ${PASS_THRESHOLD}`);

    // Filter summary
    const filteredCount = ALL_SCENARIOS.filter(matchesFilters).length;
    const activeFilters: string[] = [];
    if (SCENARIO_FILTER) activeFilters.push(`scenario=${SCENARIO_FILTER}`);
    if (FILE_FILTER) activeFilters.push(`file=${FILE_FILTER.join(',')}`);
    if (TAG_FILTER) activeFilters.push(`tag=${TAG_FILTER.join(',')}`);
    if (CATEGORY_FILTER) activeFilters.push(`category=${CATEGORY_FILTER}`);
    console.log(
      `  Scenarios: ${filteredCount}/${ALL_SCENARIOS.length}` +
        (activeFilters.length ? ` (filters: ${activeFilters.join(', ')})` : '') +
        '\n',
    );
  });

  afterAll(async () => {
    if (live) {
      await live.close().catch(() => undefined);
    }
    if (allScores.length === 0) return;

    const total = allScores.length;
    const passed = allScores.filter((s) => s.passed).length;
    const avgToolSelection = allScores.reduce((sum, s) => sum + s.toolSelectionScore, 0) / total;
    const avgParameter = allScores.reduce((sum, s) => sum + s.parameterScore, 0) / total;
    const avgOverall = allScores.reduce((sum, s) => sum + s.overallScore, 0) / total;
    const avgCalls = allScores.reduce((sum, s) => sum + s.toolCallCount, 0) / total;
    const avgDuration = allScores.reduce((sum, s) => sum + s.durationMs, 0) / total;
    const totalTokens = allScores.reduce((sum, s) => sum + (s.totalTokens ?? 0), 0);

    const result: EvalRunResult = {
      model: MODEL,
      toolMode: 'standard',
      timestamp: new Date().toISOString(),
      scores: allScores,
      summary: {
        totalScenarios: total,
        passed,
        failed: total - passed,
        avgToolSelectionScore: Math.round(avgToolSelection * 100) / 100,
        avgParameterScore: Math.round(avgParameter * 100) / 100,
        avgOverallScore: Math.round(avgOverall * 100) / 100,
        avgToolCalls: Math.round(avgCalls * 100) / 100,
        avgDurationMs: Math.round(avgDuration),
        totalTokens,
      },
    };

    console.log(formatResults(result));

    const path = persistResults(result);
    if (path) console.log(`  Results written to: ${path}\n`);
  });

  // Generate a test case for each scenario.
  // We iterate ALL_SCENARIOS (not the pre-filtered list) so vitest shows the
  // full matrix in its reporter with non-matching scenarios visibly skipped.
  for (const scenario of ALL_SCENARIOS) {
    const shouldSkip = !matchesFilters(scenario);
    const testFn = shouldSkip ? it.skip : it;
    const fileTag = FILE_OF_SCENARIO[scenario.id] ?? '?';

    testFn(
      `[${fileTag}] ${scenario.id}: ${scenario.description}`,
      async () => {
        if (!provider) return;

        const score = await runScenario(provider, scenario, tools, {
          passThreshold: PASS_THRESHOLD,
          liveExecutor: live?.execute,
        });
        allScores.push(score);

        const status = score.passed ? '✅' : '❌';
        console.log(
          `    ${status} ${scenario.id} — tool:${(score.toolSelectionScore * 100).toFixed(0)}% ` +
            `params:${(score.parameterScore * 100).toFixed(0)}% calls:${score.toolCallCount} ${score.durationMs}ms`,
        );
        if (!score.passed) {
          console.log(`       ${score.explanation}`);
          if (score.trace.length > 0) {
            console.log(
              `       Trace: ${score.trace.map((t) => `${t.name}(${JSON.stringify(t.arguments)})`).join(' → ')}`,
            );
          }
        }

        expect(score.overallScore, score.explanation).toBeGreaterThanOrEqual(PASS_THRESHOLD);
      },
      // 180s per scenario — LLM + (optional) real SAP latency.
      180_000,
    );
  }
});

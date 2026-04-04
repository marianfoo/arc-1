/**
 * LLM Eval Test Suite
 *
 * Tests whether LLMs correctly select and parameterize ARC-1 MCP tools.
 * Runs against Ollama (local) or Anthropic (API) providers.
 *
 * Usage:
 *   # Run with Ollama (default: qwen3:8b)
 *   EVAL_MODEL=qwen3:8b npm run test:eval
 *
 *   # Run with a specific Ollama model
 *   EVAL_MODEL=llama3.1:70b npm run test:eval
 *
 *   # Run with Anthropic Claude
 *   EVAL_PROVIDER=anthropic EVAL_MODEL=claude-sonnet-4-20250514 ANTHROPIC_API_KEY=sk-... npm run test:eval
 *
 *   # Filter by category
 *   EVAL_CATEGORY=read npm run test:eval
 *
 *   # Filter by specific scenario
 *   EVAL_SCENARIO=read-program npm run test:eval
 *
 * Environment variables:
 *   EVAL_PROVIDER    - "ollama" (default) or "anthropic"
 *   EVAL_MODEL       - Model name (default: "qwen3:8b" for ollama)
 *   EVAL_CATEGORY    - Filter scenarios by category
 *   EVAL_SCENARIO    - Run a single scenario by ID
 *   EVAL_PASS_THRESHOLD - Score threshold for pass (default: 0.5)
 *   OLLAMA_BASE_URL  - Ollama API URL (default: http://localhost:11434)
 *   ANTHROPIC_API_KEY - Required for anthropic provider
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getToolDefinitions } from '../../src/handlers/tools.js';
import { DEFAULT_CONFIG } from '../../src/server/types.js';
import { formatResults, runScenario, toOpenAITools } from './harness.js';
import { checkAnthropicAvailable, createAnthropicProvider } from './providers/anthropic.js';
import { checkOllamaAvailable, createOllamaProvider } from './providers/ollama.js';
import { TOOL_SELECTION_SCENARIOS } from './scenarios/tool-selection.js';
import type { EvalRunResult, LLMProvider, ScenarioScore, ToolDefinitionForLLM } from './types.js';

// ─── Configuration ──────────────────────────────────────────────────

const PROVIDER_NAME = process.env.EVAL_PROVIDER ?? 'ollama';
const DEFAULT_OLLAMA_MODEL = 'qwen3:8b';
const MODEL =
  process.env.EVAL_MODEL ?? (PROVIDER_NAME === 'ollama' ? DEFAULT_OLLAMA_MODEL : 'claude-sonnet-4-20250514');
const CATEGORY_FILTER = process.env.EVAL_CATEGORY;
const SCENARIO_FILTER = process.env.EVAL_SCENARIO;
const PASS_THRESHOLD = Number(process.env.EVAL_PASS_THRESHOLD ?? '0.5');

// ─── Test Setup ─────────────────────────────────────────────────────

let provider: LLMProvider;
let tools: ToolDefinitionForLLM[];
let scenarios: typeof TOOL_SELECTION_SCENARIOS;
const allScores: ScenarioScore[] = [];

describe(`LLM Eval — ${PROVIDER_NAME}/${MODEL}`, () => {
  beforeAll(async () => {
    // Check provider availability
    if (PROVIDER_NAME === 'ollama') {
      const check = await checkOllamaAvailable(MODEL);
      if (!check.available) {
        console.log(`\n  ⚠️  Skipping eval: ${check.reason}\n`);
        return;
      }
      provider = createOllamaProvider(MODEL);
    } else if (PROVIDER_NAME === 'anthropic') {
      const check = checkAnthropicAvailable();
      if (!check.available) {
        console.log(`\n  ⚠️  Skipping eval: ${check.reason}\n`);
        return;
      }
      provider = createAnthropicProvider(MODEL);
    } else {
      throw new Error(`Unknown provider: ${PROVIDER_NAME}. Use "ollama" or "anthropic".`);
    }

    // Get tool definitions from ARC-1 (reusing production code!)
    const arcTools = getToolDefinitions({ ...DEFAULT_CONFIG, readOnly: false });
    tools = toOpenAITools(arcTools);

    console.log(`\n  Provider: ${PROVIDER_NAME}/${MODEL}`);
    console.log(`  Tools: ${arcTools.map((t) => t.name).join(', ')}`);
    console.log(`  Pass threshold: ${PASS_THRESHOLD}`);

    // Filter scenarios
    scenarios = TOOL_SELECTION_SCENARIOS;
    if (SCENARIO_FILTER) {
      scenarios = scenarios.filter((s) => s.id === SCENARIO_FILTER);
    } else if (CATEGORY_FILTER) {
      scenarios = scenarios.filter((s) => s.category === CATEGORY_FILTER);
    }

    console.log(`  Scenarios: ${scenarios.length} (of ${TOOL_SELECTION_SCENARIOS.length} total)\n`);
  });

  afterAll(() => {
    if (allScores.length === 0) return;

    // Build and print summary
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
  });

  // Generate a test case for each scenario
  // This runs sequentially to avoid overwhelming Ollama
  for (const scenario of TOOL_SELECTION_SCENARIOS) {
    // Apply filters at the test level too (for vitest filtering)
    const shouldSkip =
      (SCENARIO_FILTER && scenario.id !== SCENARIO_FILTER) ||
      (CATEGORY_FILTER && scenario.category !== CATEGORY_FILTER);

    const testFn = shouldSkip ? it.skip : it;

    testFn(
      `[${scenario.category}] ${scenario.id}: ${scenario.description}`,
      async () => {
        // Skip if provider not available (checked in beforeAll)
        if (!provider) return;

        const score = await runScenario(provider, scenario, tools, { passThreshold: PASS_THRESHOLD });
        allScores.push(score);

        // Log individual result
        const status = score.passed ? '✅' : '❌';
        console.log(
          `    ${status} ${scenario.id} — tool:${(score.toolSelectionScore * 100).toFixed(0)}% params:${(score.parameterScore * 100).toFixed(0)}% calls:${score.toolCallCount} ${score.durationMs}ms`,
        );
        if (!score.passed) {
          console.log(`       ${score.explanation}`);
          if (score.trace.length > 0) {
            console.log(
              `       Trace: ${score.trace.map((t) => `${t.name}(${JSON.stringify(t.arguments)})`).join(' → ')}`,
            );
          }
        }

        // The test "passes" in vitest if the LLM scored above threshold
        // We don't fail the CI build on LLM eval — it's informational
        // But we do assert so the test shows red/green in the output
        expect(score.overallScore, score.explanation).toBeGreaterThanOrEqual(PASS_THRESHOLD);
      },
      // Long timeout for LLM calls (120s per scenario)
      120_000,
    );
  }
});

/**
 * Ollama LLM provider — uses Ollama's OpenAI-compatible API.
 *
 * Requires a running Ollama instance at OLLAMA_BASE_URL (default: http://localhost:11434).
 * Supports any Ollama model with tool calling: llama3.1, qwen3, mistral, etc.
 *
 * Usage:
 *   const provider = createOllamaProvider('llama3.1:8b');
 *   const response = await provider.chat(messages, tools);
 */

import type { LLMProvider, LLMResponse, LLMToolCall, Message, ToolDefinitionForLLM } from '../types.js';

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434';

/** Convert our Message format to OpenAI chat format */
function toOpenAIMessages(messages: Message[]): Array<Record<string, unknown>> {
  return messages.map((msg) => {
    if (msg.role === 'tool') {
      return {
        role: 'tool',
        content: msg.content ?? '',
        tool_call_id: msg.toolCallId ?? 'call_0',
      };
    }

    if (msg.role === 'assistant' && msg.toolCalls?.length) {
      return {
        role: 'assistant',
        content: msg.content ?? null,
        tool_calls: msg.toolCalls.map((tc, i) => ({
          id: `call_${i}`,
          type: 'function',
          function: {
            name: tc.name,
            arguments: JSON.stringify(tc.arguments),
          },
        })),
      };
    }

    return {
      role: msg.role,
      content: msg.content ?? '',
    };
  });
}

/** Parse OpenAI-format tool calls from response */
function parseToolCalls(
  choices: Array<{ message?: { tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }> } }>,
): LLMToolCall[] | undefined {
  const toolCalls = choices?.[0]?.message?.tool_calls;
  if (!toolCalls?.length) return undefined;

  return toolCalls.map((tc) => ({
    name: tc.function.name,
    arguments: JSON.parse(tc.function.arguments),
  }));
}

export function createOllamaProvider(model: string): LLMProvider {
  return {
    name: 'ollama',
    model,

    async chat(messages: Message[], tools: ToolDefinitionForLLM[]): Promise<LLMResponse> {
      const body = {
        model,
        messages: toOpenAIMessages(messages),
        tools: tools.length > 0 ? tools : undefined,
        stream: false,
      };

      const resp = await fetch(`${OLLAMA_BASE_URL}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!resp.ok) {
        const text = await resp.text();
        throw new Error(`Ollama API error ${resp.status}: ${text}`);
      }

      const data = (await resp.json()) as {
        choices: Array<{
          message: {
            content?: string;
            tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }>;
          };
          finish_reason: string;
        }>;
        usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
      };

      const choice = data.choices?.[0];
      const toolCalls = parseToolCalls(data.choices);
      const content = choice?.message?.content ?? undefined;

      return {
        content: content || undefined,
        toolCalls,
        usage: data.usage
          ? {
              promptTokens: data.usage.prompt_tokens,
              completionTokens: data.usage.completion_tokens,
              totalTokens: data.usage.total_tokens,
            }
          : undefined,
        done: !toolCalls?.length,
      };
    },
  };
}

/** Check if Ollama is reachable and model is available */
export async function checkOllamaAvailable(model: string): Promise<{ available: boolean; reason?: string }> {
  try {
    const resp = await fetch(`${OLLAMA_BASE_URL}/api/tags`, { signal: AbortSignal.timeout(5000) });
    if (!resp.ok) {
      return { available: false, reason: `Ollama API returned ${resp.status}` };
    }
    const data = (await resp.json()) as { models?: Array<{ name: string }> };
    const models = data.models?.map((m) => m.name) ?? [];

    // Check if exact model or base name matches
    const found = models.some((m) => m === model || m.startsWith(`${model.split(':')[0]}:`));
    if (!found) {
      return {
        available: false,
        reason: `Model "${model}" not found. Available: ${models.join(', ')}. Run: ollama pull ${model}`,
      };
    }
    return { available: true };
  } catch (err) {
    return {
      available: false,
      reason: `Cannot reach Ollama at ${OLLAMA_BASE_URL}: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

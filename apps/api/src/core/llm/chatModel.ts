import { Ollama } from 'ollama';

// The one thing the service asks of a language model: chat messages in, JSON text out (shaped by a JSON Schema).
// Production uses Ollama on the host; tests use a scripted fake. Every reply is still parsed with Zod by the caller.
export type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };

export type ChatModel = {
  name: string;
  digest: string | null;
  chatJson(messages: ChatMessage[], jsonSchema: Record<string, unknown>): Promise<{ content: string; ms: number }>;
};

// Deterministic decoding: temperature 0 and a fixed seed, so the same evidence gives the same reply.
// Any constant seed works; it is fixed so reruns and the eval are reproducible.
const TEMPERATURE = 0;
const FIXED_SEED = 42;

export function createOllamaChatModel(options: {
  baseUrl: string;
  model: string;
  digest: string | null;
  timeoutMs: number;
}): ChatModel {
  // Every request gets a deadline; a slow or stuck model makes the summary fall back to the template.
  const client = new Ollama({
    host: options.baseUrl,
    fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(options.timeoutMs) }),
  });

  return {
    name: options.model,
    digest: options.digest,
    async chatJson(messages, jsonSchema) {
      const started = performance.now();
      const response = await client.chat({
        model: options.model,
        messages,
        format: jsonSchema,
        stream: false,
        think: false,
        options: { temperature: TEMPERATURE, seed: FIXED_SEED },
      });
      return { content: response.message.content, ms: Math.round(performance.now() - started) };
    },
  };
}

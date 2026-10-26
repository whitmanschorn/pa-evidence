import { describe, expect, it } from 'vitest';
import { findForbiddenTerms } from '@pa/shared';
import { createOllamaChatModel } from '../../src/core/llm/chatModel.js';
import { assemblePacket } from '../../src/core/packet/assemblePacket.js';
import { suppliedDeps } from '../support/suppliedWorld.js';

// Runs against the real local model when Ollama is up and the model is pulled; skipped otherwise, so `pnpm test`
// never needs a model. OLLAMA_TEST_MODEL picks another model (the eval compares several).
const BASE_URL = process.env.OLLAMA_BASE_URL_FOR_TESTS ?? 'http://127.0.0.1:11434';
const MODEL = process.env.OLLAMA_TEST_MODEL ?? 'qwen3:4b-instruct-2507-q4_K_M';

async function modelAvailable(): Promise<boolean> {
  try {
    const tags = (await (await fetch(`${BASE_URL}/api/tags`)).json()) as { models: { name: string }[] };
    return tags.models.some((model) => model.name === MODEL);
  } catch {
    return false;
  }
}

describe.skipIf(!(await modelAvailable()))(`summaries from the local model (${MODEL})`, () => {
  const summaryModel = createOllamaChatModel({ baseUrl: BASE_URL, model: MODEL, digest: null, timeoutMs: 60_000 });

  it.each(['PA-001', 'PA-002', 'PA-003', 'PA-004', 'PA-005', 'PA-006', 'PA-007'])(
    '%s: a faithful model summary, or the template with summary_fallback',
    async (requestId) => {
      const { packet, metrics } = await assemblePacket({ ...suppliedDeps(), summaryModel }, requestId);

      // A model summary only gets into the packet after passing checkSummary; anything else is the template.
      if (packet.summary_source === 'template') {
        expect(packet.warnings).toContain('summary_fallback');
      }
      expect(findForbiddenTerms(packet.summary)).toEqual([]);
      console.log(`${requestId} ${packet.summary_source} attempts=${metrics.summary.attempts} ${metrics.summary.llmMs}ms: ${packet.summary}`);
    },
    120_000,
  );
});

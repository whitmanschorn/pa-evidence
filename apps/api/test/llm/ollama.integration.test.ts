import { describe, expect, it } from 'vitest';
import { findForbiddenTerms } from '@pa/shared';
import { connectLocalModel } from '../../src/core/llm/localModel.js';
import { assemblePacket } from '../../src/core/packet/assemblePacket.js';
import { OLLAMA_URL_FOR_TESTS, modelVersionInEffect, ollamaHasModel } from '../support/modelVersion.js';
import { suppliedDeps } from '../support/suppliedWorld.js';

// Runs against the real local model when Ollama is up and the model is pulled; skipped otherwise, so `pnpm test`
// never needs a model. Uses the model version in effect (data/models); OLLAMA_TEST_MODEL tries another model with
// that version's prompts and settings.
const VERSION = modelVersionInEffect();
const MODEL = process.env.OLLAMA_TEST_MODEL ?? VERSION.name;

describe.skipIf(!(await ollamaHasModel(MODEL)))(`summaries from the local model (${MODEL})`, () => {
  const summaryModel = connectLocalModel(OLLAMA_URL_FOR_TESTS, { ...VERSION, name: MODEL });

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

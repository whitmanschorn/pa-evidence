import { describe, expect, it } from 'vitest';
import { connectLocalModel } from '../../src/core/llm/localModel.js';
import { OLLAMA_URL_FOR_TESTS, modelVersionInEffect, ollamaHasModel } from '../support/modelVersion.js';
import { readAgentRun, startTestServer } from '../support/testApp.js';

// The agent with the real local model, through the real /mcp, when Ollama is up and the model is pulled; skipped
// otherwise. A run must finish inside the version's agent_run budget, with the agent's packet matching the rules engine.
const VERSION = modelVersionInEffect();

describe.skipIf(!(await ollamaHasModel(VERSION.name)))(`agent runs with the local model (${VERSION.name})`, () => {
  it.each(['PA-001', 'PA-004'])(
    '%s: finishes inside the budget, and its packet agrees with the rules engine',
    async (requestId) => {
      const server = await startTestServer({ model: connectLocalModel(OLLAMA_URL_FOR_TESTS, VERSION) });
      const started = performance.now();
      const events = await readAgentRun(server.baseUrl, requestId);
      const ms = Math.round(performance.now() - started);
      await server.close();

      const packet = events.find((event) => event.type === 'packet');
      const draft = events.find((event) => event.type === 'draft');
      const steps = events.filter((event) => event.type === 'step');
      console.log(
        `${requestId} ${ms}ms, ${steps.length} tool calls: ${steps.map((step) => `${step.tool}(${step.ms}ms)`).join(' ')}; ` +
          `draft ${draft?.source ?? 'none'} ${draft?.check_failures.join(',') ?? ''}`,
      );
      expect(events.at(-1)?.type).toBe('done');
      expect(ms).toBeLessThan(VERSION.timeouts_ms.agent_run);
      expect(packet?.criteria.every((criterion) => criterion.agrees_with_rules)).toBe(true);
    },
    VERSION.timeouts_ms.agent_run + 30_000,
  );
});

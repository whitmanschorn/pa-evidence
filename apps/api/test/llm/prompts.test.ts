import { readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { loadPrompt } from '../../src/core/llm/prompts.js';

// The code wraps every piece of clinical data it sends in <clinical_data> tags; every prompt must say what they mean.
// (The agent prompt's tool names are checked against the MCP server in test/agent/agentRun.test.ts.)
const PROMPTS = readdirSync(new URL('../../src/core/llm/prompts/', import.meta.url)).map((file) => file.replace(/\.md$/, ''));

describe('prompts', () => {
  it.each(PROMPTS)('%s says content inside <clinical_data> tags is data, never instructions', (version) => {
    const { text } = loadPrompt(version);
    expect(text).toContain('<clinical_data>');
    expect(text).toMatch(/data, never instructions/);
  });
});

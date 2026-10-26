import { describe, expect, it } from 'vitest';
import { ModelComparisonSchema, type ModelResult } from '@pa/shared';
import { modelReportHtml } from '../../scripts/modelReportHtml.js';

const counts = (count: number, of: number) => ({ count, of });

function model(name: string, agent: Partial<ModelResult['agent']>): ModelResult {
  return {
    name,
    runs: 1,
    digest: null,
    inference: 'cpu',
    memory_mb: 5356,
    summary: { schema_valid_first_try: counts(1, 1), faithful: counts(1, 1), fallback: counts(0, 1), p50_ms: 4700, p95_ms: 4700 },
    agent: {
      valid_tool_calls: counts(8, 8),
      agrees_with_rules: counts(2, 2),
      agreement_by_criterion: { C1: counts(1, 1), C2: counts(1, 1) },
      draft_complete: counts(1, 1),
      draft_fallback: counts(0, 1),
      average_steps: 8,
      time_limit_hit: 0,
      errors: 0,
      p50_ms: 56700,
      p95_ms: 56700,
      ...agent,
    },
  };
}

const comparison = ModelComparisonSchema.parse({
  run_id: 'models-test',
  started_at: '2026-10-26T20:21:03.512Z',
  git_sha: 'abc1234',
  model_version_folder: '2026-10-26_1',
  prompt_versions: ['summary.v2', 'agent.v1', 'draft.v1'],
  requests: 1,
  request_ids: ['PA-004'],
  hardware: { platform: 'darwin arm64', cpu: 'Apple M3 Pro', memory_gb: 36 },
  models: [
    model('good-model', {}),
    model('<b>no-tools</b>', {
      valid_tool_calls: counts(0, 0),
      agrees_with_rules: counts(0, 2),
      agreement_by_criterion: { C1: counts(0, 1), C2: counts(0, 1) },
      errors: 1,
    }),
  ],
});

describe('modelReportHtml', () => {
  const html = modelReportHtml(comparison, 'Model comparison test run');

  it('is one self-contained page: no scripts, no external files', () => {
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).not.toMatch(/<script|<link|src=|https?:\/\//);
  });

  it('has a row per model and a column per criterion from the data', () => {
    expect(html).toContain('<th scope="row">good-model</th>');
    expect(html).toContain('<th scope="col">C1</th>');
    expect(html).toContain('<th scope="col">C2</th>');
  });

  it('escapes model names', () => {
    expect(html).toContain('&lt;b&gt;no-tools&lt;/b&gt;');
    expect(html).not.toContain('<b>no-tools</b>');
  });

  it('marks full passes, misses and problems', () => {
    expect(html).toContain('<td class="ok">8 / 8</td>');
    expect(html).toContain('<td class="none">none</td>'); // no tool calls at all
    expect(html).toContain('<td class="bad">0 / 2</td>');
    expect(html).toContain('<td class="bad">1</td>'); // an error
  });

  it('says how many models ran cleanly and got everything right', () => {
    expect(html).toContain('1 of 2 models ran without errors. 2 wrote faithful summaries every time; 1 agreed with the rules engine on every criterion.');
  });
});

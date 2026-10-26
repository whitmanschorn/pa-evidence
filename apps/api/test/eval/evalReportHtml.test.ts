import { describe, expect, it } from 'vitest';
import { EvalRunSchema, findForbiddenTerms, type EvalCriterion } from '@pa/shared';
import { evalReportHtml } from '../../scripts/evalReportHtml.js';

function criterion(id: string, actual: EvalCriterion['actual_status'], expected: EvalCriterion['actual_status']): EvalCriterion {
  return {
    id,
    requirement: `${id} requirement`,
    expected_status: expected,
    actual_status: actual,
    status_matches: actual === expected,
    expected_reason: 'reason from the key',
    expected_sources: [],
    actual_sources: [],
    sources_match: true,
    unresolved_sources: [],
    considered: [],
  };
}

function request(requestId: string, group: 'supplied' | 'synthea', criteria: EvalCriterion[]) {
  return {
    request_id: requestId,
    group,
    request_date: '2026-09-01',
    policy_version: '2026.1',
    criteria,
    route_expected: 'clinician_review',
    route_actual: 'clinician_review',
    warnings_expected: [],
    warnings_actual: [],
    missing_documents_match: true,
    summary: 'Two sentences.',
    summary_source: 'model',
    summary_fallback: false,
    summary_faithful: true,
    summary_problems: [],
    banned_word_clean: true,
    latency_ms: 3455,
    model: 'qwen3:4b-instruct-2507-q4_K_M',
    model_digest: 'abc',
    prompt_version: 'summary.v2',
  };
}

const run = EvalRunSchema.parse({
  run_id: 'run-test',
  started_at: '2026-10-26T18:00:00.000Z',
  git_sha: 'abc1234',
  git_dirty: false,
  api_url: 'http://localhost:8080',
  policy_versions: ['2026.1'],
  model: { name: 'qwen3:4b-instruct-2507-q4_K_M', digest: 'abcdef1234567890', version_folder: '2026-10-26_1' },
  hardware: { platform: 'darwin arm64', cpu: 'Apple M3 Pro', memory_gb: 36, inference: 'metal' },
  criteria_ids: ['C1', 'C2'],
  requests: [
    request('PA-001', 'supplied', [criterion('C1', 'met', 'met'), criterion('C2', 'met', 'met')]),
    request('SYN-001', 'synthea', [criterion('C1', 'not_met', 'missing'), criterion('C2', 'met', 'met')]),
  ],
  totals: {
    criterion_results: 4, criterion_matches: 3, routes: 2, route_matches: 2, sources_cited: 0, sources_resolved: 0,
    summaries: 2, summaries_faithful: 2, summaries_from_model: 2, banned_word_clean: 2, latency_p50_ms: 3455, latency_p95_ms: 3455,
  },
});

const findings = [{ id: 'F-001', severity: 'high' as const, kind: 'service' as const, request_id: 'SYN-001', criterion_id: 'C1', text: '<i>escaped</i>', status: 'open' as const }];
const handAudit = [{ request_id: 'PA-001', agrees: null, note: '' }];

describe('evalReportHtml', () => {
  const html = evalReportHtml(run, null, findings, handAudit, 'Charts with resources added by hand: SYN-011.');

  it('is one self-contained page with no banned word', () => {
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).not.toMatch(/<script|<link|src=|https?:\/\//);
    expect(findForbiddenTerms(html)).toEqual([]);
  });

  it('takes its columns from the run, with each criterion requirement on hover', () => {
    expect(html).toContain('<th scope="col" title="C1 requirement">C1</th>');
    expect(html).toContain('<th scope="col" title="C2 requirement">C2</th>');
  });

  it('outlines a disagreement and shows the key under it', () => {
    expect(html).toContain('<td class="mismatch"><span class="chip not_met">');
    expect(html).toContain('<div class="key">key: <span class="chip missing">');
    expect(html).toContain("<li><strong>SYN-001 C1</strong>: service says Not met, key says Missing. Key's reason: reason from the key</li>");
  });

  it('names the charts with resources added by hand, under the Synthea grid', () => {
    expect(html).toContain('<p class="muted">Charts with resources added by hand: SYN-011.</p>');
  });

  it('escapes text from the data and says when a section has no data yet', () => {
    expect(html).toContain('&lt;i&gt;escaped&lt;/i&gt;');
    expect(html).toContain('Not run yet');
    expect(html).toContain('not yet audited');
  });
});

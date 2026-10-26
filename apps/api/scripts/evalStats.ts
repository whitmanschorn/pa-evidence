import { STATUS_LABEL, type EvalRun } from '@pa/shared';

// The nearest-rank percentile: the smallest value with at least `fraction` of the values at or below it.
export function percentile(values: number[], fraction: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(fraction * sorted.length) - 1)] ?? 0;
}

// Where the service and the answer key differ, as plain sentences. EVAL.md and EVAL.html both list these.
export type Disagreement = { where: string; what: string };

export function disagreements(run: EvalRun): Disagreement[] {
  const found: Disagreement[] = [];
  for (const request of run.requests) {
    for (const criterion of request.criteria) {
      if (criterion.status_matches && criterion.sources_match) continue;
      const keyStatus = criterion.expected_status === null ? 'nothing' : STATUS_LABEL[criterion.expected_status];
      const what = criterion.status_matches
        ? `sources differ: service cites ${criterion.actual_sources.join(', ') || 'none'}; key cites ${criterion.expected_sources.join(', ') || 'none'}`
        : `service says ${STATUS_LABEL[criterion.actual_status]}, key says ${keyStatus}`;
      found.push({ where: `${request.request_id} ${criterion.id}`, what: `${what}. Key's reason: ${criterion.expected_reason ?? 'none'}` });
    }
    if (JSON.stringify(request.warnings_actual) !== JSON.stringify(request.warnings_expected)) {
      found.push({ where: `${request.request_id} warnings`, what: `service ${JSON.stringify(request.warnings_actual)}, key ${JSON.stringify(request.warnings_expected)}` });
    }
    if (!request.missing_documents_match) found.push({ where: `${request.request_id} missing documents`, what: 'differ from the key' });
  }
  return found;
}

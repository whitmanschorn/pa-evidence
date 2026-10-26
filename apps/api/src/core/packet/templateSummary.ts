import type { CriterionResult, CriterionStatus } from '@pa/shared';

const STATUS_WORDS: Record<CriterionStatus, string> = {
  met: 'met',
  not_met: 'not met',
  missing: 'missing',
  conflicting: 'conflicting',
};

// The two-sentence summary written by code. Used until the model writes one (Phase 5), and whenever the
// model's summary fails the faithfulness check. Built only from the packet, so it cannot state anything else.
export function templateSummary(criteria: CriterionResult[], missingDocuments: string[]): string {
  const total = criteria.length;
  const metCount = criteria.filter((criterion) => criterion.status === 'met').length;
  const notMet = criteria
    .filter((criterion) => criterion.status !== 'met')
    .map((criterion) => `${criterion.id} ${STATUS_WORDS[criterion.status]}`);

  const first =
    notMet.length === 0
      ? `Evidence found for all ${total} criteria.`
      : `Evidence found for ${metCount} of ${total} criteria; ${notMet.join(', ')}.`;

  let second: string;
  if (missingDocuments.length > 0) {
    second = `Request from provider: ${missingDocuments.join('; ')}.`;
  } else if (notMet.length === 0) {
    second = 'Every criterion has cited evidence in the record.';
  } else {
    second = 'Nothing to request from the provider; the cited sources show the criteria not met.';
  }
  return `${first} ${second}`;
}

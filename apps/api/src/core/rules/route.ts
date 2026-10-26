import type { CriterionResult, Route } from '@pa/shared';

// Warnings that keep a request in clinician review even when every criterion is met.
// Codes may carry a criterion suffix ("display_match:<criterion id>"); only the part before ":" is compared.
const BLOCKING_WARNINGS = [
  'source_unverified', // a cited resource could not be found on the FHIR server
  'medication_not_in_policy_list', // the requested drug is not on covered_medications (panel default 4)
  'member_reference_mismatch', // the chart had resources for someone else
  'request_before_policy_effective', // no policy version was in effect on the request date
  'implausible_deceased_before_request', // the record says the member died before the request
];

// evidence_complete only when every criterion in the loaded policy is met and nothing blocks it.
// The list of criteria comes from the policy, so this never names or counts them.
export function decideRoute(criteria: CriterionResult[], warnings: string[]): Route {
  const allMet = criteria.every((criterion) => criterion.status === 'met');
  const blocked = warnings.some((warning) => BLOCKING_WARNINGS.includes(warning.split(':')[0] ?? warning));
  return allMet && !blocked ? 'evidence_complete' : 'clinician_review';
}

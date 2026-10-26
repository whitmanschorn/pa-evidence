import type { CriterionResult, CriterionStatus } from '@pa/shared';
import { describe, expect, it } from 'vitest';
import { policyStoreFrom } from '../../src/core/policy/policyStore.js';
import { BINDINGS } from '../../src/core/rules/bindings.js';
import { checkBindings } from '../../src/core/rules/checkBindings.js';
import { decideRoute } from '../../src/core/rules/route.js';
import { policy, terminology } from '../support/builders.js';

function criteria(...statuses: CriterionStatus[]): CriterionResult[] {
  return statuses.map((status, index) => ({
    id: `X${index}`,
    requirement: 'r',
    kind: 'k',
    status,
    sources: [],
    considered: [],
    missing_document: null,
  }));
}

describe('decideRoute', () => {
  it('is evidence_complete only when every criterion is met and nothing blocks it', () => {
    expect(decideRoute(criteria('met', 'met', 'met'), [])).toBe('evidence_complete');
    expect(decideRoute(criteria('met', 'missing'), [])).toBe('clinician_review');
    expect(decideRoute(criteria('met', 'conflicting'), [])).toBe('clinician_review');
  });

  it('works for any number of criteria, including one more than today', () => {
    expect(decideRoute(criteria('met', 'met', 'met', 'met', 'met', 'met'), [])).toBe('evidence_complete');
  });

  it('is kept in review by blocking warnings, not by informational ones', () => {
    expect(decideRoute(criteria('met'), ['display_match:X0'])).toBe('evidence_complete');
    expect(decideRoute(criteria('met'), ['source_unverified'])).toBe('clinician_review');
    expect(decideRoute(criteria('met'), ['medication_not_in_policy_list'])).toBe('clinician_review');
    expect(decideRoute(criteria('met'), ['implausible_deceased_before_request:X0'])).toBe('clinician_review');
  });
});

describe('checkBindings (startup check)', () => {
  it('passes for the supplied policy', () => {
    expect(checkBindings([policy], BINDINGS, terminology)).toEqual([]);
  });

  it('names a criterion that has no binding', () => {
    const extra = { ...policy, criteria: [...policy.criteria, { id: 'C9', requirement: 'new', fhir: {} }] };
    expect(checkBindings([extra], BINDINGS, terminology)).toEqual([
      'MP-SYN-021@2026.1 C9: no binding in core/rules/bindings.ts',
    ]);
  });

  it('names a criterion whose policy params do not fit its kind', () => {
    const broken = {
      ...policy,
      criteria: policy.criteria.map((criterion) =>
        criterion.id === 'C2' ? { ...criterion, fhir: { ...criterion.fhir, value_min: undefined } } : criterion,
      ),
    };
    const problems = checkBindings([broken], BINDINGS, terminology);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('C2 (observation_threshold)');
    expect(problems[0]).toContain('value_min');
  });
});

describe('policyStore.policyFor', () => {
  const v1 = { ...policy, version: '2026.1', effective: '2026-07-01' };
  const v2 = { ...policy, version: '2027.1', effective: '2027-01-01' };
  const store = policyStoreFrom([v2, v1]);

  it('uses the latest version in effect on the request date', () => {
    expect(store.policyFor('MP-SYN-021', '2026-10-01')?.policy.version).toBe('2026.1');
    expect(store.policyFor('MP-SYN-021', '2027-01-01')?.policy.version).toBe('2027.1');
  });

  it('falls back to the earliest version, with a blocking warning, for a request before every version', () => {
    expect(store.policyFor('MP-SYN-021', '2026-01-01')).toEqual({
      policy: v1,
      warnings: ['request_before_policy_effective'],
    });
  });

  it('returns null for an unknown policy', () => {
    expect(store.policyFor('NOPE', '2026-10-01')).toBeNull();
  });
});

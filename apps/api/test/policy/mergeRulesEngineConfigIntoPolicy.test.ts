import { describe, expect, it } from 'vitest';
import type { PolicyCriterion } from '../../src/core/policy/policySchema.js';
import {
  RulesEngineConfigSchema,
  mergeRulesEngineConfigIntoPolicy,
  type RulesEngineConfig,
} from '../../src/core/policy/mergeRulesEngineConfigIntoPolicy.js';
import { rulesFingerprint } from '../../src/core/policy/policyRegistry.js';
import { buildEvaluator } from '../../src/core/rules/buildEvaluator.js';
import { checkBindings } from '../../src/core/rules/checkBindings.js';
import { contextWith, evaluatorFor, hba1c, patient, policy, terminology } from '../support/builders.js';

// No clinical number and no criterion binding lives in code: the age limit, the conflict tolerances and how each
// criterion is evaluated come from data/policies/MP-SYN-021/<version>/rules-engine-config.json, applied when the policy loads.
const config = (criteria: RulesEngineConfig['criteria'], policyId = 'MP-SYN-021'): RulesEngineConfig => ({
  policy_id: policyId,
  note: 'test',
  criteria,
  bindings: {},
});

describe('rules engine config', () => {
  it('add the values the policy file has no field for', () => {
    const byId = Object.fromEntries(policy.criteria.map((criterion) => [criterion.id, criterion.fhir]));
    expect(byId.C2).toMatchObject({ value_min: 7.0, attested_tolerance: 0.1 });
    expect(byId.C3).toMatchObject({ path_a: { min_days_in_window: 90, attested_tolerance_months: 1 } });
    expect(byId.C5).toMatchObject({ min_years: 18 });
  });

  it('may only add: changing a value the payer\'s policy sets fails loudly', () => {
    expect(() => mergeRulesEngineConfigIntoPolicy(policy, config({ C2: { value_min: 6.5 } }))).toThrow(
      'Rules engine config would change MP-SYN-021@2026.1 C2.value_min, which the policy already sets',
    );
  });

  it('must be for the policy next to it', () => {
    expect(() => mergeRulesEngineConfigIntoPolicy(policy, config({}, 'MP-SYN-999'))).toThrow(
      'Rules engine config is for MP-SYN-999, but the policy next to it is MP-SYN-021',
    );
  });

  it('are required: without them the startup check names each missing value', () => {
    const bare = {
      ...policy,
      criteria: policy.criteria.map((criterion) => {
        const fhir = { ...criterion.fhir };
        delete fhir.attested_tolerance;
        delete fhir.min_years;
        return { ...criterion, fhir };
      }),
    };
    const problems = checkBindings([bare], terminology);
    expect(problems.join('\n')).toContain('C2 (observation_threshold): Error: observation_threshold with an attested value needs "attested_tolerance"');
    expect(problems.join('\n')).toContain('C5 (patient_age)');
    expect(problems.join('\n')).toContain('min_years');
  });

  it('change outcomes as data: a tighter tolerance turns agreement into a conflict', () => {
    const context = contextWith({ observations: [hba1c('o', 8.05, '2026-09-10')] }, { hba1c_value: 8.0, hba1c_date: '2026-09-10' });
    expect(evaluatorFor('C2').evaluate(context).status).toBe('met'); // the rules engine config says 0.1

    const strictC2 = withParam('C2', { attested_tolerance: 0.01 });
    expect(buildEvaluator(strictC2, policy.bindings.C2!, terminology).evaluate(context).status).toBe('conflicting');
  });

  it('change the age limit as data', () => {
    const context = contextWith({ patient: patient({ birthDate: '2007-01-01' }) }); // 19 on the request date
    expect(evaluatorFor('C5').evaluate(context).status).toBe('met'); // the rules engine config says 18

    const raisedC5 = withParam('C5', { min_years: 21 });
    expect(buildEvaluator(raisedC5, policy.bindings.C5!, terminology).evaluate(context).status).toBe('not_met');
  });
});

describe('rules engine config bindings', () => {
  const suppliedConfig = { policy_id: 'MP-SYN-021', note: 'test', criteria: {} };
  const parseBindings = (bindings: unknown) => RulesEngineConfigSchema.safeParse({ ...suppliedConfig, bindings });

  it('bind every criterion of the supplied policy, from its version folder', () => {
    expect(Object.keys(policy.bindings)).toEqual(policy.criteria.map((criterion) => criterion.id));
    expect(policy.bindings.C2).toMatchObject({ kind: 'observation_threshold', compare: 'gte' });
    expect(policy.bindings.C3).toMatchObject({ kind: 'any_of', primary: { kind: 'medication_duration', from: 'path_a' } });
  });

  it('are covered by the rules fingerprint: flipping a comparison changes it', () => {
    const flipped = { ...policy, bindings: { ...policy.bindings, C2: { kind: 'observation_threshold' as const, compare: 'lt' as const } } };
    expect(rulesFingerprint(flipped)).not.toBe(rulesFingerprint(policy));
  });

  it('refuse an unknown kind, an unknown comparison and a misspelt key at load', () => {
    expect(parseBindings({ C1: { kind: 'condition_maybe' } }).success).toBe(false);
    expect(parseBindings({ C2: { kind: 'observation_threshold', compare: 'gt' } }).success).toBe(false);
    expect(parseBindings({ C2: { kind: 'observation_threshold', comapre: 'gte' } }).success).toBe(false);
    expect(parseBindings({ C2: { kind: 'observation_threshold', compare: 'gte' } }).success).toBe(true);
  });

  it('refuse an any_of nested in an any_of path', () => {
    const nested = { kind: 'any_of', primary: { kind: 'any_of', primary: { kind: 'allergy_present' }, alternatives: [] }, alternatives: [] };
    expect(parseBindings({ C3: nested }).success).toBe(false);
  });
});

function withParam(criterionId: string, extra: Record<string, unknown>): PolicyCriterion {
  const criterion = policy.criteria.find((candidate) => candidate.id === criterionId)!;
  return { ...criterion, fhir: { ...criterion.fhir, ...extra } };
}

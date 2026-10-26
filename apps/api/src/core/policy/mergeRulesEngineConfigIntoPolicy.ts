import { z } from 'zod';
import type { Policy } from './policySchema.js';

// Why this file exists: some values the rules need (the age limit, the conflict tolerances) have no field in the
// payer's policy file. They live as data, in rules-engine-config.json next to the policy in its folder
// (data/policies/<policy id>/; the values are there, not here). This file checks that config's shape and merges
// its values into the policy's criteria when the policy loads.
// The config's `criteria`, keyed by criterion id, mirror the policy's own `fhir` blocks:
// { "<id>": { "min_years": 18 } } adds fhir.min_years to that criterion.
export const RulesEngineConfigSchema = z.object({
  policy_id: z.string(),
  version: z.string(),
  note: z.string(),
  criteria: z.record(z.string(), z.record(z.string(), z.unknown())),
});
export type RulesEngineConfig = z.infer<typeof RulesEngineConfigSchema>;

// Adds every matching config's values to the policy's criteria. A config may only add: if the policy already
// sets a value at the same key, this throws, so the config can never quietly change the payer's policy.
export function mergeRulesEngineConfigIntoPolicy(policy: Policy, configs: RulesEngineConfig[]): Policy {
  const matching = configs.filter((config) => config.policy_id === policy.policy_id);
  if (matching.length === 0) return policy;

  const criteria = policy.criteria.map((criterion) => {
    let fhir = criterion.fhir;
    for (const config of matching) {
      const extra = config.criteria[criterion.id];
      if (extra !== undefined) {
        fhir = addOnly(fhir, extra, `${policy.policy_id}@${policy.version} ${criterion.id}`);
      }
    }
    return { ...criterion, fhir };
  });
  return { ...policy, criteria };
}

function addOnly(target: Record<string, unknown>, extra: Record<string, unknown>, where: string): Record<string, unknown> {
  const result: Record<string, unknown> = { ...target };
  for (const [key, value] of Object.entries(extra)) {
    const existing = result[key];
    if (isPlainObject(existing) && isPlainObject(value)) {
      result[key] = addOnly(existing, value, `${where}.${key}`); // e.g. into fhir.path_a
    } else if (existing !== undefined) {
      throw new Error(`Rules engine config would change ${where}.${key}, which the policy already sets`);
    } else {
      result[key] = value;
    }
  }
  return result;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

import { z } from 'zod';
import type { Policy } from './policySchema.js';

// A policy supplement holds values the payer's policy file has no structured field for (an age limit,
// conflict tolerances), so they live in data and change without a code change.
// Its `criteria`, keyed by criterion id, mirror the policy's own `fhir` blocks: { "<id>": { "min_years": 18 } }
// adds fhir.min_years to that criterion.
export const SupplementSchema = z.object({
  policy_id: z.string(),
  version: z.string(),
  note: z.string(),
  criteria: z.record(z.string(), z.record(z.string(), z.unknown())),
});
export type Supplement = z.infer<typeof SupplementSchema>;

// Adds every matching supplement's values to the policy's criteria. A supplement may only add: if the policy
// already sets a value at the same key, this throws, so a supplement can never quietly change the payer's policy.
export function applySupplements(policy: Policy, supplements: Supplement[]): Policy {
  const matching = supplements.filter((supplement) => supplement.policy_id === policy.policy_id);
  if (matching.length === 0) return policy;

  const criteria = policy.criteria.map((criterion) => {
    let fhir = criterion.fhir;
    for (const supplement of matching) {
      const extra = supplement.criteria[criterion.id];
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
      throw new Error(`Supplement would change ${where}.${key}, which the policy already sets`);
    } else {
      result[key] = value;
    }
  }
  return result;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

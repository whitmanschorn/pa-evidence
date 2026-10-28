import { ZodError, prettifyError } from 'zod';
import type { Policy } from '../policy/policySchema.js';
import type { Terminology } from '../terminology.js';
import { buildEvaluator } from './buildEvaluator.js';

// Startup check, per policy version: every criterion must have a binding in that version's rules-engine-config.json,
// every binding must name a criterion of that version, and the policy's params must parse for the bound kind.
// Returns one line per problem; the app refuses to start unless the list is empty (and /ready names the problems).
export function checkBindings(policies: Policy[], terminology: Terminology): string[] {
  const problems: string[] = [];
  for (const policy of policies) {
    const label = `${policy.policy_id}@${policy.version}`;
    for (const criterion of policy.criteria) {
      const where = `${label} ${criterion.id}`;
      const binding = policy.bindings[criterion.id];
      if (binding === undefined) {
        problems.push(`${where}: no binding in rules-engine-config.json`);
        continue;
      }
      try {
        buildEvaluator(criterion, binding, terminology);
      } catch (error) {
        const message = error instanceof ZodError ? prettifyError(error) : String(error);
        problems.push(`${where} (${binding.kind}): ${message}`);
      }
    }
    // A binding for an id the policy does not have is almost always a typo, and would otherwise be ignored.
    const criterionIds = new Set(policy.criteria.map((criterion) => criterion.id));
    for (const id of Object.keys(policy.bindings)) {
      if (!criterionIds.has(id)) {
        problems.push(`${label} ${id}: binding in rules-engine-config.json, but the policy has no such criterion`);
      }
    }
  }
  return problems;
}

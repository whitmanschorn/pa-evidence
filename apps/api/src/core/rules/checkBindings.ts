import { ZodError, prettifyError } from 'zod';
import type { Policy } from '../policy/policySchema.js';
import type { Terminology } from '../terminology.js';
import { buildEvaluator } from './buildEvaluator.js';
import type { Binding } from './types.js';

// Startup check: every criterion in every loaded policy must have a binding, and the policy's params must
// parse for the bound kind. Returns one line per problem; the app refuses to start unless the list is empty
// (and /ready names the problems).
export function checkBindings(policies: Policy[], bindings: Record<string, Binding>, terminology: Terminology): string[] {
  const problems: string[] = [];
  for (const policy of policies) {
    for (const criterion of policy.criteria) {
      const where = `${policy.policy_id}@${policy.version} ${criterion.id}`;
      const binding = bindings[criterion.id];
      if (binding === undefined) {
        problems.push(`${where}: no binding in core/rules/bindings.ts`);
        continue;
      }
      try {
        buildEvaluator(criterion, binding, terminology);
      } catch (error) {
        const message = error instanceof ZodError ? prettifyError(error) : String(error);
        problems.push(`${where} (${binding.kind}): ${message}`);
      }
    }
  }
  return problems;
}

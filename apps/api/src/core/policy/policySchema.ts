import { IsoDateSchema } from '@pa/shared';
import { z } from 'zod';

// The shape of a policy file. Each criterion's `fhir` block is left loose here: the evaluator kind bound to
// the criterion parses the part it needs with its own schema (see core/rules/kinds/).
export const PolicyCriterionSchema = z.object({
  id: z.string(),
  requirement: z.string(),
  fhir: z.record(z.string(), z.unknown()),
});
export type PolicyCriterion = z.infer<typeof PolicyCriterionSchema>;

export const PolicySchema = z.object({
  policy_id: z.string(),
  title: z.string(),
  version: z.string(),
  effective: IsoDateSchema,
  covered_medications: z.array(z.object({ rxnorm: z.string(), display: z.string() })),
  criteria: z.array(PolicyCriterionSchema).min(1),
});
export type Policy = z.infer<typeof PolicySchema>;

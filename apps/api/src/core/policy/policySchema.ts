import { IsoDateSchema } from '@pa/shared';
import { z } from 'zod';
import type { Binding } from '../rules/types.js';

// The shape of the payer's policy file. Each criterion's `fhir` block is left loose here: the evaluator kind bound to
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
export type PolicyFile = z.infer<typeof PolicySchema>;

// A policy version as the service uses it: the payer's file with its rules engine config merged into the criteria,
// plus the config's bindings (criterion id -> how to evaluate it). Built only by the loader, never read from the
// payer's file, so a policy.json cannot bring its own bindings.
export type Policy = PolicyFile & { bindings: Record<string, Binding> };

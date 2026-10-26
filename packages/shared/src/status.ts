import { z } from 'zod';

// The four statuses come from the policy's status_semantics. Code decides them; the model never does.
export const CriterionStatusSchema = z.enum(['met', 'not_met', 'missing', 'conflicting']);
export type CriterionStatus = z.infer<typeof CriterionStatusSchema>;

// The brief allows exactly these two route values and nothing else.
export const RouteSchema = z.enum(['clinician_review', 'evidence_complete']);
export type Route = z.infer<typeof RouteSchema>;

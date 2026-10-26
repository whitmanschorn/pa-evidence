import { z } from 'zod';

// The four statuses come from the policy's status_semantics. Code decides them; the model never does.
export const CriterionStatusSchema = z.enum(['met', 'not_met', 'missing', 'conflicting']);
export type CriterionStatus = z.infer<typeof CriterionStatusSchema>;

// The brief allows exactly these two route values and nothing else.
export const RouteSchema = z.enum(['clinician_review', 'evidence_complete']);
export type Route = z.infer<typeof RouteSchema>;

// The words people read, wherever a status or route is shown (the UI, EVAL.md, EVAL.html). The policy's words, never
// "pass" or "fail"; the route reads as neutral, never as a verdict.
export const STATUS_LABEL: Record<CriterionStatus, string> = { met: 'Met', not_met: 'Not met', missing: 'Missing', conflicting: 'Conflicting' };
export const ROUTE_LABEL: Record<Route, string> = { evidence_complete: 'Evidence complete', clinician_review: 'Needs clinician review' };

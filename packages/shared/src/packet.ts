import { z } from 'zod';
import { CriterionStatusSchema, RouteSchema } from './status.js';

// Calendar dates are "YYYY-MM-DD" strings everywhere in the contract (no times, no time zones).
export const IsoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD');

// A FHIR reference, "Type/id". `sources` holds nothing else (invariant 8).
export const FhirRefSchema = z.string().regex(/^[A-Z][A-Za-z]+\/[A-Za-z0-9\-.]{1,64}$/, 'expected Type/id');

// A request-form value checked against the record. `agrees` is null when the record has nothing to compare with.
export const AttestedSchema = z.object({
  field: z.string(),
  value: z.string(),
  agrees: z.boolean().nullable(),
});
export type Attested = z.infer<typeof AttestedSchema>;

// A resource an evaluator looked at, and whether it was used. `reason` says why not (e.g. "outside_window").
// `end` is set for intervals (medication orders); `numeric` lets the UI plot values.
export const ConsideredItemSchema = z.object({
  ref: FhirRefSchema,
  date: IsoDateSchema.nullable(),
  end: IsoDateSchema.nullable().optional(),
  value: z.string().nullable(),
  numeric: z.number().nullable().optional(),
  used: z.boolean(),
  reason: z.string().nullable(),
});
export type ConsideredItem = z.infer<typeof ConsideredItemSchema>;

// The date range and the threshold an evaluator applied, so a reviewer (and the UI timeline) can check them.
export const WindowSchema = z.object({ from: IsoDateSchema, to: IsoDateSchema });
export const ThresholdSchema = z.object({
  compare: z.enum(['gte', 'lt']),
  value: z.number(),
  unit: z.string(),
});

// One alternative of an any_of criterion (for example "path_a"), shown so the nurse sees every route to the criterion.
export const PathResultSchema = z.object({
  from: z.string(),
  label: z.string(),
  kind: z.string(),
  status: CriterionStatusSchema,
  sources: z.array(FhirRefSchema),
  value: z.string().optional(),
  considered: z.array(ConsideredItemSchema),
  window: WindowSchema.optional(),
  threshold: ThresholdSchema.optional(),
});
export type PathResult = z.infer<typeof PathResultSchema>;

export const CriterionResultSchema = z.object({
  id: z.string(),
  requirement: z.string(),
  kind: z.string(),
  status: CriterionStatusSchema,
  sources: z.array(FhirRefSchema),
  value: z.string().optional(),
  observed: IsoDateSchema.optional(),
  attested: AttestedSchema.optional(),
  note: z.string().optional(),
  considered: z.array(ConsideredItemSchema),
  window: WindowSchema.optional(),
  threshold: ThresholdSchema.optional(),
  paths: z.array(PathResultSchema).optional(),
  missing_document: z.string().nullable(),
});
export type CriterionResult = z.infer<typeof CriterionResultSchema>;

export const PacketSchema = z.object({
  request_id: z.string(),
  request_date: IsoDateSchema,
  patient: FhirRefSchema,
  policy_id: z.string(),
  policy_version: z.string(),
  criteria: z.array(CriterionResultSchema),
  missing_documents: z.array(z.string()),
  summary: z.string(),
  summary_source: z.enum(['model', 'template']),
  evidence_complete: z.boolean(),
  route: RouteSchema,
  warnings: z.array(z.string()),
});
export type Packet = z.infer<typeof PacketSchema>;

// The hand-derived answer key (eval/expected/*.json). Written before the rules code; tests and the eval compare against it.
export const ExpectedPacketSchema = z.object({
  request_id: z.string(),
  request_date: IsoDateSchema,
  patient: FhirRefSchema,
  policy_id: z.string(),
  policy_version: z.string(),
  criteria: z.array(
    z.object({
      id: z.string(),
      status: CriterionStatusSchema,
      sources: z.array(FhirRefSchema),
      reason: z.string(),
    }),
  ),
  missing_documents: z.array(z.string()),
  route: RouteSchema,
  evidence_complete: z.boolean(),
  warnings: z.array(z.string()),
});
export type ExpectedPacket = z.infer<typeof ExpectedPacketSchema>;

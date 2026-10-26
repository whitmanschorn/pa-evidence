import { z } from 'zod';
import { IsoDateSchema } from './packet.js';
import { CriterionStatusSchema, RouteSchema } from './status.js';

// The eval's machine-readable output (eval/results/, eval/findings.json, eval/hand-audit.json). EVAL.md and EVAL.html are
// both generated from these in one call, so they can never disagree. Criteria come from each packet, never a fixed list.

export const EvalCriterionSchema = z.object({
  id: z.string(),
  requirement: z.string(),
  expected_status: CriterionStatusSchema.nullable(), // null when the answer key has no entry for this criterion
  actual_status: CriterionStatusSchema,
  status_matches: z.boolean(),
  expected_reason: z.string().nullable(),
  expected_sources: z.array(z.string()),
  actual_sources: z.array(z.string()),
  sources_match: z.boolean(),
  unresolved_sources: z.array(z.string()), // cited, but the source endpoint could not return them
  considered: z.array(z.string()),
});
export type EvalCriterion = z.infer<typeof EvalCriterionSchema>;

export const EvalRequestSchema = z.object({
  request_id: z.string(),
  group: z.enum(['supplied', 'synthea']),
  request_date: IsoDateSchema,
  policy_version: z.string(),
  criteria: z.array(EvalCriterionSchema),
  route_expected: RouteSchema.nullable(),
  route_actual: RouteSchema,
  warnings_expected: z.array(z.string()),
  warnings_actual: z.array(z.string()), // summary_fallback is reported separately, as summary_fallback below
  missing_documents_match: z.boolean(),
  summary: z.string(),
  summary_source: z.enum(['model', 'template']),
  summary_fallback: z.boolean(),
  summary_faithful: z.boolean(), // re-checked here with the service's own checker
  summary_problems: z.array(z.string()),
  banned_word_clean: z.boolean(),
  latency_ms: z.number(),
  model: z.string().nullable(),
  model_digest: z.string().nullable(),
  prompt_version: z.string().nullable(),
});
export type EvalRequest = z.infer<typeof EvalRequestSchema>;

export const EvalTotalsSchema = z.object({
  criterion_results: z.number().int(),
  criterion_matches: z.number().int(),
  routes: z.number().int(),
  route_matches: z.number().int(),
  sources_cited: z.number().int(),
  sources_resolved: z.number().int(),
  summaries: z.number().int(),
  summaries_faithful: z.number().int(),
  summaries_from_model: z.number().int(),
  banned_word_clean: z.number().int(),
  latency_p50_ms: z.number(),
  latency_p95_ms: z.number(),
});

export const EvalRunSchema = z.object({
  run_id: z.string(),
  started_at: z.string(),
  git_sha: z.string(),
  git_dirty: z.boolean(),
  api_url: z.string(),
  policy_versions: z.array(z.string()),
  model: z.object({ name: z.string(), digest: z.string(), version_folder: z.string() }).nullable(),
  hardware: z.object({ platform: z.string(), cpu: z.string(), memory_gb: z.number(), inference: z.enum(['metal', 'cpu', 'unknown']) }),
  criteria_ids: z.array(z.string()),
  requests: z.array(EvalRequestSchema),
  totals: EvalTotalsSchema,
});
export type EvalRun = z.infer<typeof EvalRunSchema>;

// eval/results/models-<run id>.json: each candidate model on every request, several runs each.
const CountsSchema = z.object({ count: z.number().int(), of: z.number().int() });
export const ModelResultSchema = z.object({
  name: z.string(),
  runs: z.number().int(), // runs per request (decoding is deterministic, so extra runs mostly measure timing)
  digest: z.string().nullable(),
  inference: z.enum(['metal', 'cpu']),
  memory_mb: z.number().nullable(), // from Ollama's /api/ps while loaded
  summary: z.object({
    schema_valid_first_try: CountsSchema,
    faithful: CountsSchema, // a model-written summary got through the checker (first try or retry)
    fallback: CountsSchema, // the template was used
    p50_ms: z.number(),
    p95_ms: z.number(),
  }),
  agent: z.object({
    valid_tool_calls: CountsSchema,
    agrees_with_rules: CountsSchema, // criterion results, all runs
    agreement_by_criterion: z.record(z.string(), CountsSchema),
    draft_complete: CountsSchema, // drafts from the model that passed every check
    draft_fallback: CountsSchema,
    average_steps: z.number(),
    time_limit_hit: z.number().int(),
    errors: z.number().int(),
    p50_ms: z.number(),
    p95_ms: z.number(),
  }),
});
export type ModelResult = z.infer<typeof ModelResultSchema>;

export const ModelComparisonSchema = z.object({
  run_id: z.string(),
  started_at: z.string(),
  git_sha: z.string(),
  model_version_folder: z.string(), // prompts, call settings and caps were those of this version
  prompt_versions: z.array(z.string()),
  requests: z.number().int(),
  request_ids: z.array(z.string()), // all of them, or the sample a test run used
  hardware: z.object({ platform: z.string(), cpu: z.string(), memory_gb: z.number() }),
  models: z.array(ModelResultSchema),
});
export type ModelComparison = z.infer<typeof ModelComparisonSchema>;

// eval/findings.json: what the service got wrong, and implausible data. Drafted by the eval, decided by a person.
export const FindingSchema = z.object({
  id: z.string(),
  severity: z.enum(['high', 'medium', 'low']),
  kind: z.enum(['service', 'data']),
  request_id: z.string().nullable(),
  criterion_id: z.string().nullable(),
  text: z.string(),
  status: z.enum(['open', 'fixed', 'wont_fix']),
});
export const FindingsSchema = z.array(FindingSchema);
export type Finding = z.infer<typeof FindingSchema>;

// eval/hand-audit.json: the reviewer's own note on each request. `agrees` is null until they have looked.
export const HandAuditEntrySchema = z.object({
  request_id: z.string(),
  agrees: z.boolean().nullable(),
  note: z.string(),
});
export const HandAuditSchema = z.array(HandAuditEntrySchema);
export type HandAuditEntry = z.infer<typeof HandAuditEntrySchema>;

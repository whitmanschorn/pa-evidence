import { z } from 'zod';
import { CriterionStatusSchema, RouteSchema } from './status.js';

// Events of an agent run, streamed over SSE by POST /requests/:id/agent-runs and read by the UI and the CLI.
// The trace shows tool calls and short summaries of their results: never a raw chart.

export const AgentStepEventSchema = z.object({
  type: z.literal('step'),
  step: z.number().int(),
  tool: z.string(),
  arguments: z.record(z.string(), z.unknown()),
  result: z.record(z.string(), z.unknown()),
  ms: z.number(),
});

// One criterion of the agent's packet. Its status and sources are the evaluate_criterion result the agent received
// (the model never restates them), so `check` only says whether the agent evaluated the criterion at all.
export const AgentCriterionSchema = z.object({
  id: z.string(),
  status: CriterionStatusSchema.nullable(),
  sources: z.array(z.string()),
  check: z.enum(['evaluated', 'not_evaluated']),
  rules_status: CriterionStatusSchema,
  agrees_with_rules: z.boolean(),
});
export type AgentCriterion = z.infer<typeof AgentCriterionSchema>;

export const AgentPacketEventSchema = z.object({
  type: z.literal('packet'),
  criteria: z.array(AgentCriterionSchema),
  route: RouteSchema,
  warnings: z.array(z.string()),
});

export const DraftItemSchema = z.object({ criterion_id: z.string(), ask: z.string() });
export type DraftItem = z.infer<typeof DraftItemSchema>;

// The provider request, which the nurse edits and sends. `source` says whether the agent's asks passed every check
// ("model") or were replaced by the missing_documents wording ("template").
export const DraftEventSchema = z.object({
  type: z.literal('draft'),
  source: z.enum(['model', 'template']),
  text: z.string(),
  items: z.array(DraftItemSchema),
  check_failures: z.array(z.string()),
});
export type DraftEvent = z.infer<typeof DraftEventSchema>;

export const DoneEventSchema = z.object({ type: z.literal('done'), steps: z.number().int(), ms: z.number() });
export const ErrorEventSchema = z.object({ type: z.literal('error'), error: z.string() });

export const AgentEventSchema = z.discriminatedUnion('type', [
  AgentStepEventSchema,
  AgentPacketEventSchema,
  DraftEventSchema,
  DoneEventSchema,
  ErrorEventSchema,
]);
export type AgentEvent = z.infer<typeof AgentEventSchema>;

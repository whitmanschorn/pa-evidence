import { z } from 'zod';

// One audit event per packet request, refusal, source view, agent run, audit read and policy reload.
// Never clinical values, names, birth dates or identifiers other than the member reference (invariant 10).
// Every field is always present (null when it does not apply), so the hashed JSON has a stable shape.
export const AuditActionSchema = z.enum([
  'packet.read',
  'source.read',
  'agent.run',
  'audit.read',
  'refusal',
  'policies.reload',
]);

export const AuditEventSchema = z.object({
  event_id: z.string(),
  ts: z.string(),
  actor_sub: z.string().nullable(),
  actor_role: z.string().nullable(),
  action: AuditActionSchema,
  outcome: z.enum(['success', 'refused', 'error']),
  http_status: z.number().int(),
  request_id: z.string().nullable(),
  member_ref: z.string().nullable(),
  policy_id: z.string().nullable(),
  policy_version: z.string().nullable(),
  // sha256 of the policy as the rules engine used it (policy.json with its rules engine config merged in),
  // so a packet can be traced to the exact rules even if a file was edited without a version bump.
  rules_fingerprint: z.string().nullable(),
  model: z.string().nullable(),
  model_digest: z.string().nullable(),
  prompt_version: z.string().nullable(),
  assembler: z.enum(['rules', 'agent']).nullable(),
  cited_sources: z.array(z.string()),
  route: z.string().nullable(),
  warnings: z.array(z.string()),
  // agent runs only: where the provider-request draft came from, and which checks failed (codes, never the text)
  draft_source: z.enum(['model', 'template']).nullable(),
  draft_check_failures: z.array(z.string()),
  // refusals only
  refusal_reason: z.enum(['missing_token', 'invalid_token', 'insufficient_permission']).nullable(),
  required_permission: z.string().nullable(),
  // policy reloads only: "<policy id>@<version>" of every version loaded
  loaded_versions: z.array(z.string()),
  prev_hash: z.string(),
  hash: z.string(),
});
export type AuditEvent = z.infer<typeof AuditEventSchema>;
export type AuditAction = z.infer<typeof AuditActionSchema>;

export const AuditVerifySchema = z.object({
  intact: z.boolean(),
  count: z.number().int(),
  head: z.string(),
  first_broken_event_id: z.string().nullable(),
});
export type AuditVerify = z.infer<typeof AuditVerifySchema>;

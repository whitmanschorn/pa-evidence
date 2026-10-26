import { z } from 'zod';

// One audit event per packet request, refusal, source view, agent run, audit read, and policy or model reload.
// Never clinical values, names, birth dates or identifiers other than the member reference.
// Every field is always written (null or [] when it does not apply), so the hashed JSON has a stable shape. A field
// added later reads as "does not apply" on events written before it existed (the defaults below); verify() hashes
// the stored text, so the chain is unaffected.
export const AuditActionSchema = z.enum([
  'packet.read',
  'source.read',
  'agent.run',
  'audit.read',
  'refusal',
  'policies.reload',
  'models.reload',
  'mcp.call', // one MCP tool call, by the agent or any other MCP client
]);

export const AuditEventSchema = z.object({
  event_id: z.string(),
  ts: z.string(),
  actor_sub: z.string().nullable().default(null),
  actor_role: z.string().nullable().default(null),
  action: AuditActionSchema,
  outcome: z.enum(['success', 'refused', 'error']),
  http_status: z.number().int(),
  request_id: z.string().nullable().default(null),
  member_ref: z.string().nullable().default(null),
  policy_id: z.string().nullable().default(null),
  policy_version: z.string().nullable().default(null),
  // sha256 of the policy as the rules engine used it (policy.json with its rules engine config merged in),
  // so a packet can be traced to the exact rules even if a file was edited without a version bump.
  rules_fingerprint: z.string().nullable().default(null),
  model: z.string().nullable().default(null),
  model_digest: z.string().nullable().default(null),
  prompt_version: z.string().nullable().default(null),
  assembler: z.enum(['rules', 'agent']).nullable().default(null),
  cited_sources: z.array(z.string()).default([]),
  route: z.string().nullable().default(null),
  warnings: z.array(z.string()).default([]),
  // agent runs only: where the provider-request draft came from, and which checks failed (codes, never the text)
  draft_source: z.enum(['model', 'template']).nullable().default(null),
  draft_check_failures: z.array(z.string()).default([]),
  // refusals only
  refusal_reason: z.enum(['missing_token', 'invalid_token', 'insufficient_permission']).nullable().default(null),
  required_permission: z.string().nullable().default(null),
  // reloads only: "<policy id>@<version>" of every policy version loaded, or every model version folder
  loaded_versions: z.array(z.string()).default([]),
  // MCP tool calls only: which tool
  tool_name: z.string().nullable().default(null),
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

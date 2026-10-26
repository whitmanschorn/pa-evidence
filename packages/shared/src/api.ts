import { z } from 'zod';
import { IsoDateSchema } from './packet.js';

// Response shapes of the API's smaller endpoints, shared so the UI parses exactly what the API sends.

// GET /userinfo: who the bearer token belongs to (the UI header shows it). Named after the OpenID Connect
// UserInfo endpoint, whose `sub` claim it shares, so it stays conventional when OIDC replaces the static tokens.
export const UserInfoSchema = z.object({
  sub: z.string(),
  role: z.string(),
  permissions: z.array(z.string()),
});
export type UserInfo = z.infer<typeof UserInfoSchema>;

// GET /requests: the queue.
export const RequestSummarySchema = z.object({
  request_id: z.string(),
  request_date: IsoDateSchema,
  urgency: z.string(),
  drug: z.string(),
  policy_id: z.string(),
});
export type RequestSummary = z.infer<typeof RequestSummarySchema>;

// GET /requests/:id/sources/:type/:fhirId: a cited resource, minus free text and member identifiers.
export const SourceViewSchema = z.object({
  ref: z.string(),
  resource: z.record(z.string(), z.unknown()),
  omitted: z.array(z.string()),
});
export type SourceViewResponse = z.infer<typeof SourceViewSchema>;

export const LoadedVersionSchema = z.object({
  policy_id: z.string(),
  version: z.string(),
  effective: IsoDateSchema,
  rules_fingerprint: z.string(),
});

// GET /ready. `checks` only for callers with health:detail.
export const DependencyCheckSchema = z.object({
  ok: z.boolean(),
  required: z.boolean(),
  detail: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null(), z.array(z.unknown())])),
});
export const ReadySchema = z.object({
  status: z.enum(['ready', 'not_ready']),
  checks: z.record(z.string(), DependencyCheckSchema).optional(),
});
export type Ready = z.infer<typeof ReadySchema>;

// POST /admin/policies/reload
export const ReloadResultSchema = z.object({
  ok: z.boolean(),
  problems: z.array(z.string()),
  versions: z.array(LoadedVersionSchema),
});
export type ReloadResult = z.infer<typeof ReloadResultSchema>;

// Every error body. The codes are fixed (invariant 5): nothing else, and never a free-form message.
export const ErrorBodySchema = z.object({
  error: z.enum(['unauthenticated', 'forbidden', 'not_found', 'invalid_request', 'internal_error', 'output_policy_violation']),
  required_permission: z.string().optional(),
  problems: z.array(z.string()).optional(),
});
export type ErrorBody = z.infer<typeof ErrorBodySchema>;

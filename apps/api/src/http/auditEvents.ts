import type { Response } from 'express';
import type { AuditEventInput, AuditStore } from '../core/audit/auditStore.js';
import { identityOf } from './locals.js';

// Builds an audit event for this HTTP request: the caller comes from the authenticated identity, every other
// field starts empty and the caller of this function fills in what applies.
export function auditEventFor(res: Response, fields: Partial<AuditEventInput> & Pick<AuditEventInput, 'action'>): AuditEventInput {
  const identity = identityOf(res);
  return {
    actor_sub: identity?.sub ?? null,
    actor_role: identity?.role ?? null,
    outcome: 'success',
    http_status: 200,
    request_id: null,
    member_ref: null,
    policy_id: null,
    policy_version: null,
    rules_fingerprint: null,
    model: null,
    model_digest: null,
    prompt_version: null,
    assembler: null,
    cited_sources: [],
    route: null,
    warnings: [],
    draft_source: null,
    draft_check_failures: [],
    refusal_reason: null,
    required_permission: null,
    loaded_versions: [],
    tool_name: null,
    ...fields,
  };
}

// Writes the request's audit event once the response is done, with the final status code. One event per request
// whatever happened: success, not found, an error thrown later, or a body replaced by the output guard.
// `fields` is read at that moment, so the handler can add to it as it learns more (policy version, sources).
export function auditWhenDone(
  res: Response,
  audit: AuditStore,
  fields: Partial<AuditEventInput> & Pick<AuditEventInput, 'action'>,
): void {
  res.once('close', () => {
    const status = res.statusCode;
    audit.append(auditEventFor(res, { ...fields, http_status: status, outcome: status < 400 ? 'success' : 'error' }));
  });
}

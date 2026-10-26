import type { AuditEventInput } from '../../src/core/audit/auditStore.js';

// A complete audit event input with plausible values; tests override what they care about.
export function auditInput(overrides: Partial<AuditEventInput> = {}): AuditEventInput {
  return {
    actor_sub: 'nurse-1',
    actor_role: 'nurse',
    action: 'packet.read',
    outcome: 'success',
    http_status: 200,
    request_id: 'PA-001',
    member_ref: 'Patient/p1',
    policy_id: 'MP-SYN-021',
    policy_version: '2026.1',
    rules_fingerprint: 'f'.repeat(64),
    model: null,
    model_digest: null,
    prompt_version: null,
    assembler: 'rules',
    cited_sources: ['Condition/c1'],
    route: 'evidence_complete',
    warnings: [],
    draft_source: null,
    draft_check_failures: [],
    refusal_reason: null,
    required_permission: null,
    loaded_versions: [],
    ...overrides,
  };
}

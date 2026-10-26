import { describe, expect, it } from 'vitest';
import { assemblePacket } from '../../src/core/packet/assemblePacket.js';
import { requestStoreFrom } from '../../src/core/requests/requestStore.js';
import { checkBindings } from '../../src/core/rules/checkBindings.js';
import { EXTENSION_BINDINGS, extensionDeps } from '../support/extensionWorld.js';

// A new criterion of an existing kind is a data change. This test adds C6 (BMI >= 27,
// LOINC 39156-5) through a new policy version folder, a fixture BMI result and one binding line, and nothing else.
describe('extension: a sixth criterion of an existing kind', () => {
  const deps = extensionDeps();

  it('passes the startup binding check', () => {
    expect(checkBindings(deps.policies.all(), EXTENSION_BINDINGS, deps.terminology)).toEqual([]);
  });

  it('evaluates C6 for a request dated after the new version took effect', async () => {
    const { packet } = await assemblePacket(deps, 'PA-001');
    expect(packet.policy_version).toBe('2026.9');
    expect(packet.criteria.map((criterion) => criterion.id)).toEqual(['C1', 'C2', 'C3', 'C4', 'C5', 'C6']);
    const c6 = packet.criteria.find((criterion) => criterion.id === 'C6');
    expect(c6).toMatchObject({
      kind: 'observation_threshold',
      status: 'met',
      sources: ['Observation/6c0b6e10-0000-4000-8000-00000000c6a1'],
      value: '31.2 kg/m2',
      threshold: { compare: 'gte', value: 27, unit: 'kg/m2' },
    });
    // The route and the summary loop over the policy's criteria, so six met criteria are evidence_complete.
    expect(packet.route).toBe('evidence_complete');
    expect(packet.summary).toContain('all 6 criteria');
  });

  it('keeps judging a request dated before the new version by the old one (five criteria)', async () => {
    const pa001 = deps.requests.get('PA-001')!;
    const earlier = { ...pa001, request_date: '2026-08-15' };
    const { packet } = await assemblePacket({ ...deps, requests: requestStoreFrom([earlier]) }, 'PA-001');
    expect(packet.policy_version).toBe('2026.1');
    expect(packet.criteria.map((criterion) => criterion.id)).toEqual(['C1', 'C2', 'C3', 'C4', 'C5']);
  });

  it('asks for the new document when the record has no BMI, with the kind\'s generic wording', async () => {
    const { packet } = await assemblePacket(deps, 'PA-002');
    const c6 = packet.criteria.find((criterion) => criterion.id === 'C6');
    expect(c6?.status).toBe('missing');
    expect(packet.missing_documents).toContain('Body mass index result dated 2025-10-01 to 2026-10-01');
  });
});

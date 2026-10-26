import { describe, expect, it } from 'vitest';
import { assemblePacket } from '../../src/core/packet/assemblePacket.js';
import { readExpected, suppliedDeps } from '../support/suppliedWorld.js';

// The hand-derived answer key (eval/expected/, written before this code) is the source of truth.
describe('the seven supplied requests match the answer key', () => {
  const deps = suppliedDeps();
  const expectedPackets = readExpected();

  it('covers all seven requests', () => {
    expect(expectedPackets.map((expected) => expected.request_id)).toEqual([
      'PA-001',
      'PA-002',
      'PA-003',
      'PA-004',
      'PA-005',
      'PA-006',
      'PA-007',
    ]);
  });

  it.each(expectedPackets)('$request_id', async (expected) => {
    const { packet } = await assemblePacket(deps, expected.request_id);

    expect(packet.patient).toBe(expected.patient);
    expect(packet.policy_version).toBe(expected.policy_version);
    const actualCriteria = packet.criteria.map((criterion) => ({
      id: criterion.id,
      status: criterion.status,
      sources: [...criterion.sources].sort(),
    }));
    const expectedCriteria = expected.criteria.map((criterion) => ({
      id: criterion.id,
      status: criterion.status,
      sources: [...criterion.sources].sort(),
    }));
    expect(actualCriteria).toEqual(expectedCriteria);
    expect(packet.missing_documents).toEqual(expected.missing_documents);
    expect(packet.route).toBe(expected.route);
    expect(packet.evidence_complete).toBe(expected.evidence_complete);
    expect(packet.warnings).toEqual(expected.warnings);
  });
});

describe('PA-001, checked field by field', () => {
  it('matches every field of the hand analysis', async () => {
    const { packet } = await assemblePacket(suppliedDeps(), 'PA-001');
    const byId = Object.fromEntries(packet.criteria.map((criterion) => [criterion.id, criterion]));

    expect(packet.request_date).toBe('2026-10-01');
    expect(packet.policy_id).toBe('MP-SYN-021');
    expect(byId.C2).toMatchObject({
      value: '8.1 %',
      observed: '2026-09-03',
      attested: { field: 'prescriber_attestation.hba1c_value', value: '8.1 % on 2026-09-03', agrees: true },
    });
    expect(byId.C3).toMatchObject({
      value: '365 of 365 days in window (path A)',
      attested: { field: 'prescriber_attestation.metformin_trial_months', value: '14 months', agrees: true },
    });
    expect(byId.C4).toMatchObject({
      sources: [],
      note: 'No Condition matching 75694006, 255032005, 61808009 or descendants',
    });
    expect(byId.C5).toMatchObject({ value: 'age 54' });

    // The out-of-window HbA1c is considered but not cited; the LDL and the hypertension Condition are not cited.
    const c2Considered = byId.C2?.considered.find((item) => item.ref === 'Observation/c98937ac-1692-53b6-abe4-29680f21d0b5');
    expect(c2Considered).toMatchObject({ used: false, reason: 'outside_window' });
    const allSources = packet.criteria.flatMap((criterion) => criterion.sources);
    expect(allSources).not.toContain('Observation/f7eaa7b5-88aa-511a-a369-449e9c72e7c4');
    expect(allSources).not.toContain('Condition/ced84225-97d3-5658-9679-4cd381222018');
  });

  it('carries no member name, birth date or MRN', async () => {
    const { packet } = await assemblePacket(suppliedDeps(), 'PA-001');
    const text = JSON.stringify(packet);
    expect(text).not.toContain('Marisol');
    expect(text).not.toContain('Example412');
    expect(text).not.toContain('1972-03-14');
    expect(text).not.toContain('SYN-001-1972');
  });
});

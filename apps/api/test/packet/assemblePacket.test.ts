import { describe, expect, it } from 'vitest';
import type { FhirClient } from '../../src/core/fhir/fhirClient.js';
import { NotFoundError, assemblePacket } from '../../src/core/packet/assemblePacket.js';
import { requestStoreFrom } from '../../src/core/requests/requestStore.js';
import { suppliedDeps } from '../support/suppliedWorld.js';

// Packet-level behaviour around the evaluators, using PA-001 (all met) as the base case.
describe('assemblePacket', () => {
  const deps = suppliedDeps();
  const pa001 = deps.requests.get('PA-001')!;

  it('rejects an unknown request id', async () => {
    await expect(assemblePacket(deps, 'PA-999')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('keeps a requested drug outside covered_medications in review, with a warning', async () => {
    const form = { ...pa001, requested_medication: { rxnorm: '2601723', display: 'tirzepatide' } };
    const { packet } = await assemblePacket({ ...deps, requests: requestStoreFrom([form]) }, 'PA-001');
    expect(packet.criteria.every((criterion) => criterion.status === 'met')).toBe(true);
    expect(packet.warnings).toEqual(['medication_not_in_policy_list']);
    expect(packet.route).toBe('clinician_review');
  });

  it('flags and blocks when a cited source cannot be found on the FHIR server', async () => {
    const forgetful: FhirClient = { ...deps.fhir, existing: async () => new Set() };
    const { packet } = await assemblePacket({ ...deps, fhir: forgetful }, 'PA-001');
    expect(packet.warnings).toEqual(['source_unverified']);
    expect(packet.route).toBe('clinician_review');
    expect(packet.evidence_complete).toBe(false);
  });

  it('drops chart resources that belong to someone else, and warns', async () => {
    const stranger = { resourceType: 'Condition', id: 'x', subject: { reference: 'Patient/other' } } as fhir4.Condition;
    const leaky: FhirClient = {
      ...deps.fhir,
      search: async (type, params) => [...(await deps.fhir.search(type, params)), ...(type === 'Condition' ? [stranger] : [])],
    };
    const { packet } = await assemblePacket({ ...deps, fhir: leaky }, 'PA-001');
    expect(packet.warnings).toEqual(['member_reference_mismatch']);
    expect(JSON.stringify(packet)).not.toContain('Condition/x');
  });

  it('verifies every considered reference, not only cited sources', async () => {
    const asked: string[] = [];
    const recording: FhirClient = {
      ...deps.fhir,
      existing: async (refs) => {
        asked.push(...refs);
        return deps.fhir.existing(refs);
      },
    };
    await assemblePacket({ ...deps, fhir: recording }, 'PA-001');
    expect(asked).toContain('Observation/c98937ac-1692-53b6-abe4-29680f21d0b5'); // considered, not cited
  });

  it('writes a two-sentence template summary from the packet only', async () => {
    const { packet } = await assemblePacket(deps, 'PA-002');
    expect(packet.summary_source).toBe('template');
    expect(packet.summary).toBe(
      'Evidence found for 4 of 5 criteria; C2 missing. Request from provider: HbA1c lab result dated 2026-07-03 to 2026-10-01.',
    );
  });
});

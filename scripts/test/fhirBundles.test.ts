import { describe, expect, it } from 'vitest';
import { countResponseStatuses, resourceTypesIn, rewritePostToPut } from '../fhirBundles.js';

describe('rewritePostToPut', () => {
  it('turns a Synthea POST entry into a PUT on the id from its urn:uuid', () => {
    const condition: fhir4.Condition = {
      resourceType: 'Condition',
      subject: { reference: 'urn:uuid:patient-1' },
    };
    const bundle: fhir4.Bundle = {
      resourceType: 'Bundle',
      type: 'transaction',
      entry: [{ fullUrl: 'urn:uuid:abc-123', resource: condition, request: { method: 'POST', url: 'Condition' } }],
    };

    const entry = rewritePostToPut(bundle).entry?.[0];

    expect(entry?.request).toEqual({ method: 'PUT', url: 'Condition/abc-123' });
    expect(entry?.resource?.id).toBe('abc-123');
    // References are left for the server to resolve.
    expect(entry?.resource).toMatchObject({ subject: { reference: 'urn:uuid:patient-1' } });
  });

  it('leaves PUT entries (the supplied bundles) unchanged', () => {
    const bundle: fhir4.Bundle = {
      resourceType: 'Bundle',
      type: 'transaction',
      entry: [
        {
          fullUrl: 'urn:uuid:p1',
          resource: { resourceType: 'Patient', id: 'p1' },
          request: { method: 'PUT', url: 'Patient/p1' },
        },
      ],
    };

    expect(rewritePostToPut(bundle)).toEqual(bundle);
  });

  it('leaves conditional creates (ifNoneExist) unchanged, since they are already idempotent', () => {
    const bundle: fhir4.Bundle = {
      resourceType: 'Bundle',
      type: 'transaction',
      entry: [
        {
          fullUrl: 'urn:uuid:prac-1',
          resource: { resourceType: 'Practitioner' },
          request: { method: 'POST', url: 'Practitioner', ifNoneExist: 'identifier=http://hl7.org/fhir/sid/us-npi|1' },
        },
      ],
    };

    expect(rewritePostToPut(bundle)).toEqual(bundle);
  });

  it('refuses a POST entry it cannot make idempotent', () => {
    const bundle: fhir4.Bundle = {
      resourceType: 'Bundle',
      type: 'transaction',
      entry: [{ resource: { resourceType: 'Patient' }, request: { method: 'POST', url: 'Patient' } }],
    };

    expect(() => rewritePostToPut(bundle)).toThrow(/urn:uuid/);
  });
});

describe('resourceTypesIn', () => {
  it('lists each resource type once', () => {
    const bundle: fhir4.Bundle = {
      resourceType: 'Bundle',
      type: 'transaction',
      entry: [
        { resource: { resourceType: 'Patient' } },
        { resource: { resourceType: 'Practitioner' } },
        { resource: { resourceType: 'Patient' } },
      ],
    };

    expect(resourceTypesIn(bundle).sort()).toEqual(['Patient', 'Practitioner']);
  });
});

describe('countResponseStatuses', () => {
  it('counts entry outcomes by status code', () => {
    const response: fhir4.Bundle = {
      resourceType: 'Bundle',
      type: 'transaction-response',
      entry: [
        { response: { status: '201 Created' } },
        { response: { status: '201 Created' } },
        { response: { status: '200 OK' } },
      ],
    };

    expect(countResponseStatuses(response)).toEqual({ '201': 2, '200': 1 });
  });
});

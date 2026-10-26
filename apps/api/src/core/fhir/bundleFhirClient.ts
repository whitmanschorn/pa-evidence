import type { FhirClient, SearchParams } from './fhirClient.js';
import { refOf, subjectRefOf } from './resources.js';

// An in-memory FhirClient over the resources in some bundle files. Tests and `pnpm fixtures` use it so the
// rules run against the supplied bundles without HAPI. It supports only the searches the chart fetch makes
// (patient, _id, code), and fails loudly on anything else so a test cannot silently ignore a filter.
// References must already be "Type/id" (as in the supplied bundles); Synthea's urn:uuid references are not resolved.
export function createBundleFhirClient(bundles: fhir4.Bundle[]): FhirClient {
  const resources: fhir4.Resource[] = [];
  for (const bundle of bundles) {
    for (const entry of bundle.entry ?? []) {
      if (entry.resource?.id !== undefined) {
        resources.push(entry.resource);
      }
    }
  }
  const knownRefs = new Set(resources.map(refOf));

  return {
    async search(resourceType, params) {
      return resources.filter((resource) => resource.resourceType === resourceType && matches(resource, params));
    },
    async existing(refs) {
      return new Set(refs.filter((ref) => knownRefs.has(ref)));
    },
    async read(ref) {
      return resources.find((resource) => refOf(resource) === ref) ?? null;
    },
  };
}

function matches(resource: fhir4.Resource, params: SearchParams): boolean {
  for (const [name, value] of Object.entries(params)) {
    if (name === 'patient') {
      const wanted = value.startsWith('Patient/') ? value : `Patient/${value}`;
      if (subjectRefOf(resource) !== wanted) return false;
    } else if (name === '_id') {
      if (resource.id !== value) return false;
    } else if (name === 'code') {
      if (!hasAnyCode(resource, value.split(','))) return false;
    } else {
      throw new Error(`bundleFhirClient does not support the search parameter "${name}"`);
    }
  }
  return true;
}

// `tokens` are "system|code" strings, as in a FHIR token search.
function hasAnyCode(resource: fhir4.Resource, tokens: string[]): boolean {
  const concept = (resource as { code?: fhir4.CodeableConcept }).code;
  const codings = concept?.coding ?? [];
  return codings.some((coding) => tokens.includes(`${coding.system}|${coding.code}`));
}

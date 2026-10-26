import type { CriterionResult } from '@pa/shared';
import type { FhirClient } from '../fhir/fhirClient.js';
import { unique } from '../rules/matching.js';

// Every reference a packet shows the nurse: cited sources, and every resource listed as considered.
export function referencedRefs(criteria: CriterionResult[]): string[] {
  const refs: string[] = [];
  for (const criterion of criteria) {
    refs.push(...criterion.sources);
    refs.push(...criterion.considered.map((item) => item.ref));
  }
  return unique(refs);
}

// Asks the FHIR server whether each reference exists, and returns the ones it could not find.
export async function findUnverifiedRefs(fhir: FhirClient, criteria: CriterionResult[]): Promise<string[]> {
  const refs = referencedRefs(criteria);
  const found = await fhir.existing(refs);
  return refs.filter((ref) => !found.has(ref));
}

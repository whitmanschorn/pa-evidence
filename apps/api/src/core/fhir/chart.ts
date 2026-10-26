import type { FhirClient } from './fhirClient.js';
import { subjectRefOf } from './resources.js';

// The slice of a member's chart the evaluators read. Each evaluator kind declares what it needs as
// ChartQuery values; fetchChart merges them, so the fetch layer never knows which criterion asked.
export type ChartResourceType = 'Patient' | 'Condition' | 'Observation' | 'MedicationRequest' | 'AllergyIntolerance';

export type ChartQuery = {
  resourceType: ChartResourceType;
  // Search only these codes. Omit to fetch every resource of the type (needed for display-text matching).
  codes?: { system: string; code: string }[];
};

export type Chart = {
  patient: fhir4.Patient | null;
  conditions: fhir4.Condition[];
  observations: fhir4.Observation[];
  medicationRequests: fhir4.MedicationRequest[];
  allergies: fhir4.AllergyIntolerance[];
};

export async function fetchChart(
  fhir: FhirClient,
  patientId: string,
  queries: ChartQuery[],
): Promise<{ chart: Chart; warnings: string[] }> {
  const memberRef = `Patient/${patientId}`;
  const merged = mergeQueries(queries);

  const [patients, conditions, observations, medicationRequests, allergies] = await Promise.all([
    fhir.search('Patient', { _id: patientId }),
    searchIfNeeded(fhir, merged, 'Condition', patientId),
    searchIfNeeded(fhir, merged, 'Observation', patientId),
    searchIfNeeded(fhir, merged, 'MedicationRequest', patientId),
    searchIfNeeded(fhir, merged, 'AllergyIntolerance', patientId),
  ]);

  // Defence in depth: the search asked for this member, but only resources that say so are kept.
  const all = [...patients, ...conditions, ...observations, ...medicationRequests, ...allergies];
  const foreign = all.filter((resource) => subjectRefOf(resource) !== memberRef);
  const warnings = foreign.length > 0 ? ['member_reference_mismatch'] : [];
  const keep = <T extends fhir4.Resource>(list: fhir4.Resource[]): T[] =>
    list.filter((resource) => subjectRefOf(resource) === memberRef) as T[];

  return {
    chart: {
      patient: keep<fhir4.Patient>(patients)[0] ?? null,
      conditions: keep<fhir4.Condition>(conditions),
      observations: keep<fhir4.Observation>(observations),
      medicationRequests: keep<fhir4.MedicationRequest>(medicationRequests),
      allergies: keep<fhir4.AllergyIntolerance>(allergies),
    },
    warnings,
  };
}

// For each resource type: undefined = not needed, 'all' = no code filter, otherwise the union of codes.
type MergedQueries = Map<ChartResourceType, 'all' | Set<string>>;

function mergeQueries(queries: ChartQuery[]): MergedQueries {
  const merged: MergedQueries = new Map();
  for (const query of queries) {
    const current = merged.get(query.resourceType);
    if (query.codes === undefined || current === 'all') {
      merged.set(query.resourceType, 'all');
      continue;
    }
    const tokens = current ?? new Set<string>();
    for (const coding of query.codes) {
      tokens.add(`${coding.system}|${coding.code}`);
    }
    merged.set(query.resourceType, tokens);
  }
  return merged;
}

async function searchIfNeeded(
  fhir: FhirClient,
  merged: MergedQueries,
  resourceType: ChartResourceType,
  patientId: string,
): Promise<fhir4.Resource[]> {
  const wanted = merged.get(resourceType);
  if (wanted === undefined) return [];
  if (wanted === 'all') return fhir.search(resourceType, { patient: patientId });
  return fhir.search(resourceType, { patient: patientId, code: [...wanted].join(',') });
}

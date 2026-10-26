// Small helpers for reading FHIR resources. fhir4.* types are global, from @types/fhir.

// "Condition/abc-123". Every resource the server returns has an id.
export function refOf(resource: fhir4.Resource): string {
  return `${resource.resourceType}/${resource.id ?? ''}`;
}

// The member a resource belongs to: `subject` on most clinical resources, `patient` on AllergyIntolerance.
// For a Patient it is the Patient itself.
export function subjectRefOf(resource: fhir4.Resource): string | undefined {
  if (resource.resourceType === 'Patient') return refOf(resource);
  const withSubject = resource as { subject?: fhir4.Reference; patient?: fhir4.Reference };
  return withSubject.subject?.reference ?? withSubject.patient?.reference;
}

// The code of the first coding in a status concept, e.g. clinicalStatus "active".
export function statusCode(concept: fhir4.CodeableConcept | undefined): string | undefined {
  return concept?.coding?.[0]?.code;
}

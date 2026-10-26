// What the source drawer shows for a cited resource: the structured facts, without free text or member
// identifiers (minimum necessary). Free text is where prompt-injection text and stray PHI live: PA-006's Condition
// note, for one, carries an instruction aimed at the reviewer. The nurse can open the full chart in the EHR.
//   - narrative `text`, `note` and attachment contents are removed from every resource
//   - a Patient keeps only what age evidence needs: birth date, deceased, gender
const FREE_TEXT_FIELDS = ['text', 'note'];
const PATIENT_KEPT_FIELDS = ['resourceType', 'id', 'meta', 'birthDate', 'deceasedBoolean', 'deceasedDateTime', 'gender'];

export type SourceView = { ref: string; resource: Record<string, unknown>; omitted: string[] };

export function sourceView(resource: fhir4.Resource): SourceView {
  const ref = `${resource.resourceType}/${resource.id ?? ''}`;
  const copy = JSON.parse(JSON.stringify(resource)) as Record<string, unknown>;
  const omitted: string[] = [];

  for (const field of Object.keys(copy)) {
    const isPatientIdentifyingField = resource.resourceType === 'Patient' && !PATIENT_KEPT_FIELDS.includes(field);
    if (FREE_TEXT_FIELDS.includes(field) || isPatientIdentifyingField) {
      delete copy[field];
      omitted.push(field);
    }
  }

  // DocumentReference (and anything else with attachments): keep the metadata, drop the contents.
  const content = copy.content;
  if (Array.isArray(content)) {
    for (const item of content as { attachment?: Record<string, unknown> }[]) {
      if (item.attachment !== undefined) {
        delete item.attachment.data;
        delete item.attachment.url;
      }
    }
    omitted.push('content.attachment.data');
  }
  return { ref, resource: copy, omitted };
}

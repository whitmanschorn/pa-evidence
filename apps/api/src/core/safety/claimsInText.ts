import { FHIR_REF, ISO_DATE } from '@pa/shared';

// What a model-written sentence claims, for the summary's faithfulness check and the draft's check: its dates, its
// other numbers, whether it names a FHIR reference, and whether it recommends a decision. Defined once, so the two
// checks can never drift apart. (Fresh RegExp objects each call: a shared global regex keeps state between calls.)

export function datesIn(text: string): string[] {
  return text.match(new RegExp(ISO_DATE.source, 'g')) ?? [];
}

// Numbers other than dates, criterion ids (a capital letter and digits) and the digits inside FHIR references
// ("…9d69…").
export function numbersIn(text: string): number[] {
  const stripped = text
    .replace(new RegExp(`\\b${FHIR_REF.source}`, 'g'), ' ')
    .replace(new RegExp(ISO_DATE.source, 'g'), ' ')
    .replace(/\b[A-Z]\d+\b/g, ' ');
  return (stripped.match(/\d+(?:\.\d+)?/g) ?? []).map(Number);
}

export function mentionsFhirRef(text: string): boolean {
  return new RegExp(`\\b${FHIR_REF.source}`).test(text);
}

export function recommendsADecision(text: string): boolean {
  return /\b(recommend\w*|eligib\w*|qualif\w*|medically necessary)\b/i.test(text);
}

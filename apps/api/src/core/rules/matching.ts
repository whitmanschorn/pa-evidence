import { z } from 'zod';
import type { Expansion } from '../terminology.js';

export const RXNORM = 'http://www.nlm.nih.gov/research/umls/rxnorm';

// A coding as written in a policy file.
export const CodingSchema = z.object({
  system: z.string(),
  code: z.string(),
  display: z.string().optional(),
});

// How a record concept matched a policy code: by code (the code or a curated descendant), or by display text.
// A display match is weaker evidence, so every one raises a "display_match" warning for the nurse.
export type MatchKind = 'code' | 'display';

export function matchConcept(concept: fhir4.CodeableConcept | undefined, expansion: Expansion): MatchKind | null {
  if (concept === undefined) return null;
  const codings = concept.coding ?? [];
  if (codings.some((coding) => coding.system === expansion.system && expansion.codes.has(coding.code ?? ''))) {
    return 'code';
  }
  const texts = [concept.text, ...codings.map((coding) => coding.display)].filter(
    (text): text is string => text !== undefined,
  );
  const displayMatched = texts.some((text) => expansion.displayTerms.some((term) => containsWords(text, term)));
  return displayMatched ? 'display' : null;
}

// True when `term` appears in `text` as whole words, ignoring case: "metformin" matches
// "24 HR Metformin hydrochloride", and "diabetes mellitus" does not match "Prediabetes".
export function containsWords(text: string, term: string): boolean {
  const escaped = term.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^a-z0-9])${escaped}($|[^a-z0-9])`).test(text.toLowerCase());
}

// Conditions and allergies marked refuted or entered-in-error never count as evidence.
export function isRefutedOrError(verificationStatus: fhir4.CodeableConcept | undefined): boolean {
  const code = verificationStatus?.coding?.[0]?.code;
  return code === 'refuted' || code === 'entered-in-error';
}

// A short label for a concept, for `value` and `considered` (e.g. "Pancreatitis (disorder)").
export function conceptLabel(concept: fhir4.CodeableConcept | undefined): string {
  return concept?.text ?? concept?.coding?.[0]?.display ?? concept?.coding?.[0]?.code ?? 'unknown';
}

export function unique(values: string[]): string[] {
  return [...new Set(values)];
}

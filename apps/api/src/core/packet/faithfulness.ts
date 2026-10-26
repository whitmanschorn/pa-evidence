import { findForbiddenTerms, type CriterionStatus } from '@pa/shared';

// What the model is shown: compact evidence only (no patient id, no notes, no free text from the chart).
export type SummaryEvidence = {
  criteria_total: number;
  criteria_with_evidence: number;
  criteria: { id: string; requirement: string; status: CriterionStatus; value?: string; observed?: string }[];
  missing_documents: string[];
};

// Checks that a model-written summary says only what the evidence says. Returns one message per problem; an
// empty list means faithful. These messages go back to the model on the retry, so they name the rule, not data.
export function checkSummary(sentences: [string, string], evidence: SummaryEvidence): string[] {
  const errors: string[] = [];
  const summary = sentences.join(' ');

  checkTwoSentences(sentences, errors);
  checkCriterionMentions(summary, evidence, errors);
  checkDatesAndNumbers(summary, evidence, errors);
  checkClaims(summary, evidence, errors);

  if (/\b[A-Z][A-Za-z]+\/[A-Za-z0-9\-.]+/.test(summary)) {
    errors.push('Do not mention FHIR references.');
  }
  if (findForbiddenTerms(summary).length > 0) {
    errors.push('Do not use any form of approve, deny or authorize.');
  }
  if (/\b(recommend\w*|eligib\w*|qualif\w*|medically necessary)\b/i.test(summary)) {
    errors.push('Do not recommend or suggest a decision.');
  }
  return errors;
}

// A sentence ends at . ! or ? followed by a space or the end. "8.1 %" does not end one: the dot is followed by a digit.
function checkTwoSentences(sentences: [string, string], errors: string[]): void {
  sentences.forEach((sentence, index) => {
    const ends = sentence.trim().match(/[.!?](?=\s|$)/g) ?? [];
    if (ends.length > 1) {
      errors.push(`sentence_${index + 1} has ${ends.length} sentences; make it one sentence by joining the parts with a semicolon.`);
    } else if (!/[.!?]$/.test(sentence.trim())) {
      errors.push(`sentence_${index + 1} must end with a period: add "." at the very end.`);
    }
  });
}

const STATUS_WORDS: { pattern: RegExp; status: CriterionStatus }[] = [
  { pattern: /^(not met|not_met|fails?|failed)\b/, status: 'not_met' },
  { pattern: /^(met|satisfied)\b/, status: 'met' },
  { pattern: /^missing\b/, status: 'missing' },
  { pattern: /^(conflicting|conflicts?)\b/, status: 'conflicting' },
];

// Every criterion id must exist, every criterion that is not met must be named, and a status written right after
// an id, or after a list of ids ("<id> and <id> are missing"), must be that criterion's status.
function checkCriterionMentions(summary: string, evidence: SummaryEvidence, errors: string[]): void {
  const statusById = new Map(evidence.criteria.map((criterion) => [criterion.id, criterion.status]));

  for (const match of summary.matchAll(/\b[A-Z]\d+\b/g)) {
    if (!statusById.has(match[0])) errors.push(`${match[0]} is not a criterion in the data.`);
  }
  for (const criterion of evidence.criteria) {
    if (criterion.status !== 'met' && !new RegExp(`\\b${criterion.id}\\b`).test(summary)) {
      errors.push(`Name ${criterion.id}, whose status is ${criterion.status.replace('_', ' ')}.`);
    }
  }

  const groups = summary.matchAll(/((?:[A-Z]\d+)(?:\s*(?:,|and|&)\s*[A-Z]\d+)*)\s*(?:is|are|was|were|:|-|\()?\s*([a-z_ ]+)/gi);
  for (const group of groups) {
    const following = (group[2] ?? '').toLowerCase().trim();
    const said = STATUS_WORDS.find((entry) => entry.pattern.test(following))?.status;
    if (said === undefined) continue;
    for (const id of (group[1] ?? '').match(/[A-Z]\d+/g) ?? []) {
      const actual = statusById.get(id);
      if (actual !== undefined && actual !== said) {
        errors.push(`${id} is ${actual.replace('_', ' ')}, not ${said.replace('_', ' ')}.`);
      }
    }
  }
}

// Dates must appear in the evidence, and so must every other number (compared as numbers, so 7 matches 7.0).
function checkDatesAndNumbers(summary: string, evidence: SummaryEvidence, errors: string[]): void {
  const evidenceText = JSON.stringify(evidence);
  const evidenceDates = new Set(evidenceText.match(/\d{4}-\d{2}-\d{2}/g) ?? []);
  for (const date of summary.match(/\d{4}-\d{2}-\d{2}/g) ?? []) {
    if (!evidenceDates.has(date)) errors.push(`The date ${date} is not in the data.`);
  }

  const withoutDatesAndIds = (text: string) => text.replace(/\d{4}-\d{2}-\d{2}/g, ' ').replace(/\b[A-Z]\d+\b/g, ' ');
  const evidenceNumbers = new Set((withoutDatesAndIds(evidenceText).match(/\d+(?:\.\d+)?/g) ?? []).map(Number));
  for (const number of withoutDatesAndIds(summary).match(/\d+(?:\.\d+)?/g) ?? []) {
    if (!evidenceNumbers.has(Number(number))) errors.push(`The number ${number} is not in the data.`);
  }
}

// Counts and "all criteria" claims must match the statuses.
function checkClaims(summary: string, evidence: SummaryEvidence, errors: string[]): void {
  const count = /(\d+)\s+of\s+(\d+)\s+criteria/i.exec(summary);
  if (count !== null && (Number(count[1]) !== evidence.criteria_with_evidence || Number(count[2]) !== evidence.criteria_total)) {
    errors.push(`Evidence was found for ${evidence.criteria_with_evidence} of ${evidence.criteria_total} criteria.`);
  }
  const allMet = evidence.criteria_with_evidence === evidence.criteria_total;
  if (!allMet && /\b(all|every)\b[^.]*\b(criteria|criterion|requirements)\b[^.]*\b(met|satisfied)\b/i.test(summary)) {
    errors.push('Not every criterion is met.');
  }
}

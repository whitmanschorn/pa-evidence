import { DraftItemSchema, findForbiddenTerms, type DraftItem, type Packet } from '@pa/shared';
import { z } from 'zod';
import { containsWords } from '../core/rules/matching.js';

// The provider request the agent drafts for the nurse. It is checked against the rules engine's packet, never against
// the agent's own answer, and it is never sent automatically.

export const DraftSchema = z.object({ items: z.array(DraftItemSchema) });

// The criteria that need something from the provider: missing or conflicting.
function criteriaNeedingDocuments(rulesPacket: Packet) {
  return rulesPacket.criteria.filter((criterion) => criterion.status === 'missing' || criterion.status === 'conflicting');
}

export type DraftCheck = { failures: string[]; problems: string[] }; // codes for the audit, sentences for the retry

export function checkDraft(items: DraftItem[], rulesPacket: Packet, memberNames: string[]): DraftCheck {
  const failures = new Set<string>();
  const problems: string[] = [];
  const expected = criteriaNeedingDocuments(rulesPacket).map((criterion) => criterion.id);

  // 1. Completeness: exactly one ask for each missing or conflicting criterion, and none for any other.
  const askedIds = items.map((item) => item.criterion_id);
  for (const id of expected) {
    const count = askedIds.filter((asked) => asked === id).length;
    if (count !== 1) {
      failures.add('incomplete');
      problems.push(`Write exactly one ask for ${id}.`);
    }
  }
  for (const id of new Set(askedIds)) {
    if (!expected.includes(id)) {
      failures.add('incomplete');
      problems.push(`Do not write an ask for ${id}: nothing is needed for it.`);
    }
  }

  for (const item of items) {
    const criterion = rulesPacket.criteria.find((candidate) => candidate.id === item.criterion_id);
    if (criterion === undefined) continue;
    // 2. Every number and date comes from that criterion's evidence or attested values (not its considered list).
    const { considered, paths, ...evidence } = criterion;
    const evidenceText = JSON.stringify(evidence);
    const ask = item.ask.replaceAll(rulesPacket.request_id, ' ');
    for (const date of ask.match(/\d{4}-\d{2}-\d{2}/g) ?? []) {
      if (!evidenceText.includes(date)) {
        failures.add('unsupported_date');
        problems.push(`The date ${date} in the ask for ${item.criterion_id} is not in its evidence.`);
      }
    }
    const numbersIn = (text: string) =>
      (text.replace(/\d{4}-\d{2}-\d{2}/g, ' ').replace(/\b[A-Z]\d+\b/g, ' ').match(/\d+(?:\.\d+)?/g) ?? []).map(Number);
    // FHIR references are dropped first: the digits inside an id ("…9d69…") are not evidence of a 9.
    const allowed = new Set(numbersIn(evidenceText.replace(/[A-Z][A-Za-z]+\/[A-Za-z0-9\-.]+/g, ' ')));
    for (const number of numbersIn(ask)) {
      if (!allowed.has(number)) {
        failures.add('unsupported_number');
        problems.push(`The number ${number} in the ask for ${item.criterion_id} is not in its evidence.`);
      }
    }
    // 3. No banned words: drafts say "request PA-00X", never "prior authorization".
    if (findForbiddenTerms(item.ask).length > 0) {
      failures.add('forbidden_term');
      problems.push(`The ask for ${item.criterion_id} uses a form of approve, deny or authorize.`);
    }
    // 4. No recommendation.
    if (/\b(recommend\w*|eligib\w*|qualif\w*|medically necessary)\b/i.test(item.ask)) {
      failures.add('recommendation');
      problems.push(`The ask for ${item.criterion_id} recommends or suggests a decision.`);
    }
    // 5. No member name (birth dates are already caught: they are never in the evidence).
    if (memberNames.some((name) => name.length >= 3 && containsWords(item.ask, name))) {
      failures.add('identifier');
      problems.push(`The ask for ${item.criterion_id} names the member; refer to the request id only.`);
    }
  }
  return { failures: [...failures], problems };
}

// The fallback asks: the rules engine's own missing_documents wording, one per criterion.
export function templateItems(rulesPacket: Packet): DraftItem[] {
  return criteriaNeedingDocuments(rulesPacket).map((criterion) => ({
    criterion_id: criterion.id,
    ask: criterion.missing_document ?? `Records for: ${criterion.requirement}`,
  }));
}

// The letter around the asks is a fixed template; the model writes only the asks.
export function renderDraft(requestId: string, drugName: string, items: DraftItem[]): string {
  const asks = items.map((item, index) => `${index + 1}. ${item.ask}`);
  return [`Re: request ${requestId} (${drugName}). To complete our review, please send:`, ...asks, 'Thank you.'].join('\n');
}

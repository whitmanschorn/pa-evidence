import type { CriterionResult } from '@pa/shared';
import { z } from 'zod';
import type { ChatMessage, ChatModel } from '../llm/chatModel.js';
import { loadPrompt } from '../llm/prompts.js';
import { checkSummary, type SummaryEvidence } from './faithfulness.js';
import { templateSummary } from './templateSummary.js';

// The model writes the two-sentence summary; code decides everything else and checks every word of it.
//   1. Send compact evidence inside <clinical_data> tags (no patient id, no notes, no chart free text).
//   2. Parse the reply with Zod, then run the faithfulness check.
//   3. On any failure, retry once with the list of problems.
//   4. If it still fails (or the model is down), use the code template and add the warning "summary_fallback".

// v2 spells out the exact sentence shapes; v1 (kept for the eval) let the model split sentence_1 in two.
const PROMPT = loadPrompt('summary.v2');
const MAX_ATTEMPTS = 2; // the first try and one retry

export const SummarySchema = z.object({
  sentence_1: z.string().min(1),
  sentence_2: z.string().min(1),
});
const SUMMARY_JSON_SCHEMA = z.toJSONSchema(SummarySchema);

export type SummaryResult = {
  summary: string;
  source: 'model' | 'template';
  warnings: string[];
  model: string | null;
  modelDigest: string | null;
  promptVersion: string | null;
  llmMs: number;
  attempts: number;
  failures: string[]; // why each rejected attempt was rejected (for the eval; never shown to the nurse)
};

export function summaryEvidence(criteria: CriterionResult[], missingDocuments: string[]): SummaryEvidence {
  return {
    criteria_total: criteria.length,
    criteria_with_evidence: criteria.filter((criterion) => criterion.status === 'met').length,
    criteria: criteria.map((criterion) => ({
      id: criterion.id,
      requirement: criterion.requirement,
      status: criterion.status,
      value: criterion.value,
      observed: criterion.observed,
    })),
    missing_documents: missingDocuments,
  };
}

export async function writeSummary(
  model: ChatModel | undefined,
  criteria: CriterionResult[],
  missingDocuments: string[],
): Promise<SummaryResult> {
  const template = templateSummary(criteria, missingDocuments);
  if (model === undefined) {
    // No model configured: the template is the summary by design, not a fallback.
    return {
      summary: template,
      source: 'template',
      warnings: [],
      model: null,
      modelDigest: null,
      promptVersion: null,
      llmMs: 0,
      attempts: 0,
      failures: [],
    };
  }

  const evidence = summaryEvidence(criteria, missingDocuments);
  const messages: ChatMessage[] = [
    { role: 'system', content: PROMPT.text },
    { role: 'user', content: `<clinical_data>\n${JSON.stringify(evidence, null, 2)}\n</clinical_data>\nWrite the summary.` },
  ];
  const failures: string[] = [];
  let llmMs = 0;
  let attempts = 0;

  while (attempts < MAX_ATTEMPTS) {
    attempts += 1;
    let content: string;
    try {
      const reply = await model.chatJson(messages, SUMMARY_JSON_SCHEMA);
      llmMs += reply.ms;
      content = reply.content;
    } catch {
      failures.push('model_unavailable');
      break; // a model that is down will not be up on the retry
    }

    const { sentences, problems } = parseAndCheck(content, evidence);
    if (sentences !== null && problems.length === 0) {
      return {
        summary: `${sentences[0]} ${sentences[1]}`,
        source: 'model',
        warnings: [],
        model: model.name,
        modelDigest: model.digest,
        promptVersion: PROMPT.version,
        llmMs,
        attempts,
        failures,
      };
    }
    failures.push(...problems);
    messages.push({ role: 'assistant', content });
    messages.push({
      role: 'user',
      content: `That summary failed these checks:\n${problems.map((problem) => `- ${problem}`).join('\n')}\nWrite it again as JSON.`,
    });
  }

  return {
    summary: template,
    source: 'template',
    warnings: ['summary_fallback'],
    model: model.name,
    modelDigest: model.digest,
    promptVersion: PROMPT.version,
    llmMs,
    attempts,
    failures,
  };
}

// Zod first (invariant 9), then the faithfulness check.
function parseAndCheck(content: string, evidence: SummaryEvidence): { sentences: [string, string] | null; problems: string[] } {
  let json: unknown;
  try {
    json = JSON.parse(content);
  } catch {
    return { sentences: null, problems: ['Reply with JSON only.'] };
  }
  const parsed = SummarySchema.safeParse(json);
  if (!parsed.success) {
    return { sentences: null, problems: ['Reply with exactly {"sentence_1": "...", "sentence_2": "..."}.'] };
  }
  const sentences: [string, string] = [withFinalPeriod(parsed.data.sentence_1), withFinalPeriod(parsed.data.sentence_2)];
  return { sentences, problems: checkSummary(sentences, evidence) };
}

// Small models often drop the last period. Adding it changes no meaning, so code does it instead of a retry.
function withFinalPeriod(sentence: string): string {
  const trimmed = sentence.trim();
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

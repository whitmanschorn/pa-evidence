import type { CriterionResult } from '@pa/shared';
import { NoObjectGeneratedError, Output, generateText, type ModelMessage } from 'ai';
import { z } from 'zod';
import { wrapClinicalData } from '../llm/clinicalData.js';
import { callSettings, type LocalModel } from '../llm/localModel.js';
import { loadPrompt } from '../llm/prompts.js';
import { checkSummary, type SummaryEvidence } from './faithfulness.js';
import { templateSummary } from './templateSummary.js';

// The model writes the two-sentence summary; code decides everything else and checks every word of it.
//   1. Send compact evidence inside <clinical_data> tags (no patient id, no notes, no chart free text).
//   2. The AI SDK parses the reply with the Zod schema (Output.object); then the faithfulness check runs.
//   3. On any failure, retry once with the list of problems.
//   4. If it still fails (or the model is down), use the code template and add the warning "summary_fallback".

// v2 spells out the exact sentence shapes; v1 (kept for the eval) let the model split sentence_1 in two.
// The output cap, timeout and call settings come from the model version in effect (data/models).
const PROMPT = loadPrompt('summary.v2');
export const SUMMARY_PROMPT_VERSION = PROMPT.version;
const MAX_ATTEMPTS = 2; // the first try and one retry

export const SummarySchema = z.object({
  sentence_1: z.string().min(1),
  sentence_2: z.string().min(1),
});

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
  schemaValidFirstTry: boolean | null; // the first reply parsed as the schema (for the model comparison); null: no call
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
  model: LocalModel | undefined,
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
      schemaValidFirstTry: null,
    };
  }

  const evidence = summaryEvidence(criteria, missingDocuments);
  const messages: ModelMessage[] = [
    { role: 'user', content: `${wrapClinicalData(JSON.stringify(evidence, null, 2))}\nWrite the summary.` },
  ];
  const failures: string[] = [];
  let llmMs = 0;
  let attempts = 0;
  let schemaValidFirstTry: boolean | null = null;

  while (attempts < MAX_ATTEMPTS) {
    attempts += 1;
    const started = performance.now();
    let reply: z.infer<typeof SummarySchema>;
    try {
      const result = await generateText({
        model: model.languageModel,
        instructions: PROMPT.text,
        messages,
        output: Output.object({ schema: SummarySchema }),
        maxOutputTokens: model.max_output_tokens.summary,
        timeout: model.timeouts_ms.call,
        ...callSettings(model),
      });
      reply = result.output;
      if (attempts === 1) schemaValidFirstTry = true;
    } catch (error) {
      llmMs += Math.round(performance.now() - started);
      if (attempts === 1) schemaValidFirstTry = false;
      if (!NoObjectGeneratedError.isInstance(error)) {
        failures.push('model_unavailable');
        break; // a model that is down will not be up on the retry
      }
      const problem = 'Reply with exactly {"sentence_1": "...", "sentence_2": "..."}.';
      failures.push(problem);
      messages.push({ role: 'assistant', content: error.text ?? '' }, { role: 'user', content: problem });
      continue;
    }
    llmMs += Math.round(performance.now() - started);

    // Used exactly as the model wrote it (trimmed): code never edits model text, it only accepts or rejects it.
    const sentences: [string, string] = [reply.sentence_1.trim(), reply.sentence_2.trim()];
    const problems = checkSummary(sentences, evidence);
    if (problems.length === 0) {
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
        schemaValidFirstTry,
      };
    }
    failures.push(...problems);
    messages.push({ role: 'assistant', content: JSON.stringify(reply) });
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
    schemaValidFirstTry,
  };
}

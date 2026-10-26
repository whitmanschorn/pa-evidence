import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { CriterionStatusSchema, DraftItemSchema, PacketSchema } from '@pa/shared';
import { describe, expect, it } from 'vitest';
import { DraftSchema, draftEvidence } from '../../src/agent/draft.js';
import { CLINICAL_DATA_TAG } from '../../src/core/llm/clinicalData.js';
import { loadPrompt } from '../../src/core/llm/prompts.js';
import { SummarySchema, summaryEvidence } from '../../src/core/packet/writeSummary.js';
import {
  EvaluateCriterionInput,
  GetPolicyInput,
  GetRequestInput,
  TOOL,
  VerifySourcesInput,
} from '../../src/core/tools/evidenceTools.js';
import { REPO_ROOT } from '../support/repoRoot.js';

// Prompts are text, so nothing in the compiler ties them to the code. These tests do.
const PROMPTS = readdirSync(new URL('../../src/core/llm/prompts/', import.meta.url)).map((file) => file.replace(/\.md$/, ''));

// 1. The code wraps every piece of clinical data it sends in CLINICAL_DATA_TAG; every prompt must name that tag and
// say its content is data. Renaming the tag in code fails this until every prompt says the new name.
describe('prompts name the clinical data tag', () => {
  it.each(PROMPTS)('%s says content inside the tag is data, never instructions', (version) => {
    const { text } = loadPrompt(version);
    expect(text).toContain(`<${CLINICAL_DATA_TAG}>`);
    expect(text).toMatch(/data, never instructions/);
  });
});

// 2. Every field, tool or status name a prompt mentions (the snake_case words, such as <criteria_with_evidence>) must
// exist in what the code sends that prompt or parses from its reply. Renaming a field in code fails this until the
// prompt follows.
function namesIn(text: string): string[] {
  return [...new Set(text.match(/\b[a-z]+(?:_[a-z0-9]+)+\b/g) ?? [])];
}

const STATUSES = CriterionStatusSchema.options;
// A real packet with a criterion that needs a document (only the field names matter here).
const rulesPacket = PacketSchema.parse(JSON.parse(readFileSync(join(REPO_ROOT, 'apps/web/e2e/fixtures/packets/PA-004.json'), 'utf8')));
const summarySent = summaryEvidence(rulesPacket.criteria, rulesPacket.missing_documents);
const draftSent = draftEvidence(rulesPacket);

const VOCABULARY: Record<string, string[]> = {
  summary: [
    CLINICAL_DATA_TAG,
    ...STATUSES,
    ...Object.keys(summarySent),
    ...Object.keys(summarySent.criteria[0] ?? {}),
    ...Object.keys(SummarySchema.shape),
  ],
  draft: [CLINICAL_DATA_TAG, ...STATUSES, ...Object.keys(draftSent[0] ?? {}), ...Object.keys(DraftSchema.shape), ...Object.keys(DraftItemSchema.shape)],
  agent: [
    CLINICAL_DATA_TAG,
    ...STATUSES,
    ...Object.values(TOOL),
    ...[GetRequestInput, GetPolicyInput, EvaluateCriterionInput, VerifySourcesInput].flatMap((input) => Object.keys(input)),
  ],
};

describe('prompts mention only names the code uses', () => {
  it.each(PROMPTS)('%s', (version) => {
    const vocabulary = VOCABULARY[version.split('.')[0] ?? ''];
    expect(vocabulary, `no vocabulary for prompt ${version}`).toBeDefined();
    const unknown = namesIn(loadPrompt(version).text).filter((name) => !vocabulary?.includes(name));
    expect(unknown).toEqual([]);
  });
});

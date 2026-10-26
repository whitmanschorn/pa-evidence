// The tag around every piece of clinical data sent to a model. Each prompt tells the model that content inside it is
// data, never instructions (prompt injection); test/llm/prompts.test.ts checks every prompt names this tag and that
// rule. The prompt files spell the tag out rather than filling in a placeholder, so each file stays the exact text the
// model receives, which is what the audit's prompt_version points to.
export const CLINICAL_DATA_TAG = 'clinical_data';

// `source` says where the data came from, e.g. "tool:evaluate_criterion".
export function wrapClinicalData(content: string, source?: string): string {
  const open = source === undefined ? `<${CLINICAL_DATA_TAG}>` : `<${CLINICAL_DATA_TAG} source="${source}">`;
  return `${open}\n${content}\n</${CLINICAL_DATA_TAG}>`;
}

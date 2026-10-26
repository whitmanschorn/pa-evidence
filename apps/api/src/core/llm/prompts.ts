import { readFileSync } from 'node:fs';

// Prompts are versioned files next to this module (prompts/<version>.md). The version is recorded in the audit
// event, so any summary can be traced to the exact instructions the model had. Changing a prompt means a new file.
//
// They live in the code, not in data/models with the model settings, because the code depends on what they say: the
// <clinical_data> tags the code wraps data in, the reply shapes its schemas parse, the summary rules its checker
// enforces, the tool order its stop condition relies on. So a prompt change goes through review and the tests.
export type Prompt = { version: string; text: string };

export function loadPrompt(version: string): Prompt {
  const text = readFileSync(new URL(`./prompts/${version}.md`, import.meta.url), 'utf8');
  return { version, text };
}

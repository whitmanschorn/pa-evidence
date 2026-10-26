import { readFileSync } from 'node:fs';

// Prompts are versioned files next to this module (prompts/<version>.md). The version is recorded in the audit
// event, so any summary can be traced to the exact instructions the model had. Changing a prompt means a new file.
export type Prompt = { version: string; text: string };

export function loadPrompt(version: string): Prompt {
  const text = readFileSync(new URL(`./prompts/${version}.md`, import.meta.url), 'utf8');
  return { version, text };
}

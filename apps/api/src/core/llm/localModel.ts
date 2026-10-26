import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import type { LanguageModel } from 'ai';
import type { ModelVersion } from './modelVersions.js';

// A model version (model.json and its prompts) connected to the model it names: the Vercel AI SDK, through Ollama's
// OpenAI-compatible API (/v1). The same code talks to any OpenAI-compatible endpoint (vLLM, or a hosted model under a
// BAA) by changing OLLAMA_BASE_URL and the version folder.
export type LocalModel = ModelVersion & { languageModel: LanguageModel };

export function connectLocalModel(baseUrl: string, version: ModelVersion): LocalModel {
  const provider = createOpenAICompatible({
    name: 'ollama',
    baseURL: `${baseUrl.replace(/\/$/, '')}/v1`,
    supportsStructuredOutputs: true, // Output.object sends a json_schema response_format
  });
  return { ...version, languageModel: provider.chatModel(version.name) };
}

// The settings for every call: the version's call_settings, and no automatic retries (each caller decides what a retry
// means; the summary, for one, retries with the list of problems).
export function callSettings(model: LocalModel) {
  return { ...model.call_settings, maxRetries: 0 };
}

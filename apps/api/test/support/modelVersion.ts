import { dayOf } from '../../src/core/dates.js';
import { loadModelVersions, type ModelVersion } from '../../src/core/llm/modelVersions.js';
import { latestInEffect } from '../../src/core/versionFolders.js';
import { MODELS_DIR } from './suppliedWorld.js';

// The tests' fixed "today", and the model version in effect on it (data/models).
export const TODAY = new Date('2026-10-26T12:00:00.000Z');

export function modelVersionInEffect(): ModelVersion {
  const version = latestInEffect(loadModelVersions(MODELS_DIR), dayOf(TODAY));
  if (version === undefined) throw new Error('no model version in effect on the test date');
  return version;
}

// The local model, for the tests that run against it and skip themselves otherwise.
export const OLLAMA_URL_FOR_TESTS = process.env.OLLAMA_BASE_URL_FOR_TESTS ?? 'http://127.0.0.1:11434';

export async function ollamaHasModel(name: string): Promise<boolean> {
  try {
    const tags = (await (await fetch(`${OLLAMA_URL_FOR_TESTS}/api/tags`)).json()) as { models: { name: string }[] };
    return tags.models.some((model) => model.name === name);
  } catch {
    return false;
  }
}

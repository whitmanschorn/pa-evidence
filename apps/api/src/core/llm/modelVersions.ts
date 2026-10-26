import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { IsoDateSchema } from '@pa/shared';
import { z } from 'zod';
import { checkVersionOrder, parseVersionFolderName, requireDirectory, visibleNames } from '../versionFolders.js';

// Reads model versions from disk, the same way policies are read. A new model or new call settings is one new folder
// (see modelRegistry.ts for which one is used). Layout:
//
//   data/models/<effective date>_<version>/model.json   which model, and how it is called
//
// The prompts are not here: they are code (see prompts.ts). As with policies, the folder name must agree with
// model.json, and anything unexpected is an error, so a mislabelled drop stops the service at startup (or fails the
// reload) instead of being used.
const MODEL_FILE = 'model.json';

const PositiveInt = z.number().int().positive();

export const ModelConfigSchema = z.strictObject({
  version: z.string().min(1),
  effective: IsoDateSchema,
  note: z.string(),
  name: z.string().min(1), // the model's name on the OpenAI-compatible server (an Ollama tag)
  digest: z.string().regex(/^[0-9a-f]{64}$/), // the pinned build: `make model` checks it, and /ready reports a mismatch
  // Sent with every call. Temperature 0 and a fixed seed: the same evidence gives the same reply.
  call_settings: z.strictObject({ temperature: z.number().min(0).max(2), seed: z.number().int() }),
  // A small model can loop (repeating text or list items); a cap ends the call instead of letting it run to the timeout.
  max_output_tokens: z.strictObject({ summary: PositiveInt, tool_step: PositiveInt, draft: PositiveInt }),
  // `call`: one model call (a summary attempt, an agent step, a draft attempt). `agent_run`: a whole agent run.
  timeouts_ms: z.strictObject({ call: PositiveInt, agent_run: PositiveInt }),
  agent: z.strictObject({ max_steps: PositiveInt }),
});
export type ModelConfig = z.infer<typeof ModelConfigSchema>;

export type ModelVersion = ModelConfig & { folder: string };

export function loadModelVersions(modelsDir: string): ModelVersion[] {
  const versions = visibleNames(modelsDir).map((folderName) => loadVersionFolder(join(modelsDir, folderName), folderName));
  if (versions.length === 0) throw new Error(`${modelsDir} holds no model version folders`);
  checkVersionOrder(versions, 'model');
  return versions.sort((a, b) => a.effective.localeCompare(b.effective));
}

function loadVersionFolder(folder: string, folderName: string): ModelVersion {
  requireDirectory(folder, 'the models directory holds one <effective date>_<version> folder per version');
  const named = parseVersionFolderName(folderName);
  if (named === null) {
    throw new Error(`Model version folder ${folder} must be named <effective date>_<version>, e.g. 2026-10-26_1`);
  }
  expectExactly(folder, [MODEL_FILE]);

  const configPath = join(folder, MODEL_FILE);
  const parsed = ModelConfigSchema.safeParse(JSON.parse(readFileSync(configPath, 'utf8')));
  if (!parsed.success) throw new Error(`Invalid model config ${configPath}: ${parsed.error.message}`);
  const config = parsed.data;
  if (config.effective !== named.effective || config.version !== named.version) {
    throw new Error(`${configPath} says effective ${config.effective}, version ${config.version}, but its folder says ${folderName}`);
  }

  return { ...config, folder: folderName };
}

// The folder holds exactly these entries: nothing missing (a half-copied drop) and nothing extra (a misnamed file).
function expectExactly(folder: string, expected: string[]): void {
  const found = visibleNames(folder);
  const missing = expected.filter((name) => !found.includes(name));
  const unexpected = found.filter((name) => !expected.includes(name));
  if (missing.length > 0 || unexpected.length > 0) {
    throw new Error(`${folder} must hold exactly ${expected.join(', ')} (missing: ${missing.join(', ') || 'none'}; unexpected: ${unexpected.join(', ') || 'none'})`);
  }
}

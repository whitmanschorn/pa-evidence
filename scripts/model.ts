// make model (run by make up): makes sure the models named in data/models are ready on the host's Ollama.
//   1. Ollama must already be running natively (Metal). This never starts it, and it is never put in Docker here.
//   2. For the version in effect today and any staged for a later date: pull its model (a no-op when it is there)
//      and check the pulled digest against the one pinned in that version's model.json.
// Older versions are skipped: they stay on disk as a record, not to be run. The API validates the folders fully.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = fileURLToPath(new URL('../', import.meta.url));
const MODELS_DIR = join(REPO_ROOT, 'data/models');
// The host's view of Ollama (containers use host.docker.internal instead).
const OLLAMA_URL = process.env.OLLAMA_HOST_URL ?? 'http://127.0.0.1:11434';

type ModelFile = { folder: string; effective: string; name: string; digest: string };

function readModelFiles(): ModelFile[] {
  return readdirSync(MODELS_DIR)
    .filter((folder) => !folder.startsWith('.') && existsSync(join(MODELS_DIR, folder, 'model.json')))
    .map((folder) => {
      const file = JSON.parse(readFileSync(join(MODELS_DIR, folder, 'model.json'), 'utf8')) as Omit<ModelFile, 'folder'>;
      return { folder, effective: file.effective, name: file.name, digest: file.digest };
    })
    .sort((a, b) => a.effective.localeCompare(b.effective));
}

// The version in effect today (the latest dated on or before it), and every version dated later.
function currentAndStaged(versions: ModelFile[], today: string): ModelFile[] {
  const started = versions.filter((version) => version.effective <= today);
  const current = started[started.length - 1];
  const staged = versions.filter((version) => version.effective > today);
  return current === undefined ? staged : [current, ...staged];
}

async function pullAndVerify(version: ModelFile, pulled: () => Promise<Map<string, string>>): Promise<void> {
  console.log(`${version.folder}: pulling ${version.name} (a no-op when it is already here)...`);
  const pull = await fetch(`${OLLAMA_URL}/api/pull`, { method: 'POST', body: JSON.stringify({ model: version.name, stream: false }) });
  if (!pull.ok) throw new Error(`Pull of ${version.name} failed: HTTP ${pull.status}`);

  const digest = (await pulled()).get(version.name);
  if (digest === undefined) throw new Error(`${version.name} is not listed after the pull`);
  if (digest !== version.digest) {
    throw new Error(
      `${version.name} has digest ${digest}, but data/models/${version.folder}/model.json pins ${version.digest}. ` +
        'Pull the pinned build, or pin this one deliberately in a new version folder.',
    );
  }
  console.log(`${version.folder}: ${version.name} @ ${digest} matches the pin`);
}

async function main(): Promise<void> {
  const version = await fetch(`${OLLAMA_URL}/api/version`)
    .then((response) => response.json() as Promise<{ version: string }>)
    .catch(() => null);
  if (version === null) {
    throw new Error(`Ollama is not running at ${OLLAMA_URL}. Start it natively: brew services start ollama`);
  }
  console.log(`Ollama ${version.version} at ${OLLAMA_URL}`);

  const pulled = async () => {
    const tags = (await (await fetch(`${OLLAMA_URL}/api/tags`)).json()) as { models: { name: string; digest: string }[] };
    return new Map(tags.models.map((entry) => [entry.name, entry.digest]));
  };
  const today = new Date().toISOString().slice(0, 10);
  const versions = currentAndStaged(readModelFiles(), today);
  if (versions.length === 0) throw new Error(`No model version folders in ${MODELS_DIR}`);
  for (const modelVersion of versions) {
    await pullAndVerify(modelVersion, pulled);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

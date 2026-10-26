// make model (run by make up): makes sure the pinned summary model is ready on the host's Ollama.
//   1. Ollama must already be running natively (Metal). This never starts it, and it is never put in Docker here.
//   2. Pull OLLAMA_MODEL; a no-op when it is already there.
//   3. Check its digest against the pinned OLLAMA_MODEL_DIGEST, and make sure .env carries the model and digest
//      (the API container reads .env), recording them there when they are missing.
// Settings come from .env, falling back to .env.example (where the default model and its digest are pinned).
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = fileURLToPath(new URL('../', import.meta.url));
const ENV_FILE = join(REPO_ROOT, '.env');
const ENV_EXAMPLE = join(REPO_ROOT, '.env.example');
// The host's view of Ollama (containers use host.docker.internal instead).
const OLLAMA_URL = process.env.OLLAMA_HOST_URL ?? 'http://127.0.0.1:11434';

function readEnvFile(path: string): Map<string, string> {
  const values = new Map<string, string>();
  if (!existsSync(path)) return values;
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const match = /^([A-Z_]+)=(.*)$/.exec(line.trim());
    if (match?.[1] !== undefined) values.set(match[1], match[2] ?? '');
  }
  return values;
}

function setting(name: string): string {
  return readEnvFile(ENV_FILE).get(name) || readEnvFile(ENV_EXAMPLE).get(name) || '';
}

function recordInEnv(name: string, value: string): void {
  const text = existsSync(ENV_FILE) ? readFileSync(ENV_FILE, 'utf8') : readFileSync(ENV_EXAMPLE, 'utf8');
  const pattern = new RegExp(`^${name}=.*$`, 'm');
  const line = `${name}=${value}`;
  writeFileSync(ENV_FILE, pattern.test(text) ? text.replace(pattern, line) : `${text.trimEnd()}\n${line}\n`);
}

async function main(): Promise<void> {
  const model = setting('OLLAMA_MODEL');
  const pinnedDigest = setting('OLLAMA_MODEL_DIGEST');
  if (model === '') throw new Error('OLLAMA_MODEL is not set in .env or .env.example');

  const version = await fetch(`${OLLAMA_URL}/api/version`)
    .then((response) => response.json() as Promise<{ version: string }>)
    .catch(() => null);
  if (version === null) {
    throw new Error(`Ollama is not running at ${OLLAMA_URL}. Start it natively: brew services start ollama`);
  }
  console.log(`Ollama ${version.version} at ${OLLAMA_URL}`);

  console.log(`Pulling ${model} (a no-op when it is already here)...`);
  const pull = await fetch(`${OLLAMA_URL}/api/pull`, { method: 'POST', body: JSON.stringify({ model, stream: false }) });
  if (!pull.ok) throw new Error(`Pull of ${model} failed: HTTP ${pull.status}`);

  const tags = (await (await fetch(`${OLLAMA_URL}/api/tags`)).json()) as { models: { name: string; digest: string }[] };
  const digest = tags.models.find((entry) => entry.name === model)?.digest;
  if (digest === undefined) throw new Error(`${model} is not listed after the pull`);

  if (pinnedDigest !== '' && pinnedDigest !== digest) {
    throw new Error(`${model} has digest ${digest}, but ${pinnedDigest} is pinned. Pull the pinned build or update the pin deliberately.`);
  }
  console.log(`${model} @ ${digest}${pinnedDigest === '' ? ' (no pin yet)' : ': matches the pin'}`);

  const env = readEnvFile(ENV_FILE);
  if ((env.get('OLLAMA_MODEL') ?? '') === '' || (env.get('OLLAMA_MODEL_DIGEST') ?? '') === '') {
    recordInEnv('OLLAMA_MODEL', model);
    recordInEnv('OLLAMA_MODEL_DIGEST', digest);
    console.log('Recorded the model and its digest in .env');
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

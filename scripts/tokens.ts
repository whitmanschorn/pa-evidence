// make tokens: creates one random token per role (nurse, admin, probe).
//   .env           AUTH_TOKENS=role:subject:sha256(token),...  (hashes only; the API reads this)
//                  PROBE_TOKEN=<plaintext>                       (the container healthcheck's own token; health:read only)
//   .tokens.local  role=token lines, plaintext, for you to paste into the UI or curl
// Both files are gitignored. Running it again replaces every token.
import { createHash, randomBytes } from 'node:crypto';
import { chmodSync, copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = fileURLToPath(new URL('../', import.meta.url));
const ENV_FILE = join(REPO_ROOT, '.env');
const ENV_EXAMPLE = join(REPO_ROOT, '.env.example');
const TOKENS_FILE = join(REPO_ROOT, '.tokens.local');
const ROLES = [
  { role: 'nurse', sub: 'nurse-1' },
  { role: 'admin', sub: 'admin-1' },
  { role: 'probe', sub: 'probe-1' },
];

function newToken(): string {
  return randomBytes(32).toString('base64url');
}

function sha256(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

// Replaces "NAME=..." in the env text, or appends it.
function setEnvLine(envText: string, name: string, value: string): string {
  const line = `${name}=${value}`;
  const pattern = new RegExp(`^${name}=.*$`, 'm');
  return pattern.test(envText) ? envText.replace(pattern, line) : `${envText.trimEnd()}\n${line}\n`;
}

function main(): void {
  if (!existsSync(ENV_FILE)) {
    copyFileSync(ENV_EXAMPLE, ENV_FILE);
  }
  const tokens = ROLES.map((entry) => ({ ...entry, token: newToken() }));
  const authTokens = tokens.map((entry) => `${entry.role}:${entry.sub}:${sha256(entry.token)}`).join(',');
  const probeToken = tokens.find((entry) => entry.role === 'probe')?.token ?? '';

  let envText = readFileSync(ENV_FILE, 'utf8');
  envText = setEnvLine(envText, 'AUTH_TOKENS', authTokens);
  envText = setEnvLine(envText, 'PROBE_TOKEN', probeToken);
  writeFileSync(ENV_FILE, envText);

  writeFileSync(TOKENS_FILE, `${tokens.map((entry) => `${entry.role}=${entry.token}`).join('\n')}\n`);
  chmodSync(TOKENS_FILE, 0o600);
  chmodSync(ENV_FILE, 0o600);

  console.log('Wrote token hashes to .env (AUTH_TOKENS) and the tokens to .tokens.local (nurse, admin, probe).');
}

main();

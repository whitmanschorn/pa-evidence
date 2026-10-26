import { readFileSync } from 'node:fs';
import { prettifyError, z } from 'zod';
import type { FhirAuthConfig } from './core/fhir/fhirAuth.js';

// Environment variables, parsed once at startup. A missing or malformed value stops the service with a list of
// what is wrong (never the values themselves). Every variable is documented in .env.example.
const optional = z.preprocess((value) => (value === '' ? undefined : value), z.string().optional());
const csv = z.string().transform((value) => value.split(',').map((part) => part.trim()).filter((part) => part !== ''));

const EnvSchema = z
  .object({
    PORT: z.coerce.number().int().positive().default(8080),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
    FHIR_BASE_URL: z.url(),
    FHIR_AUTH: z.enum(['none', 'bearer', 'smart']).default('none'),
    FHIR_BEARER_TOKEN: optional,
    SMART_TOKEN_URL: optional,
    SMART_CLIENT_ID: optional,
    SMART_PRIVATE_KEY_PATH: optional,
    SMART_KEY_ID: optional,
    SMART_ALG: z.enum(['RS384', 'ES384']).default('RS384'),
    SMART_SCOPES: optional,
    OLLAMA_BASE_URL: z.url().default('http://127.0.0.1:11434'),
    OLLAMA_EXPECTED_VERSION: optional,
    AUTH_TOKENS: z.string().min(1, 'run `make tokens`'),
    AUDIT_DB_PATH: z.string().default('var/audit.db'),
    POLICIES_DIR: z.string().default('data/policies'),
    // Which model, its prompts, and its call settings and timeouts: one version folder each (see modelVersions.ts).
    MODELS_DIR: z.string().default('data/models'),
    TERMINOLOGY_DIR: z.string().default('data/terminology'),
    REQUESTS_DIRS: csv.default(['data/requests', 'eval/synthea-requests']),
    UI_DIR: z.string().default('apps/web/dist'),
  })
  .superRefine((env, context) => {
    if (env.FHIR_AUTH === 'bearer' && env.FHIR_BEARER_TOKEN === undefined) {
      context.addIssue({ code: 'custom', path: ['FHIR_BEARER_TOKEN'], message: 'required when FHIR_AUTH=bearer' });
    }
    if (env.FHIR_AUTH === 'smart') {
      for (const name of ['SMART_TOKEN_URL', 'SMART_CLIENT_ID', 'SMART_PRIVATE_KEY_PATH', 'SMART_KEY_ID', 'SMART_SCOPES'] as const) {
        if (env[name] === undefined) {
          context.addIssue({ code: 'custom', path: [name], message: 'required when FHIR_AUTH=smart' });
        }
      }
    }
  });

export type Config = z.infer<typeof EnvSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    throw new Error(`Invalid configuration:\n${prettifyError(parsed.error)}`);
  }
  return parsed.data;
}

export function fhirAuthConfig(config: Config): FhirAuthConfig {
  if (config.FHIR_AUTH === 'bearer') {
    return { mode: 'bearer', token: config.FHIR_BEARER_TOKEN ?? '' };
  }
  if (config.FHIR_AUTH === 'smart') {
    return {
      mode: 'smart',
      tokenUrl: config.SMART_TOKEN_URL ?? '',
      clientId: config.SMART_CLIENT_ID ?? '',
      privateKeyPem: readFileSync(config.SMART_PRIVATE_KEY_PATH ?? '', 'utf8'),
      keyId: config.SMART_KEY_ID ?? '',
      alg: config.SMART_ALG,
      scopes: config.SMART_SCOPES ?? '',
    };
  }
  return { mode: 'none' };
}

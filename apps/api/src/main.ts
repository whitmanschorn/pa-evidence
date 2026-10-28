import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { buildApp } from './app.js';
import { fhirAuthConfig, loadConfig } from './config.js';
import { openAuditStore } from './core/audit/auditStore.js';
import { createStaticTokenVerifier, parseAuthTokens } from './core/auth/identityVerifier.js';
import { createFhirAuth } from './core/fhir/fhirAuth.js';
import { connectLocalModel } from './core/llm/localModel.js';
import { createModelRegistry } from './core/llm/modelRegistry.js';
import { loadModelVersions } from './core/llm/modelVersions.js';
import { createHttpFhirClient } from './core/fhir/fhirClient.js';
import { checkFhir, checkModel } from './core/health.js';
import { createPolicyRegistry } from './core/policy/policyRegistry.js';
import { loadPolicyStore } from './core/policy/policyStore.js';
import { loadRequestStore } from './core/requests/requestStore.js';
import { checkBindings } from './core/rules/checkBindings.js';
import { loadTerminology } from './core/terminology.js';
import { createLogger } from './http/httpLogger.js';

// Reads config, builds every dependency, and listens. Anything wrong at startup stops the process with a reason.
const config = loadConfig();
const logger = createLogger(config.LOG_LEVEL);

try {
  const terminology = loadTerminology(config.TERMINOLOGY_DIR);
  // Every criterion in every policy version must have a binding (in that version's rules-engine-config.json) whose
  // params parse, or the service does not start.
  const policies = createPolicyRegistry({
    load: () => loadPolicyStore([config.POLICIES_DIR]),
    check: (store) => checkBindings(store.all(), terminology),
  });
  const requests = loadRequestStore(config.REQUESTS_DIRS);
  const fhirAuth = createFhirAuth(fhirAuthConfig(config));
  const fhir = createHttpFhirClient({ baseUrl: config.FHIR_BASE_URL, authHeader: fhirAuth });
  mkdirSync(dirname(config.AUDIT_DB_PATH), { recursive: true });
  const audit = openAuditStore(config.AUDIT_DB_PATH);
  // Which model, its prompts and how it is called: the version folder in effect under MODELS_DIR (see modelVersions.ts).
  const models = createModelRegistry({
    load: () => loadModelVersions(config.MODELS_DIR),
    connect: (version) => connectLocalModel(config.OLLAMA_BASE_URL, version),
  });

  const app = buildApp({
    fhir,
    policies,
    requests,
    terminology,
    models,
    mcpUrl: `http://127.0.0.1:${config.PORT}/mcp`,
    verifier: createStaticTokenVerifier(parseAuthTokens(config.AUTH_TOKENS)),
    audit,
    logger,
    readiness: {
      fhir: () => checkFhir(config.FHIR_BASE_URL, fhirAuth),
      model: () =>
        checkModel({
          baseUrl: config.OLLAMA_BASE_URL,
          model: models.current().name,
          expectedDigest: models.current().digest,
          expectedVersion: config.OLLAMA_EXPECTED_VERSION,
        }),
    },
    uiDir: config.UI_DIR,
  });

  const server = app.listen(config.PORT, () => {
    logger.info(
      {
        port: config.PORT,
        fhir_auth: config.FHIR_AUTH,
        model_version: models.current().folder,
        requests: requests.list().length,
        policies: policies.versions().map((version) => `${version.policy_id}@${version.version}`),
      },
      'listening',
    );
  });

  const shutdown = () => {
    server.close(() => {
      audit.close();
      process.exit(0);
    });
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
} catch (error) {
  logger.fatal({ reason: error instanceof Error ? error.message : String(error) }, 'startup failed');
  process.exit(1);
}

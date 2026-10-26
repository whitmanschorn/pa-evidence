import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { buildApp } from './app.js';
import { fhirAuthConfig, loadConfig } from './config.js';
import { openAuditStore } from './core/audit/auditStore.js';
import { createStaticTokenVerifier, parseAuthTokens } from './core/auth/identityVerifier.js';
import { createFhirAuth } from './core/fhir/fhirAuth.js';
import { createHttpFhirClient } from './core/fhir/fhirClient.js';
import { checkFhir, checkModel } from './core/health.js';
import { createPolicyRegistry } from './core/policy/policyRegistry.js';
import { loadPolicyStore } from './core/policy/policyStore.js';
import { loadRequestStore } from './core/requests/requestStore.js';
import { BINDINGS } from './core/rules/bindings.js';
import { checkBindings } from './core/rules/checkBindings.js';
import { loadTerminology } from './core/terminology.js';
import { createLogger } from './http/httpLogger.js';

// Reads config, builds every dependency, and listens. Anything wrong at startup stops the process with a reason.
const config = loadConfig();
const logger = createLogger(config.LOG_LEVEL);

try {
  const terminology = loadTerminology(config.TERMINOLOGY_DIR);
  // Every criterion in every policy version must have a binding whose params parse, or the service does not start.
  const policies = createPolicyRegistry({
    load: () => loadPolicyStore([config.POLICIES_DIR]),
    check: (store) => checkBindings(store.all(), BINDINGS, terminology),
  });
  const requests = loadRequestStore(config.REQUESTS_DIRS);
  const fhirAuth = createFhirAuth(fhirAuthConfig(config));
  const fhir = createHttpFhirClient({ baseUrl: config.FHIR_BASE_URL, authHeader: fhirAuth });
  mkdirSync(dirname(config.AUDIT_DB_PATH), { recursive: true });
  const audit = openAuditStore(config.AUDIT_DB_PATH);

  const app = buildApp({
    fhir,
    policies,
    requests,
    terminology,
    bindings: BINDINGS,
    verifier: createStaticTokenVerifier(parseAuthTokens(config.AUTH_TOKENS)),
    audit,
    logger,
    readiness: {
      fhir: () => checkFhir(config.FHIR_BASE_URL, fhirAuth),
      model: () =>
        checkModel({
          baseUrl: config.OLLAMA_BASE_URL,
          model: config.OLLAMA_MODEL,
          expectedDigest: config.OLLAMA_MODEL_DIGEST,
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

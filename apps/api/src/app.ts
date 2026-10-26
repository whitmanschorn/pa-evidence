import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import express, { type Express, type RequestHandler } from 'express';
import type { Logger } from 'pino';
import type { AuditStore } from './core/audit/auditStore.js';
import type { IdentityVerifier } from './core/auth/identityVerifier.js';
import type { FhirClient } from './core/fhir/fhirClient.js';
import type { ModelRegistry } from './core/llm/modelRegistry.js';
import type { DependencyCheck } from './core/health.js';
import type { PolicyRegistry } from './core/policy/policyRegistry.js';
import type { RequestStore } from './core/requests/requestStore.js';
import type { Binding } from './core/rules/types.js';
import type { Terminology } from './core/terminology.js';
import { authenticate } from './http/authenticate.js';
import { errorHandler, notFound } from './http/errors.js';
import { httpLogger } from './http/httpLogger.js';
import { outputGuard } from './http/outputGuard.js';
import { requestId } from './http/requestId.js';
import { adminRoutes } from './http/routes/adminRoutes.js';
import { agentRoutes } from './http/routes/agentRoutes.js';
import { auditRoutes } from './http/routes/auditRoutes.js';
import { healthRoutes } from './http/routes/healthRoutes.js';
import { mcpRoutes } from './http/routes/mcpRoutes.js';
import { requestRoutes } from './http/routes/requestRoutes.js';
import { securityHeaders } from './http/securityHeaders.js';

// Everything the app needs, built once in main.ts (or in a test) and passed in. No module reads config itself.
export type AppDeps = {
  fhir: FhirClient;
  policies: PolicyRegistry;
  requests: RequestStore;
  terminology: Terminology;
  bindings: Record<string, Binding>;
  // The model versions in data/models. Without them every summary is the code template and agent runs are unavailable.
  models?: ModelRegistry;
  // This service's own /mcp: the agent reaches its tools through it, with the caller's token.
  mcpUrl?: string;
  verifier: IdentityVerifier;
  audit: AuditStore;
  logger: Logger;
  readiness: { fhir: () => Promise<DependencyCheck>; model: () => Promise<DependencyCheck> };
  uiDir?: string;
};

// The composition root. The middleware order is the security story.
export function buildApp(deps: AppDeps): Express {
  const app = express();
  app.disable('x-powered-by');

  app.use(requestId());
  app.use(httpLogger(deps.logger));
  app.use(outputGuard());
  if (deps.uiDir !== undefined && existsSync(deps.uiDir)) {
    app.use('/ui', express.static(deps.uiDir), spaFallback(deps.uiDir)); // static only: no data, no secrets
  }
  app.use(securityHeaders());
  app.use(authenticate(deps.verifier, deps.audit)); // nothing returning data is above this line
  app.use(express.json({ limit: '100kb' }));

  app.use(healthRoutes(deps));
  app.use(requestRoutes(deps));
  app.use(auditRoutes(deps));
  app.use(adminRoutes(deps));
  app.use(mcpRoutes(deps));
  app.use(agentRoutes(deps));

  app.use(notFound());
  app.use(errorHandler(deps.logger));
  return app;
}

// Client-side routes (/ui/requests/PA-001) all load the single-page app.
function spaFallback(uiDir: string): RequestHandler {
  return (req, res, next) => {
    if (req.method !== 'GET') {
      next();
      return;
    }
    res.sendFile(join(resolve(uiDir), 'index.html')); // sendFile needs an absolute path
  };
}


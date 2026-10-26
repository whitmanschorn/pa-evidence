import { once } from 'node:events';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Writable } from 'node:stream';
import { readAgentEvents, type AgentEvent } from '@pa/shared';
import { buildApp, type AppDeps } from '../../src/app.js';
import { openAuditStore, type AuditStore } from '../../src/core/audit/auditStore.js';
import { createStaticTokenVerifier, parseAuthTokens, sha256OfToken } from '../../src/core/auth/identityVerifier.js';
import type { LocalModel } from '../../src/core/llm/localModel.js';
import { createPolicyRegistry } from '../../src/core/policy/policyRegistry.js';
import { loadPolicyStore } from '../../src/core/policy/policyStore.js';
import { BINDINGS } from '../../src/core/rules/bindings.js';
import { checkBindings } from '../../src/core/rules/checkBindings.js';
import { createLogger } from '../../src/http/httpLogger.js';
import { modelRegistryFor } from './mockModel.js';
import { POLICIES_DIR, suppliedDeps } from './suppliedWorld.js';

export const TOKENS = {
  nurse: 'nurse-token-for-tests',
  admin: 'admin-token-for-tests',
  probe: 'probe-token-for-tests',
};

export const bearer = (role: keyof typeof TOKENS) => ({ Authorization: `Bearer ${TOKENS[role]}` });

// The real app over the supplied data: in-memory FHIR, an audit store on a fixed clock, known tokens,
// logs captured as text, and readiness checks a test can override.
export function testApp(overrides: Partial<AppDeps> & { policiesDir?: string; auditPath?: string } = {}) {
  const logChunks: string[] = [];
  const logStream = new Writable({
    write(chunk: Buffer, _encoding, callback) {
      logChunks.push(chunk.toString());
      callback();
    },
  });
  const supplied = suppliedDeps();
  const policiesDir = overrides.policiesDir ?? POLICIES_DIR;
  const audit: AuditStore = openAuditStore(overrides.auditPath ?? ':memory:', () => new Date('2026-10-26T12:00:00.000Z'));
  const authTokens = (Object.keys(TOKENS) as (keyof typeof TOKENS)[])
    .map((role) => `${role}:${role}-1:${sha256OfToken(TOKENS[role])}`)
    .join(',');

  const deps: AppDeps = {
    ...supplied,
    policies: createPolicyRegistry({
      load: () => loadPolicyStore([policiesDir]),
      check: (store) => checkBindings(store.all(), BINDINGS, supplied.terminology),
    }),
    verifier: createStaticTokenVerifier(parseAuthTokens(authTokens)),
    audit,
    logger: createLogger('info', logStream),
    readiness: {
      fhir: async () => ({ ok: true, required: true, detail: { http_status: 200, fhir_version: '4.0.1', ms: 3 } }),
      model: async () => ({ ok: false, required: false, detail: { error: 'unreachable' } }),
    },
    ...overrides,
  };
  return { app: buildApp(deps), audit, logs: () => logChunks.join('') };
}

// Audit events are written when the response closes, a moment after the client has the body.
export function settle(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 20));
}

// The app on a real port, for anything that calls /mcp over HTTP: the agent reaches the tools through the service's
// own /mcp with the caller's token, exactly as in production. The port is known first, so the app is built with its
// own /mcp address.
export async function startTestServer(overrides: Parameters<typeof testApp>[0] & { model?: LocalModel } = {}) {
  const server = createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const models = overrides.model === undefined ? undefined : modelRegistryFor(overrides.model);
  const { app, audit, logs } = testApp({ ...overrides, models, mcpUrl: `${baseUrl}/mcp` });
  server.on('request', app);
  return { baseUrl, audit, logs, close: () => new Promise<void>((resolve) => server.close(() => resolve())) };
}

// Reads a whole agent run (server-sent events) with the shared reader the UI and the CLI use.
export async function readAgentRun(baseUrl: string, requestId: string, role: keyof typeof TOKENS = 'nurse'): Promise<AgentEvent[]> {
  const response = await fetch(`${baseUrl}/requests/${requestId}/agent-runs`, { method: 'POST', headers: bearer(role) });
  const events: AgentEvent[] = [];
  if (response.body !== null) await readAgentEvents(response.body, (event) => events.push(event));
  return events;
}

import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { Router } from 'express';
import type { AppDeps } from '../../app.js';
import { buildMcpServer } from '../../mcp/mcpServer.js';
import { allow } from '../allow.js';
import { auditEventFor } from '../auditEvents.js';

export function mcpRoutes(deps: AppDeps): Router {
  const router = Router();

  // MCP Streamable HTTP, stateless: a fresh server and transport per POST, JSON responses. Same auth as everything.
  router.post('/mcp', allow('evidence:read', deps.audit), async (req, res) => {
    const server = buildMcpServer(deps, (fields) => deps.audit.append(auditEventFor(res, { assembler: 'agent', ...fields })));
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.on('close', () => {
      void transport.close();
      void server.close();
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  });

  return router;
}

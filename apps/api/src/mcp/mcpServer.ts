import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AuditEventInput } from '../core/audit/auditStore.js';
import type { PacketDeps } from '../core/packet/assemblePacket.js';
import { assertNoForbiddenTerms } from '../core/safety/forbiddenTerms.js';
import {
  EvaluateCriterionInput,
  GetPolicyInput,
  GetRequestInput,
  VerifySourcesInput,
  evaluateCriterion,
  getPolicy,
  getRequest,
  verifySources,
} from '../core/tools/evidenceTools.js';

// The MCP server: the four evidence tools, published over Streamable HTTP at POST /mcp (behind the same auth as
// every route). Built per request, so each tool call knows who is calling and can be audited.
// Every result passes the same banned-word check as JSON responses.
export function buildMcpServer(deps: PacketDeps, audit: (event: Partial<AuditEventInput> & Pick<AuditEventInput, 'action'>) => void): McpServer {
  const server = new McpServer({ name: 'pa-evidence', version: '1.0.0' });

  async function respond(toolName: string, requestId: string | null, run: () => Promise<unknown> | unknown) {
    try {
      const result = await run();
      const text = JSON.stringify(result);
      assertNoForbiddenTerms(text);
      const sources = (result as { sources?: string[] }).sources ?? [];
      audit({ action: 'mcp.call', tool_name: toolName, request_id: requestId, cited_sources: sources });
      return { content: [{ type: 'text' as const, text }] };
    } catch (error) {
      const code = error instanceof Error && error.name === 'NotFoundError' ? 'not_found' : 'internal_error';
      audit({ action: 'mcp.call', tool_name: toolName, outcome: 'error', http_status: code === 'not_found' ? 404 : 500, request_id: requestId });
      return { content: [{ type: 'text' as const, text: JSON.stringify({ error: code }) }], isError: true };
    }
  }

  server.registerTool(
    'get_request',
    { description: 'The structured fields of a request form: request date, policy id, requested drug, claimed diagnosis and attested values.', inputSchema: GetRequestInput },
    ({ request_id }) => respond('get_request', request_id, () => getRequest(deps, request_id)),
  );
  server.registerTool(
    'get_policy',
    { description: 'The policy version in effect on the request date, with the id and requirement of every criterion.', inputSchema: GetPolicyInput },
    ({ policy_id, request_date }) => respond('get_policy', null, () => getPolicy(deps, policy_id, request_date)),
  );
  server.registerTool(
    'evaluate_criterion',
    { description: "One criterion's status (met, not_met, missing or conflicting), cited FHIR sources, value, date, attested value and the document to request.", inputSchema: EvaluateCriterionInput },
    ({ request_id, criterion_id }) => respond('evaluate_criterion', request_id, () => evaluateCriterion(deps, request_id, criterion_id)),
  );
  server.registerTool(
    'verify_sources',
    { description: 'Which of these FHIR references ("Type/id") exist on the FHIR server.', inputSchema: VerifySourcesInput },
    ({ refs }) => respond('verify_sources', null, () => verifySources(deps, refs)),
  );
  return server;
}

import { createMCPClient } from '@ai-sdk/mcp';
import type { AgentEvent } from '@pa/shared';
import type { LocalModel } from '../core/llm/localModel.js';
import { assemblePacket, type PacketDeps } from '../core/packet/assemblePacket.js';
import { runAgent, type AgentRunResult } from './runAgent.js';

// Everything one agent run needs: the rules engine's packet (what the agent is checked against),
// the drug name for the letter, the member's names (only to check the draft never contains them), and an MCP
// connection to our own /mcp carrying the caller's token.
export async function runAgentForRequest(input: {
  deps: PacketDeps;
  model: LocalModel;
  mcpUrl: string;
  bearerToken: string;
  requestId: string;
  onEvent: (event: AgentEvent) => void;
}): Promise<AgentRunResult & { rulesRoute: string }> {
  const { deps, requestId } = input;
  const { packet: rulesPacket } = await assemblePacket({ ...deps, summaryModel: undefined }, requestId);

  const form = deps.requests.get(requestId);
  const policy = form === undefined ? null : deps.policies.policyFor(form.policy_id, form.request_date)?.policy;
  const covered = policy?.covered_medications.find((medication) => medication.rxnorm === form?.requested_medication.rxnorm);
  // "semaglutide (injection)" -> "semaglutide"; otherwise the drug as the form names it.
  const drugName = covered?.display.split(' (')[0] ?? form?.requested_medication.display ?? 'the requested drug';

  const patient = (await deps.fhir.read(rulesPacket.patient)) as fhir4.Patient | null;
  const memberNames = (patient?.name ?? []).flatMap((name) => [name.family ?? '', ...(name.given ?? []), name.text ?? '']).filter((part) => part !== '');

  // The AI SDK's MCP client, over Streamable HTTP to our own /mcp with the caller's token: every tool call is
  // authenticated, permission-checked and audited like any other client's, and the agent can do no more than the caller.
  const mcp = await createMCPClient({
    transport: { type: 'http', url: input.mcpUrl, headers: { Authorization: `Bearer ${input.bearerToken}` } },
  });
  try {
    const tools = await mcp.tools();
    const result = await runAgent({ requestId, tools, model: input.model, rulesPacket, drugName, memberNames, onEvent: input.onEvent });
    return { ...result, rulesRoute: rulesPacket.route };
  } finally {
    await mcp.close();
  }
}

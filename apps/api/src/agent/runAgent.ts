import {
  AgentCriterionSchema,
  CriterionStatusSchema,
  type AgentCriterion,
  type AgentEvent,
  type DraftEvent,
  type DraftItem,
  type Packet,
  type Route,
} from '@pa/shared';
import { NoObjectGeneratedError, Output, ToolLoopAgent, generateText, hasToolCall, isStepCount, type ModelMessage, type ToolSet } from 'ai';
import { z } from 'zod';
import { wrapClinicalData } from '../core/llm/clinicalData.js';
import { callSettings, type LocalModel } from '../core/llm/localModel.js';
import { loadPrompt } from '../core/llm/prompts.js';
import { TOOL } from '../core/tools/evidenceTools.js';
import { DraftSchema, checkDraft, draftEvidence, renderDraft, templateItems } from './draft.js';

// The agent: the model gathers the evidence by calling MCP tools, then drafts the provider request.
//
// The tool loop is the AI SDK's ToolLoopAgent. A ReAct loop is easy to write ourselves, and that is the trap: like
// rolling your own crypto, it is easy to get subtly wrong, and it never improves on its own. The library's loop is
// tested and maintained, and we pick up its fixes by upgrading. See README.md, "Why the agent loop is the AI SDK's".
//
// What stays here is what the library cannot know, and each piece is a security control:
//   - tool results go back to the model inside <clinical_data> tags (prompt injection)
//   - the agent's packet is built in code from the tool results it received; the model never restates a status
//   - the route is computed in code, and every criterion is compared with the rules engine's packet
//   - the draft is checked against the rules engine's packet, with a template fallback
//
// The step limit, output caps and timeouts come from the model version in effect (data/models).

const AGENT_PROMPT = loadPrompt('agent.v1');
const DRAFT_PROMPT = loadPrompt('draft.v1');
export const AGENT_PROMPT_VERSION = AGENT_PROMPT.version;
export const DRAFT_PROMPT_VERSION = DRAFT_PROMPT.version;

// What evaluate_criterion returned.
const ToolCriterionSchema = z.object({ criterion_id: z.string(), status: CriterionStatusSchema, sources: z.array(z.string()) });
type ToolCriterion = z.infer<typeof ToolCriterionSchema>;

export type AgentRunResult = {
  steps: number;
  toolCalls: number; // every call the model made
  invalidToolCalls: number; // calls the SDK rejected (bad name or arguments) or the tool answered with an error
  criteria: AgentCriterion[];
  route: Route;
  warnings: string[];
  draft: DraftEvent | null;
  llmMs: number;
};

export async function runAgent(input: {
  requestId: string;
  tools: ToolSet; // the MCP server's tools, from the AI SDK's MCP client
  model: LocalModel;
  rulesPacket: Packet; // the rules engine's packet: what the agent's packet and draft are checked against
  drugName: string;
  memberNames: string[]; // only for the draft's identifier check; never sent to the model
  onEvent: (event: AgentEvent) => void;
}): Promise<AgentRunResult> {
  const { requestId, model, rulesPacket, onEvent } = input;
  const started = performance.now();
  // One deadline for the whole run, shared by the tool loop and the draft. When it passes, the run ends with what the
  // agent got to: unreached criteria show as not evaluated, and the draft is the rules engine's own wording.
  const deadline = AbortSignal.timeout(model.timeouts_ms.agent_run);
  const runWarnings: string[] = [];

  // 1. The tool loop (the library's). Each evaluate_criterion result is kept as it arrives.
  const evaluated = new Map<string, ToolCriterion>();
  let steps = 0;
  let toolCalls = 0;
  let invalidToolCalls = 0;
  let stepStarted = performance.now();
  const agent = new ToolLoopAgent({
    model: model.languageModel,
    instructions: AGENT_PROMPT.text,
    tools: tagToolResults(input.tools),
    // Stop once the sources are verified (the last tool in the prompt's order), or after max_steps turns.
    stopWhen: [hasToolCall(TOOL.verifySources), isStepCount(model.agent.max_steps)],
    maxOutputTokens: model.max_output_tokens.tool_step,
    ...callSettings(model),
  });
  try {
    await agent.generate({
      prompt: `Assemble the evidence packet for request ${requestId}.`,
      abortSignal: deadline,
      timeout: { stepMs: model.timeouts_ms.call },
      onStepEnd: (step) => {
        const ms = Math.round(performance.now() - stepStarted);
        stepStarted = performance.now();
        toolCalls += step.toolCalls.length;
        invalidToolCalls += step.content.filter((part) => part.type === 'tool-error').length;
        for (const result of step.toolResults) {
          steps += 1;
          const output = toolJson(result.output);
          if (isToolError(result.output)) invalidToolCalls += 1;
          const args = (result.input ?? {}) as Record<string, unknown>;
          onEvent({ type: 'step', step: steps, tool: result.toolName, arguments: args, result: traceSummary(result.toolName, output), ms });
          const criterion = result.toolName === TOOL.evaluateCriterion ? ToolCriterionSchema.safeParse(output) : null;
          if (criterion?.success === true) evaluated.set(criterion.data.criterion_id, criterion.data);
        }
      },
    });
  } catch (error) {
    if (!deadline.aborted) throw error;
    runWarnings.push('agent_time_limit');
  }

  // 2. The agent's packet: built in code from the evaluate_criterion results it received, compared with the rules engine.
  const criteria = rulesPacket.criteria.map((rules) => {
    const fromTool = evaluated.get(rules.id);
    return AgentCriterionSchema.parse({
      id: rules.id,
      status: fromTool?.status ?? null,
      sources: fromTool?.sources ?? [],
      check: fromTool === undefined ? 'not_evaluated' : 'evaluated',
      rules_status: rules.status,
      agrees_with_rules: fromTool?.status === rules.status,
    });
  });
  const warnings = [
    ...runWarnings,
    ...criteria.filter((criterion) => criterion.check === 'not_evaluated').map((criterion) => `agent_not_evaluated:${criterion.id}`),
  ];
  const allMet = criteria.every((criterion) => criterion.status === 'met');
  const route: Route = allMet ? 'evidence_complete' : 'clinician_review';
  onEvent({ type: 'packet', criteria, route, warnings });

  // 3. The provider-request draft, only when the rules engine says something is needed.
  let draft: DraftEvent | null = null;
  const needed = templateItems(rulesPacket);
  if (rulesPacket.route === 'clinician_review' && needed.length > 0) {
    const agreesWithRules = criteria.every((criterion) => criterion.agrees_with_rules);
    let result: { items: DraftItem[]; source: 'model' | 'template'; failures: string[] };
    if (deadline.aborted) {
      result = { items: needed, source: 'template', failures: ['agent_time_limit'] };
    } else if (!agreesWithRules) {
      result = { items: needed, source: 'template', failures: ['agent_disagrees_with_rules'] };
    } else {
      result = await checkedDraft(model, requestId, rulesPacket, input.memberNames, deadline);
    }
    draft = {
      type: 'draft',
      source: result.source,
      text: renderDraft(requestId, input.drugName, result.items),
      items: result.items,
      check_failures: result.failures,
    };
    onEvent(draft);
  }
  return { steps, toolCalls, invalidToolCalls, criteria, route, warnings, draft, llmMs: Math.round(performance.now() - started) };
}

// The model writes one ask per criterion that needs a document, from that criterion's facts only. The asks are checked
// against the rules engine's packet; one retry with the problems; otherwise the rules engine's own wording.
async function checkedDraft(
  model: LocalModel,
  requestId: string,
  rulesPacket: Packet,
  memberNames: string[],
  deadline: AbortSignal,
): Promise<{ items: DraftItem[]; source: 'model' | 'template'; failures: string[] }> {
  const needed = draftEvidence(rulesPacket);
  const messages: ModelMessage[] = [
    { role: 'user', content: `Request ${requestId}.\n${wrapClinicalData(JSON.stringify(needed, null, 2))}` },
  ];
  const failures = new Set<string>();
  try {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const reply = await draftReply(model, messages, deadline);
      if (reply === null) {
        failures.add('not_json');
        continue;
      }
      const check = checkDraft(reply.items, rulesPacket, memberNames);
      if (check.failures.length === 0) return { items: reply.items, source: 'model', failures: [...failures] };
      check.failures.forEach((failure) => failures.add(failure));
      messages.push({
        role: 'user',
        content: `Those asks failed these checks:\n${check.problems.map((problem) => `- ${problem}`).join('\n')}\nReply again as JSON.`,
      });
    }
  } catch (error) {
    if (!deadline.aborted) throw error;
    failures.add('agent_time_limit');
  }
  return { items: templateItems(rulesPacket), source: 'template', failures: [...failures] };
}

// One draft reply, validated against DraftSchema by the AI SDK; null when it does not validate.
async function draftReply(model: LocalModel, messages: ModelMessage[], deadline: AbortSignal): Promise<{ items: DraftItem[] } | null> {
  try {
    const result = await generateText({
      model: model.languageModel,
      instructions: DRAFT_PROMPT.text,
      messages,
      output: Output.object({ schema: DraftSchema }),
      maxOutputTokens: model.max_output_tokens.draft,
      abortSignal: deadline,
      timeout: model.timeouts_ms.call,
      ...callSettings(model),
    });
    messages.push({ role: 'assistant', content: JSON.stringify(result.output) });
    return result.output;
  } catch (error) {
    if (!NoObjectGeneratedError.isInstance(error)) throw error;
    messages.push({ role: 'assistant', content: error.text ?? '' }, { role: 'user', content: 'That was not the JSON asked for.' });
    return null;
  }
}

// Every tool result goes back to the model as data, never as instructions (the AI SDK's toModelOutput hook).
function tagToolResults(tools: ToolSet): ToolSet {
  const tagged: ToolSet = {};
  for (const [name, tool] of Object.entries(tools)) {
    tagged[name] = {
      ...tool,
      toModelOutput: ({ output }: { output: unknown }) => ({
        type: 'text' as const,
        value: wrapClinicalData(toolText(output), `tool:${name}`),
      }),
    };
  }
  return tagged;
}

// MCP tool results come back as { content: [{ type: 'text', text }] }; our tools put JSON in that text.
function toolText(output: unknown): string {
  const content = (output as { content?: { type: string; text?: string }[] } | undefined)?.content ?? [];
  return content.filter((part) => part.type === 'text').map((part) => part.text ?? '').join('\n');
}

// A rejected call: the MCP server refused the arguments (isError, with a plain-text message, e.g. a missing request_id)
// or our tool answered { error }. Either way the model got no result from it.
export function isToolError(output: unknown): boolean {
  if ((output as { isError?: boolean } | undefined)?.isError === true) return true;
  const json = toolJson(output);
  return json !== null && typeof json === 'object' && 'error' in json;
}

function toolJson(output: unknown): unknown {
  try {
    return JSON.parse(toolText(output));
  } catch {
    return null;
  }
}

// A short, chart-free summary of a tool result for the trace the nurse sees.
function traceSummary(tool: string, result: unknown): Record<string, unknown> {
  const value = (result ?? {}) as Record<string, unknown>;
  if ('error' in value) return { error: value.error };
  if (tool === TOOL.evaluateCriterion) return { criterion_id: value.criterion_id, status: value.status, sources: value.sources };
  if (tool === TOOL.getPolicy) return { version: value.version, criteria: (value.criteria as { id: string }[] | undefined)?.map((criterion) => criterion.id) };
  if (tool === TOOL.getRequest) return { policy_id: value.policy_id, request_date: value.request_date };
  if (tool === TOOL.verifySources) return { verified: (value.verified as unknown[] | undefined)?.length ?? 0, not_found: value.not_found };
  return {};
}

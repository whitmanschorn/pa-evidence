import { readFileSync } from 'node:fs';
import { createMCPClient } from '@ai-sdk/mcp';
import type { AgentEvent, DraftEvent } from '@pa/shared';
import { afterEach, describe, expect, it } from 'vitest';
import { CRITERIA, NEVER_ANSWERS, PA_004_REFS, draftReply, mockModel, textReply, toolLoop } from '../support/mockModel.js';
import { TOKENS, readAgentRun, startTestServer } from '../support/testApp.js';

// The agent end to end with a scripted model: the real MCP server over HTTP with the nurse's token, the real tools,
// checks and audit. Only the model's replies are scripted.

const GOOD_ASK = 'Please send the metformin prescription or pharmacy fill history supporting the reported 6 months.';

let server: Awaited<ReturnType<typeof startTestServer>> | undefined;
afterEach(async () => {
  await server?.close();
  server = undefined;
});

const ofType = <T extends AgentEvent['type']>(events: AgentEvent[], type: T) =>
  events.filter((event): event is Extract<AgentEvent, { type: T }> => event.type === type);

describe('agent runs (scripted model, real MCP over HTTP)', () => {
  it('PA-001: the trace shows the tool calls, and the packet agrees with the rules engine on every criterion', async () => {
    server = await startTestServer({ model: mockModel(toolLoop('PA-001', [])) });
    const events = await readAgentRun(server.baseUrl, 'PA-001');

    expect(ofType(events, 'step').map((step) => step.tool)).toEqual([
      'get_request',
      'get_policy',
      ...CRITERIA.map(() => 'evaluate_criterion'),
      'verify_sources',
    ]);
    const [packet] = ofType(events, 'packet');
    expect(packet?.route).toBe('evidence_complete');
    expect(packet?.criteria.every((criterion) => criterion.check === 'evaluated' && criterion.agrees_with_rules)).toBe(true);
    expect(ofType(events, 'draft')).toEqual([]); // nothing to ask the provider for
    expect(events.at(-1)?.type).toBe('done');
  });

  it("audits every MCP tool call as the nurse who started the run, and the run itself", async () => {
    server = await startTestServer({ model: mockModel(toolLoop('PA-001', [])) });
    await readAgentRun(server.baseUrl, 'PA-001');
    await new Promise((resolve) => setTimeout(resolve, 20));

    const events = server.audit.list({ limit: 50 });
    const toolCalls = events.filter((event) => event.action === 'mcp.call');
    expect(toolCalls).toHaveLength(8);
    expect(toolCalls.every((event) => event.actor_sub === 'nurse-1')).toBe(true);
    expect(events.find((event) => event.action === 'agent.run')).toMatchObject({
      actor_sub: 'nurse-1',
      outcome: 'success',
      request_id: 'PA-001',
      route: 'evidence_complete',
      prompt_version: 'agent.v1',
    });
  });

  it('PA-004: a draft that passes the checks is used as the model wrote it', async () => {
    server = await startTestServer({ model: mockModel([...toolLoop('PA-004', PA_004_REFS), draftReply(GOOD_ASK)]) });
    const events = await readAgentRun(server.baseUrl, 'PA-004');

    const [draft] = ofType(events, 'draft');
    expect(draft).toMatchObject({ source: 'model', check_failures: [], items: [{ criterion_id: 'C3', ask: GOOD_ASK }] });
    expect(draft?.text).toContain('Re: request PA-004 (semaglutide)');
  });

  it.each([
    ['a missing ask', textReply(JSON.stringify({ items: [] })), 'incomplete'],
    ['an invented number', draftReply('Please send the fill history supporting the reported 9 months.'), 'unsupported_number'],
    ['a banned word', draftReply('Please send the fill history so we can authorize the request.'), 'forbidden_term'],
  ])('PA-004: a draft with %s, twice, falls back to the rules engine wording', async (_label, badReply, failure) => {
    server = await startTestServer({ model: mockModel([...toolLoop('PA-004', PA_004_REFS), badReply, badReply]) });
    const [draft] = ofType(await readAgentRun(server.baseUrl, 'PA-004'), 'draft') as DraftEvent[];

    expect(draft?.source).toBe('template');
    expect(draft?.check_failures).toContain(failure);
    expect(draft?.items).toEqual([
      { criterion_id: 'C3', ask: 'Metformin prescription or pharmacy fill history supporting the reported 6 months' },
    ]);
  });

  it("stops at the run's time limit: unreached criteria show as not evaluated, and the draft is the template", async () => {
    const slow = { ...mockModel([toolLoop('PA-004', PA_004_REFS)[0]!, NEVER_ANSWERS]), timeouts_ms: { call: 5_000, agent_run: 300 } };
    server = await startTestServer({ model: slow });
    const events = await readAgentRun(server.baseUrl, 'PA-004');

    const [packet] = ofType(events, 'packet');
    expect(packet?.warnings).toContain('agent_time_limit');
    expect(packet?.criteria.every((criterion) => criterion.check === 'not_evaluated')).toBe(true);
    expect(ofType(events, 'draft')[0]).toMatchObject({ source: 'template', check_failures: ['agent_time_limit'] });
    expect(events.at(-1)?.type).toBe('done');
  });
});

describe('/mcp', () => {
  it('needs a token', async () => {
    server = await startTestServer();
    const response = await fetch(`${server.baseUrl}/mcp`, { method: 'POST', body: '{}' });
    expect(response.status).toBe(401);
  });

  it('lists the four evidence tools to a nurse, and the agent prompt names each, with verify_sources last', async () => {
    server = await startTestServer();
    const mcp = await createMCPClient({
      transport: { type: 'http', url: `${server.baseUrl}/mcp`, headers: { Authorization: `Bearer ${TOKENS.nurse}` } },
    });
    const names = Object.keys(await mcp.tools()).sort();
    await mcp.close();
    expect(names).toEqual(['evaluate_criterion', 'get_policy', 'get_request', 'verify_sources']);

    // The prompt and the code must agree: the loop stops on verify_sources, so the prompt must introduce it last.
    const prompt = readFileSync(new URL('../../src/core/llm/prompts/agent.v1.md', import.meta.url), 'utf8');
    for (const name of names) expect(prompt).toContain(name);
    const introducedLast = Math.max(...names.map((name) => prompt.indexOf(name)));
    expect(prompt.indexOf('verify_sources')).toBe(introducedLast);
  });
});

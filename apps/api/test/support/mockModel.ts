import type { LanguageModelV4GenerateResult } from '@ai-sdk/provider';
import { MockLanguageModelV4 } from 'ai/test';
import type { LocalModel } from '../../src/core/llm/localModel.js';
import { createModelRegistry, type ModelRegistry } from '../../src/core/llm/modelRegistry.js';
import { TODAY, modelVersionInEffect } from './modelVersion.js';

// The model version in effect (its real prompts, settings and caps from data/models), with the AI SDK's own mock
// language model in place of Ollama, scripted: each call returns the next reply in order (an Error is thrown instead).
// `calls` holds what the model was sent, so a test can check what it saw.

type Reply = LanguageModelV4GenerateResult;

const USAGE = {
  inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 10, text: 10, reasoning: 0 },
};

export function textReply(text: string): Reply {
  return { content: [{ type: 'text', text }], finishReason: { unified: 'stop', raw: undefined }, usage: USAGE, warnings: [] };
}

export function toolCallsReply(calls: { toolName: string; input: Record<string, unknown> }[]): Reply {
  return {
    content: calls.map((call, index) => ({
      type: 'tool-call' as const,
      toolCallId: `call-${call.toolName}-${index}-${JSON.stringify(call.input).length}`,
      toolName: call.toolName,
      input: JSON.stringify(call.input),
    })),
    finishReason: { unified: 'tool-calls', raw: undefined },
    usage: USAGE,
    warnings: [],
  };
}

// A reply that never comes: the call waits until it is cancelled (for the time-limit tests).
export const NEVER_ANSWERS = Symbol('never answers');

export function mockModel(replies: (Reply | Error | typeof NEVER_ANSWERS)[]): LocalModel & { languageModel: MockLanguageModelV4; calls: () => string } {
  let next = 0;
  const languageModel = new MockLanguageModelV4({
    doGenerate: async (options) => {
      const reply = replies[Math.min(next, replies.length - 1)];
      next += 1;
      if (reply === NEVER_ANSWERS) {
        return new Promise<Reply>((_resolve, reject) => {
          options.abortSignal?.addEventListener('abort', () => reject(options.abortSignal?.reason));
        });
      }
      if (reply instanceof Error || reply === undefined) throw reply ?? new Error('no scripted reply');
      return reply;
    },
  });
  return { ...modelVersionInEffect(), languageModel, calls: () => JSON.stringify(languageModel.doGenerateCalls) };
}

// A registry serving one model, for the app (summaries and agent runs).
export function modelRegistryFor(model: LocalModel): ModelRegistry {
  return createModelRegistry({ load: () => [model], connect: () => model, clock: () => TODAY });
}

export const summaryJson = (sentence1: string, sentence2: string) => JSON.stringify({ sentence_1: sentence1, sentence_2: sentence2 });

// Scripted agent replies for the supplied requests.
export const CRITERIA = ['C1', 'C2', 'C3', 'C4', 'C5'];
export const PA_004_REFS = ['MedicationRequest/061087a3-cb71-5a24-9142-ff5c46ddfc92', 'AllergyIntolerance/5343aadb-9d69-59eb-9aac-e96f129206b1'];

// A well-behaved tool loop: the steps the agent prompt asks for, in order.
export function toolLoop(requestId: string, refs: string[]): Reply[] {
  return [
    toolCallsReply([{ toolName: 'get_request', input: { request_id: requestId } }]),
    toolCallsReply([{ toolName: 'get_policy', input: { policy_id: 'MP-SYN-021', request_date: '2026-10-01' } }]),
    toolCallsReply(CRITERIA.map((id) => ({ toolName: 'evaluate_criterion', input: { request_id: requestId, criterion_id: id } }))),
    toolCallsReply([{ toolName: 'verify_sources', input: { refs } }]),
  ];
}

// A draft reply with one ask, for the criterion PA-004 needs a document for.
export const draftReply = (ask: string) => textReply(JSON.stringify({ items: [{ criterion_id: 'C3', ask }] }));

import type { ChatMessage, ChatModel } from '../../src/core/llm/chatModel.js';

// A stand-in for the local model: returns the scripted replies in order (an Error is thrown instead), and records
// every conversation it was sent, so a test can check what the model saw.
export function scriptedModel(replies: (string | Error)[]): ChatModel & { calls: ChatMessage[][] } {
  const calls: ChatMessage[][] = [];
  let next = 0;
  return {
    name: 'scripted-model',
    digest: 'sha256-scripted',
    calls,
    async chatJson(messages) {
      calls.push(messages.map((message) => ({ ...message })));
      const reply = replies[Math.min(next, replies.length - 1)];
      next += 1;
      if (reply instanceof Error) throw reply;
      return { content: reply ?? '', ms: 5 };
    },
  };
}

export const summaryJson = (sentence1: string, sentence2: string) =>
  JSON.stringify({ sentence_1: sentence1, sentence_2: sentence2 });

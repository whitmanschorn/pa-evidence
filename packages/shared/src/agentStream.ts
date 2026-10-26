import { EventSourceParserStream } from 'eventsource-parser/stream';
import { AgentEventSchema, type AgentEvent } from './agent.js';

// One server-sent event, as POST /requests/:id/agent-runs writes it (and the UI tests' mock replays it).
export function formatAgentEvent(event: AgentEvent): string {
  return `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
}

// Reads an agent run's server-sent events (the body of POST /requests/:id/agent-runs) and hands each one, parsed with
// the shared schema, to onEvent. Used by the UI and the CLI. The SSE framing is parsed by eventsource-parser (the
// parser the AI SDK uses); the browser's EventSource cannot be used because it cannot send the bearer token.
// `BufferSource` is what TextDecoderStream takes; a fetch body (Uint8Array chunks) is one.
export async function readAgentEvents(body: ReadableStream<BufferSource>, onEvent: (event: AgentEvent) => void): Promise<void> {
  const reader = body.pipeThrough(new TextDecoderStream()).pipeThrough(new EventSourceParserStream()).getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return;
    onEvent(AgentEventSchema.parse(JSON.parse(value.data)));
  }
}

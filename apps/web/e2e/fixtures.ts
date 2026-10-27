import { readFileSync } from 'node:fs';
import type { AgentEvent, Packet, RequestSummary } from '@pa/shared';
import type { MockApi } from './test';

// Real API responses written by `pnpm fixtures` (see apps/api/scripts/fixtures.ts), for the ui project's mocks.
function read<T>(path: string): T {
  return JSON.parse(readFileSync(new URL(`./fixtures/${path}`, import.meta.url), 'utf8')) as T;
}

export const queue = () => read<RequestSummary[]>('requests.json');
export const packet = (name: string) => read<Packet>(`packets/${name}.json`);
export const agentRun = (name: 'PA-004-model' | 'PA-004-template') => read<AgentEvent[]>(`agent-runs/${name}.json`);

// The packet page asks for the packet twice: first with ?summary=template, so the criteria show at once, then the full
// packet with the model's summary. The quick reply's summary is never shown, so it reuses the full packet's fields.
// holdCriteria and holdSummary keep a reply back until their promise resolves, to see each loading state.
export function mockPacket(api: MockApi, name: string, options: { holdCriteria?: Promise<void>; holdSummary?: Promise<void> } = {}) {
  const full = packet(name);
  api.mock('GET', `/requests/${name}/evidence?summary=template`, { ...full, summary_source: 'template' }, { after: options.holdCriteria });
  api.mock('GET', `/requests/${name}/evidence`, full, { after: options.holdSummary });
}

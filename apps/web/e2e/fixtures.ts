import { readFileSync } from 'node:fs';
import type { AgentEvent, Packet, RequestSummary } from '@pa/shared';

// Real API responses written by `pnpm fixtures` (see apps/api/scripts/fixtures.ts), for the ui project's mocks.
function read<T>(path: string): T {
  return JSON.parse(readFileSync(new URL(`./fixtures/${path}`, import.meta.url), 'utf8')) as T;
}

export const queue = () => read<RequestSummary[]>('requests.json');
export const packet = (name: string) => read<Packet>(`packets/${name}.json`);
export const agentRun = (name: 'PA-004-model' | 'PA-004-template') => read<AgentEvent[]>(`agent-runs/${name}.json`);

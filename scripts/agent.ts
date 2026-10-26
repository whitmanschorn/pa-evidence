// pnpm agent <request id>: runs the agent on a request against the running stack (make up) and prints its events as
// they arrive: each tool call, the agent's packet compared with the rules engine, and the provider-request draft.
// Uses the nurse token from .tokens.local (make tokens), so it can do exactly what a nurse can.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readAgentEvents, type AgentEvent } from '@pa/shared';

const REPO_ROOT = fileURLToPath(new URL('../', import.meta.url));
const API_URL = process.env.API_URL ?? 'http://localhost:8080';

function nurseToken(): string {
  const line = readFileSync(join(REPO_ROOT, '.tokens.local'), 'utf8')
    .split('\n')
    .find((entry) => entry.startsWith('nurse='));
  if (line === undefined) throw new Error('No nurse token in .tokens.local. Run `make tokens`.');
  return line.slice('nurse='.length).trim();
}

function print(event: AgentEvent): void {
  if (event.type === 'step') {
    console.log(`${String(event.step).padStart(2)}. ${event.tool} ${JSON.stringify(event.arguments)} -> ${JSON.stringify(event.result)} (${event.ms} ms)`);
  } else if (event.type === 'packet') {
    console.log(`\nAgent's packet (route ${event.route}):`);
    for (const criterion of event.criteria) {
      const agreement = criterion.agrees_with_rules ? 'agrees with the rules engine' : `rules engine says ${criterion.rules_status}`;
      console.log(`  ${criterion.id}: ${criterion.status ?? 'not evaluated'} (${agreement})`);
    }
    if (event.warnings.length > 0) console.log(`  warnings: ${event.warnings.join(', ')}`);
  } else if (event.type === 'draft') {
    const failures = event.check_failures.length > 0 ? `; checks failed: ${event.check_failures.join(', ')}` : '';
    console.log(`\nProvider-request draft (${event.source}${failures}):\n${event.text}`);
  } else if (event.type === 'done') {
    console.log(`\nDone: ${event.steps} tool calls in ${(event.ms / 1000).toFixed(1)} s`);
  } else {
    console.log(`\nThe run failed: ${event.error}`);
  }
}

async function main(): Promise<void> {
  const requestId = process.argv[2];
  if (requestId === undefined) throw new Error('Usage: pnpm agent <request id>, e.g. pnpm agent PA-004');
  const response = await fetch(`${API_URL}/requests/${encodeURIComponent(requestId)}/agent-runs`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${nurseToken()}` },
  });
  if (!response.ok || response.body === null) throw new Error(`HTTP ${response.status}: ${await response.text()}`);
  await readAgentEvents(response.body, print);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

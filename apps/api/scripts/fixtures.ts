// pnpm fixtures: writes real API responses for the Playwright `ui` project's mocks, so the UI is built against the
// actual API contract. Each is re-parsed with its shared schema before it is written.
//   apps/web/e2e/fixtures/packets/PA-00X.json     the seven supplied requests
//   apps/web/e2e/fixtures/packets/PA-001-c6.json  PA-001 under the six-criterion fixture policy (extension test)
//   apps/web/e2e/fixtures/requests.json           the queue (GET /requests)
//   apps/web/e2e/fixtures/agent-runs/*.json       agent runs on PA-004 with a scripted model, through the real app and
//                                                 /mcp: one whose draft passes the checks, one that falls back
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PacketSchema, RequestSummarySchema, type Packet } from '@pa/shared';
import { assemblePacket, type PacketDeps } from '../src/core/packet/assemblePacket.js';
import { extensionDeps } from '../test/support/extensionWorld.js';
import { PA_004_REFS, draftReply, mockModel, toolLoop } from '../test/support/mockModel.js';
import { REPO_ROOT } from '../test/support/repoRoot.js';
import { suppliedDeps } from '../test/support/suppliedWorld.js';
import { bearer, readAgentRun, startTestServer } from '../test/support/testApp.js';

const FIXTURES_DIR = join(REPO_ROOT, 'apps/web/e2e/fixtures');
const OUT_DIR = join(FIXTURES_DIR, 'packets');

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

async function writeQueueAndAgentRuns(): Promise<void> {
  const goodAsk = 'Please send the metformin prescription or pharmacy fill history supporting the reported 6 months.';
  const inventedNumber = draftReply('Please send the fill history supporting the reported 9 months.');
  const runs = {
    'PA-004-model': [...toolLoop('PA-004', PA_004_REFS), draftReply(goodAsk)],
    'PA-004-template': [...toolLoop('PA-004', PA_004_REFS), inventedNumber, inventedNumber],
  };
  mkdirSync(join(FIXTURES_DIR, 'agent-runs'), { recursive: true });
  for (const [name, replies] of Object.entries(runs)) {
    const server = await startTestServer({ model: mockModel(replies) });
    if (name === 'PA-004-model') {
      const queue = await (await fetch(`${server.baseUrl}/requests`, { headers: bearer('nurse') })).json();
      writeJson(join(FIXTURES_DIR, 'requests.json'), RequestSummarySchema.array().parse(queue));
      console.log('requests.json');
    }
    writeJson(join(FIXTURES_DIR, 'agent-runs', `${name}.json`), await readAgentRun(server.baseUrl, 'PA-004'));
    await server.close();
    console.log(`agent-runs/${name}.json`);
  }
}

async function writePacket(deps: PacketDeps, requestId: string, fileName: string): Promise<void> {
  const { packet } = await assemblePacket(deps, requestId);
  const checked: Packet = PacketSchema.parse(packet);
  writeJson(join(OUT_DIR, fileName), checked);
  console.log(`${fileName}: ${checked.criteria.map((criterion) => `${criterion.id}=${criterion.status}`).join(' ')} -> ${checked.route}`);
}

async function main(): Promise<void> {
  mkdirSync(OUT_DIR, { recursive: true });
  const supplied = suppliedDeps();
  for (const form of supplied.requests.list()) {
    await writePacket(supplied, form.request_id, `${form.request_id}.json`);
  }
  await writePacket(extensionDeps(), 'PA-001', 'PA-001-c6.json');
  await writeQueueAndAgentRuns();
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});

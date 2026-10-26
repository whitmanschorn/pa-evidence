// pnpm fixtures: writes real rules-engine packets for the Playwright `ui` project's mocks, so the UI is built
// against the actual API contract. Each packet is re-parsed with the shared PacketSchema before it is written.
//   apps/web/e2e/fixtures/packets/PA-00X.json   the seven supplied requests
//   apps/web/e2e/fixtures/packets/PA-001-c6.json PA-001 under the six-criterion fixture policy (extension test)
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PacketSchema, type Packet } from '@pa/shared';
import { assemblePacket, type PacketDeps } from '../src/core/packet/assemblePacket.js';
import { extensionDeps } from '../test/support/extensionWorld.js';
import { REPO_ROOT } from '../test/support/repoRoot.js';
import { suppliedDeps } from '../test/support/suppliedWorld.js';

const OUT_DIR = join(REPO_ROOT, 'apps/web/e2e/fixtures/packets');

async function writePacket(deps: PacketDeps, requestId: string, fileName: string): Promise<void> {
  const { packet } = await assemblePacket(deps, requestId);
  const checked: Packet = PacketSchema.parse(packet);
  writeFileSync(join(OUT_DIR, fileName), `${JSON.stringify(checked, null, 2)}\n`);
  console.log(`${fileName}: ${checked.criteria.map((criterion) => `${criterion.id}=${criterion.status}`).join(' ')} -> ${checked.route}`);
}

async function main(): Promise<void> {
  mkdirSync(OUT_DIR, { recursive: true });
  const supplied = suppliedDeps();
  for (const form of supplied.requests.list()) {
    await writePacket(supplied, form.request_id, `${form.request_id}.json`);
  }
  await writePacket(extensionDeps(), 'PA-001', 'PA-001-c6.json');
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});

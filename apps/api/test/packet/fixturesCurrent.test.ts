import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PacketSchema } from '@pa/shared';
import { describe, expect, it } from 'vitest';
import { assemblePacket } from '../../src/core/packet/assemblePacket.js';
import { extensionDeps } from '../support/extensionWorld.js';
import { REPO_ROOT } from '../support/repoRoot.js';
import { suppliedDeps } from '../support/suppliedWorld.js';

// The Playwright mocks must be real packets from today's rules engine. If this fails, run `pnpm fixtures`.
const FIXTURE_DIR = join(REPO_ROOT, 'apps/web/e2e/fixtures/packets');

function readFixture(fileName: string): unknown {
  return JSON.parse(readFileSync(join(FIXTURE_DIR, fileName), 'utf8'));
}

describe('UI fixture packets are current', () => {
  const supplied = suppliedDeps();

  it.each(['PA-001', 'PA-002', 'PA-003', 'PA-004', 'PA-005', 'PA-006', 'PA-007'])('%s', async (requestId) => {
    const fixture = PacketSchema.parse(readFixture(`${requestId}.json`));
    const { packet } = await assemblePacket(supplied, requestId);
    expect(fixture).toEqual(packet);
  });

  it('PA-001-c6 (six-criterion extension)', async () => {
    const fixture = PacketSchema.parse(readFixture('PA-001-c6.json'));
    const { packet } = await assemblePacket(extensionDeps(), 'PA-001');
    expect(fixture).toEqual(packet);
  });
});

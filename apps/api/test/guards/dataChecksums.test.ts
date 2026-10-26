import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { REPO_ROOT } from '../support/repoRoot.js';

// Invariant 13: the supplied data is read-only. If any supplied file changes, this test fails.
const DATA_DIR = join(REPO_ROOT, 'data');

function readChecksumLines(): { expectedHash: string; relativePath: string }[] {
  const text = readFileSync(join(DATA_DIR, 'CHECKSUMS.sha256'), 'utf8');
  const lines = text.split('\n').filter((line) => line.trim() !== '');
  return lines.map((line) => {
    // shasum format: "<64 hex chars><two spaces><path>"
    const expectedHash = line.slice(0, 64);
    const relativePath = line.slice(66);
    return { expectedHash, relativePath };
  });
}

describe('supplied data', () => {
  const entries = readChecksumLines();

  it('lists the policy, index, README, seven requests and seven bundles', () => {
    expect(entries).toHaveLength(17);
  });

  it.each(entries)('$relativePath is unchanged', ({ expectedHash, relativePath }) => {
    const bytes = readFileSync(join(DATA_DIR, relativePath));
    const actualHash = createHash('sha256').update(bytes).digest('hex');
    expect(actualHash).toBe(expectedHash);
  });
});

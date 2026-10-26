import { copyFileSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadPolicyStore, policyFoldersIn } from '../../src/core/policy/policyStore.js';
import { REPO_ROOT } from '../support/repoRoot.js';
import { POLICY_FOLDER } from '../support/suppliedWorld.js';

describe('loadPolicyStore (one folder per policy)', () => {
  it('finds the policy folders under data/policies/', () => {
    expect(policyFoldersIn(join(REPO_ROOT, 'data/policies'))).toEqual([POLICY_FOLDER]);
  });

  it('loads the policy version and merges the rules engine config next to it', () => {
    const [policy] = loadPolicyStore([POLICY_FOLDER]).all();
    expect(policy?.version).toBe('2026.1');
    expect(policy?.criteria.find((criterion) => criterion.id === 'C5')?.fhir.min_years).toBe(18);
  });

  it('refuses any other file in a policy folder', () => {
    const folder = mkdtempSync(join(tmpdir(), 'policy-folder-'));
    copyFileSync(join(POLICY_FOLDER, 'policy_MP-SYN-021.json'), join(folder, 'policy_MP-SYN-021.json'));
    writeFileSync(join(folder, 'notes.json'), '{}');
    expect(() => loadPolicyStore([folder])).toThrow('a policy folder holds policy_*.json and rules-engine-config.json only');
  });
});

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

  it('refuses any other file in a policy folder, including a second version', () => {
    const folder = mkdtempSync(join(tmpdir(), 'policy-folder-'));
    copyFileSync(join(POLICY_FOLDER, 'policy.json'), join(folder, 'policy.json'));
    writeFileSync(join(folder, 'policy@2026.2.json'), '{}');
    expect(() => loadPolicyStore([folder])).toThrow('Unexpected file');
  });

  it('refuses a folder without policy.json', () => {
    const folder = mkdtempSync(join(tmpdir(), 'policy-folder-'));
    expect(() => loadPolicyStore([folder])).toThrow('has no policy.json');
  });

  it('refuses two folders holding the same policy: one version is loaded at a time', () => {
    expect(() => loadPolicyStore([POLICY_FOLDER, POLICY_FOLDER])).toThrow('only one version is loaded at a time');
  });
});

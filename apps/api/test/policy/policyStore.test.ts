import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { compareVersions, loadPolicyStore } from '../../src/core/policy/policyStore.js';
import { POLICIES_DIR } from '../support/suppliedWorld.js';

// data/policies/<policy id>/<effective date>_<version>/{policy.json, rules-engine-config.json}
const SUPPLIED_VERSION = join(POLICIES_DIR, 'MP-SYN-021', '2026-07-01_2026.1');

// A temporary policies directory holding the supplied version, so a test can drop more folders in next to it.
function policiesDirWithSupplied(): string {
  const dir = mkdtempSync(join(tmpdir(), 'policies-'));
  cpSync(SUPPLIED_VERSION, join(dir, 'MP-SYN-021', '2026-07-01_2026.1'), { recursive: true });
  return dir;
}

// Drops in a version folder: the supplied policy with a new version, effective date and HbA1c window.
function dropVersion(dir: string, folderName: string, fields: { version: string; effective: string; policyId?: string }) {
  const folder = join(dir, fields.policyId ?? 'MP-SYN-021', folderName);
  mkdirSync(folder, { recursive: true });
  const policy = JSON.parse(readFileSync(join(SUPPLIED_VERSION, 'policy.json'), 'utf8'));
  policy.version = fields.version;
  policy.effective = fields.effective;
  policy.criteria[1].fhir.window_days = 120;
  writeFileSync(join(folder, 'policy.json'), JSON.stringify(policy));
  cpSync(join(SUPPLIED_VERSION, 'rules-engine-config.json'), join(folder, 'rules-engine-config.json'));
  return folder;
}

describe('loadPolicyStore', () => {
  it('loads the supplied version with the rules engine config next to it', () => {
    const [policy] = loadPolicyStore([POLICIES_DIR]).all();
    expect(policy?.version).toBe('2026.1');
    expect(policy?.criteria.find((criterion) => criterion.id === 'C5')?.fhir.min_years).toBe(18);
  });

  it('updates by dropping in a folder: each request gets the version in effect on its date', () => {
    const dir = policiesDirWithSupplied();
    dropVersion(dir, '2027-01-01_2027.1', { version: '2027.1', effective: '2027-01-01' });
    const store = loadPolicyStore([dir]);

    expect(store.policyFor('MP-SYN-021', '2026-12-31')?.policy.version).toBe('2026.1');
    const later = store.policyFor('MP-SYN-021', '2027-01-01')?.policy;
    expect(later?.version).toBe('2027.1');
    expect(later?.criteria[1]?.fhir.window_days).toBe(120);
    expect(later?.criteria.find((criterion) => criterion.id === 'C5')?.fhir.min_years).toBe(18); // its own config
  });

  it('ignores dotfiles left by Finder or SFTP', () => {
    const dir = policiesDirWithSupplied();
    writeFileSync(join(dir, '.DS_Store'), '');
    writeFileSync(join(dir, 'MP-SYN-021', '2026-07-01_2026.1', '.upload.part'), '');
    expect(loadPolicyStore([dir]).all()).toHaveLength(1);
  });

  it('refuses a folder name that disagrees with its policy.json', () => {
    const dir = policiesDirWithSupplied();
    dropVersion(dir, '2027-01-01_2027.1', { version: '2027.2', effective: '2027-01-01' });
    expect(() => loadPolicyStore([dir])).toThrow('says effective 2027-01-01, version 2027.2, but its folder says 2027-01-01_2027.1');
  });

  it('refuses a policy filed under another policy id', () => {
    const dir = policiesDirWithSupplied();
    dropVersion(dir, '2027-01-01_2027.1', { version: '2027.1', effective: '2027-01-01', policyId: 'MP-SYN-999' });
    expect(() => loadPolicyStore([dir])).toThrow('is policy MP-SYN-021, but its folder says MP-SYN-999');
  });

  it('refuses a badly named version folder and stray files', () => {
    const misnamed = policiesDirWithSupplied();
    mkdirSync(join(misnamed, 'MP-SYN-021', 'latest'));
    expect(() => loadPolicyStore([misnamed])).toThrow('must be named <effective date>_<version>');

    const stray = policiesDirWithSupplied();
    writeFileSync(join(stray, 'MP-SYN-021', '2026-07-01_2026.1', 'notes.txt'), '');
    expect(() => loadPolicyStore([stray])).toThrow('Unexpected file');
  });

  it('refuses two versions taking effect on the same day', () => {
    const dir = policiesDirWithSupplied();
    dropVersion(dir, '2026-07-01_2026.2', { version: '2026.2', effective: '2026-07-01' });
    expect(() => loadPolicyStore([dir])).toThrow('Two versions take effect on the same day');
  });

  it('refuses versions whose order contradicts their effective dates', () => {
    const dir = policiesDirWithSupplied();
    dropVersion(dir, '2027-01-01_2025.9', { version: '2025.9', effective: '2027-01-01' });
    expect(() => loadPolicyStore([dir])).toThrow('Version order contradicts effective-date order');
  });
});

describe('compareVersions', () => {
  it('compares numerically part by part', () => {
    expect(compareVersions('2026.10', '2026.9')).toBeGreaterThan(0);
    expect(compareVersions('2026.1', '2027.1')).toBeLessThan(0);
    expect(compareVersions('2026.1', '2026.1')).toBe(0);
  });
});

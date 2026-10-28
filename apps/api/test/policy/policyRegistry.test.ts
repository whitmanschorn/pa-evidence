import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createPolicyRegistry } from '../../src/core/policy/policyRegistry.js';
import { loadPolicyStore } from '../../src/core/policy/policyStore.js';
import { checkBindings } from '../../src/core/rules/checkBindings.js';
import { terminology } from '../support/builders.js';
import { POLICIES_DIR } from '../support/suppliedWorld.js';

const SUPPLIED_VERSION = join(POLICIES_DIR, 'MP-SYN-021', '2026-07-01_2026.1');

function registryOver(dir: string) {
  return createPolicyRegistry({
    load: () => loadPolicyStore([dir]),
    check: (store) => checkBindings(store.all(), terminology),
  });
}

function policiesDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'policies-'));
  cpSync(SUPPLIED_VERSION, join(dir, 'MP-SYN-021', '2026-07-01_2026.1'), { recursive: true });
  return dir;
}

function dropVersion(dir: string, folder: string, edit: (policy: Record<string, unknown>) => void): void {
  const target = join(dir, 'MP-SYN-021', folder);
  mkdirSync(target, { recursive: true });
  const policy = JSON.parse(readFileSync(join(SUPPLIED_VERSION, 'policy.json'), 'utf8'));
  edit(policy);
  writeFileSync(join(target, 'policy.json'), JSON.stringify(policy));
  cpSync(join(SUPPLIED_VERSION, 'rules-engine-config.json'), join(target, 'rules-engine-config.json'));
}

describe('policy registry (reload without a restart)', () => {
  it('picks up a dropped-in version folder on reload', () => {
    const dir = policiesDir();
    const registry = registryOver(dir);
    expect(registry.versions().map((version) => version.version)).toEqual(['2026.1']);

    dropVersion(dir, '2027-01-01_2027.1', (policy) => {
      policy.version = '2027.1';
      policy.effective = '2027-01-01';
    });
    const result = registry.reload();

    expect(result.ok).toBe(true);
    expect(result.versions.map((version) => version.version)).toEqual(['2026.1', '2027.1']);
    expect(registry.policyFor('MP-SYN-021', '2027-02-01')?.policy.version).toBe('2027.1');
  });

  it('keeps serving the old versions when a reload finds a problem, and reports it', () => {
    const dir = policiesDir();
    const registry = registryOver(dir);
    dropVersion(dir, '2027-01-01_2027.1', (policy) => {
      policy.version = '2027.1';
      policy.effective = '2027-01-01';
      (policy.criteria as unknown[]).push({ id: 'C9', requirement: 'new rule', fhir: {} });
    });

    const result = registry.reload();

    expect(result.ok).toBe(false);
    expect(result.problems).toEqual(['MP-SYN-021@2027.1 C9: no binding in rules-engine-config.json']);
    expect(result.versions.map((version) => version.version)).toEqual(['2026.1']);
    expect(registry.lastReload()).toMatchObject({ ok: false });
  });

  it('reports a malformed folder instead of crashing', () => {
    const dir = policiesDir();
    const registry = registryOver(dir);
    mkdirSync(join(dir, 'MP-SYN-021', 'latest'));
    const result = registry.reload();
    expect(result.ok).toBe(false);
    expect(result.problems[0]).toContain('must be named <effective date>_<version>');
  });

  it('refuses to start on a problem, since there is nothing to fall back to', () => {
    const dir = policiesDir();
    dropVersion(dir, '2027-01-01_2027.1', (policy) => {
      policy.version = '2027.1';
      policy.effective = '2027-01-01';
      (policy.criteria as unknown[]).push({ id: 'C9', requirement: 'new rule', fhir: {} });
    });
    expect(() => registryOver(dir)).toThrow('Policies failed the startup check');
  });

  it('fingerprints the rules each version uses', () => {
    const [version] = registryOver(policiesDir()).versions();
    expect(version?.rules_fingerprint).toMatch(/^[0-9a-f]{64}$/);
  });
});

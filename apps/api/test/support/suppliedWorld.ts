import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { ExpectedPacketSchema, type ExpectedPacket } from '@pa/shared';
import { createBundleFhirClient } from '../../src/core/fhir/bundleFhirClient.js';
import type { PacketDeps } from '../../src/core/packet/assemblePacket.js';
import { loadPolicyStore, policyFoldersIn } from '../../src/core/policy/policyStore.js';
import { loadRequestStore } from '../../src/core/requests/requestStore.js';
import { BINDINGS } from '../../src/core/rules/bindings.js';
import { loadTerminology } from '../../src/core/terminology.js';
import { REPO_ROOT } from './repoRoot.js';

// The supplied policy and its rules engine config, in one folder.
export const POLICY_FOLDER = join(REPO_ROOT, 'data/policies/MP-SYN-021');
export const TERMINOLOGY_DIR = join(REPO_ROOT, 'data/terminology');

export function readBundles(dir: string): fhir4.Bundle[] {
  return readdirSync(dir)
    .filter((name) => name.endsWith('.json'))
    .map((name) => JSON.parse(readFileSync(join(dir, name), 'utf8')) as fhir4.Bundle);
}

// The supplied data, wired the way the service wires it, but with an in-memory FHIR server (no HAPI).
export function suppliedDeps(overrides: Partial<PacketDeps> = {}): PacketDeps {
  return {
    fhir: createBundleFhirClient(readBundles(join(REPO_ROOT, 'data/bundles'))),
    policies: loadPolicyStore(policyFoldersIn(join(REPO_ROOT, 'data/policies'))),
    requests: loadRequestStore([join(REPO_ROOT, 'data/requests')]),
    terminology: loadTerminology(TERMINOLOGY_DIR),
    bindings: BINDINGS,
    ...overrides,
  };
}

export function readExpected(): ExpectedPacket[] {
  const dir = join(REPO_ROOT, 'eval/expected');
  return readdirSync(dir)
    .filter((name) => name.endsWith('.json'))
    .map((name) => ExpectedPacketSchema.parse(JSON.parse(readFileSync(join(dir, name), 'utf8'))));
}

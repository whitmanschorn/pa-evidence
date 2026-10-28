import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { ExpectedPacketSchema, type ExpectedPacket } from '@pa/shared';
import { createBundleFhirClient } from '../../src/core/fhir/bundleFhirClient.js';
import type { PacketDeps } from '../../src/core/packet/assemblePacket.js';
import { loadPolicyStore } from '../../src/core/policy/policyStore.js';
import { loadRequestStore } from '../../src/core/requests/requestStore.js';
import { loadTerminology } from '../../src/core/terminology.js';
import { REPO_ROOT } from './repoRoot.js';

// data/policies/<policy id>/<effective date>_<version>/{policy.json, rules-engine-config.json}
export const POLICIES_DIR = join(REPO_ROOT, 'data/policies');
export const TERMINOLOGY_DIR = join(REPO_ROOT, 'data/terminology');
export const MODELS_DIR = join(REPO_ROOT, 'data/models');

export function readBundles(dir: string): fhir4.Bundle[] {
  return readdirSync(dir)
    .filter((name) => name.endsWith('.json'))
    .map((name) => JSON.parse(readFileSync(join(dir, name), 'utf8')) as fhir4.Bundle);
}

// The supplied data, wired the way the service wires it, but with an in-memory FHIR server (no HAPI).
export function suppliedDeps(overrides: Partial<PacketDeps> = {}): PacketDeps {
  return {
    fhir: createBundleFhirClient(readBundles(join(REPO_ROOT, 'data/bundles'))),
    policies: loadPolicyStore([POLICIES_DIR]),
    requests: loadRequestStore([join(REPO_ROOT, 'data/requests')]),
    terminology: loadTerminology(TERMINOLOGY_DIR),
    ...overrides,
  };
}

// The answer key for the seven supplied requests. (eval/expected/ also holds the Synthea requests' key, which needs
// their records on the FHIR server: pnpm eval checks those.)
export function readExpected(): ExpectedPacket[] {
  const dir = join(REPO_ROOT, 'eval/expected');
  const supplied = new Set(loadRequestStore([join(REPO_ROOT, 'data/requests')]).list().map((form) => form.request_id));
  return readdirSync(dir)
    .filter((name) => name.endsWith('.json'))
    .map((name) => ExpectedPacketSchema.parse(JSON.parse(readFileSync(join(dir, name), 'utf8'))))
    .filter((expected) => supplied.has(expected.request_id));
}

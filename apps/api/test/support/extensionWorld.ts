import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createBundleFhirClient } from '../../src/core/fhir/bundleFhirClient.js';
import type { PacketDeps } from '../../src/core/packet/assemblePacket.js';
import { loadPolicyStore } from '../../src/core/policy/policyStore.js';
import { BINDINGS } from '../../src/core/rules/bindings.js';
import type { Binding } from '../../src/core/rules/types.js';
import { REPO_ROOT } from './repoRoot.js';
import { POLICIES_DIR, readBundles, suppliedDeps } from './suppliedWorld.js';

// The extension test's whole change: a new policy version folder with a sixth criterion, dropped in next to the
// supplied version (from a fixtures directory, so the real data/policies/ stays untouched), a bundle with one BMI
// result, and this one binding line. No production code changes.
const EXTENSION_DIR = join(REPO_ROOT, 'apps/api/test/fixtures/extension');
export const EXTENSION_BINDINGS: Record<string, Binding> = {
  ...BINDINGS,
  C6: { kind: 'observation_threshold', compare: 'gte' },
};

export function extensionDeps(): PacketDeps {
  const bmiBundle = JSON.parse(readFileSync(join(EXTENSION_DIR, 'bmi-PA-001.json'), 'utf8')) as fhir4.Bundle;
  return suppliedDeps({
    fhir: createBundleFhirClient([...readBundles(join(REPO_ROOT, 'data/bundles')), bmiBundle]),
    policies: loadPolicyStore([POLICIES_DIR, join(EXTENSION_DIR, 'policies')]),
    bindings: EXTENSION_BINDINGS,
  });
}

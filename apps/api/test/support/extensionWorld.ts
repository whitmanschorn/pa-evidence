import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createBundleFhirClient } from '../../src/core/fhir/bundleFhirClient.js';
import type { PacketDeps } from '../../src/core/packet/assemblePacket.js';
import { loadPolicyStore } from '../../src/core/policy/policyStore.js';
import { REPO_ROOT } from './repoRoot.js';
import { POLICIES_DIR, readBundles, suppliedDeps } from './suppliedWorld.js';

// The extension test's whole change: a new policy version folder with a sixth criterion and its binding (policy.json
// and rules-engine-config.json), dropped in next to the supplied version (from a fixtures directory, so the real
// data/policies/ stays untouched), and a bundle with one BMI result. No code changes, not even in this test.
const EXTENSION_DIR = join(REPO_ROOT, 'apps/api/test/fixtures/extension');

export function extensionDeps(): PacketDeps {
  const bmiBundle = JSON.parse(readFileSync(join(EXTENSION_DIR, 'bmi-PA-001.json'), 'utf8')) as fhir4.Bundle;
  return suppliedDeps({
    fhir: createBundleFhirClient([...readBundles(join(REPO_ROOT, 'data/bundles')), bmiBundle]),
    policies: loadPolicyStore([POLICIES_DIR, join(EXTENSION_DIR, 'policies')]),
  });
}

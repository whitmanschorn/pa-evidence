import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createBundleFhirClient } from '../../src/core/fhir/bundleFhirClient.js';
import type { PacketDeps } from '../../src/core/packet/assemblePacket.js';
import { loadPolicyStore } from '../../src/core/policy/policyStore.js';
import { BINDINGS } from '../../src/core/rules/bindings.js';
import type { Binding } from '../../src/core/rules/types.js';
import { REPO_ROOT } from './repoRoot.js';
import { readBundles, suppliedDeps } from './suppliedWorld.js';

// The extension test's whole change: the policy with a sixth criterion added (a fixture policy folder loaded in
// place of data/policies/MP-SYN-021, so the real data stays untouched), a bundle with one BMI result, and this
// one binding line. No production code changes.
const EXTENSION_DIR = join(REPO_ROOT, 'apps/api/test/fixtures/extension');
export const EXTENSION_BINDINGS: Record<string, Binding> = {
  ...BINDINGS,
  C6: { kind: 'observation_threshold', compare: 'gte' },
};

export function extensionDeps(): PacketDeps {
  const bmiBundle = JSON.parse(readFileSync(join(EXTENSION_DIR, 'bmi-PA-001.json'), 'utf8')) as fhir4.Bundle;
  return suppliedDeps({
    fhir: createBundleFhirClient([...readBundles(join(REPO_ROOT, 'data/bundles')), bmiBundle]),
    policies: loadPolicyStore([join(EXTENSION_DIR, 'policy')]),
    bindings: EXTENSION_BINDINGS,
  });
}

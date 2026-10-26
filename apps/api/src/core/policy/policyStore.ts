import { loadPolicyVersions } from './loadPolicyVersions.js';
import type { Policy } from './policySchema.js';

export type PolicyChoice = { policy: Policy; warnings: string[] };

export type PolicyStore = {
  all(): Policy[];
  // The version in effect on the request date: the latest one whose `effective` date is on or before it.
  policyFor(policyId: string, requestDate: string): PolicyChoice | null;
};

// Every version of every policy found under the policies directories (see loadPolicyVersions.ts for the layout).
export function loadPolicyStore(policiesDirs: string[]): PolicyStore {
  return policyStoreFrom(loadPolicyVersions(policiesDirs));
}

export function policyStoreFrom(policies: Policy[]): PolicyStore {
  const versionsById = new Map<string, Policy[]>();
  for (const policy of policies) {
    const versions = versionsById.get(policy.policy_id) ?? [];
    versions.push(policy);
    versionsById.set(policy.policy_id, versions);
  }
  for (const versions of versionsById.values()) {
    versions.sort((a, b) => a.effective.localeCompare(b.effective));
    checkVersionOrder(versions);
  }

  return {
    all: () => policies,
    policyFor(policyId, requestDate) {
      const versions = versionsById.get(policyId);
      if (versions === undefined) return null;

      const inEffect = versions.filter((policy) => policy.effective <= requestDate);
      const latestInEffect = inEffect[inEffect.length - 1];
      if (latestInEffect !== undefined) {
        return { policy: latestInEffect, warnings: [] };
      }
      // The request predates every version. Use the earliest, and say so: the warning blocks evidence_complete
      // and the nurse reviews it.
      return { policy: versions[0] as Policy, warnings: ['request_before_policy_effective'] };
    },
  };
}

// Versions sorted by effective date must also be in version order, with no two on the same day. Otherwise it is
// ambiguous which rules applied when, so the service refuses to start.
function checkVersionOrder(versions: Policy[]): void {
  for (let index = 1; index < versions.length; index += 1) {
    const earlier = versions[index - 1] as Policy;
    const later = versions[index] as Policy;
    const label = `${later.policy_id} ${earlier.version} (effective ${earlier.effective}) and ${later.version} (effective ${later.effective})`;
    if (earlier.effective === later.effective) {
      throw new Error(`Two versions take effect on the same day: ${label}`);
    }
    if (compareVersions(earlier.version, later.version) >= 0) {
      throw new Error(`Version order contradicts effective-date order: ${label}`);
    }
  }
}

// Compares "2026.1" with "2026.10" part by part, numerically where both parts are numbers (so 2026.10 > 2026.9).
export function compareVersions(a: string, b: string): number {
  const aParts = a.split('.');
  const bParts = b.split('.');
  for (let index = 0; index < Math.max(aParts.length, bParts.length); index += 1) {
    const aPart = aParts[index] ?? '';
    const bPart = bParts[index] ?? '';
    const bothNumeric = /^\d+$/.test(aPart) && /^\d+$/.test(bPart);
    const difference = bothNumeric ? Number(aPart) - Number(bPart) : aPart.localeCompare(bPart);
    if (difference !== 0) return difference;
  }
  return 0;
}

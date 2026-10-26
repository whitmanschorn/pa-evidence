import { checkVersionOrder, latestInEffect } from '../versionFolders.js';
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
  for (const [policyId, versions] of versionsById) {
    versions.sort((a, b) => a.effective.localeCompare(b.effective));
    checkVersionOrder(versions, policyId);
  }

  return {
    all: () => policies,
    policyFor(policyId, requestDate) {
      const versions = versionsById.get(policyId);
      if (versions === undefined) return null;

      const inEffect = latestInEffect(versions, requestDate);
      if (inEffect !== undefined) {
        return { policy: inEffect, warnings: [] };
      }
      // The request predates every version. Use the earliest, and say so: the warning blocks evidence_complete
      // and the nurse reviews it.
      return { policy: versions[0] as Policy, warnings: ['request_before_policy_effective'] };
    },
  };
}

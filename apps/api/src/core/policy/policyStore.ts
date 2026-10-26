import { readJsonFiles } from '../files.js';
import { PolicySchema, type Policy } from './policySchema.js';
import { RulesEngineConfigSchema, applyRulesEngineConfig, type RulesEngineConfig } from './rulesEngineConfig.js';

export type PolicyChoice = { policy: Policy; warnings: string[] };

export type PolicyStore = {
  all(): Policy[];
  // The version in effect on the request date: the latest one whose `effective` date is on or before it.
  policyFor(policyId: string, requestDate: string): PolicyChoice | null;
};

// Loads every policy version found in `policyPaths`, each with its rules engine config (data/rules-engine-config/) applied.
export function loadPolicyStore(policyPaths: string[], rulesEngineConfigPaths: string[]): PolicyStore {
  const configs: RulesEngineConfig[] = readJsonFiles(rulesEngineConfigPaths).map(({ path, json }) => {
    const parsed = RulesEngineConfigSchema.safeParse(json);
    if (!parsed.success) {
      throw new Error(`Invalid rules engine config ${path}: ${parsed.error.message}`);
    }
    return parsed.data;
  });
  const policies = readJsonFiles(policyPaths).map(({ path, json }) => {
    const parsed = PolicySchema.safeParse(json);
    if (!parsed.success) {
      throw new Error(`Invalid policy file ${path}: ${parsed.error.message}`);
    }
    return applyRulesEngineConfig(parsed.data, configs);
  });
  return policyStoreFrom(policies);
}

export function policyStoreFrom(policies: Policy[]): PolicyStore {
  return {
    all: () => policies,
    policyFor(policyId, requestDate) {
      const versions = policies
        .filter((policy) => policy.policy_id === policyId)
        .sort((a, b) => a.effective.localeCompare(b.effective));
      if (versions.length === 0) return null;

      const inEffect = versions.filter((policy) => policy.effective <= requestDate);
      const latestInEffect = inEffect[inEffect.length - 1];
      if (latestInEffect !== undefined) {
        return { policy: latestInEffect, warnings: [] };
      }
      // The request predates every version. Use the earliest, and say so: the nurse must review it.
      return { policy: versions[0] as Policy, warnings: ['request_before_policy_effective'] };
    },
  };
}

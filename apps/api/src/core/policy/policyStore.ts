import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  RulesEngineConfigSchema,
  mergeRulesEngineConfigIntoPolicy,
  type RulesEngineConfig,
} from './mergeRulesEngineConfigIntoPolicy.js';
import { PolicySchema, type Policy } from './policySchema.js';

// One folder per policy, e.g. data/policies/MP-SYN-021/:
//   policy_MP-SYN-021.json          a policy version (the supplied file)
//   policy_MP-SYN-021@2026.2.json   later versions, as new files
//   rules-engine-config.json        values the policy has no field for (age limit, tolerances)
const POLICY_FILE = /^policy_.+\.json$/;
const RULES_ENGINE_CONFIG_FILE = 'rules-engine-config.json';

export type PolicyChoice = { policy: Policy; warnings: string[] };

export type PolicyStore = {
  all(): Policy[];
  // The version in effect on the request date: the latest one whose `effective` date is on or before it.
  policyFor(policyId: string, requestDate: string): PolicyChoice | null;
};

// The policy folders inside a policies directory (data/policies/), one per policy.
export function policyFoldersIn(policiesDir: string): string[] {
  return readdirSync(policiesDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(policiesDir, entry.name))
    .sort();
}

// Loads every policy version in the given folders, with its rules engine config merged in (matched by policy_id).
// Any other file in a policy folder is an error, so a folder's contents are always exactly what they look like.
export function loadPolicyStore(policyFolders: string[]): PolicyStore {
  const policies: Policy[] = [];
  const configs: RulesEngineConfig[] = [];

  for (const folder of policyFolders) {
    const names = readdirSync(folder).filter((name) => name.endsWith('.json')).sort();
    for (const name of names) {
      const path = join(folder, name);
      const json = JSON.parse(readFileSync(path, 'utf8')) as unknown;
      if (name === RULES_ENGINE_CONFIG_FILE) {
        const parsed = RulesEngineConfigSchema.safeParse(json);
        if (!parsed.success) throw new Error(`Invalid rules engine config ${path}: ${parsed.error.message}`);
        configs.push(parsed.data);
      } else if (POLICY_FILE.test(name)) {
        const parsed = PolicySchema.safeParse(json);
        if (!parsed.success) throw new Error(`Invalid policy file ${path}: ${parsed.error.message}`);
        policies.push(parsed.data);
      } else {
        throw new Error(`Unexpected file ${path}: a policy folder holds policy_*.json and ${RULES_ENGINE_CONFIG_FILE} only`);
      }
    }
  }

  return policyStoreFrom(policies.map((policy) => mergeRulesEngineConfigIntoPolicy(policy, configs)));
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

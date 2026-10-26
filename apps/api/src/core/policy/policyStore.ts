import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { RulesEngineConfigSchema, mergeRulesEngineConfigIntoPolicy } from './mergeRulesEngineConfigIntoPolicy.js';
import { PolicySchema, type Policy } from './policySchema.js';

// One folder per policy, and one policy in effect at a time, e.g. data/policies/MP-SYN-021/:
//   policy.json                the payer's policy (its version and effective date are inside)
//   rules-engine-config.json   values the policy has no field for (age limit, tolerances); optional
// Updating a policy means replacing these files; git history is the record, and the version inside the file
// goes into every packet and audit event.
const POLICY_FILE = 'policy.json';
const RULES_ENGINE_CONFIG_FILE = 'rules-engine-config.json';

export type PolicyChoice = { policy: Policy; warnings: string[] };

export type PolicyStore = {
  all(): Policy[];
  policyFor(policyId: string, requestDate: string): PolicyChoice | null;
};

// The policy folders inside a policies directory (data/policies/), one per policy.
export function policyFoldersIn(policiesDir: string): string[] {
  return readdirSync(policiesDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(policiesDir, entry.name))
    .sort();
}

// Loads one policy from each folder, with the rules engine config next to it merged in.
// Anything unexpected in a folder is an error, so a folder's contents are always exactly what they look like.
export function loadPolicyStore(policyFolders: string[]): PolicyStore {
  return policyStoreFrom(policyFolders.map(loadPolicyFolder));
}

function loadPolicyFolder(folder: string): Policy {
  const unexpected = readdirSync(folder).filter((name) => name !== POLICY_FILE && name !== RULES_ENGINE_CONFIG_FILE);
  if (unexpected.length > 0) {
    throw new Error(`Unexpected file in ${folder}: ${unexpected.join(', ')}. A policy folder holds ${POLICY_FILE} and ${RULES_ENGINE_CONFIG_FILE} only`);
  }

  const policyPath = join(folder, POLICY_FILE);
  if (!existsSync(policyPath)) throw new Error(`${folder} has no ${POLICY_FILE}`);
  const policy = PolicySchema.safeParse(JSON.parse(readFileSync(policyPath, 'utf8')));
  if (!policy.success) throw new Error(`Invalid policy file ${policyPath}: ${policy.error.message}`);

  const configPath = join(folder, RULES_ENGINE_CONFIG_FILE);
  if (!existsSync(configPath)) return policy.data;
  const config = RulesEngineConfigSchema.safeParse(JSON.parse(readFileSync(configPath, 'utf8')));
  if (!config.success) throw new Error(`Invalid rules engine config ${configPath}: ${config.error.message}`);
  return mergeRulesEngineConfigIntoPolicy(policy.data, config.data);
}

export function policyStoreFrom(policies: Policy[]): PolicyStore {
  const byId = new Map<string, Policy>();
  for (const policy of policies) {
    if (byId.has(policy.policy_id)) {
      throw new Error(`Two policy folders hold ${policy.policy_id}; only one version is loaded at a time`);
    }
    byId.set(policy.policy_id, policy);
  }

  return {
    all: () => policies,
    policyFor(policyId, requestDate) {
      const policy = byId.get(policyId);
      if (policy === undefined) return null;
      // The loaded version took effect after the request was made, so it may not be the criteria the request was
      // made under. Evaluate it anyway, and say so: the warning blocks evidence_complete and the nurse reviews it.
      const warnings = requestDate < policy.effective ? ['request_before_policy_effective'] : [];
      return { policy, warnings };
    },
  };
}

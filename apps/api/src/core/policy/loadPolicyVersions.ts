import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { RulesEngineConfigSchema, mergeRulesEngineConfigIntoPolicy } from './mergeRulesEngineConfigIntoPolicy.js';
import { PolicySchema, type Policy } from './policySchema.js';
import { parseVersionFolderName, requireDirectory, visibleNames } from '../versionFolders.js';

// Reads policy versions from disk. Layout (an update is one new folder, e.g. dropped in by SFTP):
//
//   data/policies/<policy id>/<effective date>_<version>/policy.json                the payer's policy
//   data/policies/<policy id>/<effective date>_<version>/rules-engine-config.json   values the policy has no field
//                                                                                   for (optional), versioned with it
//
// The folder names must agree with what is inside policy.json, and anything unexpected is an error, so a
// half-copied or mislabelled drop stops the service at startup instead of being used. Dotfiles (.DS_Store,
// SFTP partial-upload markers) are ignored.
const POLICY_FILE = 'policy.json';
const RULES_ENGINE_CONFIG_FILE = 'rules-engine-config.json';

export function loadPolicyVersions(policiesDirs: string[]): Policy[] {
  const policies: Policy[] = [];
  for (const policiesDir of policiesDirs) {
    for (const policyId of visibleNames(policiesDir)) {
      const policyFolder = join(policiesDir, policyId);
      requireDirectory(policyFolder, 'a policies directory holds one folder per policy id');
      for (const versionName of visibleNames(policyFolder)) {
        policies.push(loadVersionFolder(join(policyFolder, versionName), policyId, versionName));
      }
    }
  }
  return policies;
}

function loadVersionFolder(folder: string, policyId: string, versionName: string): Policy {
  requireDirectory(folder, 'a policy folder holds one <effective date>_<version> folder per version');
  const folderName = parseVersionFolderName(versionName);
  if (folderName === null) {
    throw new Error(`Version folder ${folder} must be named <effective date>_<version>, e.g. 2026-07-01_2026.1`);
  }
  const unexpected = visibleNames(folder).filter((name) => name !== POLICY_FILE && name !== RULES_ENGINE_CONFIG_FILE);
  if (unexpected.length > 0) {
    throw new Error(`Unexpected file in ${folder}: ${unexpected.join(', ')}. A version folder holds ${POLICY_FILE} and ${RULES_ENGINE_CONFIG_FILE} only`);
  }

  const policyPath = join(folder, POLICY_FILE);
  if (!existsSync(policyPath)) throw new Error(`${folder} has no ${POLICY_FILE}`);
  const parsed = PolicySchema.safeParse(JSON.parse(readFileSync(policyPath, 'utf8')));
  if (!parsed.success) throw new Error(`Invalid policy file ${policyPath}: ${parsed.error.message}`);
  const policy = parsed.data;

  // The names on disk must say the same thing as the file, or nobody can trust either.
  if (policy.policy_id !== policyId) {
    throw new Error(`${policyPath} is policy ${policy.policy_id}, but its folder says ${policyId}`);
  }
  if (policy.effective !== folderName.effective || policy.version !== folderName.version) {
    throw new Error(
      `${policyPath} says effective ${policy.effective}, version ${policy.version}, but its folder says ${versionName}`,
    );
  }

  const configPath = join(folder, RULES_ENGINE_CONFIG_FILE);
  if (!existsSync(configPath)) return policy;
  const config = RulesEngineConfigSchema.safeParse(JSON.parse(readFileSync(configPath, 'utf8')));
  if (!config.success) throw new Error(`Invalid rules engine config ${configPath}: ${config.error.message}`);
  return mergeRulesEngineConfigIntoPolicy(policy, config.data);
}

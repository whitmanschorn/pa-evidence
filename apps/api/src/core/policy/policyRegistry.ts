import { canonicalJson, sha256Hex } from '../canonicalJson.js';
import type { Policy } from './policySchema.js';
import type { PolicyStore } from './policyStore.js';

// The policies the service is using right now, and a way to pick up a dropped-in version folder without a restart.
// A reload that fails (a malformed folder, a criterion with no binding) changes nothing: the service keeps
// serving the versions it had, and /ready names the problem.

export type LoadedVersion = { policy_id: string; version: string; effective: string; rules_fingerprint: string };
export type ReloadResult = { ok: boolean; problems: string[]; versions: LoadedVersion[] };

export type PolicyRegistry = PolicyStore & {
  reload(): ReloadResult;
  versions(): LoadedVersion[];
  lastReload(): (ReloadResult & { at: string }) | null;
};

// sha256 of the policy as the rules engine sees it: policy.json with its rules engine config merged in.
// The audit records it, so a packet can be traced to the exact rules even if a file changed without a version bump.
export function rulesFingerprint(policy: Policy): string {
  return sha256Hex(canonicalJson(policy));
}

export function createPolicyRegistry(options: {
  load: () => PolicyStore; // reads the policies directory (throws on a malformed folder)
  check: (store: PolicyStore) => string[]; // the startup binding check: one line per problem
  clock?: () => Date;
}): PolicyRegistry {
  const clock = options.clock ?? (() => new Date());

  // At startup a problem stops the service: there is nothing older to fall back to.
  let current = options.load();
  const startupProblems = options.check(current);
  if (startupProblems.length > 0) {
    throw new Error(`Policies failed the startup check:\n${startupProblems.join('\n')}`);
  }
  let last: (ReloadResult & { at: string }) | null = null;

  function versionsOf(store: PolicyStore): LoadedVersion[] {
    return store.all().map((policy) => ({
      policy_id: policy.policy_id,
      version: policy.version,
      effective: policy.effective,
      rules_fingerprint: rulesFingerprint(policy),
    }));
  }

  return {
    all: () => current.all(),
    policyFor: (policyId, requestDate) => current.policyFor(policyId, requestDate),
    versions: () => versionsOf(current),
    lastReload: () => last,

    reload() {
      let candidate: PolicyStore;
      let problems: string[];
      try {
        candidate = options.load();
        problems = options.check(candidate);
      } catch (error) {
        candidate = current;
        problems = [error instanceof Error ? error.message : String(error)];
      }
      if (problems.length === 0) {
        current = candidate; // one assignment: a request sees either the old policies or the new ones, never a mix
      }
      const result = { ok: problems.length === 0, problems, versions: versionsOf(current) };
      last = { ...result, at: clock().toISOString() };
      return result;
    },
  };
}

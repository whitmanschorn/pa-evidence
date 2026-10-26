import { Router } from 'express';
import type { DependencyCheck } from '../../core/health.js';
import type { ModelRegistry } from '../../core/llm/modelRegistry.js';
import { hasPermission, permissionsOf } from '@pa/shared';
import { allow } from '../allow.js';
import { identityOf } from '../locals.js';
import type { AppDeps } from '../../app.js';

export function healthRoutes(deps: AppDeps): Router {
  const router = Router();

  // Liveness: the process answers. Nothing about dependencies.
  router.get('/health', allow('health:read', deps.audit), (_req, res) => {
    res.json({ status: 'ok' });
  });

  // Readiness: FHIR server, model, audit store, policies and model versions. Detail only with health:detail.
  router.get('/ready', allow('health:read', deps.audit), async (_req, res) => {
    const [fhir, model] = await Promise.all([deps.readiness.fhir(), deps.readiness.model()]);
    const checks: Record<string, DependencyCheck> = { fhir, model, audit: auditCheck(deps), policies: policiesCheck(deps) };
    if (deps.models !== undefined) checks.model_versions = modelVersionsCheck(deps.models);
    const ready = Object.values(checks).every((check) => check.ok || !check.required);
    res.status(ready ? 200 : 503);

    const identity = identityOf(res);
    const showDetail = identity !== undefined && hasPermission(identity.role, 'health:detail');
    res.json(showDetail ? { status: ready ? 'ready' : 'not_ready', checks } : { status: ready ? 'ready' : 'not_ready' });
  });

  // Who the bearer token belongs to (named after the OIDC UserInfo endpoint); the UI header shows it.
  // Every role has health:read, so every signed-in caller can ask.
  router.get('/userinfo', allow('health:read', deps.audit), (_req, res) => {
    const identity = identityOf(res)!; // authenticate guarantees an identity
    res.json({ sub: identity.sub, role: identity.role, permissions: permissionsOf(identity.role) });
  });

  return router;
}

function auditCheck(deps: AppDeps): DependencyCheck {
  try {
    const head = deps.audit.head();
    return { ok: true, required: true, detail: { events: head.count, chain_head: head.hash } };
  } catch {
    return { ok: false, required: true, detail: { error: 'unreadable' } };
  }
}

// The policies being served, and whether the last reload worked. A failed reload leaves the service ready
// (it still serves the previous versions) but names the problem here.
function policiesCheck(deps: AppDeps): DependencyCheck {
  const last = deps.policies.lastReload();
  return {
    ok: true,
    required: true,
    detail: {
      versions: deps.policies.versions().map((version) => `${version.policy_id}@${version.version} effective ${version.effective}`),
      last_reload_at: last?.at ?? null,
      last_reload_ok: last?.ok ?? null,
      last_reload_problems: last?.problems ?? [],
    },
  };
}

// The model version folders, which one is in effect, and whether the last reload worked (same rules as policies).
function modelVersionsCheck(models: ModelRegistry): DependencyCheck {
  const last = models.lastReload();
  return {
    ok: true,
    required: false,
    detail: {
      versions: models.versions().map((version) => `${version.folder} ${version.name}${version.in_effect ? ' (in effect)' : ''}`),
      last_reload_at: last?.at ?? null,
      last_reload_ok: last?.ok ?? null,
      last_reload_problems: last?.problems ?? [],
    },
  };
}

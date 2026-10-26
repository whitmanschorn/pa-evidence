import { Router, type Response } from 'express';
import type { AuditStore } from '../../core/audit/auditStore.js';
import { allow } from '../allow.js';
import { auditEventFor } from '../auditEvents.js';
import type { AppDeps } from '../../app.js';

// Both reloads pick up a dropped-in version folder without a restart. A folder that fails validation changes nothing:
// the previous versions keep serving, and the problems come back here and in /ready.
export function adminRoutes(deps: AppDeps): Router {
  const router = Router();

  router.post('/admin/policies/reload', allow('policies:reload', deps.audit), (_req, res) => {
    const result = deps.policies.reload();
    const loaded = result.versions.map((version) => `${version.policy_id}@${version.version}`);
    answerReload(res, deps.audit, 'policies.reload', result, loaded);
  });

  router.post('/admin/models/reload', allow('models:reload', deps.audit), (_req, res) => {
    if (deps.models === undefined) {
      res.status(503).json({ error: 'internal_error' }); // this deployment has no model
      return;
    }
    const result = deps.models.reload();
    answerReload(res, deps.audit, 'models.reload', result, result.versions.map((version) => version.folder));
  });

  return router;
}

// Audits the reload (with what is loaded now), then answers 200 with the versions, or 400 with the problems.
function answerReload(
  res: Response,
  audit: AuditStore,
  action: 'policies.reload' | 'models.reload',
  result: { ok: boolean; problems: string[] },
  loadedVersions: string[],
): void {
  const status = result.ok ? 200 : 400;
  audit.append(
    auditEventFor(res, { action, outcome: result.ok ? 'success' : 'error', http_status: status, loaded_versions: loadedVersions }),
  );
  if (!result.ok) {
    res.status(status).json({ error: 'invalid_request', problems: result.problems });
    return;
  }
  res.json(result);
}

import { Router } from 'express';
import { allow } from '../allow.js';
import { auditEventFor } from '../auditEvents.js';
import type { AppDeps } from '../../app.js';

export function adminRoutes(deps: AppDeps): Router {
  const router = Router();

  // Picks up a dropped-in policy version folder without a restart. A folder that fails validation changes
  // nothing: the previous versions keep serving, and the problems come back here and in /ready.
  router.post('/admin/policies/reload', allow('policies:reload', deps.audit), (_req, res) => {
    const result = deps.policies.reload();
    deps.audit.append(
      auditEventFor(res, {
        action: 'policies.reload',
        outcome: result.ok ? 'success' : 'error',
        http_status: result.ok ? 200 : 400,
        loaded_versions: result.versions.map((version) => `${version.policy_id}@${version.version}`),
      }),
    );
    if (!result.ok) {
      res.status(400).json({ error: 'invalid_request', problems: result.problems });
      return;
    }
    res.json(result);
  });

  // Picks up a dropped-in model version folder (a new model, prompts or call settings) the same way.
  router.post('/admin/models/reload', allow('models:reload', deps.audit), (_req, res) => {
    if (deps.models === undefined) {
      res.status(503).json({ error: 'internal_error' }); // this deployment has no model
      return;
    }
    const result = deps.models.reload();
    deps.audit.append(
      auditEventFor(res, {
        action: 'models.reload',
        outcome: result.ok ? 'success' : 'error',
        http_status: result.ok ? 200 : 400,
        loaded_versions: result.versions.map((version) => version.folder),
      }),
    );
    if (!result.ok) {
      res.status(400).json({ error: 'invalid_request', problems: result.problems });
      return;
    }
    res.json(result);
  });

  return router;
}

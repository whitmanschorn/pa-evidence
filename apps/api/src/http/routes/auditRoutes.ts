import { Router } from 'express';
import { z } from 'zod';
import { allow } from '../allow.js';
import { auditEventFor } from '../auditEvents.js';
import type { AppDeps } from '../../app.js';

const AuditQuery = z.object({
  request_id: z.string().regex(/^[A-Za-z0-9-]{1,64}$/).optional(),
  limit: z.coerce.number().int().min(1).max(1000).default(100),
});

export function auditRoutes(deps: AppDeps): Router {
  const router = Router();

  // Newest first. Reading the audit trail is itself audited.
  router.get('/audit', allow('audit:read', deps.audit), (req, res) => {
    const query = AuditQuery.parse(req.query);
    const events = deps.audit.list({ requestId: query.request_id, limit: query.limit });
    deps.audit.append(auditEventFor(res, { action: 'audit.read', request_id: query.request_id ?? null }));
    res.json(events);
  });

  // Recomputes the whole hash chain.
  router.get('/audit/verify', allow('audit:read', deps.audit), (_req, res) => {
    const result = deps.audit.verify();
    deps.audit.append(auditEventFor(res, { action: 'audit.read' }));
    res.json(result);
  });

  return router;
}

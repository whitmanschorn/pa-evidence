import type { RequestHandler } from 'express';
import type { AuditStore } from '../core/audit/auditStore.js';
import { hasPermission, type Permission } from '../core/auth/permissions.js';
import { auditEventFor } from './auditEvents.js';
import { identityOf } from './locals.js';

// Every route carries allow(<permission>) (invariant 4). A caller without the permission gets 403, the body names
// the permission that was needed, and the refusal is audited.
export function allow(permission: Permission, audit: AuditStore): RequestHandler {
  return (req, res, next) => {
    const identity = identityOf(res);
    if (identity !== undefined && hasPermission(identity.role, permission)) {
      next();
      return;
    }
    const requestId = typeof req.params.id === 'string' ? req.params.id : null;
    audit.append(
      auditEventFor(res, {
        action: 'refusal',
        outcome: 'refused',
        http_status: 403,
        request_id: requestId,
        refusal_reason: 'insufficient_permission',
        required_permission: permission,
      }),
    );
    res.status(403).json({ error: 'forbidden', required_permission: permission });
  };
}

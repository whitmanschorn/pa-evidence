import type { RequestHandler } from 'express';
import type { AuditStore } from '../core/audit/auditStore.js';
import type { IdentityVerifier } from '../core/auth/identityVerifier.js';
import { auditEventFor } from './auditEvents.js';
import { setIdentity } from './locals.js';

// Every route below this middleware requires a caller identity. No token or an unknown token
// is refused with 401 and the refusal is audited.
export function authenticate(verifier: IdentityVerifier, audit: AuditStore): RequestHandler {
  return (req, res, next) => {
    const header = req.get('authorization');
    const token = header?.startsWith('Bearer ') === true ? header.slice('Bearer '.length).trim() : undefined;
    const identity = token === undefined || token === '' ? null : verifier.verify(token);

    if (identity === null) {
      const reason = token === undefined || token === '' ? 'missing_token' : 'invalid_token';
      audit.append(auditEventFor(res, { action: 'refusal', outcome: 'refused', http_status: 401, refusal_reason: reason }));
      // The default reason phrase for 401 is a banned word, and curl -i shows it, so say what it means.
      res.statusMessage = 'Unauthenticated';
      res.status(401).json({ error: 'unauthenticated' });
      return;
    }
    setIdentity(res, identity);
    next();
  };
}

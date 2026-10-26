import { randomUUID } from 'node:crypto';
import type { RequestHandler } from 'express';
import { setRequestId } from './locals.js';

// Every request gets an id, echoed in X-Request-Id and in its log line, so `grep <id>` finds it.
// A well-formed incoming id (from a proxy) is kept; anything else is replaced.
const ACCEPTED_ID = /^[A-Za-z0-9-]{8,64}$/;

export function requestId(): RequestHandler {
  return (req, res, next) => {
    const incoming = req.get('x-request-id');
    const id = incoming !== undefined && ACCEPTED_ID.test(incoming) ? incoming : randomUUID();
    setRequestId(res, id);
    res.setHeader('X-Request-Id', id);
    next();
  };
}

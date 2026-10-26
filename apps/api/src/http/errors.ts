import type { ErrorRequestHandler, RequestHandler } from 'express';
import type { Logger } from 'pino';
import { ZodError } from 'zod';
import { NotFoundError } from '../core/packet/assemblePacket.js';
import { OutputPolicyError } from '../core/safety/forbiddenTerms.js';

// Error bodies use only the fixed codes; details go to the log as a type, never as data.
export function notFound(): RequestHandler {
  return (_req, res) => {
    res.status(404).json({ error: 'not_found' });
  };
}

export function errorHandler(logger: Logger): ErrorRequestHandler {
  return (error: unknown, _req, res, _next) => {
    if (error instanceof ZodError || (error as { type?: string }).type === 'entity.parse.failed') {
      res.status(400).json({ error: 'invalid_request' });
      return;
    }
    if (error instanceof NotFoundError) {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    if (error instanceof OutputPolicyError) {
      res.status(500).json({ error: 'output_policy_violation' });
      return;
    }
    // The error's class name only: a message could carry data from a downstream system.
    logger.error({ error_type: error instanceof Error ? error.name : typeof error }, 'unhandled error');
    res.status(500).json({ error: 'internal_error' });
  };
}

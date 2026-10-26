import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Request, Response } from 'express';
import { pino, type Logger } from 'pino';
import { pinoHttp } from 'pino-http';
import { logFieldsOf, requestIdOf } from './locals.js';

// Logs carry request ids, the route pattern, status, timings and counts. Never names, birth dates, identifiers,
// clinical values, headers, bodies, URLs, prompts or model output (invariant 11). The URL is left out because a
// source URL contains FHIR resource ids; the route pattern ("/requests/:id/evidence") says the same without them.
export function createLogger(level: string, destination?: NodeJS.WritableStream): Logger {
  const options = {
    level,
    timestamp: pino.stdTimeFunctions.isoTime,
    redact: ['req.headers.authorization', 'req.headers.cookie'], // defence in depth: headers are never serialized
  };
  return destination === undefined ? pino(options) : pino(options, destination);
}

export function httpLogger(logger: Logger) {
  return pinoHttp({
    logger,
    genReqId: (_req: IncomingMessage, res: ServerResponse) => requestIdOf(res as Response),
    wrapSerializers: false,
    serializers: {
      req: (req: IncomingMessage & { id?: string }) => ({ id: req.id, method: req.method }),
      res: (res: ServerResponse) => ({ statusCode: res.statusCode }),
    },
    // pino-http calls this when the request starts (before routing) and again when the response finishes.
    // Only the second call has the route pattern and the handler's counts, so the first adds nothing; otherwise
    // the line would carry the key twice.
    customProps: (req: IncomingMessage, res: ServerResponse) =>
      res.headersSent ? { route_pattern: routePattern(req as Request), ...logFieldsOf(res as Response) } : {},
    customLogLevel: (_req, res, error) => {
      if (error !== undefined || res.statusCode >= 500) return 'error';
      if (res.statusCode >= 400) return 'warn';
      return 'info';
    },
    customSuccessMessage: () => 'request completed',
    customErrorMessage: () => 'request failed',
  });
}

function routePattern(req: Request): string {
  const path = (req.route as { path?: string } | undefined)?.path;
  return path === undefined ? 'unmatched' : `${req.baseUrl}${path}`;
}

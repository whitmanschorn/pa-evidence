// Pairs the API's log lines with the audit events their requests wrote, for `make tail-log-and-audit`.
// Pure functions; tail-log-and-audit.ts does the reading and the printing.

// The fields of a log line (pino-http, apps/api/src/http/httpLogger.ts) that the pairing reads.
export type LogLine = {
  time: string;
  req?: { id?: string; method?: string };
  route_pattern?: string;
  res?: { statusCode?: number };
  request_id?: string;
};

// The fields of an audit event (packages/shared/src/audit.ts) that the pairing reads.
export type AuditEventFields = { ts: string; action: string; request_id: string | null };

// The X-Request-Id prefix on the tail's own audit reads, so their log lines can be left out.
export const OWN_REQUEST_PREFIX = 'tail-';

// A request's audit event and its log line are both written as its response ends, usually in the same millisecond.
export const MAX_GAP_MS = 1000;

// A log line, or null for anything else the container prints.
export function parseLogLine(raw: string): LogLine | null {
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== 'object' || value === null) return null;
    if (typeof (value as { time?: unknown }).time !== 'string') return null;
    return value as LogLine;
  } catch {
    return null;
  }
}

// Every request but the health probe, the UI's static files (2xx and 3xx with no route pattern) and the tail's own
// audit reads. Refusals before routing (401, route pattern "unmatched") are shown.
export function isShown(line: LogLine): boolean {
  const status = line.res?.statusCode ?? 0;
  if (line.route_pattern === '/health') return false;
  if (line.route_pattern === 'unmatched' && status < 400) return false;
  if (line.req?.id?.startsWith(OWN_REQUEST_PREFIX) === true) return false;
  return true;
}

// The audit action a request writes, from its route and status. Null for the routes that write none (the queue,
// /userinfo) and for /mcp, whose requests carry the protocol's handshake as well as tool calls.
export function auditActionFor(line: LogLine): string | null {
  const status = line.res?.statusCode ?? 0;
  if (status === 401 || status === 403) return 'refusal';
  switch (line.route_pattern) {
    case '/requests/:id/evidence':
      return 'packet.read';
    case '/requests/:id/sources/:type/:fhirId':
      return 'source.read';
    case '/requests/:id/agent-runs':
      return 'agent.run';
    case '/audit':
    case '/audit/verify':
      return 'audit.read';
    case '/admin/policies/reload':
      return 'policies.reload';
    case '/admin/models/reload':
      return 'models.reload';
    default:
      return null;
  }
}

// The audit event a log line's request wrote: the expected action, the same request id when both name one, and the
// closest in time, within MAX_GAP_MS. Null when there is none.
export function matchingAuditEvent<T extends AuditEventFields>(line: LogLine, action: string, events: T[]): T | null {
  const logged = Date.parse(line.time);
  let best: T | null = null;
  let bestGap = Infinity;
  for (const event of events) {
    if (event.action !== action) continue;
    if (line.request_id !== undefined && event.request_id !== null && event.request_id !== line.request_id) continue;
    const gap = Math.abs(Date.parse(event.ts) - logged);
    if (gap <= MAX_GAP_MS && gap < bestGap) {
      best = event;
      bestGap = gap;
    }
  }
  return best;
}

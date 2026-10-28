import { describe, expect, it } from 'vitest';
import { auditActionFor, isShown, matchingAuditEvent, parseLogLine, type LogLine } from '../logAudit.js';

const packetLine: LogLine = {
  time: '2026-10-28T16:44:52.753Z',
  req: { id: 'afbba9ba-42d2-4f51-bcd5-5eaea5eaa255', method: 'GET' },
  route_pattern: '/requests/:id/evidence',
  res: { statusCode: 200 },
  request_id: 'PA-003',
};

describe('parseLogLine', () => {
  it('reads a log line and passes over anything else', () => {
    expect(parseLogLine(JSON.stringify(packetLine))).toEqual(packetLine);
    expect(parseLogLine('Listening on 8080')).toBeNull();
    expect(parseLogLine('{"msg":"no time"}')).toBeNull();
  });
});

describe('isShown', () => {
  it('shows requests and refusals, not the health probe, static files or its own audit reads', () => {
    expect(isShown(packetLine)).toBe(true);
    expect(isShown({ ...packetLine, route_pattern: 'unmatched', res: { statusCode: 401 } })).toBe(true);
    expect(isShown({ ...packetLine, route_pattern: '/health' })).toBe(false);
    expect(isShown({ ...packetLine, route_pattern: 'unmatched', res: { statusCode: 304 } })).toBe(false);
    expect(isShown({ ...packetLine, route_pattern: '/audit', req: { id: 'tail-1234-abcd' } })).toBe(false);
  });
});

describe('auditActionFor', () => {
  it('names the action from the route, and refusal for 401 and 403', () => {
    expect(auditActionFor(packetLine)).toBe('packet.read');
    expect(auditActionFor({ ...packetLine, route_pattern: '/requests/:id/sources/:type/:fhirId' })).toBe('source.read');
    expect(auditActionFor({ ...packetLine, route_pattern: 'unmatched', res: { statusCode: 401 } })).toBe('refusal');
    expect(auditActionFor({ ...packetLine, route_pattern: '/audit', res: { statusCode: 403 } })).toBe('refusal');
    expect(auditActionFor({ ...packetLine, route_pattern: '/requests' })).toBeNull();
    expect(auditActionFor({ ...packetLine, route_pattern: '/mcp' })).toBeNull();
  });
});

describe('matchingAuditEvent', () => {
  const event = (ts: string, action: string, requestId: string | null) => ({ ts, action, request_id: requestId });

  it('takes the closest event with the action and request id, within a second', () => {
    const events = [
      event('2026-10-28T16:44:52.900Z', 'packet.read', 'PA-003'),
      event('2026-10-28T16:44:52.753Z', 'packet.read', 'PA-003'),
      event('2026-10-28T16:44:52.753Z', 'packet.read', 'PA-004'),
      event('2026-10-28T16:44:52.753Z', 'audit.read', 'PA-003'),
    ];
    expect(matchingAuditEvent(packetLine, 'packet.read', events)).toBe(events[1]);
  });

  it('matches a refusal, which names no request', () => {
    const refusalLine: LogLine = { time: '2026-10-28T16:45:04.611Z', route_pattern: 'unmatched', res: { statusCode: 401 } };
    const refusal = event('2026-10-28T16:45:04.604Z', 'refusal', null);
    expect(matchingAuditEvent(refusalLine, 'refusal', [refusal])).toBe(refusal);
  });

  it('finds none more than a second away', () => {
    expect(matchingAuditEvent(packetLine, 'packet.read', [event('2026-10-28T16:44:54.000Z', 'packet.read', 'PA-003')])).toBeNull();
  });
});

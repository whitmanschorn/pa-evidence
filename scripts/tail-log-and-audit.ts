// pnpm tail-log-and-audit (make tail-log-and-audit): follows the API's log from now on and, under each request's log
// line, prints the audit event that request wrote (a packet, a refusal, a source view, an agent run, an audit read).
// Start it in a second terminal after `make up`, then use the UI or curl in the first. Ctrl-C stops it.
//
// The audit events are read through the API with the admin token from .tokens.local, so each read is itself audited
// (audit.read) and logged. Those requests carry an X-Request-Id starting with "tail-", and their log lines are not shown.
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { OWN_REQUEST_PREFIX, auditActionFor, isShown, matchingAuditEvent, parseLogLine, type AuditEventFields, type LogLine } from './logAudit.js';

const REPO_ROOT = fileURLToPath(new URL('../', import.meta.url));
const API_URL = process.env.API_URL ?? 'http://localhost:8080';
const RETRY_MS = 300; // the audit event can be stored a moment after the log line is printed
const RECENT_EVENTS = '50';

const colour = process.stdout.isTTY;
const paint = (code: string, text: string) => (colour ? `\x1b[${code}m${text}\x1b[0m` : text);

function adminToken(): string {
  const line = readFileSync(join(REPO_ROOT, '.tokens.local'), 'utf8')
    .split('\n')
    .find((entry) => entry.startsWith('admin='));
  if (line === undefined) throw new Error('No admin token in .tokens.local. Run `make tokens`.');
  return line.slice('admin='.length).trim();
}

type AuditEvent = AuditEventFields & Record<string, unknown>;

// The newest events, unfiltered: an audit read records the request id it asked for, so asking by request id would put
// the tail's own reads among that request's events (where `GET /audit?request_id=...` would list them first).
async function recentAuditEvents(token: string): Promise<AuditEvent[]> {
  const response = await fetch(`${API_URL}/audit?limit=${RECENT_EVENTS}`, {
    headers: { Authorization: `Bearer ${token}`, 'X-Request-Id': `${OWN_REQUEST_PREFIX}${randomUUID()}` },
  });
  if (!response.ok) throw new Error(`GET /audit answered HTTP ${response.status}`);
  return (await response.json()) as AuditEvent[];
}

async function auditEventFor(token: string, line: LogLine, action: string): Promise<AuditEvent | null> {
  const first = matchingAuditEvent(line, action, await recentAuditEvents(token));
  if (first !== null) return first;
  await delay(RETRY_MS);
  return matchingAuditEvent(line, action, await recentAuditEvents(token));
}

function heading(line: LogLine): string {
  const status = line.res?.statusCode ?? 0;
  const parts = [line.time.slice(11), line.req?.method, line.route_pattern, String(status), line.request_id];
  const text = parts.filter((part) => part !== undefined && part !== '').join('  ');
  return paint(status >= 400 ? '1;33' : '1', text);
}

async function main(): Promise<void> {
  const token = adminToken();
  const logs = spawn('docker', ['compose', 'logs', '-f', '--tail', '0', '--no-log-prefix', 'api'], {
    cwd: REPO_ROOT,
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  console.log(paint('2', `Following the API's log from now on, with each request's audit event (${API_URL}). Ctrl-C to stop.`));

  for await (const raw of createInterface({ input: logs.stdout })) {
    const line = parseLogLine(raw);
    if (line === null) {
      console.log(paint('2', raw));
      continue;
    }
    if (!isShown(line)) continue;
    console.log(`\n${heading(line)}`);
    console.log(`${paint('36', 'log  ')}  ${raw}`);
    const action = auditActionFor(line);
    if (action === null) continue;
    const event = await auditEventFor(token, line, action);
    const shown = event === null ? paint('2', `(no ${action} event within a second of this line)`) : JSON.stringify(event);
    console.log(`${paint('35', 'audit')}  ${shown}`);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

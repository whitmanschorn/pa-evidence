import { mkdtempSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { GENESIS_HASH, openAuditStore } from '../../src/core/audit/auditStore.js';
import { sha256Hex } from '../../src/core/canonicalJson.js';
import { auditInput } from '../support/auditInput.js';

function tempDbPath(): string {
  return join(mkdtempSync(join(tmpdir(), 'audit-')), 'audit.db');
}

describe('audit store', () => {
  it('chains each event to the previous one, starting from 64 zeros', () => {
    const store = openAuditStore(':memory:');
    const first = store.append(auditInput());
    const second = store.append(auditInput({ request_id: 'PA-002' }));
    expect(first.prev_hash).toBe(GENESIS_HASH);
    expect(second.prev_hash).toBe(first.hash);
    expect(store.head()).toEqual({ count: 2, hash: second.hash });
    expect(store.verify()).toEqual({ intact: true, count: 2, head: second.hash, first_broken_event_id: null });
  });

  it('hashes prev_hash + the canonical JSON of the event', () => {
    const store = openAuditStore(':memory:', () => new Date('2026-10-26T12:00:00.000Z'));
    const event = store.append(auditInput());
    const { prev_hash: prevHash, hash, ...body } = event;
    const sortedJson = JSON.stringify(Object.fromEntries(Object.entries(body).sort(([a], [b]) => a.localeCompare(b))));
    expect(hash).toBe(sha256Hex(prevHash + sortedJson));
  });

  it('lists newest first, optionally for one request', () => {
    const store = openAuditStore(':memory:');
    store.append(auditInput({ request_id: 'PA-001' }));
    store.append(auditInput({ request_id: 'PA-002' }));
    store.append(auditInput({ request_id: 'PA-001', action: 'source.read' }));
    expect(store.list({ requestId: 'PA-001', limit: 10 }).map((event) => event.action)).toEqual(['source.read', 'packet.read']);
    expect(store.list({ limit: 1 })).toHaveLength(1);
  });

  it('rejects UPDATE and DELETE (append-only triggers)', () => {
    const path = tempDbPath();
    openAuditStore(path).append(auditInput());
    const raw = new DatabaseSync(path);
    expect(() => raw.exec("UPDATE audit_events SET action = 'x'")).toThrow('append-only');
    expect(() => raw.exec('DELETE FROM audit_events')).toThrow('append-only');
  });

  it('detects an edited row once someone drops the triggers', () => {
    const path = tempDbPath();
    const store = openAuditStore(path);
    store.append(auditInput());
    const tampered = store.append(auditInput({ request_id: 'PA-002', route: 'clinician_review' }));
    store.append(auditInput({ request_id: 'PA-003' }));

    const raw = new DatabaseSync(path);
    raw.exec('DROP TRIGGER audit_events_no_update');
    raw.exec("UPDATE audit_events SET body = replace(body, 'clinician_review', 'evidence_complete') WHERE seq = 2");

    expect(store.verify()).toMatchObject({ intact: false, first_broken_event_id: tampered.event_id });
  });

  it('detects a deleted row', () => {
    const path = tempDbPath();
    const store = openAuditStore(path);
    store.append(auditInput());
    store.append(auditInput({ request_id: 'PA-002' }));
    const after = store.append(auditInput({ request_id: 'PA-003' }));

    const raw = new DatabaseSync(path);
    raw.exec('DROP TRIGGER audit_events_no_delete');
    raw.exec('DELETE FROM audit_events WHERE seq = 2');

    expect(store.verify()).toMatchObject({ intact: false, first_broken_event_id: after.event_id });
  });
});

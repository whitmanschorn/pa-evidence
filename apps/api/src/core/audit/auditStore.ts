import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { AuditEventSchema, type AuditEvent, type AuditVerify } from '@pa/shared';
import { canonicalJson, sha256Hex } from '../canonicalJson.js';

// Append-only audit store in SQLite, made tamper-evident with a hash chain:
//   hash = sha256(prev_hash + canonical JSON of the event without its hashes)
// The first event's prev_hash is 64 zeros. Triggers reject UPDATE and DELETE, so rows can only be added;
// someone with file access could drop the triggers, which is why verify() recomputes the whole chain.
// (Production adds anchoring of the chain head to WORM storage and a SIEM copy; see README.)

export const GENESIS_HASH = '0'.repeat(64);

// What a caller supplies. The store adds event_id, ts and the hashes.
export type AuditEventInput = Omit<AuditEvent, 'event_id' | 'ts' | 'prev_hash' | 'hash'>;

export type AuditStore = {
  append(input: AuditEventInput): AuditEvent;
  list(filter: { requestId?: string; limit: number }): AuditEvent[];
  verify(): AuditVerify;
  head(): { count: number; hash: string };
  close(): void;
};

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS audit_events (
    seq        INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id   TEXT NOT NULL UNIQUE,
    request_id TEXT,
    action     TEXT NOT NULL,
    body       TEXT NOT NULL,   -- canonical JSON of the event without prev_hash and hash
    prev_hash  TEXT NOT NULL,
    hash       TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS audit_events_request_id ON audit_events (request_id);
  CREATE TRIGGER IF NOT EXISTS audit_events_no_update BEFORE UPDATE ON audit_events
    BEGIN SELECT RAISE(ABORT, 'audit_events is append-only'); END;
  CREATE TRIGGER IF NOT EXISTS audit_events_no_delete BEFORE DELETE ON audit_events
    BEGIN SELECT RAISE(ABORT, 'audit_events is append-only'); END;
`;

type Row = { seq: number; event_id: string; body: string; prev_hash: string; hash: string };

export function openAuditStore(path: string, clock: () => Date = () => new Date()): AuditStore {
  const db = new DatabaseSync(path);
  db.exec(SCHEMA);

  const lastRow = db.prepare('SELECT hash FROM audit_events ORDER BY seq DESC LIMIT 1');
  const insert = db.prepare(
    'INSERT INTO audit_events (event_id, request_id, action, body, prev_hash, hash) VALUES (?, ?, ?, ?, ?, ?)',
  );

  function toEvent(row: Row): AuditEvent {
    return AuditEventSchema.parse({ ...JSON.parse(row.body), prev_hash: row.prev_hash, hash: row.hash });
  }

  return {
    append(input) {
      const body = { ...input, event_id: randomUUID(), ts: clock().toISOString() };
      const bodyJson = canonicalJson(body);
      // Read the head and insert in one write transaction, so two writers can never chain from the same head.
      db.exec('BEGIN IMMEDIATE');
      try {
        const previous = lastRow.get() as { hash: string } | undefined;
        const prevHash = previous?.hash ?? GENESIS_HASH;
        const hash = sha256Hex(prevHash + bodyJson);
        insert.run(body.event_id, input.request_id, input.action, bodyJson, prevHash, hash);
        db.exec('COMMIT');
        return AuditEventSchema.parse({ ...body, prev_hash: prevHash, hash });
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    },

    list({ requestId, limit }) {
      const rows =
        requestId === undefined
          ? db.prepare('SELECT * FROM audit_events ORDER BY seq DESC LIMIT ?').all(limit)
          : db.prepare('SELECT * FROM audit_events WHERE request_id = ? ORDER BY seq DESC LIMIT ?').all(requestId, limit);
      return (rows as Row[]).map(toEvent);
    },

    // Walks the chain from the first event: each row must point at the previous row's hash, and its own hash
    // must match its body. Any edited, inserted or removed row breaks one of the two.
    verify() {
      const rows = db.prepare('SELECT * FROM audit_events ORDER BY seq').all() as Row[];
      let expectedPrev = GENESIS_HASH;
      for (const row of rows) {
        const recomputed = sha256Hex(row.prev_hash + row.body);
        if (row.prev_hash !== expectedPrev || row.hash !== recomputed) {
          return { intact: false, count: rows.length, head: expectedPrev, first_broken_event_id: row.event_id };
        }
        expectedPrev = row.hash;
      }
      return { intact: true, count: rows.length, head: expectedPrev, first_broken_event_id: null };
    },

    head() {
      const count = (db.prepare('SELECT COUNT(*) AS n FROM audit_events').get() as { n: number }).n;
      const previous = lastRow.get() as { hash: string } | undefined;
      return { count, hash: previous?.hash ?? GENESIS_HASH };
    },

    close() {
      db.close();
    },
  };
}

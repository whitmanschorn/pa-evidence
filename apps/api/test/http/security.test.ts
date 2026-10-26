import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { AuditEventSchema, ErrorBodySchema, findForbiddenTerms } from '@pa/shared';
import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { outputGuard } from '../../src/http/outputGuard.js';
import { REPO_ROOT } from '../support/repoRoot.js';
import { TOKENS, bearer, settle, testApp } from '../support/testApp.js';

describe('authentication and roles', () => {
  it('refuses a call without a token with 401, no banned word even in the status line, and audits it', async () => {
    const { app, audit } = testApp();
    const response = await request(app).get('/requests/PA-001/evidence');

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: 'unauthenticated' });
    // The raw response's reason phrase (supertest's types leave `res` out).
    expect((response as unknown as { res: { statusMessage: string } }).res.statusMessage).toBe('Unauthenticated');
    const [event] = audit.list({ limit: 10 });
    expect(event).toMatchObject({ action: 'refusal', outcome: 'refused', http_status: 401, refusal_reason: 'missing_token', actor_sub: null });
  });

  it('refuses an unknown token as invalid_token', async () => {
    const { app, audit } = testApp();
    const response = await request(app).get('/health').set('Authorization', 'Bearer not-a-real-token');
    expect(response.status).toBe(401);
    expect(audit.list({ limit: 1 })[0]?.refusal_reason).toBe('invalid_token');
  });

  it('refuses the nurse on /audit with 403 naming the permission, and audits it', async () => {
    const { app, audit } = testApp();
    const response = await request(app).get('/audit').set(bearer('nurse'));

    expect(response.status).toBe(403);
    expect(response.body).toEqual({ error: 'forbidden', required_permission: 'audit:read' });
    expect(audit.list({ limit: 1 })[0]).toMatchObject({
      action: 'refusal',
      actor_sub: 'nurse-1',
      actor_role: 'nurse',
      http_status: 403,
      refusal_reason: 'insufficient_permission',
      required_permission: 'audit:read',
    });
  });

  it('lets the admin read the audit trail', async () => {
    const { app } = testApp();
    const response = await request(app).get('/audit').set(bearer('admin'));
    expect(response.status).toBe(200);
    expect(Array.isArray(response.body)).toBe(true);
  });

  it('lets the probe read health and nothing else', async () => {
    const { app } = testApp();
    expect((await request(app).get('/health').set(bearer('probe'))).status).toBe(200);
    expect((await request(app).get('/requests').set(bearer('probe'))).status).toBe(403);
  });

  it('answers unknown paths with not_found, but only after authentication', async () => {
    const { app } = testApp();
    expect((await request(app).get('/nope')).status).toBe(401);
    const response = await request(app).get('/nope').set(bearer('nurse'));
    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'not_found' });
  });

  it('marks every API response no-store and gives it a request id', async () => {
    const { app } = testApp();
    const response = await request(app).get('/health').set(bearer('nurse'));
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe('packet request audit event', () => {
  it('writes exactly one event, with every field, and no clinical values', async () => {
    const { app, audit } = testApp();
    const response = await request(app).get('/requests/PA-001/evidence').set(bearer('nurse'));
    await settle();

    expect(response.status).toBe(200);
    const events = audit.list({ limit: 10 });
    expect(events).toHaveLength(1);
    const event = AuditEventSchema.parse(events[0]);
    expect(Object.keys(event).sort()).toEqual(Object.keys(AuditEventSchema.shape).sort());
    expect(event).toMatchObject({
      actor_sub: 'nurse-1',
      actor_role: 'nurse',
      action: 'packet.read',
      outcome: 'success',
      http_status: 200,
      request_id: 'PA-001',
      member_ref: 'Patient/1805a90b-326d-5089-845f-185dae4679fd',
      policy_id: 'MP-SYN-021',
      policy_version: '2026.1',
      assembler: 'rules',
      route: 'evidence_complete',
      warnings: [],
    });
    expect(event.rules_fingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(event.cited_sources).toContain('Observation/17151fc0-9010-5d12-9ee1-d8ca14145838');

    const text = JSON.stringify(event);
    for (const clinical of ['8.1 %', 'age 54', '365 of 365', 'Type 2 diabetes', 'Marisol', '1972-03-14', 'SYN-001']) {
      expect(text).not.toContain(clinical);
    }
  });

  it('writes one event for an unknown request too, as an error', async () => {
    const { app, audit } = testApp();
    const response = await request(app).get('/requests/PA-999/evidence').set(bearer('nurse'));
    await settle();
    expect(response.status).toBe(404);
    expect(audit.list({ limit: 10 })).toMatchObject([{ action: 'packet.read', outcome: 'error', http_status: 404, request_id: 'PA-999' }]);
  });
});

// Everything a log must never contain, taken from the supplied charts: names, birth dates, MRNs, patient ids.
function phiFromBundles(): string[] {
  const values: string[] = [];
  const dir = join(REPO_ROOT, 'data/bundles');
  for (const file of readdirSync(dir)) {
    const bundle = JSON.parse(readFileSync(join(dir, file), 'utf8')) as fhir4.Bundle;
    const patient = bundle.entry?.find((entry) => entry.resource?.resourceType === 'Patient')?.resource as fhir4.Patient;
    values.push(patient.id ?? '', patient.birthDate ?? '');
    values.push(...(patient.name ?? []).flatMap((name) => [name.family ?? '', ...(name.given ?? [])]));
    values.push(...(patient.identifier ?? []).map((identifier) => identifier.value ?? ''));
  }
  return values.filter((value) => value !== '');
}

describe('PHI canary on logs', () => {
  it('logs ids, timings and counts for packet requests, never PHI, clinical values or tokens', async () => {
    const { app, logs } = testApp();
    const clinicalValues: string[] = [];
    for (const requestId of ['PA-001', 'PA-002', 'PA-003', 'PA-004', 'PA-005', 'PA-006', 'PA-007']) {
      const response = await request(app).get(`/requests/${requestId}/evidence`).set(bearer('nurse'));
      for (const criterion of response.body.criteria as { value?: string; attested?: { value: string } }[]) {
        if (criterion.value !== undefined) clinicalValues.push(criterion.value);
        if (criterion.attested !== undefined) clinicalValues.push(criterion.attested.value);
      }
    }
    await request(app).get('/requests/PA-001/sources/Patient/1805a90b-326d-5089-845f-185dae4679fd').set(bearer('nurse'));
    await settle();

    const text = logs();
    for (const forbidden of [...phiFromBundles(), ...clinicalValues, ...Object.values(TOKENS), 'Bearer']) {
      expect(text, `log contains "${forbidden}"`).not.toContain(forbidden);
    }

    const line = text.split('\n').map((entry) => (entry === '' ? null : JSON.parse(entry))).find((entry) => entry?.request_id === 'PA-001');
    expect(line).toMatchObject({ msg: 'request completed', route_pattern: '/requests/:id/evidence', route: 'evidence_complete', sources: 4, warnings: 0 }); // C1, C2, C3, C5 (C4 cites none when met)
    expect(typeof line.fhir_ms).toBe('number');
    expect(typeof line.responseTime).toBe('number');
    // JSON.parse keeps the last of two equal keys, so check the raw line: each key once.
    const rawLine = text.split('\n').find((entry) => entry.includes('"request_id":"PA-001"')) ?? '';
    expect(rawLine.match(/"route_pattern"/g)).toHaveLength(1);
  });
});

describe('banned-word guard', () => {
  it('replaces a response containing a banned word with output_policy_violation', async () => {
    const app = express();
    app.use(outputGuard());
    app.get('/leaky', (_req, res) => {
      res.json({ text: 'This request is approved.' });
    });
    const response = await request(app).get('/leaky');
    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: 'output_policy_violation' });
  });

  it('finds no banned word in any response for any request, including every source view', async () => {
    const { app } = testApp();
    const bodies: string[] = [];
    for (const path of ['/health', '/ready', '/userinfo', '/requests', '/audit', '/audit/verify', '/nope']) {
      bodies.push((await request(app).get(path).set(bearer('admin'))).text);
    }
    bodies.push((await request(app).get('/requests')).text); // a refusal
    for (const requestId of ['PA-001', 'PA-002', 'PA-003', 'PA-004', 'PA-005', 'PA-006', 'PA-007']) {
      const packet = await request(app).get(`/requests/${requestId}/evidence`).set(bearer('nurse'));
      expect(packet.status).toBe(200);
      bodies.push(packet.text);
      const refs = new Set<string>();
      for (const criterion of packet.body.criteria as { sources: string[]; considered: { ref: string }[] }[]) {
        criterion.sources.forEach((ref) => refs.add(ref));
        criterion.considered.forEach((item) => refs.add(item.ref));
      }
      for (const ref of refs) {
        const source = await request(app).get(`/requests/${requestId}/sources/${ref}`).set(bearer('nurse'));
        expect(source.status, ref).toBe(200);
        bodies.push(source.text);
      }
    }
    for (const body of bodies) {
      expect(findForbiddenTerms(body)).toEqual([]);
    }
  });

  it('uses only the fixed error codes in error bodies', async () => {
    const { app } = testApp();
    const errors = [
      await request(app).get('/requests'),
      await request(app).get('/audit').set(bearer('nurse')),
      await request(app).get('/requests/PA-999/evidence').set(bearer('nurse')),
      await request(app).get('/requests/bad id!/evidence').set(bearer('nurse')),
    ];
    for (const response of errors) {
      expect(response.status).toBeGreaterThanOrEqual(400);
      expect(ErrorBodySchema.parse(response.body)).toBeTruthy();
    }
  });
});

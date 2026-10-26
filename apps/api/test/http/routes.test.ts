import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { AuditVerifySchema, PacketSchema, ReadySchema, ReloadResultSchema, RequestSummarySchema, SourceViewSchema, UserInfoSchema } from '@pa/shared';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { POLICIES_DIR } from '../support/suppliedWorld.js';
import { bearer, settle, testApp } from '../support/testApp.js';

describe('requests and packets', () => {
  it('lists the queue', async () => {
    const response = await request(testApp().app).get('/requests').set(bearer('nurse'));
    const queue = response.body.map((row: unknown) => RequestSummarySchema.parse(row));
    expect(queue).toHaveLength(7);
    expect(queue[0]).toEqual({
      request_id: 'PA-001',
      request_date: '2026-10-01',
      urgency: 'standard',
      drug: 'Semaglutide 0.25 MG/0.5 MG Injection, weekly',
      policy_id: 'MP-SYN-021',
    });
  });

  it('returns the packet for a request, matching the shared contract', async () => {
    const response = await request(testApp().app).get('/requests/PA-006/evidence').set(bearer('nurse'));
    const packet = PacketSchema.parse(response.body);
    expect(packet.criteria.find((criterion) => criterion.id === 'C2')?.status).toBe('conflicting');
  });

  it('rejects a malformed request id with invalid_request', async () => {
    const response = await request(testApp().app).get('/requests/bad%20id/evidence').set(bearer('nurse'));
    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'invalid_request' });
  });
});

describe('source view', () => {
  it('shows a cited resource without free text, and audits the view', async () => {
    const { app, audit } = testApp();
    // PA-006's Condition note carries injected instructions: the note must not come through.
    const response = await request(app)
      .get('/requests/PA-006/sources/Condition/d8713d44-715b-5d4b-8679-9a67e76987c4')
      .set(bearer('nurse'));
    await settle();

    const view = SourceViewSchema.parse(response.body);
    expect(view.resource.note).toBeUndefined();
    expect(view.omitted).toContain('note');
    expect(view.resource.code).toBeDefined();
    expect(audit.list({ limit: 1 })[0]).toMatchObject({
      action: 'source.read',
      request_id: 'PA-006',
      cited_sources: ['Condition/d8713d44-715b-5d4b-8679-9a67e76987c4'],
    });
  });

  it('shows the Patient with its birth date but without name or identifiers', async () => {
    const response = await request(testApp().app)
      .get('/requests/PA-001/sources/Patient/1805a90b-326d-5089-845f-185dae4679fd')
      .set(bearer('nurse'));
    const view = SourceViewSchema.parse(response.body);
    expect(view.resource.birthDate).toBe('1972-03-14');
    expect(view.resource.name).toBeUndefined();
    expect(view.resource.identifier).toBeUndefined();
  });

  it('refuses a resource the packet does not reference, so the endpoint cannot browse the chart', async () => {
    // The LDL Observation is in PA-001's chart but not in its packet.
    const response = await request(testApp().app)
      .get('/requests/PA-001/sources/Observation/f7eaa7b5-88aa-511a-a369-449e9c72e7c4')
      .set(bearer('nurse'));
    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'not_found' });
  });
});

describe('audit endpoints', () => {
  it('filters by request id, and records the read itself', async () => {
    const { app, audit } = testApp();
    await request(app).get('/requests/PA-001/evidence').set(bearer('nurse'));
    await request(app).get('/requests/PA-002/evidence').set(bearer('nurse'));
    await settle();

    const response = await request(app).get('/audit?request_id=PA-002').set(bearer('admin'));
    expect(response.body.map((event: { request_id: string }) => event.request_id)).toEqual(['PA-002']);
    expect(audit.list({ limit: 1 })[0]).toMatchObject({ action: 'audit.read', actor_sub: 'admin-1', request_id: 'PA-002' });
  });

  it('verifies an intact chain, and detects a row edited after the triggers were dropped', async () => {
    const auditPath = join(mkdtempSync(join(tmpdir(), 'audit-')), 'audit.db');
    const { app } = testApp({ auditPath });
    await request(app).get('/requests/PA-001/evidence').set(bearer('nurse'));
    await request(app).get('/requests/PA-005/evidence').set(bearer('nurse'));
    await settle();
    expect(AuditVerifySchema.parse((await request(app).get('/audit/verify').set(bearer('admin'))).body).intact).toBe(true);

    const raw = new DatabaseSync(auditPath);
    raw.exec('DROP TRIGGER audit_events_no_update');
    raw.exec("UPDATE audit_events SET body = replace(body, 'clinician_review', 'evidence_complete') WHERE request_id = 'PA-005'");

    const verify = AuditVerifySchema.parse((await request(app).get('/audit/verify').set(bearer('admin'))).body);
    expect(verify.intact).toBe(false);
    expect(verify.first_broken_event_id).not.toBeNull();
  });
});

describe('/health, /ready and /userinfo', () => {
  it('reports each dependency to the admin, and only the status to the nurse', async () => {
    const { app } = testApp();
    const admin = ReadySchema.parse((await request(app).get('/ready').set(bearer('admin'))).body);
    expect(admin.status).toBe('ready'); // the model is down, but summaries fall back to the template
    expect(Object.keys(admin.checks ?? {}).sort()).toEqual(['audit', 'fhir', 'model', 'policies']);
    expect(admin.checks?.model).toMatchObject({ ok: false, required: false });
    expect(admin.checks?.policies?.detail.versions).toEqual(['MP-SYN-021@2026.1 effective 2026-07-01']);

    const nurse = await request(app).get('/ready').set(bearer('nurse'));
    expect(nurse.body).toEqual({ status: 'ready' });
  });

  it('is not ready when the FHIR server is down', async () => {
    const { app } = testApp({
      readiness: {
        fhir: async () => ({ ok: false, required: true, detail: { error: 'unreachable' } }),
        model: async () => ({ ok: true, required: false, detail: {} }),
      },
    });
    const response = await request(app).get('/ready').set(bearer('probe'));
    expect(response.status).toBe(503);
    expect(response.body).toEqual({ status: 'not_ready' });
  });

  it('tells the UI who is signed in', async () => {
    const userInfo = UserInfoSchema.parse((await request(testApp().app).get('/userinfo').set(bearer('nurse'))).body);
    expect(userInfo).toEqual({ sub: 'nurse-1', role: 'nurse', permissions: ['evidence:read', 'health:read'] });
  });
});

describe('POST /admin/policies/reload', () => {
  function policiesCopy(): string {
    const dir = mkdtempSync(join(tmpdir(), 'policies-'));
    cpSync(POLICIES_DIR, dir, { recursive: true });
    return dir;
  }

  it('is admin only', async () => {
    const response = await request(testApp().app).post('/admin/policies/reload').set(bearer('nurse'));
    expect(response.status).toBe(403);
    expect(response.body.required_permission).toBe('policies:reload');
  });

  it('picks up a dropped-in version folder and audits the reload', async () => {
    const policiesDir = policiesCopy();
    const { app, audit } = testApp({ policiesDir });
    cpSync(join(POLICIES_DIR, 'MP-SYN-021', '2026-07-01_2026.1'), join(policiesDir, 'MP-SYN-021', '2027-01-01_2027.1'), { recursive: true });
    // the copy still says 2026.1 inside: first, the reload must refuse it and keep serving
    const refused = await request(app).post('/admin/policies/reload').set(bearer('admin'));
    expect(refused.status).toBe(400);
    expect(refused.body.error).toBe('invalid_request');
    expect(refused.body.problems[0]).toContain('but its folder says 2027-01-01_2027.1');
    const ready = ReadySchema.parse((await request(app).get('/ready').set(bearer('admin'))).body);
    expect(ready.checks?.policies?.detail.last_reload_ok).toBe(false);
    expect(audit.list({ limit: 2 }).find((event) => event.action === 'policies.reload')).toMatchObject({ outcome: 'error' });
  });

  it('serves the new version after a good drop', async () => {
    const policiesDir = policiesCopy();
    const { app } = testApp({ policiesDir });
    const folder = join(policiesDir, 'MP-SYN-021', '2026-09-01_2026.2');
    mkdirSync(folder);
    const policy = JSON.parse(readFileSync(join(POLICIES_DIR, 'MP-SYN-021', '2026-07-01_2026.1', 'policy.json'), 'utf8'));
    policy.version = '2026.2';
    policy.effective = '2026-09-01';
    writeFileSync(join(folder, 'policy.json'), JSON.stringify(policy));
    cpSync(join(POLICIES_DIR, 'MP-SYN-021', '2026-07-01_2026.1', 'rules-engine-config.json'), join(folder, 'rules-engine-config.json'));

    const reload = ReloadResultSchema.parse((await request(app).post('/admin/policies/reload').set(bearer('admin'))).body);
    expect(reload.versions.map((version) => version.version)).toEqual(['2026.1', '2026.2']);
    const packet = await request(app).get('/requests/PA-001/evidence').set(bearer('nurse'));
    expect(packet.body.policy_version).toBe('2026.2');
  });
});

describe('the web app at /ui', () => {
  // Relative, like the real UI_DIR (apps/web/dist): sendFile rejects relative paths unless the app resolves them.
  function uiDir(): string {
    const dir = mkdtempSync(join(tmpdir(), 'ui-'));
    writeFileSync(join(dir, 'index.html'), '<!doctype html><title>Utilization review</title>');
    return relative(process.cwd(), dir);
  }

  it('is served without a token (static files only: no data, no secrets)', async () => {
    const response = await request(testApp({ uiDir: uiDir() }).app).get('/ui/');
    expect(response.status).toBe(200);
    expect(response.text).toContain('Utilization review');
  });

  it('answers client-side routes with the app, so a deep link works', async () => {
    const response = await request(testApp({ uiDir: uiDir() }).app).get('/ui/requests/PA-001');
    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('text/html');
  });
});

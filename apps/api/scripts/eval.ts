// pnpm eval: runs every request through the running service's HTTP API (make up) and compares it with the
// hand-derived answer key in eval/expected/. Writes eval/results/<run id>.json, then EVAL.md (see evalReport.ts).
//
// Per request: each criterion's status and sources against the key, whether every cited source can be fetched,
// the route, the warnings, the summary (re-checked with the service's own faithfulness checker), the banned-word
// scan over the whole response, and latency. The model, its digest and the prompt version come from the audit trail.
import { execSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { cpus, platform, totalmem } from 'node:os';
import { join } from 'node:path';
import {
  AuditEventSchema,
  EvalRunSchema,
  ExpectedPacketSchema,
  PacketSchema,
  ReadySchema,
  RequestSummarySchema,
  findForbiddenTerms,
  type EvalCriterion,
  type EvalRequest,
  type EvalRun,
  type ExpectedPacket,
} from '@pa/shared';
import { checkSummary, splitSummary } from '../src/core/packet/faithfulness.js';
import { summaryEvidence } from '../src/core/packet/writeSummary.js';
import { REPO_ROOT } from '../test/support/repoRoot.js';
import { writeEvalReport } from './evalReport.js';
import { percentile } from './evalStats.js';

const API_URL = process.env.API_URL ?? 'http://localhost:8080';
const OLLAMA_URL = process.env.OLLAMA_HOST_URL ?? 'http://127.0.0.1:11434';
const RESULTS_DIR = join(REPO_ROOT, 'eval/results');

function token(role: 'nurse' | 'admin'): string {
  const line = readFileSync(join(REPO_ROOT, '.tokens.local'), 'utf8')
    .split('\n')
    .find((entry) => entry.startsWith(`${role}=`));
  if (line === undefined) throw new Error(`No ${role} token in .tokens.local. Run make tokens.`);
  return line.slice(role.length + 1).trim();
}

async function get(path: string, role: 'nurse' | 'admin'): Promise<{ status: number; text: string }> {
  const response = await fetch(`${API_URL}${path}`, { headers: { Authorization: `Bearer ${token(role)}` } });
  return { status: response.status, text: await response.text() };
}

// GET and parse with a shared schema; a failure names the call, so a broken run says where it broke.
async function getParsed<T>(path: string, role: 'nurse' | 'admin', schema: { safeParse: (data: unknown) => { success: true; data: T } | { success: false; error: Error } }): Promise<T> {
  const response = await get(path, role);
  const parsed = schema.safeParse(JSON.parse(response.text));
  if (!parsed.success) throw new Error(`GET ${path} (HTTP ${response.status}) did not match its schema: ${parsed.error.message.slice(0, 300)}`);
  return parsed.data;
}

function readExpected(): Map<string, ExpectedPacket> {
  const dir = join(REPO_ROOT, 'eval/expected');
  const packets = readdirSync(dir)
    .filter((name) => name.endsWith('.json'))
    .map((name) => ExpectedPacketSchema.parse(JSON.parse(readFileSync(join(dir, name), 'utf8'))));
  return new Map(packets.map((expected) => [expected.request_id, expected]));
}

const suppliedIds = new Set(readdirSync(join(REPO_ROOT, 'data/requests')).map((name) => name.replace(/\.json$/, '')));

async function evaluateRequest(requestId: string, expected: ExpectedPacket | undefined): Promise<EvalRequest> {
  const started = performance.now();
  const response = await get(`/requests/${requestId}/evidence`, 'nurse');
  const latencyMs = Math.round(performance.now() - started);
  if (response.status !== 200) throw new Error(`${requestId}: HTTP ${response.status}`);
  const packet = PacketSchema.parse(JSON.parse(response.text));

  const criteria: EvalCriterion[] = [];
  for (const criterion of packet.criteria) {
    const key = expected?.criteria.find((candidate) => candidate.id === criterion.id);
    const unresolved: string[] = [];
    for (const ref of criterion.sources) {
      const source = await get(`/requests/${requestId}/sources/${ref}`, 'nurse');
      if (source.status !== 200) unresolved.push(ref);
    }
    const expectedSources = [...(key?.sources ?? [])].sort();
    const actualSources = [...criterion.sources].sort();
    criteria.push({
      id: criterion.id,
      requirement: criterion.requirement,
      expected_status: key?.status ?? null,
      actual_status: criterion.status,
      status_matches: key?.status === criterion.status,
      expected_reason: key?.reason ?? null,
      expected_sources: expectedSources,
      actual_sources: actualSources,
      sources_match: JSON.stringify(expectedSources) === JSON.stringify(actualSources),
      unresolved_sources: unresolved,
      considered: [...new Set(criterion.considered.map((item) => item.ref))],
    });
  }

  const summaryProblems = checkSummary(splitSummary(packet.summary), summaryEvidence(packet.criteria, packet.missing_documents));
  const audit = await latestPacketAudit(requestId);
  return {
    request_id: requestId,
    group: suppliedIds.has(requestId) ? 'supplied' : 'synthea',
    request_date: packet.request_date,
    policy_version: packet.policy_version,
    criteria,
    route_expected: expected?.route ?? null,
    route_actual: packet.route,
    warnings_expected: [...(expected?.warnings ?? [])].sort(),
    warnings_actual: packet.warnings.filter((warning) => warning !== 'summary_fallback').sort(),
    missing_documents_match: JSON.stringify(expected?.missing_documents ?? null) === JSON.stringify(packet.missing_documents),
    summary: packet.summary,
    summary_source: packet.summary_source,
    summary_fallback: packet.warnings.includes('summary_fallback'),
    summary_faithful: summaryProblems.length === 0,
    summary_problems: summaryProblems,
    banned_word_clean: findForbiddenTerms(response.text).length === 0,
    latency_ms: latencyMs,
    model: audit?.model ?? null,
    model_digest: audit?.model_digest ?? null,
    prompt_version: audit?.prompt_version ?? null,
  };
}

// The audit event of the packet read just made: which model, digest and prompt wrote its summary.
async function latestPacketAudit(requestId: string) {
  const events = await getParsed(`/audit?request_id=${requestId}&limit=20`, 'admin', AuditEventSchema.array());
  return events.find((event) => event.action === 'packet.read');
}

async function modelInUse(): Promise<EvalRun['model']> {
  const ready = await getParsed('/ready', 'admin', ReadySchema);
  const model = ready.checks?.model?.detail;
  const versions = ready.checks?.model_versions?.detail.versions;
  const inEffect = Array.isArray(versions) ? versions.find((line) => String(line).includes('(in effect)')) : undefined;
  if (typeof model?.model !== 'string' || typeof model.model_digest !== 'string') return null;
  return { name: model.model, digest: model.model_digest, version_folder: String(inEffect ?? '').split(' ')[0] ?? '' };
}

// Metal or CPU: whether the loaded model sits in GPU memory, as Ollama reports it.
async function inference(): Promise<'metal' | 'cpu' | 'unknown'> {
  try {
    const ps = (await (await fetch(`${OLLAMA_URL}/api/ps`)).json()) as { models: { size_vram: number }[] };
    if (ps.models.length === 0) return 'unknown';
    return ps.models.some((model) => model.size_vram > 0) ? 'metal' : 'cpu';
  } catch {
    return 'unknown';
  }
}

function git(command: string): string {
  return execSync(`git ${command}`, { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
}

async function main(): Promise<void> {
  const startedAt = new Date();
  const expected = readExpected();
  const queue = await getParsed('/requests', 'nurse', RequestSummarySchema.array());

  const requests: EvalRequest[] = [];
  for (const { request_id: requestId } of queue) {
    const result = await evaluateRequest(requestId, expected.get(requestId));
    const mismatches = result.criteria.filter((criterion) => !criterion.status_matches).map((criterion) => criterion.id);
    console.log(
      `${requestId} ${result.latency_ms} ms  ${result.criteria.map((criterion) => `${criterion.id}=${criterion.actual_status}`).join(' ')}` +
        `  route ${result.route_actual}  summary ${result.summary_source}${mismatches.length > 0 ? `  MISMATCH ${mismatches.join(',')}` : ''}`,
    );
    requests.push(result);
  }

  const allCriteria = requests.flatMap((request) => request.criteria);
  const latencies = requests.map((request) => request.latency_ms);
  const gitSha = git('rev-parse --short HEAD');
  const run: EvalRun = EvalRunSchema.parse({
    run_id: `${startedAt.toISOString().replace(/[:.]/g, '-')}_${gitSha}`,
    started_at: startedAt.toISOString(),
    git_sha: gitSha,
    git_dirty: git('status --porcelain') !== '',
    api_url: API_URL,
    policy_versions: [...new Set(requests.map((request) => request.policy_version))],
    model: await modelInUse(),
    hardware: { platform: `${platform()} ${process.arch}`, cpu: cpus()[0]?.model ?? 'unknown', memory_gb: Math.round(totalmem() / 2 ** 30), inference: await inference() },
    criteria_ids: [...new Set(allCriteria.map((criterion) => criterion.id))],
    requests,
    totals: {
      criterion_results: allCriteria.length,
      criterion_matches: allCriteria.filter((criterion) => criterion.status_matches).length,
      routes: requests.length,
      route_matches: requests.filter((request) => request.route_actual === request.route_expected).length,
      sources_cited: allCriteria.reduce((sum, criterion) => sum + criterion.actual_sources.length, 0),
      sources_resolved: allCriteria.reduce((sum, criterion) => sum + criterion.actual_sources.length - criterion.unresolved_sources.length, 0),
      summaries: requests.length,
      summaries_faithful: requests.filter((request) => request.summary_faithful).length,
      summaries_from_model: requests.filter((request) => request.summary_source === 'model').length,
      banned_word_clean: requests.filter((request) => request.banned_word_clean).length,
      latency_p50_ms: percentile(latencies, 0.5),
      latency_p95_ms: percentile(latencies, 0.95),
    },
  });

  mkdirSync(RESULTS_DIR, { recursive: true });
  const path = join(RESULTS_DIR, `${run.run_id}.json`);
  writeFileSync(path, `${JSON.stringify(run, null, 2)}\n`);
  const { totals } = run;
  console.log(
    `\n${totals.criterion_matches}/${totals.criterion_results} statuses, ${totals.route_matches}/${totals.routes} routes, ` +
      `${totals.sources_resolved}/${totals.sources_cited} sources resolve, ${totals.summaries_faithful}/${totals.summaries} summaries faithful ` +
      `(${totals.summaries_from_model} from the model), ${totals.banned_word_clean}/${totals.summaries} clean, p50 ${totals.latency_p50_ms} ms, p95 ${totals.latency_p95_ms} ms`,
  );
  console.log(`Wrote ${path}`);
  writeEvalReport();
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

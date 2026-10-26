// pnpm eval:report: writes EVAL.md and EVAL.html from the eval's JSON (the latest eval/results/<run id>.json, the latest
// models-<run id>.json, eval/findings.json and eval/hand-audit.json). Nothing in either is typed by hand, and both come
// from the same data in the same run, so they can never disagree. `pnpm eval` and `pnpm eval:models` run this at the end.
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  EvalRunSchema,
  FindingsSchema,
  HandAuditSchema,
  ModelComparisonSchema,
  STATUS_LABEL,
  type EvalRequest,
  type EvalRun,
  type ModelComparison,
} from '@pa/shared';
import { REPO_ROOT } from '../test/support/repoRoot.js';
import { evalReportHtml } from './evalReportHtml.js';
import { disagreements } from './evalStats.js';

const RESULTS_DIR = join(REPO_ROOT, 'eval/results');

function latest(prefix: 'models-' | ''): string | null {
  if (!existsSync(RESULTS_DIR)) return null;
  const names = readdirSync(RESULTS_DIR)
    .filter((name) => name.endsWith('.json') && (prefix === '' ? !name.startsWith('models-') : name.startsWith(prefix)))
    .sort();
  const name = names[names.length - 1];
  return name === undefined ? null : join(RESULTS_DIR, name);
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8'));
}

const pct = (count: number, of: number) => (of === 0 ? 'n/a' : `${Math.round((100 * count) / of)} %`);

function scorecards(run: EvalRun): string[] {
  const t = run.totals;
  return [
    '| Measure | Result |',
    '|---|---|',
    `| Criterion statuses matching the answer key | ${t.criterion_matches} / ${t.criterion_results} (${pct(t.criterion_matches, t.criterion_results)}) |`,
    `| Routes matching | ${t.route_matches} / ${t.routes} |`,
    `| Cited sources that resolve | ${t.sources_resolved} / ${t.sources_cited} |`,
    `| Summaries faithful (re-checked) | ${t.summaries_faithful} / ${t.summaries} |`,
    `| Summaries written by the model (the rest: template fallback) | ${t.summaries_from_model} / ${t.summaries} |`,
    `| Responses with no banned word | ${t.banned_word_clean} / ${t.summaries} |`,
    `| Packet latency p50 / p95 | ${t.latency_p50_ms} ms / ${t.latency_p95_ms} ms |`,
  ];
}

// One row per request, one column per criterion in the data (a new criterion adds a column by itself).
function grid(run: EvalRun, group: EvalRequest['group']): string[] {
  const requests = run.requests.filter((request) => request.group === group);
  if (requests.length === 0) return [];
  const header = ['Request', ...run.criteria_ids, 'Route', 'Sources', 'Summary', 'Latency'];
  const lines = [`| ${header.join(' | ')} |`, `|${header.map(() => '---').join('|')}|`];
  for (const request of requests) {
    const cells = run.criteria_ids.map((id) => {
      const criterion = request.criteria.find((candidate) => candidate.id === id);
      if (criterion === undefined) return '';
      const label = STATUS_LABEL[criterion.actual_status];
      return criterion.status_matches ? label : `**${label}** (key: ${criterion.expected_status === null ? 'none' : STATUS_LABEL[criterion.expected_status]})`;
    });
    const route = request.route_actual === request.route_expected ? request.route_actual : `**${request.route_actual}** (key: ${request.route_expected})`;
    const unresolved = request.criteria.reduce((sum, criterion) => sum + criterion.unresolved_sources.length, 0);
    const summary = `${request.summary_source}${request.summary_faithful ? '' : ', **not faithful**'}`;
    lines.push(`| ${[request.request_id, ...cells, route, unresolved === 0 ? 'all resolve' : `**${unresolved} unresolved**`, summary, `${request.latency_ms} ms`].join(' | ')} |`);
  }
  return lines;
}

function mismatches(run: EvalRun): string[] {
  const found = disagreements(run);
  if (found.length === 0) return ['None: every status, source, warning and provider ask matches the key.'];
  return found.map((item) => `- **${item.where}**: ${item.what}`);
}

function modelTable(comparison: ModelComparison): string[] {
  const lines = [
    `Run ${comparison.run_id} (commit ${comparison.git_sha}): ${comparison.requests} requests per run; runs per model in the table. ` +
      `prompts and call settings from model version ${comparison.model_version_folder} (${comparison.prompt_versions.join(', ')}), on ${comparison.hardware.cpu}.`,
    '',
    '| Model | Runs | Where | Memory | Summary: schema-valid 1st try | Faithful | Fallback | Summary p50 / p95 | Agent: valid tool calls | Agrees with rules | Draft complete | Draft fallback | Avg steps | Agent p50 / p95 | Time limit hit | Errors |',
    '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|',
  ];
  for (const model of comparison.models) {
    const s = model.summary;
    const a = model.agent;
    lines.push(
      `| ${model.name} | ${model.runs} | ${model.inference} | ${model.memory_mb === null ? 'n/a' : `${model.memory_mb} MB`} | ${pct(s.schema_valid_first_try.count, s.schema_valid_first_try.of)} | ` +
        `${pct(s.faithful.count, s.faithful.of)} | ${pct(s.fallback.count, s.fallback.of)} | ${s.p50_ms} / ${s.p95_ms} ms | ` +
        `${pct(a.valid_tool_calls.count, a.valid_tool_calls.of)} | ${pct(a.agrees_with_rules.count, a.agrees_with_rules.of)} | ` +
        `${pct(a.draft_complete.count, a.draft_complete.of)} | ${pct(a.draft_fallback.count, a.draft_fallback.of)} | ${a.average_steps.toFixed(1)} | ` +
        `${a.p50_ms} / ${a.p95_ms} ms | ${a.time_limit_hit} | ${a.errors} |`,
    );
  }
  return lines;
}

// Synthea charts with resources added by hand (eval/synthea-overlays/<request id>.json): both reports name them,
// so a reader never has to find out elsewhere that a chart is not as Synthea generated it.
function overlayNote(): string | null {
  const dir = join(REPO_ROOT, 'eval/synthea-overlays');
  const requestIds = existsSync(dir) ? readdirSync(dir).filter((name) => name.endsWith('.json')).map((name) => name.replace(/\.json$/, '')) : [];
  if (requestIds.length === 0) return null;
  return `Charts with resources added by hand: ${requestIds.sort().join(', ')} (see eval/synthea-overlays/README.md). Every other Synthea chart is as Synthea generated it.`;
}

export function writeEvalReport(): void {
  const runPath = latest('');
  if (runPath === null) throw new Error('No eval run in eval/results/. Run pnpm eval first.');
  const run = EvalRunSchema.parse(readJson(runPath));
  const modelsPath = latest('models-');
  const comparison = modelsPath === null ? null : ModelComparisonSchema.parse(readJson(modelsPath));
  const findingsPath = join(REPO_ROOT, 'eval/findings.json');
  const findings = existsSync(findingsPath) ? FindingsSchema.parse(readJson(findingsPath)) : [];
  const auditPath = join(REPO_ROOT, 'eval/hand-audit.json');
  const handAudit = existsSync(auditPath) ? HandAuditSchema.parse(readJson(auditPath)) : [];
  const overlays = overlayNote();

  const model = run.model === null ? 'none' : `${run.model.name} (${run.model.digest.slice(0, 12)}…, model version ${run.model.version_folder})`;
  const prompts = [...new Set(run.requests.map((request) => request.prompt_version).filter((version) => version !== null))];
  const lines = [
    '# EVAL',
    '',
    '<!-- Generated by `pnpm eval:report` from eval/results/, eval/findings.json and eval/hand-audit.json. Do not edit by hand. -->',
    '',
    `Run **${run.run_id}**: commit ${run.git_sha}${run.git_dirty ? ' (with uncommitted changes)' : ''}, ${run.started_at}. ` +
      `Policy ${run.policy_versions.join(', ')}. Model ${model}; summary prompt ${prompts.join(', ') || 'none'}. ` +
      `${run.hardware.cpu}, ${run.hardware.memory_gb} GB, ${run.hardware.platform}, inference on ${run.hardware.inference}.`,
    '',
    'Every request goes through the running service over HTTP, as a nurse would. The answer key (eval/expected/) was ' +
      'written by hand before the rules code (supplied requests) or before the first eval run (Synthea requests).',
    '',
    '## Scorecards',
    '',
    ...scorecards(run),
    '',
    '## Requests × criteria',
    '',
    'Bold marks a disagreement with the answer key.',
    '',
    '### Supplied requests',
    '',
    ...grid(run, 'supplied'),
    '',
    '### Synthea requests',
    '',
    ...(overlays === null ? [] : [overlays, '']),
    ...grid(run, 'synthea'),
    '',
    '## Disagreements with the answer key',
    '',
    ...mismatches(run),
    '',
    '## Model comparison',
    '',
    ...(comparison === null ? ['Not run yet: `pnpm eval:models`.'] : modelTable(comparison)),
    '',
    '## Findings',
    '',
    ...(findings.length === 0
      ? ['None recorded.']
      : [
          '| Id | Severity | Kind | Request | Criterion | Finding | Status |',
          '|---|---|---|---|---|---|---|',
          ...findings.map((f) => `| ${f.id} | ${f.severity} | ${f.kind} | ${f.request_id ?? ''} | ${f.criterion_id ?? ''} | ${f.text} | ${f.status} |`),
        ]),
    '',
    '## Hand audit',
    '',
    ...(handAudit.length === 0
      ? ['Not done yet.']
      : [
          '| Request | Agrees with the service | Note |',
          '|---|---|---|',
          ...handAudit.map((entry) => `| ${entry.request_id} | ${entry.agrees === null ? 'not yet audited' : entry.agrees ? 'yes' : 'no'} | ${entry.note} |`),
        ]),
    '',
  ];
  writeFileSync(join(REPO_ROOT, 'EVAL.md'), lines.join('\n'));
  writeFileSync(join(REPO_ROOT, 'EVAL.html'), evalReportHtml(run, comparison, findings, handAudit, overlays));
  console.log('Wrote EVAL.md and EVAL.html');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  writeEvalReport();
}

// EVAL.html: the same sections as EVAL.md, from the same JSON, written by the same `pnpm eval:report`, as one page that
// opens from disk. Criteria come from the run (a new criterion adds a column by itself); nothing is typed by hand.
import type { EvalRequest, EvalRun, Finding, HandAuditEntry, ModelComparison } from '@pa/shared';
import { disagreements } from './evalStats.js';
import { modelSections } from './modelReportHtml.js';
import { escapeHtml, htmlPage, routeChip, shareTone, statusChip, type Share } from './reportHtml.js';

const pct = (share: Share) => (share.of === 0 ? 'n/a' : `${Math.round((100 * share.count) / share.of)} %`);

function tile(label: string, share: Share): string {
  return `<div class="tile ${shareTone(share)}"><span class="label">${label}</span><span class="value">${share.count} / ${share.of}</span><span class="muted">${pct(share)}</span></div>`;
}

function scorecards(run: EvalRun): string {
  const t = run.totals;
  return `<div class="tiles">
    ${tile('Criterion statuses matching the answer key', { count: t.criterion_matches, of: t.criterion_results })}
    ${tile('Routes matching', { count: t.route_matches, of: t.routes })}
    ${tile('Cited sources that resolve', { count: t.sources_resolved, of: t.sources_cited })}
    ${tile('Summaries faithful (re-checked)', { count: t.summaries_faithful, of: t.summaries })}
    ${tile('Summaries written by the model (the rest: template)', { count: t.summaries_from_model, of: t.summaries })}
    ${tile('Responses with no banned word', { count: t.banned_word_clean, of: t.summaries })}
    <div class="tile"><span class="label">Packet latency p50 / p95</span><span class="value">${t.latency_p50_ms} / ${t.latency_p95_ms}</span><span class="muted">ms</span></div>
  </div>`;
}

// One row per request, one column per criterion in the run. A disagreement keeps the service's chip, outlined, with
// the answer key's status under it.
function grid(run: EvalRun, group: EvalRequest['group'], title: string): string {
  const requests = run.requests.filter((request) => request.group === group);
  if (requests.length === 0) return '';
  const requirementOf = (id: string) => run.requests.flatMap((request) => request.criteria).find((criterion) => criterion.id === id)?.requirement ?? '';
  const header = run.criteria_ids.map((id) => `<th scope="col" title="${escapeHtml(requirementOf(id))}">${escapeHtml(id)}</th>`).join('');
  const rows = requests.map((request) => {
    const cells = run.criteria_ids.map((id) => {
      const criterion = request.criteria.find((candidate) => candidate.id === id);
      if (criterion === undefined) return '<td></td>';
      if (criterion.status_matches) return `<td>${statusChip(criterion.actual_status)}</td>`;
      const key = criterion.expected_status === null ? 'none' : statusChip(criterion.expected_status);
      return `<td class="mismatch">${statusChip(criterion.actual_status)}<div class="key">key: ${key}</div></td>`;
    });
    const routeMatches = request.route_actual === request.route_expected;
    const route = routeMatches
      ? `<td>${routeChip(request.route_actual)}</td>`
      : `<td class="mismatch">${routeChip(request.route_actual)}<div class="key">key: ${request.route_expected === null ? 'none' : routeChip(request.route_expected)}</div></td>`;
    const unresolved = request.criteria.reduce((sum, criterion) => sum + criterion.unresolved_sources.length, 0);
    const sources = unresolved === 0 ? '<td class="ok">all resolve</td>' : `<td class="bad">${unresolved} unresolved</td>`;
    const summary = request.summary_faithful ? `<td class="ok">${request.summary_source}</td>` : `<td class="bad">${request.summary_source}, not faithful</td>`;
    return `<tr><th scope="row">${escapeHtml(request.request_id)}</th>${cells.join('')}${route}${sources}${summary}<td>${request.latency_ms} ms</td></tr>`;
  });
  return `
  <h3>${title}</h3>
  <div class="scroll"><table class="grid">
    <thead><tr><th scope="col">Request</th>${header}<th scope="col">Route</th><th scope="col">Sources</th><th scope="col">Summary</th><th scope="col">Latency</th></tr></thead>
    <tbody>${rows.join('')}</tbody>
  </table></div>`;
}

function disagreementList(run: EvalRun): string {
  const found = disagreements(run);
  if (found.length === 0) return '<p>None: every status, source, warning and provider ask matches the key.</p>';
  return `<ul>${found.map((item) => `<li><strong>${escapeHtml(item.where)}</strong>: ${escapeHtml(item.what)}</li>`).join('')}</ul>`;
}

function findingsTable(findings: Finding[]): string {
  if (findings.length === 0) return '<p>None recorded.</p>';
  const rows = findings.map(
    (f) =>
      `<tr><th scope="row">${escapeHtml(f.id)}</th><td>${f.severity}</td><td>${f.kind}</td><td>${escapeHtml(f.request_id ?? '')}</td>` +
      `<td>${escapeHtml(f.criterion_id ?? '')}</td><td>${escapeHtml(f.text)}</td><td>${f.status.replace('_', ' ')}</td></tr>`,
  );
  return `<div class="scroll"><table class="text">
    <thead><tr><th scope="col">Id</th><th scope="col">Severity</th><th scope="col">Kind</th><th scope="col">Request</th><th scope="col">Criterion</th><th scope="col">Finding</th><th scope="col">Status</th></tr></thead>
    <tbody>${rows.join('')}</tbody>
  </table></div>`;
}

function handAuditTable(entries: HandAuditEntry[]): string {
  if (entries.length === 0) return '<p>Not done yet.</p>';
  const agreesCell = (agrees: boolean | null) =>
    agrees === null ? '<td class="none">not yet audited</td>' : agrees ? '<td class="ok">yes</td>' : '<td class="bad">no</td>';
  const rows = entries.map((entry) => `<tr><th scope="row">${escapeHtml(entry.request_id)}</th>${agreesCell(entry.agrees)}<td>${escapeHtml(entry.note)}</td></tr>`);
  return `<div class="scroll"><table class="text">
    <thead><tr><th scope="col">Request</th><th scope="col">Agrees with the service</th><th scope="col">Note</th></tr></thead>
    <tbody>${rows.join('')}</tbody>
  </table></div>`;
}

export function evalReportHtml(
  run: EvalRun,
  comparison: ModelComparison | null,
  findings: Finding[],
  handAudit: HandAuditEntry[],
  overlayNote: string | null,
): string {
  const model = run.model === null ? 'none' : `${run.model.name} (${run.model.digest.slice(0, 12)}…, model version ${run.model.version_folder})`;
  const prompts = [...new Set(run.requests.map((request) => request.prompt_version).filter((version) => version !== null))];
  const body = `
  <h1>Evaluation</h1>
  <p>Every request goes through the running service over HTTP, as a nurse would. The answer key (eval/expected/) was written by hand before the rules code (supplied requests) or before the first eval run (Synthea requests). EVAL.md has the same content.</p>
  <dl class="facts">
    <dt>Run</dt><dd>${escapeHtml(run.run_id)}, commit ${escapeHtml(run.git_sha)}${run.git_dirty ? ' (with uncommitted changes)' : ''}, ${escapeHtml(run.started_at)}</dd>
    <dt>Policy</dt><dd>${escapeHtml(run.policy_versions.join(', '))}</dd>
    <dt>Model</dt><dd>${escapeHtml(model)}; summary prompt ${escapeHtml(prompts.join(', ') || 'none')}</dd>
    <dt>Hardware</dt><dd>${escapeHtml(run.hardware.cpu)}, ${run.hardware.memory_gb} GB, ${escapeHtml(run.hardware.platform)}, inference on ${run.hardware.inference}</dd>
  </dl>

  <h2>Scorecards</h2>
  ${scorecards(run)}

  <h2>Requests × criteria</h2>
  <p class="muted">An outlined chip disagrees with the answer key; the key's status is under it. Hover a criterion for its requirement.</p>
  ${grid(run, 'supplied', 'Supplied requests')}
  ${grid(run, 'synthea', 'Synthea requests')}
  ${overlayNote === null ? '' : `<p class="muted">${escapeHtml(overlayNote)}</p>`}

  <h2>Disagreements with the answer key</h2>
  ${disagreementList(run)}

  <h2>Model comparison</h2>
  ${comparison === null ? '<p>Not run yet: <code>pnpm eval:models</code>.</p>' : modelSections(comparison, 'h3')}

  <h2>Findings</h2>
  ${findingsTable(findings)}

  <h2>Hand audit</h2>
  ${handAuditTable(handAudit)}`;
  return htmlPage(`Evaluation ${run.run_id}`, body);
}

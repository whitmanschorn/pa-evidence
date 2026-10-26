// A model comparison (eval/results/models-<run id>.json, or a test run in eval/results/samples/) as one HTML page,
// written next to its JSON by compareModels after every run. EVAL.html shows the latest full comparison with the same
// sections. This command re-renders an existing comparison:
//
//   pnpm eval:models:html eval/results/samples/models-<run id>.json
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ModelComparisonSchema, type ModelComparison, type ModelResult } from '@pa/shared';
import { REPO_ROOT } from '../test/support/repoRoot.js';
import { escapeHtml, htmlPage, problemCell, shareCell } from './reportHtml.js';

const seconds = (ms: number) => (ms / 1000).toFixed(1);

function modelRow(model: ModelResult): string {
  const s = model.summary;
  const a = model.agent;
  return [
    `<tr><th scope="row">${escapeHtml(model.name)}</th>`,
    `<td>${model.inference}</td>`,
    `<td>${model.memory_mb === null ? 'n/a' : `${model.memory_mb.toLocaleString('en-US')} MB`}</td>`,
    shareCell(s.faithful),
    shareCell(s.schema_valid_first_try),
    problemCell(s.fallback.count, s.fallback.of),
    `<td>${seconds(s.p50_ms)} / ${seconds(s.p95_ms)}</td>`,
    shareCell(a.valid_tool_calls),
    shareCell(a.agrees_with_rules),
    shareCell(a.draft_complete),
    `<td>${a.average_steps.toFixed(1)}</td>`,
    `<td>${seconds(a.p50_ms)} / ${seconds(a.p95_ms)}</td>`,
    problemCell(a.time_limit_hit),
    problemCell(a.errors),
    '</tr>',
  ].join('');
}

// One column per criterion the agent was scored on (from the data, so a new criterion adds a column by itself).
function criterionTable(comparison: ModelComparison, heading: 'h2' | 'h3'): string {
  const ids = [...new Set(comparison.models.flatMap((model) => Object.keys(model.agent.agreement_by_criterion)))];
  ids.sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
  if (ids.length === 0) return '';
  const header = ids.map((id) => `<th scope="col">${escapeHtml(id)}</th>`).join('');
  const rows = comparison.models.map((model) => {
    const cells = ids.map((id) => shareCell(model.agent.agreement_by_criterion[id] ?? { count: 0, of: 0 })).join('');
    return `<tr><th scope="row">${escapeHtml(model.name)}</th>${cells}</tr>`;
  });
  return `
    <${heading}>Agent agreement with the rules engine, by criterion</${heading}>
    <div class="scroll fit"><table>
      <thead><tr><th scope="col">Model</th>${header}</tr></thead>
      <tbody>${rows.join('')}</tbody>
    </table></div>`;
}

// One sentence on top: how many models ran cleanly and how many got everything right.
export function modelTakeaway(comparison: ModelComparison): string {
  const models = comparison.models;
  const clean = models.filter((model) => model.agent.errors === 0 && model.agent.time_limit_hit === 0).length;
  const faithful = models.filter((model) => model.summary.faithful.of > 0 && model.summary.faithful.count === model.summary.faithful.of).length;
  const agree = models.filter((model) => model.agent.agrees_with_rules.of > 0 && model.agent.agrees_with_rules.count === model.agent.agrees_with_rules.of).length;
  return `${clean} of ${models.length} models ran without errors. ${faithful} wrote faithful summaries every time; ${agree} agreed with the rules engine on every criterion.`;
}

// The facts, the per-model table, the per-criterion table and how to read them. `heading` is the level of the
// section titles, so EVAL.html can nest them under its own "Model comparison" heading.
export function modelSections(comparison: ModelComparison, heading: 'h2' | 'h3'): string {
  const where = [...new Set(comparison.models.map((model) => model.inference))].join(' and ');
  const runs = [...new Set(comparison.models.map((model) => model.runs))].join(', ');
  return `
  <p>${escapeHtml(modelTakeaway(comparison))}</p>
  <dl class="facts">
    <dt>Requests</dt><dd>${comparison.requests}: ${escapeHtml(comparison.request_ids.join(', '))}</dd>
    <dt>Runs per model</dt><dd>${runs}</dd>
    <dt>Inference</dt><dd>${where}, ${escapeHtml(comparison.hardware.cpu)}, ${comparison.hardware.memory_gb} GB</dd>
    <dt>Prompts</dt><dd>${escapeHtml(comparison.prompt_versions.join(', '))}; call settings from model version ${escapeHtml(comparison.model_version_folder)}</dd>
    <dt>Run</dt><dd>${escapeHtml(comparison.run_id)}, commit ${escapeHtml(comparison.git_sha)}, started ${escapeHtml(comparison.started_at)}</dd>
  </dl>

  <${heading}>Per model</${heading}>
  <div class="scroll"><table>
    <thead>
      <tr class="group"><th></th><th></th><th></th><th colspan="4">Summary</th><th colspan="7">Agent</th></tr>
      <tr><th scope="col">Model</th><th scope="col">Where</th><th scope="col">Memory</th>
        <th scope="col">Faithful</th><th scope="col">Schema-valid 1st try</th><th scope="col">Fallback</th><th scope="col">p50 / p95 s</th>
        <th scope="col">Valid tool calls</th><th scope="col">Agrees with rules</th><th scope="col">Draft by model</th>
        <th scope="col">Avg steps</th><th scope="col">p50 / p95 s</th><th scope="col">Time limit hit</th><th scope="col">Errors</th></tr>
    </thead>
    <tbody>${comparison.models.map(modelRow).join('')}</tbody>
  </table></div>
  ${criterionTable(comparison, heading)}

  <${heading}>How to read the model tables</${heading}>
  <dl class="legend">
    <dt>Faithful</dt><dd>The model's summary passed the faithfulness check, so the nurse saw it. Otherwise the template summary is shown (Fallback).</dd>
    <dt>Schema-valid 1st try</dt><dd>The summary parsed against its schema without a retry.</dd>
    <dt>Valid tool calls</dt><dd>MCP tool calls that ran without an error. "none" means the model called no tools.</dd>
    <dt>Agrees with rules</dt><dd>Criteria where the agent's evaluate_criterion result matched the rules engine. A criterion it never evaluated counts as a disagreement.</dd>
    <dt>Draft by model</dt><dd>Provider-request drafts the model wrote. It may only write one when it agrees with the rules on every criterion; otherwise the template is used.</dd>
    <dt>Times</dt><dd>Seconds per request on the inference shown above, after a warm-up call that is not counted.</dd>
  </dl>`;
}

export function modelReportHtml(comparison: ModelComparison, title: string): string {
  return htmlPage(`${title} ${comparison.run_id}`, `<h1>${escapeHtml(title)}</h1>${modelSections(comparison, 'h2')}`);
}

// Writes <comparison>.html next to the comparison's JSON and returns its path.
export function writeModelReport(jsonPath: string, comparison: ModelComparison, testRun: boolean): string {
  const htmlPath = jsonPath.replace(/\.json$/, '.html');
  writeFileSync(htmlPath, modelReportHtml(comparison, testRun ? 'Model comparison test run' : 'Model comparison'));
  return htmlPath;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const arg = process.argv.slice(2).find((value) => value !== '--'); // pnpm passes a literal "--" through
  if (arg === undefined) throw new Error('Usage: pnpm eval:models:html eval/results/<models-run id>.json');
  const jsonPath = resolve(REPO_ROOT, arg);
  const comparison = ModelComparisonSchema.parse(JSON.parse(readFileSync(jsonPath, 'utf8')));
  console.log(`Wrote ${writeModelReport(jsonPath, comparison, jsonPath.includes('/samples/'))}`);
}

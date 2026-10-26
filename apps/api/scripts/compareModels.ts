// pnpm eval:models: every candidate model on every request, several runs each, with the prompts, call settings, caps
// and timeouts of the model version in effect (data/models), so only the model differs. Writes
// eval/results/models-<run id>.json, then EVAL.md.
//
// Needs HAPI (make up) and the candidates pulled in the host's Ollama. Runs the service's code in this process: the
// summary through assemblePacket, and the agent through runAgentForRequest against this process's own /mcp, as in
// production. On Metal, the Mac's own GPU: the brief rules out datacenter and gaming GPUs, not this (see DECISIONS).
//
//   pnpm eval:models                          the five candidates, 3 runs
//   pnpm eval:models -- --runs 1 --models qwen3:4b-instruct-2507-q4_K_M
//   pnpm eval:models -- --runs 1 --into eval/results/models-<run id>.json   add models to an earlier comparison
//   pnpm eval:models -- --runs 1 --requests PA-004                          a test run on a sample: written to
//                                                                           eval/results/samples/, EVAL.md untouched
//   pnpm eval:models -- --runs 1 --requests PA-004 --models <name> --trace  also print each agent event (tool calls)
import { randomBytes } from 'node:crypto';
import { execSync } from 'node:child_process';
import { once } from 'node:events';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { cpus, platform, totalmem } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { ModelComparisonSchema, type ModelComparison, type ModelResult } from '@pa/shared';
import { runAgentForRequest } from '../src/agent/runAgentForRequest.js';
import { buildApp } from '../src/app.js';
import { openAuditStore } from '../src/core/audit/auditStore.js';
import { createStaticTokenVerifier, parseAuthTokens, sha256OfToken } from '../src/core/auth/identityVerifier.js';
import { dayOf } from '../src/core/dates.js';
import { createFhirAuth } from '../src/core/fhir/fhirAuth.js';
import { createHttpFhirClient } from '../src/core/fhir/fhirClient.js';
import { AGENT_PROMPT_VERSION, DRAFT_PROMPT_VERSION } from '../src/agent/runAgent.js';
import { connectLocalModel } from '../src/core/llm/localModel.js';
import { loadModelVersions, type ModelVersion } from '../src/core/llm/modelVersions.js';
import { assemblePacket, type PacketDeps } from '../src/core/packet/assemblePacket.js';
import { SUMMARY_PROMPT_VERSION } from '../src/core/packet/writeSummary.js';
import { createPolicyRegistry, type PolicyRegistry } from '../src/core/policy/policyRegistry.js';
import { loadPolicyStore } from '../src/core/policy/policyStore.js';
import { loadRequestStore } from '../src/core/requests/requestStore.js';
import { BINDINGS } from '../src/core/rules/bindings.js';
import { checkBindings } from '../src/core/rules/checkBindings.js';
import { loadTerminology } from '../src/core/terminology.js';
import { latestInEffect } from '../src/core/versionFolders.js';
import { createLogger } from '../src/http/httpLogger.js';
import { REPO_ROOT } from '../test/support/repoRoot.js';
import { writeEvalReport } from './evalReport.js';
import { writeModelReport } from './modelReportHtml.js';
import { percentile } from './evalStats.js';

const CANDIDATES = [
  'qwen3:4b-instruct-2507-q4_K_M',
  'phi4-mini:3.8b-q4_K_M',
  'llama3.2:3b-instruct-q4_K_M',
  'granite4:micro',
  'llama3.1:8b-instruct-q4_K_M', // the 7-8B reference point
];
const OLLAMA_URL = process.env.OLLAMA_HOST_URL ?? 'http://127.0.0.1:11434';
const FHIR_URL = process.env.FHIR_LOAD_URL ?? 'http://localhost:8090/fhir';

// pnpm passes a literal "--" through to the script; it is not an argument.
const { values: args } = parseArgs({
  args: process.argv.slice(2).filter((arg) => arg !== '--'),
  options: { runs: { type: 'string', default: '3' }, models: { type: 'string' }, into: { type: 'string' }, requests: { type: 'string' }, trace: { type: 'boolean', default: false } },
});
const RUNS = Number(args.runs);
const MODELS = args.models === undefined ? CANDIDATES : args.models.split(',');
const SAMPLE = args.requests?.split(','); // a test run on these requests only
const TRACE = args.trace; // print every agent event, to see what a model actually did

// The service's dependencies, as main.ts builds them, with HAPI reached from the host.
type ServiceDeps = PacketDeps & { policies: PolicyRegistry };

function serviceDeps(): ServiceDeps {
  const terminology = loadTerminology(join(REPO_ROOT, 'data/terminology'));
  return {
    fhir: createHttpFhirClient({ baseUrl: FHIR_URL, authHeader: createFhirAuth({ mode: 'none' }) }),
    policies: createPolicyRegistry({
      load: () => loadPolicyStore([join(REPO_ROOT, 'data/policies')]),
      check: (store) => checkBindings(store.all(), BINDINGS, terminology),
    }),
    requests: loadRequestStore([join(REPO_ROOT, 'data/requests'), join(REPO_ROOT, 'eval/synthea-requests')]),
    terminology,
    bindings: BINDINGS,
  };
}

// This process's own /mcp, with a one-off nurse token: the agent's tool calls go through it as in production.
async function startMcp(deps: ServiceDeps) {
  const nurseToken = randomBytes(24).toString('hex');
  const server = createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const mcpUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/mcp`;
  const app = buildApp({
    ...deps,
    mcpUrl,
    verifier: createStaticTokenVerifier(parseAuthTokens(`nurse:eval-nurse:${sha256OfToken(nurseToken)}`)),
    audit: openAuditStore(':memory:'),
    logger: createLogger('error'),
    readiness: {
      fhir: async () => ({ ok: true, required: true, detail: {} }),
      model: async () => ({ ok: true, required: false, detail: {} }),
    },
  });
  server.on('request', app);
  return { mcpUrl, nurseToken, close: () => new Promise<void>((resolve) => server.close(() => resolve())) };
}

async function ollama<T>(path: string): Promise<T> {
  return (await (await fetch(`${OLLAMA_URL}${path}`)).json()) as T;
}

const share = (count: number, of: number) => ({ count, of });

// Where a long run is, on every request line: [#####---------------] 21/85, ~38 min left
type Progress = { done: number; total: number; startedMs: number };

function progressBar(progress: Progress): string {
  const width = 20;
  const filled = Math.round((progress.done / progress.total) * width);
  const msPerRequest = (performance.now() - progress.startedMs) / progress.done;
  const minutesLeft = Math.round((msPerRequest * (progress.total - progress.done)) / 60_000);
  return `[${'#'.repeat(filled)}${'-'.repeat(width - filled)}] ${progress.done}/${progress.total}, ~${minutesLeft} min left`;
}

// The version's settings with another model's name: only the model differs between candidates.
async function measureModel(
  name: string,
  deps: ServiceDeps,
  mcp: Awaited<ReturnType<typeof startMcp>>,
  version: ModelVersion,
  progress: Progress,
): Promise<ModelResult> {
  const model = connectLocalModel(OLLAMA_URL, { ...version, name });
  const requestIds = requestIdsFor(deps);

  // Warm-up: the first call loads the model into memory; it is not counted.
  await assemblePacket({ ...deps, summaryModel: model }, requestIds[0] ?? '');

  const summary = { firstTry: 0, firstTryOf: 0, faithful: 0, fallback: 0, total: 0, ms: [] as number[] };
  const agent = { calls: 0, invalid: 0, agree: 0, criteria: 0, drafts: 0, complete: 0, fallback: 0, steps: 0, runs: 0, timeLimit: 0, errors: 0, ms: [] as number[] };
  const byCriterion: Record<string, { count: number; of: number }> = {};
  let failingInARow = 0; // requests where the model answered neither the summary nor the agent

  for (let run = 1; run <= RUNS; run += 1) {
    for (const requestId of requestIds) {
      const { packet, metrics } = await assemblePacket({ ...deps, summaryModel: model }, requestId);
      summary.total += 1;
      summary.ms.push(metrics.summary.llmMs);
      if (metrics.summary.schemaValidFirstTry !== null) {
        summary.firstTryOf += 1;
        if (metrics.summary.schemaValidFirstTry) summary.firstTry += 1;
      }
      if (packet.summary_source === 'model') summary.faithful += 1;
      if (packet.warnings.includes('summary_fallback')) summary.fallback += 1;

      const started = performance.now();
      let agentOutcome: string;
      try {
        const result = await runAgentForRequest({ deps, model, mcpUrl: mcp.mcpUrl, bearerToken: mcp.nurseToken, requestId, onEvent: TRACE ? (event) => console.log(`    ${JSON.stringify(event)}`) : () => {} });
        agent.ms.push(Math.round(performance.now() - started));
        agentOutcome = `${agent.ms[agent.ms.length - 1]} ms`;
        agent.runs += 1;
        agent.steps += result.steps;
        agent.calls += result.toolCalls;
        agent.invalid += result.invalidToolCalls;
        if (result.warnings.includes('agent_time_limit')) agent.timeLimit += 1;
        for (const criterion of result.criteria) {
          agent.criteria += 1;
          const tally = (byCriterion[criterion.id] ??= { count: 0, of: 0 });
          tally.of += 1;
          if (criterion.agrees_with_rules) {
            agent.agree += 1;
            tally.count += 1;
          }
        }
        if (result.draft !== null) {
          agent.drafts += 1;
          if (result.draft.source === 'model') agent.complete += 1;
          else agent.fallback += 1;
        }
      } catch (error) {
        agent.errors += 1;
        agentOutcome = `error (${error instanceof Error ? error.message.slice(0, 120) : 'unknown'})`;
      }
      progress.done += 1;
      console.log(`${progressBar(progress)}  ${name} run ${run} ${requestId}: summary ${packet.summary_source}, agent ${agentOutcome}`);

      // A model that stops answering altogether (Ollama's GPU backend can be left broken by a GPU reset) would fill
      // the comparison with failures that are not the model's: stop instead, and say so.
      const modelDown = metrics.summary.failures.includes('model_unavailable') && agentOutcome.startsWith('error');
      failingInARow = modelDown ? failingInARow + 1 : 0;
      if (failingInARow >= 3) {
        throw new Error(`${name} stopped answering (3 requests in a row). Check Ollama (its log, then restart it) and run again.`);
      }
    }
  }

  const ps = await ollama<{ models: { name: string; size: number; size_vram: number }[] }>('/api/ps');
  const loaded = ps.models.find((entry) => entry.name === name);
  const tags = await ollama<{ models: { name: string; digest: string }[] }>('/api/tags');
  // Unload it (keep_alive 0), so the next candidate does not share GPU memory with this one.
  await fetch(`${OLLAMA_URL}/api/generate`, { method: 'POST', body: JSON.stringify({ model: name, keep_alive: 0 }) });
  return {
    name,
    runs: RUNS,
    digest: tags.models.find((entry) => entry.name === name)?.digest ?? null,
    inference: loaded !== undefined && loaded.size_vram === 0 ? 'cpu' : 'metal',
    memory_mb: loaded === undefined ? null : Math.round(loaded.size / 2 ** 20),
    summary: {
      schema_valid_first_try: share(summary.firstTry, summary.firstTryOf),
      faithful: share(summary.faithful, summary.total),
      fallback: share(summary.fallback, summary.total),
      p50_ms: percentile(summary.ms, 0.5),
      p95_ms: percentile(summary.ms, 0.95),
    },
    agent: {
      valid_tool_calls: share(agent.calls - agent.invalid, agent.calls),
      agrees_with_rules: share(agent.agree, agent.criteria),
      agreement_by_criterion: byCriterion,
      draft_complete: share(agent.complete, agent.drafts),
      draft_fallback: share(agent.fallback, agent.drafts),
      average_steps: agent.runs === 0 ? 0 : agent.steps / agent.runs,
      time_limit_hit: agent.timeLimit,
      errors: agent.errors,
      p50_ms: percentile(agent.ms, 0.5),
      p95_ms: percentile(agent.ms, 0.95),
    },
  };
}

function requestIdsFor(deps: ServiceDeps): string[] {
  const all = deps.requests.list().map((form) => form.request_id);
  if (SAMPLE === undefined) return all;
  const unknown = SAMPLE.filter((id) => !all.includes(id));
  if (unknown.length > 0) throw new Error(`Unknown request ids: ${unknown.join(', ')}`);
  return SAMPLE;
}

async function main(): Promise<void> {
  const startedAt = new Date();
  const deps = serviceDeps();
  const versions = loadModelVersions(join(REPO_ROOT, 'data/models'));
  const version = latestInEffect(versions, dayOf(startedAt));
  if (version === undefined) throw new Error('No model version in effect today');
  const mcp = await startMcp(deps);
  const gitSha = execSync('git rev-parse --short HEAD', { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
  const runId = `models-${startedAt.toISOString().replace(/[:.]/g, '-')}_${gitSha}`;
  const resultsDir = join(REPO_ROOT, SAMPLE === undefined ? 'eval/results' : 'eval/results/samples');
  mkdirSync(resultsDir, { recursive: true });

  // --into: add to an earlier comparison (same prompts and settings), skipping models it already has.
  const path = args.into === undefined ? join(resultsDir, `${runId}.json`) : join(REPO_ROOT, args.into);
  const comparison: ModelComparison =
    args.into === undefined
      ? {
          run_id: runId,
          started_at: startedAt.toISOString(),
          git_sha: gitSha,
          model_version_folder: version.folder,
          prompt_versions: [SUMMARY_PROMPT_VERSION, AGENT_PROMPT_VERSION, DRAFT_PROMPT_VERSION],
          requests: requestIdsFor(deps).length,
          request_ids: requestIdsFor(deps),
          hardware: { platform: `${platform()} ${process.arch}`, cpu: cpus()[0]?.model ?? 'unknown', memory_gb: Math.round(totalmem() / 2 ** 30) },
          models: [],
        }
      : ModelComparisonSchema.parse(JSON.parse(readFileSync(path, 'utf8')));
  if (comparison.model_version_folder !== version.folder) {
    throw new Error(`${path} used model version ${comparison.model_version_folder}; today's is ${version.folder}. Start a new comparison.`);
  }
  try {
    const toMeasure = MODELS.filter((candidate) => !comparison.models.some((model) => model.name === candidate));
    const progress: Progress = { done: 0, total: toMeasure.length * RUNS * comparison.requests, startedMs: performance.now() };
    for (const name of toMeasure) {
      console.log(`${name}: ${comparison.requests} requests × ${RUNS} runs`);
      comparison.models.push(await measureModel(name, deps, mcp, version, progress));
      // Written after every model, so a long run that stops early still leaves its results.
      writeFileSync(path, `${JSON.stringify(ModelComparisonSchema.parse(comparison), null, 2)}\n`);
    }
  } finally {
    await mcp.close();
  }
  console.log(`Wrote ${path}`);
  console.log(`Wrote ${writeModelReport(path, comparison, SAMPLE !== undefined)}`);
  if (SAMPLE === undefined) writeEvalReport(); // a test run never replaces the real results in EVAL.md
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

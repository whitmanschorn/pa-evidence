import { PacketSchema, type Packet } from '@pa/shared';
import { fetchChart } from '../fhir/chart.js';
import type { FhirClient } from '../fhir/fhirClient.js';
import type { LocalModel } from '../llm/localModel.js';
import type { PolicyStore } from '../policy/policyStore.js';
import type { RequestStore } from '../requests/requestStore.js';
import { buildEvaluator } from '../rules/buildEvaluator.js';
import { evaluateCriterion } from '../rules/evaluateCriterion.js';
import { unique } from '../rules/matching.js';
import { rulesFingerprint } from '../policy/policyRegistry.js';
import { decideRoute } from '../rules/route.js';
import type { Binding } from '../rules/types.js';
import type { Terminology } from '../terminology.js';
import { findUnverifiedRefs } from './verifySources.js';
import { writeSummary, type SummaryResult } from './writeSummary.js';

export type PacketDeps = {
  fhir: FhirClient;
  policies: PolicyStore;
  requests: RequestStore;
  terminology: Terminology;
  bindings: Record<string, Binding>;
  // The local model that writes the two-sentence summary. Without it, the code template is the summary.
  summaryModel?: LocalModel;
};

// Thrown for a request id or policy we do not have; the HTTP layer turns it into 404 not_found.
export class NotFoundError extends Error {
  override name = 'NotFoundError';
}

// For the log line and the audit event: timings, counts, which exact rules and which model and prompt were used.
// Never clinical values.
export type PacketMetrics = { fhirMs: number; sourceCount: number; rulesFingerprint: string; summary: SummaryResult };

// Builds the evidence packet for one request. Every status, source and the route are decided here, in code.
// The model only writes the two-sentence summary, which is checked and replaced by a template if it fails.
export async function assemblePacket(
  deps: PacketDeps,
  requestId: string,
): Promise<{ packet: Packet; metrics: PacketMetrics }> {
  const form = deps.requests.get(requestId);
  if (form === undefined) throw new NotFoundError('request not found');
  const choice = deps.policies.policyFor(form.policy_id, form.request_date);
  if (choice === null) throw new NotFoundError('policy not found');
  const policy = choice.policy;
  const patientId = form.member.patient_id;
  const warnings: string[] = [...choice.warnings];

  if (form.member.fhir_reference !== `Patient/${patientId}`) {
    warnings.push('member_reference_mismatch');
  }
  const covered = policy.covered_medications.some((medication) => medication.rxnorm === form.requested_medication.rxnorm);
  if (!covered) {
    warnings.push('medication_not_in_policy_list');
  }

  // Loop over whatever criteria this policy version has; nothing here assumes how many or which.
  const plans = policy.criteria.map((criterion) => {
    const binding = deps.bindings[criterion.id];
    if (binding === undefined) throw new Error(`No binding for ${criterion.id}`); // checkBindings prevents this at startup
    return { criterion, evaluator: buildEvaluator(criterion, binding, deps.terminology) };
  });

  const fhirStarted = performance.now();
  const { chart, warnings: chartWarnings } = await fetchChart(
    deps.fhir,
    patientId,
    plans.flatMap((plan) => plan.evaluator.needs),
  );
  warnings.push(...chartWarnings);

  const context = { requestDate: form.request_date, form, chart };
  const evaluated = plans.map((plan) => evaluateCriterion(plan.criterion, plan.evaluator, context));
  const criteria = evaluated.map((entry) => entry.result);
  warnings.push(...evaluated.flatMap((entry) => entry.warnings));

  const unverified = await findUnverifiedRefs(deps.fhir, criteria);
  const fhirMs = Math.round(performance.now() - fhirStarted);
  if (unverified.length > 0) {
    warnings.push('source_unverified');
  }

  const missingDocuments = criteria
    .map((criterion) => criterion.missing_document)
    .filter((document): document is string => document !== null);
  const route = decideRoute(criteria, unique(warnings));
  // The summary comes last: it describes the decided statuses and cannot change them, or the route.
  const summary = await writeSummary(deps.summaryModel, criteria, missingDocuments);
  const uniqueWarnings = unique([...warnings, ...summary.warnings]);

  const packet = PacketSchema.parse({
    request_id: form.request_id,
    request_date: form.request_date,
    patient: `Patient/${patientId}`,
    policy_id: policy.policy_id,
    policy_version: policy.version,
    criteria,
    missing_documents: missingDocuments,
    summary: summary.summary,
    summary_source: summary.source,
    evidence_complete: route === 'evidence_complete',
    route,
    warnings: uniqueWarnings,
  });
  const sourceCount = unique(criteria.flatMap((criterion) => criterion.sources)).length;
  return { packet, metrics: { fhirMs, sourceCount, rulesFingerprint: rulesFingerprint(policy), summary } };
}

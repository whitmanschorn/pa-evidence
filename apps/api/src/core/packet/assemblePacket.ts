import { PacketSchema, type Packet } from '@pa/shared';
import { fetchChart } from '../fhir/chart.js';
import type { FhirClient } from '../fhir/fhirClient.js';
import type { PolicyStore } from '../policy/policyStore.js';
import type { RequestStore } from '../requests/requestStore.js';
import { buildEvaluator } from '../rules/buildEvaluator.js';
import { evaluateCriterion } from '../rules/evaluateCriterion.js';
import { unique } from '../rules/matching.js';
import { decideRoute } from '../rules/route.js';
import type { Binding } from '../rules/types.js';
import type { Terminology } from '../terminology.js';
import { templateSummary } from './templateSummary.js';
import { findUnverifiedRefs } from './verifySources.js';

export type PacketDeps = {
  fhir: FhirClient;
  policies: PolicyStore;
  requests: RequestStore;
  terminology: Terminology;
  bindings: Record<string, Binding>;
};

// Thrown for a request id or policy we do not have; the HTTP layer turns it into 404 not_found.
export class NotFoundError extends Error {}

export type PacketMetrics = { fhirMs: number; sourceCount: number };

// Door 1: builds the evidence packet for one request with the rules engine alone. Every status, source and the
// route are decided here, in code. The summary is the code template (Phase 5 adds the model, with a fallback).
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
  const uniqueWarnings = unique(warnings);
  const route = decideRoute(criteria, uniqueWarnings);

  const packet = PacketSchema.parse({
    request_id: form.request_id,
    request_date: form.request_date,
    patient: `Patient/${patientId}`,
    policy_id: policy.policy_id,
    policy_version: policy.version,
    criteria,
    missing_documents: missingDocuments,
    summary: templateSummary(criteria, missingDocuments),
    summary_source: 'template',
    evidence_complete: route === 'evidence_complete',
    route,
    warnings: uniqueWarnings,
  });
  const sourceCount = unique(criteria.flatMap((criterion) => criterion.sources)).length;
  return { packet, metrics: { fhirMs, sourceCount } };
}

import { FhirRefSchema } from '@pa/shared';
import { z } from 'zod';
import { NotFoundError, assemblePacket, type PacketDeps } from '../packet/assemblePacket.js';

// The agent's four tools, as plain functions over the rules engine. They return evaluated facts only: never raw
// FHIR resources, never free text from the chart or the form. src/mcp/ publishes them over MCP.

export const GetRequestInput = { request_id: z.string().regex(/^[A-Za-z0-9-]{1,64}$/) };
export const GetPolicyInput = { policy_id: z.string(), request_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) };
export const EvaluateCriterionInput = { request_id: GetRequestInput.request_id, criterion_id: z.string() };
export const VerifySourcesInput = { refs: z.array(FhirRefSchema).max(200) };

// The request form's structured fields. Free-text notes are left out, so they never reach a model.
export function getRequest(deps: PacketDeps, requestId: string) {
  const form = deps.requests.get(requestId);
  if (form === undefined) throw new NotFoundError('request not found');
  const { notes, ...attested } = form.prescriber_attestation;
  return {
    request_id: form.request_id,
    request_date: form.request_date,
    urgency: form.urgency,
    policy_id: form.policy_id,
    requested_medication: form.requested_medication,
    diagnosis_claimed: form.diagnosis_claimed,
    attested,
  };
}

// The policy version in effect on the request date: its criteria, by id and requirement.
export function getPolicy(deps: PacketDeps, policyId: string, requestDate: string) {
  const choice = deps.policies.policyFor(policyId, requestDate);
  if (choice === null) throw new NotFoundError('policy not found');
  return {
    policy_id: choice.policy.policy_id,
    version: choice.policy.version,
    effective: choice.policy.effective,
    title: choice.policy.title,
    criteria: choice.policy.criteria.map((criterion) => ({ id: criterion.id, requirement: criterion.requirement })),
  };
}

// One criterion, evaluated by the rules engine exactly as the evidence endpoint does.
export async function evaluateCriterion(deps: PacketDeps, requestId: string, criterionId: string) {
  const { packet } = await assemblePacket({ ...deps, summaryModel: undefined }, requestId);
  const criterion = packet.criteria.find((candidate) => candidate.id === criterionId);
  if (criterion === undefined) throw new NotFoundError('criterion not in the policy');
  return {
    criterion_id: criterion.id,
    requirement: criterion.requirement,
    status: criterion.status,
    sources: criterion.sources,
    value: criterion.value ?? null,
    observed: criterion.observed ?? null,
    attested: criterion.attested ?? null,
    note: criterion.note ?? null,
    missing_document: criterion.missing_document,
  };
}

export async function verifySources(deps: PacketDeps, refs: string[]) {
  const found = await deps.fhir.existing(refs);
  return { verified: refs.filter((ref) => found.has(ref)), not_found: refs.filter((ref) => !found.has(ref)) };
}

export type EvaluatedCriterion = Awaited<ReturnType<typeof evaluateCriterion>>;

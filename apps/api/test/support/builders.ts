import type { Chart } from '../../src/core/fhir/chart.js';
import type { Policy } from '../../src/core/policy/policySchema.js';
import { loadPolicyStore } from '../../src/core/policy/policyStore.js';
import type { RequestForm } from '../../src/core/requests/requestStore.js';
import { BINDINGS } from '../../src/core/rules/bindings.js';
import { buildEvaluator } from '../../src/core/rules/buildEvaluator.js';
import type { EvaluationContext, Evaluator, KindResult } from '../../src/core/rules/types.js';
import { loadTerminology } from '../../src/core/terminology.js';
import { POLICY_FOLDER, TERMINOLOGY_DIR } from './suppliedWorld.js';

// Tiny FHIR resources for evaluator unit tests. Everything belongs to Patient/p1 unless a test says otherwise.
export const REQUEST_DATE = '2026-10-01';
const SUBJECT = { reference: 'Patient/p1' };
const SNOMED = 'http://snomed.info/sct';
const LOINC = 'http://loinc.org';
const RXNORM = 'http://www.nlm.nih.gov/research/umls/rxnorm';

// The supplied policy with its rules engine config applied, exactly as the service loads it.
export const policy: Policy = loadPolicyStore([POLICY_FOLDER]).all()[0]!;
export const terminology = loadTerminology(TERMINOLOGY_DIR);

// The evaluator for a supplied-policy criterion, exactly as the service builds it.
export function evaluatorFor(criterionId: string): Evaluator {
  const criterion = policy.criteria.find((candidate) => candidate.id === criterionId);
  const binding = BINDINGS[criterionId];
  if (criterion === undefined || binding === undefined) throw new Error(`no ${criterionId}`);
  return buildEvaluator(criterion, binding, terminology);
}

export function run(criterionId: string, chart: Partial<Chart>, attestation: Record<string, unknown> = {}): KindResult {
  return evaluatorFor(criterionId).evaluate(contextWith(chart, attestation));
}

export function contextWith(chart: Partial<Chart>, attestation: Record<string, unknown> = {}): EvaluationContext {
  return {
    requestDate: REQUEST_DATE,
    form: form(attestation),
    chart: {
      patient: null,
      conditions: [],
      observations: [],
      medicationRequests: [],
      allergies: [],
      ...chart,
    },
  };
}

export function form(attestation: Record<string, unknown> = {}): RequestForm {
  return {
    request_id: 'T-1',
    request_date: REQUEST_DATE,
    urgency: 'standard',
    policy_id: 'MP-SYN-021',
    member: { patient_id: 'p1', fhir_reference: 'Patient/p1' },
    requested_medication: { rxnorm: '1991302', display: 'semaglutide' },
    diagnosis_claimed: { snomed: '44054006', display: 'Type 2 diabetes mellitus' },
    prescriber_attestation: attestation as RequestForm['prescriber_attestation'],
  };
}

export function patient(fields: Partial<fhir4.Patient> = {}): fhir4.Patient {
  return { resourceType: 'Patient', id: 'p1', ...fields };
}

export function condition(
  id: string,
  code: { code?: string; display?: string; system?: string },
  options: { clinicalStatus?: string; verificationStatus?: string; onset?: string } = {},
): fhir4.Condition {
  return {
    resourceType: 'Condition',
    id,
    subject: SUBJECT,
    clinicalStatus: { coding: [{ code: options.clinicalStatus ?? 'active' }] },
    verificationStatus: { coding: [{ code: options.verificationStatus ?? 'confirmed' }] },
    code: { coding: [{ system: code.system ?? SNOMED, code: code.code, display: code.display }], text: code.display },
    onsetDateTime: options.onset ?? '2020-01-01',
  };
}

export function observation(
  id: string,
  loinc: string,
  value: number | undefined,
  unit: string,
  date: { effective?: string; period?: string; issued?: string },
  status: fhir4.Observation['status'] = 'final',
): fhir4.Observation {
  return {
    resourceType: 'Observation',
    id,
    status,
    subject: SUBJECT,
    code: { coding: [{ system: LOINC, code: loinc }] },
    effectiveDateTime: date.effective,
    effectivePeriod: date.period === undefined ? undefined : { start: date.period },
    issued: date.issued,
    valueQuantity: value === undefined ? undefined : { value, unit },
  };
}

export const hba1c = (id: string, value: number, effective: string, options: { unit?: string; status?: fhir4.Observation['status'] } = {}) =>
  observation(id, '4548-4', value, options.unit ?? '%', { effective }, options.status);

export const egfr = (id: string, value: number, effective: string) =>
  observation(id, '33914-3', value, 'mL/min/{1.73_m2}', { effective });

export function metforminOrder(
  id: string,
  status: fhir4.MedicationRequest['status'],
  authoredOn: string,
  options: { end?: string; code?: string; display?: string } = {},
): fhir4.MedicationRequest {
  return {
    resourceType: 'MedicationRequest',
    id,
    status,
    intent: 'order',
    subject: SUBJECT,
    medicationCodeableConcept: {
      coding: [{ system: RXNORM, code: options.code ?? '860975', display: options.display ?? '24 HR Metformin hydrochloride 500 MG' }],
    },
    authoredOn,
    dispenseRequest: options.end === undefined ? undefined : { validityPeriod: { start: authoredOn, end: options.end } },
  };
}

export function allergy(
  id: string,
  code: { code?: string; display: string },
  verificationStatus = 'confirmed',
): fhir4.AllergyIntolerance {
  return {
    resourceType: 'AllergyIntolerance',
    id,
    patient: SUBJECT,
    type: 'intolerance',
    verificationStatus: { coding: [{ code: verificationStatus }] },
    code: { coding: [{ system: RXNORM, code: code.code, display: code.display }], text: code.display },
    recordedDate: '2026-02-22',
  };
}

export function reasonOf(result: KindResult, ref: string): string | null | undefined {
  return result.considered.find((item) => item.ref === ref)?.reason;
}

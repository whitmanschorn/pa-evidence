import { z } from 'zod';
import { ageRangeOn, isAfter, parsePartialDate, toDay } from '../../dates.js';
import { refOf } from '../../fhir/resources.js';
import type { EvaluationContext, Evaluator, KindResult, PatientAgeBinding } from '../types.js';

// "The member is at least N years old on the request date." The age limit comes from the binding because
// the policy has no structured field for it. The birth date itself never leaves this function: the packet
// carries only the age.
const ParamsSchema = z.object({
  resource: z.literal('Patient'),
  element: z.literal('birthDate'),
});

export function buildPatientAge(block: unknown, binding: PatientAgeBinding): Evaluator {
  ParamsSchema.parse(block);
  const minYears = binding.min_years;

  function evaluate(context: EvaluationContext): KindResult {
    const patient = context.chart.patient;
    const threshold = { compare: 'gte' as const, value: minYears, unit: 'years' };
    if (patient === null) {
      return { status: 'missing', sources: [], considered: [], threshold, warnings: [], documentVars: {} };
    }

    const ref = refOf(patient);
    const warnings: string[] = [];
    const deceasedDay = toDay(patient.deceasedDateTime);
    if (patient.deceasedBoolean === true || (deceasedDay !== null && !isAfter(deceasedDay, context.requestDate))) {
      warnings.push('implausible_deceased_before_request');
    }

    const birth = parsePartialDate(patient.birthDate);
    if (birth === null) {
      return {
        status: 'missing',
        sources: [],
        note: 'Patient record has no birth date',
        considered: [{ ref, date: null, value: 'no birth date', used: false, reason: 'no_birth_date' }],
        threshold,
        warnings,
        documentVars: {},
      };
    }

    // A partial birth date ("1980") gives an age range; decide only when the whole range is on one side.
    const age = ageRangeOn(birth, context.requestDate);
    const value = age.min === age.max ? `age ${age.min}` : `age ${age.min} or ${age.max}`;
    let status: KindResult['status'] = 'missing';
    if (age.min >= minYears) status = 'met';
    if (age.max < minYears) status = 'not_met';

    return {
      status,
      sources: status === 'missing' ? [] : [ref],
      value,
      note: status === 'missing' ? 'Birth date is partial and the age is ambiguous' : undefined,
      considered: [{ ref, date: null, value, used: status !== 'missing', reason: status === 'missing' ? 'partial_birth_date' : null }],
      threshold,
      warnings,
      documentVars: {},
    };
  }

  return {
    kind: 'patient_age',
    needs: [{ resourceType: 'Patient' }],
    documents: { missing: 'Member date of birth', ...binding.documents },
    evaluate,
  };
}

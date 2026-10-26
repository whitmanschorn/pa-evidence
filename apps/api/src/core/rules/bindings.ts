import type { Binding } from './types.js';

// The only file in the code that names criterion ids (invariant 14). Each policy criterion is bound to an
// evaluator kind. A binding adds only what the policy JSON lacks and is not a number: the comparison direction,
// the request-form fields to check for conflicts, and the provider-request wording.
// Every number (thresholds, windows, tolerances, the age limit) is data: the policy file, or the rules engine
// config in data/rules-engine-config/ for values the policy has no field for.
//
// Wording placeholders: {from} {to} = the look-back window, {value} {date} = the attested lab result,
// {months} = the attested months of therapy.
export const BINDINGS: Record<string, Binding> = {
  C1: {
    kind: 'condition_present',
    attested: { code: 'diagnosis_claimed.snomed' },
    documents: {
      missing: 'Documentation of an active type 2 diabetes diagnosis (problem list or visit note)',
      conflicting: 'Clinical note confirming the type 2 diabetes diagnosis and its current status',
    },
  },
  C2: {
    kind: 'observation_threshold',
    compare: 'gte',
    attested: { value: 'prescriber_attestation.hba1c_value', date: 'prescriber_attestation.hba1c_date' },
    documents: {
      missing: 'HbA1c lab result dated {from} to {to}',
      conflicting: 'Lab report for the HbA1c result reported on the request form ({value} % on {date})',
    },
  },
  C3: {
    kind: 'any_of',
    primary: {
      kind: 'medication_duration',
      from: 'path_a',
      attested: { months: 'prescriber_attestation.metformin_trial_months' },
    },
    alternatives: [
      { kind: 'allergy_present', from: 'path_b' },
      // The policy's value_max 30 is read as strict "< 30", per its note (DECISIONS: panel default 1).
      { kind: 'observation_threshold', from: 'path_c', compare: 'lt' },
    ],
    documents: {
      missing:
        'Metformin prescription history for {from} to {to}, or documentation of metformin intolerance or contraindication',
      conflicting: 'Metformin prescription or pharmacy fill history supporting the reported {months} months',
    },
  },
  C4: { kind: 'condition_absent_ever' },
  C5: {
    kind: 'patient_age',
    documents: { missing: 'Proof of member date of birth' },
  },
};

import type { Binding } from './types.js';

// The only file in the code that names criterion ids (invariant 14). Each policy criterion is bound to an
// evaluator kind. A binding adds only what the policy JSON lacks: the comparison direction, the request-form
// fields to check for conflicts and their tolerances, the C5 age limit, and the provider-request wording.
// Thresholds, windows and codes that the policy does hold are read from the policy file.
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
    // A difference of 0.1 or more between the form and the record is a conflict (DECISIONS: panel default 2).
    attested: { value: 'prescriber_attestation.hba1c_value', date: 'prescriber_attestation.hba1c_date', tolerance: 0.1 },
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
      // Conflicting only when the form claims more than 1 month beyond the record (D-029; panel default 3).
      attested: { months: 'prescriber_attestation.metformin_trial_months', tolerance_months: 1 },
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
    min_years: 18, // the policy has no structured field for the age limit (invariant 6 exception)
    documents: { missing: 'Proof of member date of birth' },
  },
};

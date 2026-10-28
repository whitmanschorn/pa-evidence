import { z } from 'zod';

// A binding says how the rules engine evaluates one policy criterion: the evaluator kind, the comparison direction,
// the request-form fields to check for conflicts, and the provider-request wording. Bindings are data: each policy
// version's rules-engine-config.json holds them under `bindings`, keyed by criterion id, so they are versioned and
// fingerprinted with the policy they belong to. They hold no numbers: those are the criterion's params (its `fhir`
// block in policy.json, plus the config's `criteria`).
//
// Every object is strict, so a misspelt key (say "comapre") stops the load instead of being silently ignored.

// Wording of the provider request, with {placeholders} the kind fills in (each kind's documentVars).
// Only missing and conflicting criteria produce a request.
export const DocumentWordingSchema = z.strictObject({
  missing: z.string().optional(),
  conflicting: z.string().optional(),
});

// Request-form fields compared with the record. Paths are dotted, e.g. "prescriber_attestation.hba1c_value".
// The tolerances for these comparisons are numbers, so they are params (attested_tolerance,
// attested_tolerance_months), never part of a binding.
const AttestedCodeSchema = z.strictObject({ code: z.string() });
const AttestedValueSchema = z.strictObject({ value: z.string(), date: z.string() });
const AttestedMonthsSchema = z.strictObject({ months: z.string() });

// Fields every kind accepts. `from` names the sub-block of the criterion's `fhir` object that holds this kind's
// params (e.g. "path_a"). `note` says why a binding is the way it is, since JSON has no comments; code never reads it.
const common = {
  from: z.string().optional(),
  documents: DocumentWordingSchema.optional(),
  note: z.string().optional(),
};

export const ConditionPresentBindingSchema = z.strictObject({
  kind: z.literal('condition_present'),
  ...common,
  attested: AttestedCodeSchema.optional(),
});

export const ObservationThresholdBindingSchema = z.strictObject({
  kind: z.literal('observation_threshold'),
  ...common,
  compare: z.enum(['gte', 'lt']),
  attested: AttestedValueSchema.optional(),
});

export const MedicationDurationBindingSchema = z.strictObject({
  kind: z.literal('medication_duration'),
  ...common,
  attested: AttestedMonthsSchema.optional(),
});

export const AllergyPresentBindingSchema = z.strictObject({ kind: z.literal('allergy_present'), ...common });

export const ConditionAbsentEverBindingSchema = z.strictObject({ kind: z.literal('condition_absent_ever'), ...common });

// min_years is a number, so it is a param (the rules engine config), not part of the binding.
export const PatientAgeBindingSchema = z.strictObject({ kind: z.literal('patient_age'), ...common });

// Any kind except any_of can be one path of an any_of.
export const PathBindingSchema = z.discriminatedUnion('kind', [
  ConditionPresentBindingSchema,
  ObservationThresholdBindingSchema,
  MedicationDurationBindingSchema,
  AllergyPresentBindingSchema,
  ConditionAbsentEverBindingSchema,
  PatientAgeBindingSchema,
]);

export const AnyOfBindingSchema = z.strictObject({
  kind: z.literal('any_of'),
  ...common,
  primary: PathBindingSchema,
  alternatives: z.array(PathBindingSchema),
});

export const BindingSchema = z.discriminatedUnion('kind', [
  ConditionPresentBindingSchema,
  ObservationThresholdBindingSchema,
  MedicationDurationBindingSchema,
  AllergyPresentBindingSchema,
  ConditionAbsentEverBindingSchema,
  PatientAgeBindingSchema,
  AnyOfBindingSchema,
]);

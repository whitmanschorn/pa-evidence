import type { Attested, ConsideredItem, CriterionStatus, PathResult } from '@pa/shared';
import type { Chart, ChartQuery } from '../fhir/chart.js';
import type { RequestForm } from '../requests/requestStore.js';

// Everything an evaluator reads. Pure data: evaluators never fetch, never read the clock.
export type EvaluationContext = {
  requestDate: string;
  form: RequestForm;
  chart: Chart;
};

export type Window = { from: string; to: string };
export type Threshold = { compare: 'gte' | 'lt'; value: number; unit: string };

// What one evaluator kind returns. evaluateCriterion adds the criterion id, requirement and missing-document text.
export type KindResult = {
  status: CriterionStatus;
  sources: string[];
  value?: string;
  observed?: string;
  attested?: Attested;
  note?: string;
  considered: ConsideredItem[];
  window?: Window;
  threshold?: Threshold;
  paths?: PathResult[];
  // Generic warning codes, e.g. "display_match". evaluateCriterion appends ":<criterion id>".
  warnings: string[];
  // Values for the {placeholders} in the missing-document wording, e.g. { from: "2026-07-03" }.
  documentVars: Record<string, string>;
};

// Wording of the provider request for a criterion, with {placeholders}. Only missing and conflicting produce one.
export type DocumentWording = { missing?: string; conflicting?: string };

// A built evaluator: a kind configured with one criterion's params.
export type Evaluator = {
  kind: string;
  needs: ChartQuery[];
  documents: DocumentWording;
  evaluate(context: EvaluationContext): KindResult;
};

// ----- Bindings: criterion id -> kind, plus what the policy JSON lacks (see bindings.ts) -----

// Request-form fields compared with the record. Paths are dotted, e.g. "prescriber_attestation.hba1c_value".
export type AttestedValueBinding = { value: string; date: string; tolerance: number };
export type AttestedMonthsBinding = { months: string; tolerance_months: number };

// `from` names the sub-block of the criterion's `fhir` object that holds this kind's params (e.g. "path_a").
type BindingCommon = { from?: string; documents?: DocumentWording };

export type ConditionPresentBinding = BindingCommon & { kind: 'condition_present'; attested?: { code: string } };
export type ObservationThresholdBinding = BindingCommon & {
  kind: 'observation_threshold';
  compare: 'gte' | 'lt';
  attested?: AttestedValueBinding;
};
export type MedicationDurationBinding = BindingCommon & {
  kind: 'medication_duration';
  attested?: AttestedMonthsBinding;
};
export type AllergyPresentBinding = BindingCommon & { kind: 'allergy_present' };
export type ConditionAbsentEverBinding = BindingCommon & { kind: 'condition_absent_ever' };
export type PatientAgeBinding = BindingCommon & { kind: 'patient_age'; min_years: number };

// Any kind except any_of can be one path of an any_of.
export type PathBinding =
  | ConditionPresentBinding
  | ObservationThresholdBinding
  | MedicationDurationBinding
  | AllergyPresentBinding
  | ConditionAbsentEverBinding
  | PatientAgeBinding;

export type AnyOfBinding = BindingCommon & { kind: 'any_of'; primary: PathBinding; alternatives: PathBinding[] };

export type Binding = PathBinding | AnyOfBinding;

import type { Attested, ConsideredItem, CriterionStatus, PathResult } from '@pa/shared';
import type { z } from 'zod';
import type { Chart, ChartQuery } from '../fhir/chart.js';
import type { RequestForm } from '../requests/requestStore.js';
import type {
  AllergyPresentBindingSchema,
  AnyOfBindingSchema,
  BindingSchema,
  ConditionAbsentEverBindingSchema,
  ConditionPresentBindingSchema,
  DocumentWordingSchema,
  MedicationDurationBindingSchema,
  ObservationThresholdBindingSchema,
  PathBindingSchema,
  PatientAgeBindingSchema,
} from './bindingSchema.js';

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
export type DocumentWording = z.infer<typeof DocumentWordingSchema>;

// A built evaluator: a kind configured with one criterion's params.
export type Evaluator = {
  kind: string;
  needs: ChartQuery[];
  documents: DocumentWording;
  evaluate(context: EvaluationContext): KindResult;
};

// ----- Bindings: criterion id -> kind, plus what the policy JSON lacks. They are data, read from each policy
// version's rules-engine-config.json; the schemas, and why each field exists, are in bindingSchema.ts. -----

export type ConditionPresentBinding = z.infer<typeof ConditionPresentBindingSchema>;
export type ObservationThresholdBinding = z.infer<typeof ObservationThresholdBindingSchema>;
export type MedicationDurationBinding = z.infer<typeof MedicationDurationBindingSchema>;
export type AllergyPresentBinding = z.infer<typeof AllergyPresentBindingSchema>;
export type ConditionAbsentEverBinding = z.infer<typeof ConditionAbsentEverBindingSchema>;
export type PatientAgeBinding = z.infer<typeof PatientAgeBindingSchema>;
export type PathBinding = z.infer<typeof PathBindingSchema>;
export type AnyOfBinding = z.infer<typeof AnyOfBindingSchema>;
export type Binding = z.infer<typeof BindingSchema>;

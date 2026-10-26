import type { PolicyCriterion } from '../policy/policySchema.js';
import type { Terminology } from '../terminology.js';
import { buildAllergyPresent } from './kinds/allergyPresent.js';
import { buildAnyOf } from './kinds/anyOf.js';
import { buildConditionAbsentEver } from './kinds/conditionAbsentEver.js';
import { buildConditionPresent } from './kinds/conditionPresent.js';
import { buildMedicationDuration } from './kinds/medicationDuration.js';
import { buildObservationThreshold } from './kinds/observationThreshold.js';
import { buildPatientAge } from './kinds/patientAge.js';
import type { Binding, Evaluator } from './types.js';

// Turns a policy criterion plus its binding into an evaluator. Throws when the policy's params do not parse
// for the bound kind; checkBindings runs this at startup so a bad policy file stops the service early.
export function buildEvaluator(criterion: PolicyCriterion, binding: Binding, terminology: Terminology): Evaluator {
  return buildFromBlock(criterion.fhir, binding, terminology);
}

function buildFromBlock(fhirBlock: Record<string, unknown>, binding: Binding, terminology: Terminology): Evaluator {
  // `from` picks a sub-block of the criterion's fhir object, e.g. "path_a"; without it the whole block is used.
  const block = binding.from === undefined ? fhirBlock : fhirBlock[binding.from];

  // Exhaustive: adding a kind to the Binding union makes the compiler point here.
  switch (binding.kind) {
    case 'condition_present':
      return buildConditionPresent(block, binding, terminology);
    case 'observation_threshold':
      return buildObservationThreshold(block, binding, terminology);
    case 'medication_duration':
      return buildMedicationDuration(block, binding, terminology);
    case 'allergy_present':
      return buildAllergyPresent(block, binding, terminology);
    case 'condition_absent_ever':
      return buildConditionAbsentEver(block, binding, terminology);
    case 'patient_age':
      return buildPatientAge(block, binding);
    case 'any_of':
      return buildAnyOf(fhirBlock, binding, (pathBlock, pathBinding) => buildFromBlock(pathBlock, pathBinding, terminology));
    default:
      return assertNever(binding);
  }
}

function assertNever(value: never): never {
  throw new Error(`Unknown evaluator kind: ${JSON.stringify(value)}`);
}

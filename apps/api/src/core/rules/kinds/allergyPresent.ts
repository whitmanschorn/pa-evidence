import type { ConsideredItem } from '@pa/shared';
import { z } from 'zod';
import { isAfter, toDay } from '../../dates.js';
import { refOf } from '../../fhir/resources.js';
import type { Terminology } from '../../terminology.js';
import { RXNORM, conceptLabel, isRefutedOrError, matchConcept } from '../matching.js';
import type { AllergyPresentBinding, EvaluationContext, Evaluator, KindResult } from '../types.js';

// "The record documents an allergy or intolerance to <drug>." Example: metformin intolerance (an alternative path of the metformin criterion).
// Any matching AllergyIntolerance with acceptable verification is met; otherwise missing.
const ParamsSchema = z.object({
  resource: z.literal('AllergyIntolerance'),
  ingredient_rxnorm: z.string(),
});

export function buildAllergyPresent(block: unknown, binding: AllergyPresentBinding, terminology: Terminology): Evaluator {
  const params = ParamsSchema.parse(block);
  const expansion = terminology.expand({ system: RXNORM, code: params.ingredient_rxnorm });

  function evaluate(context: EvaluationContext): KindResult {
    const considered: ConsideredItem[] = [];
    const found: fhir4.AllergyIntolerance[] = [];
    const warnings = new Set<string>();

    for (const allergy of context.chart.allergies) {
      const match = matchConcept(allergy.code, expansion);
      if (match === null) continue;

      const day = toDay(allergy.recordedDate ?? allergy.onsetDateTime);
      const item: ConsideredItem = {
        ref: refOf(allergy),
        date: day,
        value: `${conceptLabel(allergy.code)} ${allergy.type ?? 'allergy or intolerance'}`,
        used: false,
        reason: null,
      };
      considered.push(item);

      if (isRefutedOrError(allergy.verificationStatus)) {
        item.reason = 'verification_refuted';
      } else if (day !== null && isAfter(day, context.requestDate)) {
        item.reason = 'after_request_date';
      } else {
        item.used = true;
        found.push(allergy);
        if (match === 'display') warnings.add('display_match');
      }
    }

    if (found.length === 0) {
      return { status: 'missing', sources: [], considered, warnings: [...warnings], documentVars: {} };
    }
    return {
      status: 'met',
      sources: found.map(refOf),
      value: `${found[0]?.type ?? 'allergy or intolerance'} documented`,
      considered,
      warnings: [...warnings],
      documentVars: {},
    };
  }

  return {
    kind: 'allergy_present',
    needs: [{ resourceType: 'AllergyIntolerance' }],
    documents: { missing: `Documentation of ${expansion.label} allergy or intolerance`, ...binding.documents },
    evaluate,
  };
}

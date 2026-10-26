import type { ConsideredItem } from '@pa/shared';
import { z } from 'zod';
import { isAfter, toDay } from '../../dates.js';
import { refOf, statusCode } from '../../fhir/resources.js';
import type { Terminology } from '../../terminology.js';
import { CodingSchema, conceptLabel, isRefutedOrError, matchConcept } from '../matching.js';
import type { ConditionAbsentEverBinding, EvaluationContext, Evaluator, KindResult } from '../types.js';

// "No history of <conditions>, at any time." Example: no pancreatitis, MTC or MEN2.
// Any matching Condition counts whatever its clinicalStatus (resolved is still history): not_met, cited.
// No match: met, with no sources and a note naming the codes searched. It must be met when nothing is found,
// because the decision rule needs every criterion met for evidence_complete.
const ParamsSchema = z.object({
  resource: z.literal('Condition'),
  codes: z.array(CodingSchema).min(1),
});

export function buildConditionAbsentEver(
  block: unknown,
  binding: ConditionAbsentEverBinding,
  terminology: Terminology,
): Evaluator {
  const params = ParamsSchema.parse(block);
  const expansions = params.codes.map((coding) => terminology.expand(coding));
  const searchedCodes = params.codes.map((coding) => coding.code).join(', ');

  function evaluate(context: EvaluationContext): KindResult {
    const considered: ConsideredItem[] = [];
    const found: fhir4.Condition[] = [];
    const warnings = new Set<string>();

    for (const condition of context.chart.conditions) {
      const matches = expansions.map((expansion) => matchConcept(condition.code, expansion));
      const match = matches.includes('code') ? 'code' : matches.includes('display') ? 'display' : null;
      if (match === null) continue;

      const day = toDay(condition.onsetDateTime ?? condition.recordedDate);
      const item: ConsideredItem = {
        ref: refOf(condition),
        date: day,
        value: `${conceptLabel(condition.code)}, ${statusCode(condition.clinicalStatus) ?? 'unknown'}`,
        used: false,
        reason: null,
      };
      considered.push(item);

      if (isRefutedOrError(condition.verificationStatus)) {
        item.reason = 'verification_refuted';
      } else if (day !== null && isAfter(day, context.requestDate)) {
        item.reason = 'after_request_date';
      } else {
        item.used = true;
        found.push(condition);
        if (match === 'display') warnings.add('display_match');
      }
    }

    if (found.length > 0) {
      return {
        status: 'not_met',
        sources: found.map(refOf),
        value: found.map((condition) => conceptLabel(condition.code)).join('; '),
        considered,
        warnings: [...warnings],
        documentVars: {},
      };
    }
    return {
      status: 'met',
      sources: [],
      note: `No Condition matching ${searchedCodes} or descendants`,
      considered,
      warnings: [...warnings],
      documentVars: {},
    };
  }

  return {
    kind: 'condition_absent_ever',
    needs: [{ resourceType: 'Condition' }],
    documents: { ...binding.documents }, // never missing or conflicting, so no default wording
    evaluate,
  };
}

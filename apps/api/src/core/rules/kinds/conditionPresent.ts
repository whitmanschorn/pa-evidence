import type { ConsideredItem } from '@pa/shared';
import { z } from 'zod';
import { isAfter, toDay } from '../../dates.js';
import { refOf, statusCode } from '../../fhir/resources.js';
import { readFormField } from '../../requests/requestStore.js';
import type { Terminology } from '../../terminology.js';
import { CodingSchema, conceptLabel, isRefutedOrError, matchConcept } from '../matching.js';
import type { ConditionPresentBinding, EvaluationContext, Evaluator, KindResult } from '../types.js';

// "The record documents an active <condition>." Example: active type 2 diabetes.
//   met:         a matching Condition whose clinicalStatus is in the policy's list
//   conflicting: the record has the condition only inactive (or only a related type), and the form claims it
//   not_met:     the same record, but the form does not claim it
//   missing:     no matching or related Condition at all
const ParamsSchema = z.object({
  resource: z.literal('Condition'),
  code: CodingSchema,
  clinicalStatus_in: z.array(z.string()).min(1),
});

export function buildConditionPresent(
  block: unknown,
  binding: ConditionPresentBinding,
  terminology: Terminology,
): Evaluator {
  const params = ParamsSchema.parse(block);
  const target = terminology.expand(params.code);
  const related = target.broader === undefined ? null : terminology.expand(target.broader);

  function evaluate(context: EvaluationContext): KindResult {
    const considered: ConsideredItem[] = [];
    const active: fhir4.Condition[] = [];
    const notActive: fhir4.Condition[] = [];
    const warnings = new Set<string>();
    const matchedBy = new Map<string, 'code' | 'display'>(); // ref -> how a usable condition matched
    const targetRefs = new Set<string>(); // usable conditions of the target type (not only a related type)

    for (const condition of context.chart.conditions) {
      const targetMatch = matchConcept(condition.code, target);
      const relatedMatch = related === null ? null : matchConcept(condition.code, related);
      const match = targetMatch ?? relatedMatch;
      if (match === null) continue;

      const day = toDay(condition.onsetDateTime ?? condition.recordedDate);
      const clinicalStatus = statusCode(condition.clinicalStatus) ?? 'unknown';
      const item: ConsideredItem = {
        ref: refOf(condition),
        date: day,
        value: `${conceptLabel(condition.code)}, ${clinicalStatus}`,
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
        matchedBy.set(item.ref, match);
        if (targetMatch !== null) targetRefs.add(item.ref);
        const isActiveTarget = targetMatch !== null && params.clinicalStatus_in.includes(clinicalStatus);
        if (isActiveTarget) {
          active.push(condition);
        } else {
          notActive.push(condition);
        }
      }
    }

    // When the target is active, the inactive or related conditions are context, not evidence.
    if (active.length > 0) {
      for (const item of considered) {
        if (item.used && !active.some((condition) => refOf(condition) === item.ref)) {
          item.used = false;
          item.reason = targetRefs.has(item.ref) ? 'not_active' : 'related_condition';
        }
      }
    }
    // A display match is flagged only when it is cited: that is the one the nurse should check.
    const cited = active.length > 0 ? active : notActive;
    if (cited.some((condition) => matchedBy.get(refOf(condition)) === 'display')) warnings.add('display_match');

    const claimed = binding.attested === undefined ? undefined : readFormField(context.form, binding.attested.code);
    const claimsTarget = claimed !== undefined && target.codes.has(String(claimed));
    const attestedFor = (agrees: boolean | null) =>
      binding.attested === undefined || claimed === undefined
        ? undefined
        : { field: binding.attested.code, value: String(claimed), agrees };

    if (active.length > 0) {
      // The record has it active; a form claiming a different diagnosis disagrees with the record.
      const attested = attestedFor(claimed === undefined ? null : claimsTarget);
      return {
        status: attested?.agrees === false ? 'conflicting' : 'met',
        sources: active.map(refOf),
        value: `clinicalStatus ${statusCode(active[0]?.clinicalStatus) ?? 'unknown'}`,
        attested,
        considered,
        warnings: [...warnings],
        documentVars: {},
      };
    }

    if (notActive.length > 0) {
      // The record has the condition, but not active (or only a related type).
      const attested = attestedFor(!claimsTarget);
      return {
        status: claimsTarget ? 'conflicting' : 'not_met',
        sources: notActive.map(refOf),
        value: `clinicalStatus ${statusCode(notActive[0]?.clinicalStatus) ?? 'unknown'}`,
        attested,
        considered,
        warnings: [...warnings],
        documentVars: {},
      };
    }

    // Nothing in the record either way. An absent record is missing, never conflicting.
    return {
      status: 'missing',
      sources: [],
      attested: attestedFor(null),
      considered,
      warnings: [...warnings],
      documentVars: {},
    };
  }

  return {
    kind: 'condition_present',
    needs: [{ resourceType: 'Condition' }], // all Conditions: the display fallback needs to see every one
    documents: {
      missing: `Documentation of ${target.label} (problem list or visit note)`,
      conflicting: `Clinical note confirming ${target.label} and its current status`,
      ...binding.documents,
    },
    evaluate,
  };
}

import type { Attested, ConsideredItem } from '@pa/shared';
import { z } from 'zod';
import { daysBetween, earlierOf, isAfter, laterOf, lookbackWindow, toDay } from '../../dates.js';
import { refOf } from '../../fhir/resources.js';
import { readFormField } from '../../requests/requestStore.js';
import type { Terminology } from '../../terminology.js';
import { RXNORM, matchConcept } from '../matching.js';
import type { EvaluationContext, Evaluator, KindResult, MedicationDurationBinding, Window } from '../types.js';

// "At least N days of <drug> within the last W days." Example: 90 days of metformin in the 365 days before the request.
// Each order runs from authoredOn to dispenseRequest.validityPeriod.end, or to the request date while active.
// Overlapping orders are merged (a union), clipped to the window, and the days summed.
const ParamsSchema = z.object({
  resource: z.literal('MedicationRequest'),
  ingredient_rxnorm: z.string(),
  min_days_in_window: z.number().int().positive(),
  window_days: z.number().int().positive(),
  // How many months the form may claim beyond the record before it is a conflict (from the rules engine config).
  attested_tolerance_months: z.number().nonnegative().optional(),
});

const EXCLUDED_STATUSES = ['entered-in-error', 'cancelled', 'draft'];
// Average month length (365.25 / 12), to turn record days into the months a prescriber attests. A unit
// conversion, not a policy value.
const DAYS_PER_MONTH = 365.25 / 12;

type Interval = { start: string; end: string };

export function buildMedicationDuration(
  block: unknown,
  binding: MedicationDurationBinding,
  terminology: Terminology,
): Evaluator {
  const params = ParamsSchema.parse(block);
  const expansion = terminology.expand({ system: RXNORM, code: params.ingredient_rxnorm });
  const name = expansion.label;
  const toleranceMonths = params.attested_tolerance_months;
  if (binding.attested !== undefined && toleranceMonths === undefined) {
    throw new Error('medication_duration with attested months needs "attested_tolerance_months" in the policy or the rules engine config');
  }

  function evaluate(context: EvaluationContext): KindResult {
    const window = lookbackWindow(context.requestDate, params.window_days);
    const considered: ConsideredItem[] = [];
    const known: { item: ConsideredItem; interval: Interval }[] = [];
    const warnings = new Set<string>();
    let unknownDurations = 0;

    for (const order of context.chart.medicationRequests) {
      const match = matchConcept(order.medicationCodeableConcept, expansion);
      if (match === null) continue;

      const start = toDay(order.authoredOn);
      const end = orderEnd(order, context.requestDate);
      const item: ConsideredItem = {
        ref: refOf(order),
        date: start,
        end,
        value: order.status,
        used: false,
        reason: null,
      };
      considered.push(item);

      if (EXCLUDED_STATUSES.includes(order.status)) {
        item.reason = 'excluded_status';
      } else if (start === null) {
        item.reason = 'no_date';
      } else if (isAfter(start, context.requestDate)) {
        item.reason = 'after_request_date';
      } else if (end === null) {
        // Stopped or completed with no end date: the duration is unknown, so it is not counted.
        item.reason = 'end_unknown';
        unknownDurations += 1;
        warnings.add('medication_end_unknown');
      } else {
        if (match === 'display') warnings.add('display_match');
        known.push({ item, interval: { start, end: earlierOf(end, context.requestDate) } });
      }
    }

    const inWindowDays = unionDays(known.map((order) => clip(order.interval, window)));
    const recordMonths = unionDays(known.map((order) => order.interval)) / DAYS_PER_MONTH;
    const overlapping = known.filter((order) => {
      const clipped = clip(order.interval, window);
      return clipped.end > clipped.start;
    });
    for (const order of known) {
      order.item.used = overlapping.includes(order);
      order.item.reason = order.item.used ? null : 'outside_window';
    }

    // One-sided: conflicting only when the form claims more months than the record supports.
    const claimed = binding.attested === undefined ? undefined : readFormField(context.form, binding.attested.months);
    let attested: Attested | undefined;
    if (binding.attested !== undefined && toleranceMonths !== undefined && typeof claimed === 'number') {
      const agrees = known.length === 0 ? null : claimed - recordMonths <= toleranceMonths;
      attested = { field: binding.attested.months, value: `${claimed} months`, agrees };
    }

    let status: KindResult['status'];
    if (attested?.agrees === false) {
      status = 'conflicting';
    } else if (inWindowDays >= params.min_days_in_window) {
      status = 'met';
    } else if (unknownDurations > 0) {
      status = 'missing'; // orders exist, but how long they ran is unknown: ask for the fill history
    } else if (known.length > 0) {
      status = 'not_met';
    } else {
      status = 'missing';
    }

    const cited = overlapping.length > 0 ? overlapping : known;
    return {
      status,
      sources: cited.map((order) => order.item.ref),
      value: `${inWindowDays} of ${params.window_days} days in window`,
      attested,
      note:
        known.length === 0
          ? undefined
          : `Record total ${recordMonths.toFixed(1)} months across ${known.length} order${known.length === 1 ? '' : 's'}`,
      considered,
      window,
      threshold: { compare: 'gte', value: params.min_days_in_window, unit: 'days' },
      warnings: [...warnings],
      documentVars: {
        from: window.from,
        to: context.requestDate,
        months: claimed === undefined ? '' : String(claimed),
      },
    };
  }

  return {
    kind: 'medication_duration',
    needs: [{ resourceType: 'MedicationRequest' }], // all orders: the display fallback needs to see every one
    documents: {
      missing: `${name} prescription history for {from} to {to}`,
      conflicting: `${name} prescription or pharmacy fill history supporting the reported {months} months`,
      ...binding.documents,
    },
    evaluate,
  };
}

// The last day of an order: its validity period end, the request date while it is still active, or null (unknown).
function orderEnd(order: fhir4.MedicationRequest, requestDate: string): string | null {
  const validityEnd = toDay(order.dispenseRequest?.validityPeriod?.end);
  if (validityEnd !== null) return validityEnd;
  if (order.status === 'active') return requestDate;
  return null;
}

function clip(interval: Interval, window: Window): Interval {
  return { start: laterOf(interval.start, window.from), end: earlierOf(interval.end, window.to) };
}

// Total days covered by a set of intervals, counting overlaps once.
function unionDays(intervals: Interval[]): number {
  const sorted = intervals.filter((interval) => interval.end > interval.start).sort((a, b) => a.start.localeCompare(b.start));
  let total = 0;
  let current: Interval | undefined;
  for (const interval of sorted) {
    if (current !== undefined && interval.start <= current.end) {
      current.end = laterOf(current.end, interval.end);
    } else {
      if (current !== undefined) total += daysBetween(current.start, current.end);
      current = { ...interval };
    }
  }
  if (current !== undefined) total += daysBetween(current.start, current.end);
  return total;
}

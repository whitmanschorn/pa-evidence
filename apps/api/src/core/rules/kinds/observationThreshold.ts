import type { ConsideredItem } from '@pa/shared';
import { z } from 'zod';
import { isAfter, lookbackWindow, toDay } from '../../dates.js';
import { refOf } from '../../fhir/resources.js';
import { readFormField } from '../../requests/requestStore.js';
import type { Terminology } from '../../terminology.js';
import { CodingSchema, matchConcept, unique } from '../matching.js';
import type { EvaluationContext, Evaluator, KindResult, ObservationThresholdBinding, Threshold } from '../types.js';

// "The most recent <lab> result is >= (or <) a threshold." Examples: HbA1c >= 7.0 % within 90 days;
// eGFR < 30 on or before the request date (no window); BMI >= 27.
// Uses the most recent qualifying result. Results after the request date, with a non-final status, in another
// unit, or outside the window are listed in `considered` with the reason they were not used.
const ParamsSchema = z.object({
  resource: z.literal('Observation'),
  code: CodingSchema,
  value_min: z.number().optional(),
  value_max: z.number().optional(),
  unit: z.string().optional(),
  window_days: z.number().int().positive().optional(),
  // Smallest difference between the form's value and the record's that counts as a conflict (rules engine config).
  attested_tolerance: z.number().positive().optional(),
});

const COUNTED_STATUSES = ['final', 'amended', 'corrected'];

type Candidate = { item: ConsideredItem; numeric: number; day: string; fromIssued: boolean };

export function buildObservationThreshold(
  block: unknown,
  binding: ObservationThresholdBinding,
  terminology: Terminology,
): Evaluator {
  const params = ParamsSchema.parse(block);
  const thresholdValue = binding.compare === 'gte' ? params.value_min : params.value_max;
  if (thresholdValue === undefined) {
    const needed = binding.compare === 'gte' ? 'value_min' : 'value_max';
    throw new Error(`observation_threshold with compare "${binding.compare}" needs "${needed}" in the policy`);
  }
  const threshold: Threshold = { compare: binding.compare, value: thresholdValue, unit: params.unit ?? '' };
  const tolerance = params.attested_tolerance;
  if (binding.attested !== undefined && tolerance === undefined) {
    throw new Error('observation_threshold with an attested value needs "attested_tolerance" in the policy or the rules engine config');
  }
  const expansion = terminology.expand(params.code);
  const name = expansion.label;

  function passes(value: number): boolean {
    return threshold.compare === 'gte' ? value >= threshold.value : value < threshold.value;
  }

  function evaluate(context: EvaluationContext): KindResult {
    const window = params.window_days === undefined ? undefined : lookbackWindow(context.requestDate, params.window_days);
    const considered: ConsideredItem[] = [];
    const usable: Candidate[] = []; // qualifying on status, date, value and unit, any date up to the request
    const warnings = new Set<string>();

    for (const observation of context.chart.observations) {
      if (matchConcept(observation.code, expansion) !== 'code') continue; // labs match by LOINC code only

      const { day, fromIssued } = observationDay(observation);
      const quantity = observation.valueQuantity;
      const unit = quantity?.unit ?? quantity?.code ?? '';
      const item: ConsideredItem = {
        ref: refOf(observation),
        date: day,
        value: quantity?.value === undefined ? null : `${quantity.value} ${unit}`.trim(),
        numeric: quantity?.value ?? null,
        used: false,
        reason: null,
      };
      considered.push(item);

      if (!COUNTED_STATUSES.includes(observation.status)) {
        item.reason = 'status_not_final';
      } else if (day === null) {
        item.reason = 'no_date';
      } else if (isAfter(day, context.requestDate)) {
        item.reason = 'after_request_date';
      } else if (quantity?.value === undefined) {
        item.reason = 'no_value';
      } else if (params.unit !== undefined && unit !== params.unit) {
        item.reason = 'unit_mismatch';
        if (window === undefined || day >= window.from) warnings.add('unit_mismatch');
      } else {
        usable.push({ item, numeric: quantity.value, day, fromIssued });
      }
    }

    const inWindow = usable.filter((candidate) => window === undefined || candidate.day >= window.from);
    for (const candidate of usable) {
      if (!inWindow.includes(candidate)) candidate.item.reason = 'outside_window';
    }
    inWindow.sort((a, b) => b.day.localeCompare(a.day));
    const latest = inWindow[0];

    for (const candidate of inWindow.slice(1)) {
      candidate.item.reason = 'not_latest';
      if (latest !== undefined && passes(candidate.numeric) !== passes(latest.numeric)) {
        warnings.add('other_in_window_result');
      }
    }

    // The request form's value, if the binding names one, compared with the record.
    const attestedValue = binding.attested === undefined ? undefined : readFormField(context.form, binding.attested.value);
    const attestedDate = binding.attested === undefined ? undefined : readFormField(context.form, binding.attested.date);
    const documentVars = {
      from: window?.from ?? '',
      to: context.requestDate,
      value: attestedValue === undefined ? '' : String(attestedValue),
      date: attestedDate === undefined ? '' : String(attestedDate),
    };

    if (latest === undefined) {
      // No qualifying result: missing. An attested value with nothing to compare against is still missing.
      return {
        status: 'missing',
        sources: [],
        attested: attestedFor(binding, attestedValue, attestedDate, null, params.unit),
        considered,
        window,
        threshold,
        warnings: [...warnings],
        documentVars,
      };
    }

    latest.item.used = true;
    latest.item.reason = null;
    if (latest.fromIssued) warnings.add('observation_date_from_issued');

    // Compare the form with the record result on the attested date, or else with the latest in-window result.
    let agrees: boolean | null = null;
    let compared: Candidate | undefined;
    if (tolerance !== undefined && typeof attestedValue === 'number') {
      compared = usable.find((candidate) => candidate.day === attestedDate) ?? latest;
      agrees = roundedDifference(attestedValue, compared.numeric) < tolerance;
    }

    const status = agrees === false ? 'conflicting' : passes(latest.numeric) ? 'met' : 'not_met';
    return {
      status,
      sources: unique([latest.item.ref, ...(compared === undefined ? [] : [compared.item.ref])]),
      value: latest.item.value ?? undefined,
      observed: latest.day,
      attested: attestedFor(binding, attestedValue, attestedDate, agrees, params.unit),
      considered,
      window,
      threshold,
      warnings: [...warnings],
      documentVars,
    };
  }

  return {
    kind: 'observation_threshold',
    needs: [{ resourceType: 'Observation', codes: [params.code] }],
    documents: {
      missing:
        params.window_days === undefined
          ? `${name} result dated on or before {to}`
          : `${name} result dated {from} to {to}`,
      conflicting: `Lab report for the ${name} result reported on the request form ({value} ${params.unit ?? ''} on {date})`,
      ...binding.documents,
    },
    evaluate,
  };
}

// effectiveDateTime, else the start of effectivePeriod, else `issued` (flagged: issued is when the result was
// released, not when the sample was taken).
function observationDay(observation: fhir4.Observation): { day: string | null; fromIssued: boolean } {
  const effective = toDay(observation.effectiveDateTime ?? observation.effectivePeriod?.start);
  if (effective !== null) return { day: effective, fromIssued: false };
  const issued = toDay(observation.issued);
  return { day: issued, fromIssued: issued !== null };
}

// |a - b| without floating-point noise, so 8.0 vs 7.9 is exactly 0.1 rather than 0.09999999999999964.
// Rounding to 6 decimals is far finer than any lab reports, so it never changes a real comparison.
const COMPARISON_DECIMALS = 6;
function roundedDifference(a: number, b: number): number {
  return Number(Math.abs(a - b).toFixed(COMPARISON_DECIMALS));
}

function attestedFor(
  binding: ObservationThresholdBinding,
  value: unknown,
  date: unknown,
  agrees: boolean | null,
  unit: string | undefined,
) {
  if (binding.attested === undefined || value === undefined) return undefined;
  const shown = `${String(value)} ${unit ?? ''}`.trim();
  return {
    field: binding.attested.value,
    value: date === undefined ? shown : `${shown} on ${String(date)}`,
    agrees,
  };
}

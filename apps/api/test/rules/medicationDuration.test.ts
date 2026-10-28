import { describe, expect, it } from 'vitest';
import { buildEvaluator } from '../../src/core/rules/buildEvaluator.js';
import type { AnyOfBinding } from '../../src/core/rules/types.js';
import { contextWith, metforminOrder, policy, reasonOf, terminology } from '../support/builders.js';

// C3 path A is bound to medication_duration: at least 90 metformin days in the 365 days before the request.
// Window for a 2026-10-01 request: 2025-10-01 .. 2026-10-01.
const c3 = policy.criteria.find((criterion) => criterion.id === 'C3')!;
const pathA = buildEvaluator(c3, (policy.bindings.C3 as AnyOfBinding).primary, terminology);

function runPathA(orders: fhir4.MedicationRequest[], attestation: Record<string, unknown> = {}) {
  return pathA.evaluate(contextWith({ medicationRequests: orders }, attestation));
}

describe('medication_duration (C3 path A)', () => {
  it('runs an active order to the request date and clips it to the window', () => {
    const result = runPathA([metforminOrder('m', 'active', '2025-07-15')]);
    expect(result.status).toBe('met');
    expect(result.value).toBe('365 of 365 days in window');
    expect(result.sources).toEqual(['MedicationRequest/m']);
    expect(result.note).toBe('Record total 14.6 months across 1 order');
  });

  it('counts overlapping orders once (union of intervals)', () => {
    const result = runPathA([
      metforminOrder('a', 'completed', '2026-01-01', { end: '2026-03-01' }),
      metforminOrder('b', 'completed', '2026-02-01', { end: '2026-04-01' }),
    ]);
    expect(result.value).toBe('90 of 365 days in window'); // 2026-01-01 .. 2026-04-01
    expect(result.status).toBe('met');
  });

  it('is not_met for a short course, citing it', () => {
    const result = runPathA([metforminOrder('short', 'active', '2026-08-27')]);
    expect(result.status).toBe('not_met');
    expect(result.value).toBe('35 of 365 days in window');
    expect(result.sources).toEqual(['MedicationRequest/short']);
  });

  it('counts only the days inside the window', () => {
    const result = runPathA([metforminOrder('o', 'completed', '2025-07-01', { end: '2025-12-29' })]);
    expect(result.value).toBe('89 of 365 days in window'); // 2025-10-01 .. 2025-12-29
    expect(result.status).toBe('not_met');
  });

  it('does not count a stopped order with no end date, and warns', () => {
    const result = runPathA([metforminOrder('s', 'stopped', '2025-01-01')]);
    expect(result.status).toBe('missing');
    expect(result.warnings).toEqual(['medication_end_unknown']);
    expect(reasonOf(result, 'MedicationRequest/s')).toBe('end_unknown');
  });

  it('excludes entered-in-error, cancelled and draft orders', () => {
    const result = runPathA([
      metforminOrder('e', 'entered-in-error', '2025-01-01'),
      metforminOrder('c', 'cancelled', '2025-01-01'),
      metforminOrder('d', 'draft', '2025-01-01'),
    ]);
    expect(result.status).toBe('missing');
    expect(reasonOf(result, 'MedicationRequest/c')).toBe('excluded_status');
  });

  it('matches other metformin products by display, and flags it', () => {
    const result = runPathA([
      metforminOrder('combo', 'active', '2025-01-01', { code: '999999', display: 'sitagliptin / metformin 50/1000 MG' }),
    ]);
    expect(result.status).toBe('met');
    expect(result.warnings).toEqual(['display_match']);
  });

  it('ignores other drugs', () => {
    const result = runPathA([metforminOrder('x', 'active', '2025-01-01', { code: '1', display: 'Lisinopril 10 MG' })]);
    expect(result.status).toBe('missing');
    expect(result.considered).toEqual([]);
  });

  it('checks the attested months one way: the form may claim less than the record, not more', () => {
    const order = metforminOrder('m', 'active', '2024-01-15'); // 990 days = 32.5 months by the request date
    expect(runPathA([order], { metformin_trial_months: 30 }).attested?.agrees).toBe(true);
    expect(runPathA([order], { metformin_trial_months: 33 }).attested?.agrees).toBe(true); // within 1 month
    expect(runPathA([order], { metformin_trial_months: 34 }).status).toBe('conflicting');
  });

  it('does not call a longer claim a conflict when some orders have unknown length: they could cover it', () => {
    const recent = metforminOrder('a', 'active', '2026-09-25'); // 6 days by the request date
    const unknownLength = metforminOrder('c', 'completed', '2025-03-01'); // completed, no end date
    const result = runPathA([recent, unknownLength], { metformin_trial_months: 12 });
    expect(result.attested?.agrees).toBeNull();
    expect(result.status).toBe('missing'); // ask for the fill history
    expect(result.warnings).toEqual(['medication_end_unknown']);
  });

  it('is missing, with nothing to compare, when there are no orders', () => {
    const result = runPathA([], { metformin_trial_months: 6 });
    expect(result.status).toBe('missing');
    expect(result.attested).toEqual({ field: 'prescriber_attestation.metformin_trial_months', value: '6 months', agrees: null });
  });
});

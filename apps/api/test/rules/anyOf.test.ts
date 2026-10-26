import { describe, expect, it } from 'vitest';
import { allergy, egfr, metforminOrder, run } from '../support/builders.js';

// C3 is bound to any_of: metformin 90 days (path A, primary), or metformin intolerance (path B),
// or eGFR < 30 (path C).
const METFORMIN_INTOLERANCE = allergy('intol', { code: '6809', display: 'Metformin' });

describe('any_of (C3)', () => {
  it('is met through path A, citing the order', () => {
    const result = run('C3', { medicationRequests: [metforminOrder('m', 'active', '2025-07-15')] });
    expect(result.status).toBe('met');
    expect(result.sources).toEqual(['MedicationRequest/m']);
    expect(result.value).toBe('365 of 365 days in window (path A)');
    expect(result.paths?.map((path) => `${path.label}:${path.status}`)).toEqual([
      'path A:met',
      'path B:missing',
      'path C:missing',
    ]);
  });

  it('is met through path B alone, citing only the intolerance', () => {
    const result = run('C3', { allergies: [METFORMIN_INTOLERANCE] });
    expect(result.status).toBe('met');
    expect(result.sources).toEqual(['AllergyIntolerance/intol']);
  });

  it('is met through path C alone (eGFR below 30)', () => {
    const result = run('C3', { observations: [egfr('e', 24.8, '2026-09-01')] });
    expect(result.status).toBe('met');
    expect(result.sources).toEqual(['Observation/e']);
  });

  it('lets the primary path decide when no path is met; a normal eGFR is not cited', () => {
    const result = run('C3', {
      medicationRequests: [metforminOrder('short', 'active', '2026-08-27')],
      observations: [egfr('normal', 90, '2026-09-01')],
    });
    expect(result.status).toBe('not_met');
    expect(result.sources).toEqual(['MedicationRequest/short']);
  });

  it('never turns missing into not_met because an alternative failed', () => {
    const result = run('C3', { observations: [egfr('normal', 90, '2026-09-01')] });
    expect(result.status).toBe('missing');
  });

  it('is conflicting on an attestation conflict even when path B is met, citing both', () => {
    const result = run(
      'C3',
      {
        medicationRequests: [metforminOrder('stopped', 'stopped', '2026-02-01', { end: '2026-02-22' })],
        allergies: [METFORMIN_INTOLERANCE],
      },
      { metformin_trial_months: 6 },
    );
    expect(result.status).toBe('conflicting');
    expect(result.sources).toEqual(['MedicationRequest/stopped', 'AllergyIntolerance/intol']);
    expect(result.value).toBe('21 of 365 days in window (path A); intolerance documented (path B)');
  });

  it('does not count a refuted intolerance', () => {
    const result = run('C3', { allergies: [allergy('r', { code: '6809', display: 'Metformin' }, 'refuted')] });
    expect(result.status).toBe('missing');
  });
});

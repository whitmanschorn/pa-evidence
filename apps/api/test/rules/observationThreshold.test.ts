import { describe, expect, it } from 'vitest';
import { buildEvaluator } from '../../src/core/rules/buildEvaluator.js';
import { contextWith, egfr, hba1c, observation, policy, reasonOf, run, terminology } from '../support/builders.js';

// C2 is bound to observation_threshold: the most recent HbA1c in the 90-day window is >= 7.0 %.
// Window for a 2026-10-01 request: 2026-07-03 .. 2026-10-01.
const ATTESTED = (value: number, date: string) => ({ hba1c_value: value, hba1c_date: date });

describe('observation_threshold (C2: HbA1c >= 7.0 % within 90 days)', () => {
  it('uses the most recent in-window result and lists the others with a reason', () => {
    const result = run('C2', {
      observations: [
        hba1c('latest', 8.1, '2026-09-03'),
        hba1c('older', 7.5, '2026-08-01'),
        hba1c('old', 8.6, '2026-03-11'),
      ],
    });
    expect(result.status).toBe('met');
    expect(result.sources).toEqual(['Observation/latest']);
    expect(result.value).toBe('8.1 %');
    expect(result.observed).toBe('2026-09-03');
    expect(reasonOf(result, 'Observation/older')).toBe('not_latest');
    expect(reasonOf(result, 'Observation/old')).toBe('outside_window');
    expect(result.window).toEqual({ from: '2026-07-03', to: '2026-10-01' });
  });

  it('treats both window edges as inside', () => {
    expect(run('C2', { observations: [hba1c('edge', 7.2, '2026-07-03')] }).status).toBe('met');
    expect(run('C2', { observations: [hba1c('edge', 7.2, '2026-07-02')] }).status).toBe('missing');
  });

  it('is not_met on a low latest result, and warns when another in-window result is on the other side', () => {
    const result = run('C2', { observations: [hba1c('low', 6.8, '2026-09-20'), hba1c('high', 7.4, '2026-08-01')] });
    expect(result.status).toBe('not_met');
    expect(result.warnings).toEqual(['other_in_window_result']);
  });

  it('ignores results dated after the request date', () => {
    const result = run('C2', { observations: [hba1c('future', 9.0, '2026-10-02')] });
    expect(result.status).toBe('missing');
    expect(reasonOf(result, 'Observation/future')).toBe('after_request_date');
  });

  it('counts final, amended and corrected results only', () => {
    expect(run('C2', { observations: [hba1c('p', 8.0, '2026-09-01', { status: 'preliminary' })] }).status).toBe('missing');
    expect(run('C2', { observations: [hba1c('a', 8.0, '2026-09-01', { status: 'amended' })] }).status).toBe('met');
  });

  it('dates by effectivePeriod, and by issued only as a flagged fallback', () => {
    const period = run('C2', { observations: [observation('p', '4548-4', 8.0, '%', { period: '2026-09-01T08:00:00Z' })] });
    expect(period.observed).toBe('2026-09-01');
    const issued = run('C2', { observations: [observation('i', '4548-4', 8.0, '%', { issued: '2026-09-01T12:00:00Z' })] });
    expect(issued.status).toBe('met');
    expect(issued.warnings).toEqual(['observation_date_from_issued']);
  });

  it('does not count a result in mmol/mol: missing, with a warning', () => {
    const result = run('C2', { observations: [hba1c('mmol', 64, '2026-09-01', { unit: 'mmol/mol' })] });
    expect(result.status).toBe('missing');
    expect(result.warnings).toEqual(['unit_mismatch']);
    expect(reasonOf(result, 'Observation/mmol')).toBe('unit_mismatch');
  });

  it('compares the attested value with the record on the attested date', () => {
    const agreeing = run('C2', { observations: [hba1c('o', 8.1, '2026-09-03')] }, ATTESTED(8.1, '2026-09-03'));
    expect(agreeing.attested).toEqual({ field: 'prescriber_attestation.hba1c_value', value: '8.1 % on 2026-09-03', agrees: true });

    const conflicting = run('C2', { observations: [hba1c('o', 6.4, '2026-09-12')] }, ATTESTED(7.8, '2026-09-12'));
    expect(conflicting.status).toBe('conflicting'); // 6.4 would be not_met; conflicting takes precedence
    expect(conflicting.sources).toEqual(['Observation/o']);
  });

  it('treats a difference of exactly 0.1 as a conflict, and less as agreement', () => {
    expect(run('C2', { observations: [hba1c('o', 7.9, '2026-09-10')] }, ATTESTED(8.0, '2026-09-10')).status).toBe('conflicting');
    expect(run('C2', { observations: [hba1c('o', 8.05, '2026-09-10')] }, ATTESTED(8.0, '2026-09-10')).status).toBe('met');
  });

  it('compares with the latest in-window result when the record has none on the attested date', () => {
    const result = run('C2', { observations: [hba1c('o', 9.0, '2026-09-20')] }, ATTESTED(8.0, '2026-09-10'));
    expect(result.status).toBe('conflicting');
  });

  it('is missing, never conflicting, when the record has nothing in the window', () => {
    const result = run('C2', { observations: [hba1c('old', 7.9, '2025-07-20')] }, ATTESTED(8.0, '2026-09-10'));
    expect(result.status).toBe('missing');
    expect(result.sources).toEqual([]);
    expect(result.attested?.agrees).toBeNull();
  });
});

describe('observation_threshold with compare "lt" and no window (eGFR < 30)', () => {
  const c3 = policy.criteria.find((criterion) => criterion.id === 'C3')!;
  const evaluator = buildEvaluator(c3, { kind: 'observation_threshold', from: 'path_c', compare: 'lt' }, terminology);

  it('uses the latest eGFR on or before the request date, however old', () => {
    const result = evaluator.evaluate(contextWith({ observations: [egfr('old', 25, '2019-01-01')] }));
    expect(result.status).toBe('met');
    expect(result.window).toBeUndefined();
  });

  it('is strict: 30 is not below 30', () => {
    expect(evaluator.evaluate(contextWith({ observations: [egfr('e', 30, '2026-09-01')] })).status).toBe('not_met');
    expect(evaluator.evaluate(contextWith({ observations: [egfr('e', 29.9, '2026-09-01')] })).status).toBe('met');
  });
});

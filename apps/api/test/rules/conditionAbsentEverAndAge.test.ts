import { describe, expect, it } from 'vitest';
import { condition, patient, reasonOf, run } from '../support/builders.js';

// C4 is bound to condition_absent_ever (no pancreatitis, MTC or MEN2, ever).
describe('condition_absent_ever (C4)', () => {
  it('is met with no sources and a note when nothing matches', () => {
    const result = run('C4', { conditions: [condition('htn', { code: '59621000', display: 'Essential hypertension' })] });
    expect(result.status).toBe('met');
    expect(result.sources).toEqual([]);
    expect(result.note).toBe('No Condition matching 75694006, 255032005, 61808009 or descendants');
  });

  it('counts a resolved condition as history', () => {
    const result = run('C4', {
      conditions: [condition('p', { code: '75694006', display: 'Pancreatitis' }, { clinicalStatus: 'resolved' })],
    });
    expect(result.status).toBe('not_met');
    expect(result.sources).toEqual(['Condition/p']);
  });

  it('matches a curated descendant by code', () => {
    const result = run('C4', { conditions: [condition('a', { code: '197456007', display: 'Acute pancreatitis' })] });
    expect(result.status).toBe('not_met');
    expect(result.warnings).toEqual([]);
  });

  it('matches by display when the code is unknown, and flags it', () => {
    const result = run('C4', { conditions: [condition('m', { code: '123', display: 'Medullary thyroid carcinoma, stage II' })] });
    expect(result.status).toBe('not_met');
    expect(result.warnings).toEqual(['display_match']);
  });

  it('ignores refuted conditions', () => {
    const result = run('C4', {
      conditions: [condition('r', { code: '75694006', display: 'Pancreatitis' }, { verificationStatus: 'refuted' })],
    });
    expect(result.status).toBe('met');
    expect(reasonOf(result, 'Condition/r')).toBe('verification_refuted');
  });
});

// C5 is bound to patient_age with min_years 18.
describe('patient_age (C5)', () => {
  it('is met at 18 or older on the request date, citing the Patient and never the birth date', () => {
    const result = run('C5', { patient: patient({ birthDate: '1972-03-14' }) });
    expect(result.status).toBe('met');
    expect(result.value).toBe('age 54');
    expect(result.sources).toEqual(['Patient/p1']);
    expect(JSON.stringify(result)).not.toContain('1972-03-14');
  });

  it('turns 18 on the birthday itself', () => {
    expect(run('C5', { patient: patient({ birthDate: '2008-10-01' }) }).status).toBe('met');
    expect(run('C5', { patient: patient({ birthDate: '2008-10-02' }) }).status).toBe('not_met');
  });

  it('decides on a partial birth date only when the answer is unambiguous', () => {
    expect(run('C5', { patient: patient({ birthDate: '1980' }) }).status).toBe('met');
    expect(run('C5', { patient: patient({ birthDate: '2008-04' }) }).status).toBe('met');
    const ambiguous = run('C5', { patient: patient({ birthDate: '2008' }) });
    expect(ambiguous.status).toBe('missing');
    expect(ambiguous.value).toBe('age 17 or 18');
  });

  it('is missing without a birth date', () => {
    const result = run('C5', { patient: patient() });
    expect(result.status).toBe('missing');
    expect(result.note).toBe('Patient record has no birth date');
  });

  it('warns when the record says the member died before the request', () => {
    const result = run('C5', { patient: patient({ birthDate: '1931-08-28', deceasedDateTime: '2008-11-11T03:19:15+00:00' }) });
    expect(result.warnings).toEqual(['implausible_deceased_before_request']);
  });
});

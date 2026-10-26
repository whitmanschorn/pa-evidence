import { describe, expect, it } from 'vitest';
import { condition, contextWith, evaluatorFor, form, reasonOf } from '../support/builders.js';

// C1 is bound to condition_present: active type 2 diabetes (44054006 or a descendant).
const T2DM = { code: '44054006', display: 'Type 2 diabetes mellitus (disorder)' };

function runC1(conditions: fhir4.Condition[], claimed = '44054006') {
  const context = contextWith({ conditions });
  context.form = { ...form(), diagnosis_claimed: { snomed: claimed, display: 'claimed diagnosis' } };
  return evaluatorFor('C1').evaluate(context);
}

describe('condition_present (C1)', () => {
  it('is met by an active, confirmed condition, and cites it', () => {
    const result = runC1([condition('t2', T2DM)]);
    expect(result.status).toBe('met');
    expect(result.sources).toEqual(['Condition/t2']);
    expect(result.attested).toEqual({ field: 'diagnosis_claimed.snomed', value: '44054006', agrees: true });
  });

  it('matches a curated descendant code without a warning', () => {
    const result = runC1([condition('t2', { code: '359642000', display: 'Diabetes mellitus type 2 in nonobese' })]);
    expect(result.status).toBe('met');
    expect(result.warnings).toEqual([]);
  });

  it('falls back to the display text for an unknown code, and flags it', () => {
    const result = runC1([condition('t2', { code: '999999', display: 'Type 2 diabetes mellitus with hyperglycemia' })]);
    expect(result.status).toBe('met');
    expect(result.warnings).toEqual(['display_match']);
  });

  it('flags a display match only when it is cited, and calls an unused related type related, not inactive', () => {
    const coded = condition('t2', T2DM);
    const relatedByDisplay = condition('dk', { code: '127013003', display: 'Disorder of kidney due to diabetes mellitus (disorder)' });
    const result = runC1([coded, relatedByDisplay]);
    expect(result.sources).toEqual(['Condition/t2']);
    expect(result.warnings).toEqual([]);
    expect(reasonOf(result, 'Condition/dk')).toBe('related_condition');
  });

  it('is conflicting when the record has it resolved and the form claims it', () => {
    const result = runC1([condition('t2', T2DM, { clinicalStatus: 'resolved' })]);
    expect(result.status).toBe('conflicting');
    expect(result.sources).toEqual(['Condition/t2']);
    expect(result.attested?.agrees).toBe(false);
  });

  it('is not_met when the record has it resolved and the form does not claim it', () => {
    const result = runC1([condition('t2', T2DM, { clinicalStatus: 'resolved' })], '46635009');
    expect(result.status).toBe('not_met');
  });

  it('is conflicting when the record has only another diabetes type and the form claims type 2', () => {
    const result = runC1([condition('t1', { code: '46635009', display: 'Type 1 diabetes mellitus' })]);
    expect(result.status).toBe('conflicting');
    expect(result.sources).toEqual(['Condition/t1']);
  });

  it('is conflicting when the record has it active but the form claims another diagnosis', () => {
    const result = runC1([condition('t2', T2DM)], '46635009');
    expect(result.status).toBe('conflicting');
  });

  it('is missing when there is no diabetes at all; prediabetes is not diabetes', () => {
    const result = runC1([condition('pre', { code: '714628002', display: 'Prediabetes' })]);
    expect(result.status).toBe('missing');
    expect(result.sources).toEqual([]);
    expect(result.attested?.agrees).toBeNull();
  });

  it('ignores refuted conditions and conditions dated after the request', () => {
    const result = runC1([
      condition('refuted', T2DM, { verificationStatus: 'refuted' }),
      condition('future', T2DM, { onset: '2026-10-02' }),
    ]);
    expect(result.status).toBe('missing');
    expect(reasonOf(result, 'Condition/refuted')).toBe('verification_refuted');
    expect(reasonOf(result, 'Condition/future')).toBe('after_request_date');
  });
});

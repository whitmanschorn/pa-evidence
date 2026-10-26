import { describe, expect, it } from 'vitest';
import { findForbiddenTerms } from '../src/forbiddenTerms.js';

describe('findForbiddenTerms', () => {
  it.each([
    'approve',
    'Approved',
    'approval',
    'disapprove',
    'deny',
    'denied',
    'denies',
    'denial',
    'Access denied',
    'authorize',
    'authorised',
    'Authorization',
    'Unauthorized',
    'prior authorization',
    'preauthorization',
  ])('flags "%s"', (text) => {
    expect(findForbiddenTerms(text)).not.toEqual([]);
  });

  it.each([
    'Evidence complete',
    'Needs clinician review',
    'unauthenticated',
    'forbidden',
    'denominator',
    'Denmark',
    'approximately 14 months',
    'author of the note',
  ])('allows "%s"', (text) => {
    expect(findForbiddenTerms(text)).toEqual([]);
  });

  it('returns every match, lower-cased', () => {
    expect(findForbiddenTerms('Approved. Then DENIED.')).toEqual(['approved', 'denied']);
  });
});

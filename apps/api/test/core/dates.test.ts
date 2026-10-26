import { describe, expect, it } from 'vitest';
import {
  addDays,
  ageRangeOn,
  daysBetween,
  isWithin,
  lookbackWindow,
  parsePartialDate,
  toDay,
} from '../../src/core/dates.js';

describe('dates', () => {
  it('builds the inclusive look-back windows used by the policy', () => {
    expect(lookbackWindow('2026-10-01', 90)).toEqual({ from: '2026-07-03', to: '2026-10-01' });
    expect(lookbackWindow('2026-10-01', 365)).toEqual({ from: '2025-10-01', to: '2026-10-01' });
  });

  it('treats both ends of a window as inside', () => {
    const window = { from: '2026-07-03', to: '2026-10-01' };
    expect(isWithin('2026-07-03', window)).toBe(true);
    expect(isWithin('2026-10-01', window)).toBe(true);
    expect(isWithin('2026-07-02', window)).toBe(false);
    expect(isWithin('2026-10-02', window)).toBe(false);
  });

  it('counts days as end minus start, across a leap day', () => {
    expect(daysBetween('2025-10-01', '2026-10-01')).toBe(365);
    expect(daysBetween('2024-01-15', '2026-10-01')).toBe(990);
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29');
  });

  it('takes the calendar day of a dateTime and rejects partial dates', () => {
    expect(toDay('2026-09-03T12:00:00Z')).toBe('2026-09-03');
    expect(toDay('2008-11-11T03:19:15+00:00')).toBe('2008-11-11');
    expect(toDay('1980-04')).toBeNull();
    expect(toDay(undefined)).toBeNull();
  });

  it('parses partial FHIR dates', () => {
    expect(parsePartialDate('1980')).toEqual({ year: 1980, month: undefined, day: undefined });
    expect(parsePartialDate('1980-04')).toEqual({ year: 1980, month: 4, day: undefined });
    expect(parsePartialDate('not a date')).toBeNull();
  });

  it('computes age with calendar arithmetic', () => {
    expect(ageRangeOn({ year: 1972, month: 3, day: 14 }, '2026-10-01')).toEqual({ min: 54, max: 54 });
    // birthday on the request date counts; the day before does not
    expect(ageRangeOn({ year: 2008, month: 10, day: 1 }, '2026-10-01')).toEqual({ min: 18, max: 18 });
    expect(ageRangeOn({ year: 2008, month: 10, day: 2 }, '2026-10-01')).toEqual({ min: 17, max: 17 });
    // born on 29 February: not yet 18 on 28 February, 18 on 1 March
    expect(ageRangeOn({ year: 2008, month: 2, day: 29 }, '2026-02-28')).toEqual({ min: 17, max: 17 });
    expect(ageRangeOn({ year: 2008, month: 2, day: 29 }, '2026-03-01')).toEqual({ min: 18, max: 18 });
  });

  it('gives an age range for partial birth dates', () => {
    expect(ageRangeOn({ year: 1980 }, '2026-10-01')).toEqual({ min: 45, max: 46 });
    expect(ageRangeOn({ year: 2008, month: 4 }, '2026-10-01')).toEqual({ min: 18, max: 18 });
    expect(ageRangeOn({ year: 2008, month: 10 }, '2026-10-01')).toEqual({ min: 17, max: 18 });
  });
});

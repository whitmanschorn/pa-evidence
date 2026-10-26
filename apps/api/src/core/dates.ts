// All clinical date math lives here. Every calculation is anchored to the request date passed in;
// nothing reads the current date. Dates are calendar days, "YYYY-MM-DD", compared as UTC midnights so that
// daylight saving and the server's time zone never shift a day.

const MS_PER_DAY = 86_400_000;

// A FHIR date may be partial: "1980", "1980-04" or "1980-04-12". Missing parts stay undefined.
export type PartialDate = { year: number; month?: number; day?: number };

export function parsePartialDate(value: string | undefined): PartialDate | null {
  if (value === undefined) return null;
  const match = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?/.exec(value);
  if (match === null) return null;
  const year = Number(match[1]);
  const month = match[2] === undefined ? undefined : Number(match[2]);
  const day = match[3] === undefined ? undefined : Number(match[3]);
  return { year, month, day };
}

// The calendar day of a FHIR date or dateTime, as written in the record ("2026-09-03T12:00:00Z" -> "2026-09-03").
// Returns null for partial dates, which have no single day.
export function toDay(value: string | undefined): string | null {
  if (value === undefined) return null;
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(value);
  return match === null ? null : (match[1] ?? null);
}

function toUtcMs(day: string): number {
  const [year, month, date] = day.split('-').map(Number);
  return Date.UTC(year ?? 0, (month ?? 1) - 1, date ?? 1);
}

function fromUtcMs(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function addDays(day: string, days: number): string {
  return fromUtcMs(toUtcMs(day) + days * MS_PER_DAY);
}

// Whole days from `start` to `end` (end minus start). A full 365-day window is 365, not 366.
export function daysBetween(start: string, end: string): number {
  return Math.round((toUtcMs(end) - toUtcMs(start)) / MS_PER_DAY);
}

// The inclusive look-back window [requestDate - windowDays, requestDate].
export function lookbackWindow(requestDate: string, windowDays: number): { from: string; to: string } {
  return { from: addDays(requestDate, -windowDays), to: requestDate };
}

export function isAfter(day: string, other: string): boolean {
  return day > other; // "YYYY-MM-DD" strings sort in calendar order
}

export function isWithin(day: string, window: { from: string; to: string }): boolean {
  return day >= window.from && day <= window.to;
}

export function laterOf(a: string, b: string): string {
  return a > b ? a : b;
}

export function earlierOf(a: string, b: string): string {
  return a < b ? a : b;
}

// Age in whole years on `onDay`, by calendar arithmetic (the birthday must have happened this year).
function ageFromFullDate(year: number, month: number, day: number, onDay: string): number {
  const [onYear, onMonth, onDate] = onDay.split('-').map(Number) as [number, number, number];
  const birthdayPassed = onMonth > month || (onMonth === month && onDate >= day);
  return onYear - year - (birthdayPassed ? 0 : 1);
}

// The youngest and oldest the member can be on `onDay`. For a full birth date they are equal.
// For "1980" the birthday could be any day of 1980, so the age is a range; callers decide only when it is unambiguous.
export function ageRangeOn(birth: PartialDate, onDay: string): { min: number; max: number } {
  if (birth.month !== undefined && birth.day !== undefined) {
    const age = ageFromFullDate(birth.year, birth.month, birth.day, onDay);
    return { min: age, max: age };
  }
  const firstMonth = birth.month ?? 1;
  const lastMonth = birth.month ?? 12;
  const latestPossibleBirthday = { month: lastMonth, day: daysInMonth(birth.year, lastMonth) };
  const earliestPossibleBirthday = { month: firstMonth, day: 1 };
  return {
    min: ageFromFullDate(birth.year, latestPossibleBirthday.month, latestPossibleBirthday.day, onDay),
    max: ageFromFullDate(birth.year, earliestPossibleBirthday.month, earliestPossibleBirthday.day, onDay),
  };
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

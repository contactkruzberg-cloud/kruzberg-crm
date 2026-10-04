import { describe, expect, it } from 'vitest';
import { applicationWindow, formatMonthDay, nextOccurrence, parseMonthDay } from '../application-dates';

const at = (iso: string) => new Date(`${iso}T10:00:00Z`);

describe('application dates (annual MM-DD)', () => {
  it('next occurrence rolls over to next year once passed', () => {
    expect(nextOccurrence('01-15', at('2026-01-10'))).toBe('2026-01-15');
    expect(nextOccurrence('01-15', at('2026-01-15'))).toBe('2026-01-15');
    expect(nextOccurrence('01-15', at('2026-10-04'))).toBe('2027-01-15');
  });

  it('window open / upcoming, including a cycle across new year', () => {
    // Opens 1 Oct, closes 15 Jan: on 4 Oct 2026 it is open, closing 15 Jan 2027.
    expect(applicationWindow('10-01', '01-15', at('2026-10-04'))).toEqual({ status: 'open', opens: '2026-10-01', deadline: '2027-01-15', days_left: 103 });
    // Opens 1 Nov, closes 31 Dec: on 4 Oct it is upcoming.
    expect(applicationWindow('11-01', '12-31', at('2026-10-04'))).toMatchObject({ status: 'upcoming', opens: '2026-11-01', days_left: 88 });
    // No opening date: considered open until the deadline.
    expect(applicationWindow(null, '10-20', at('2026-10-04'))).toMatchObject({ status: 'open', days_left: 16 });
    expect(applicationWindow('10-01', null)).toBeNull();
  });

  it('parses and formats JJ/MM', () => {
    expect(parseMonthDay('15/01')).toBe('01-15');
    expect(parseMonthDay('5/3')).toBe('03-05');
    expect(parseMonthDay('')).toBeNull();
    expect(parseMonthDay('31/13')).toBeUndefined();
    expect(parseMonthDay('janvier')).toBeUndefined();
    expect(formatMonthDay('01-15')).toBe('15/01');
  });
});

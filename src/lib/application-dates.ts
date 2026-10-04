// Annual application windows of festivals / tremplins, stored as 'MM-DD'.

const MMDD = /^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

export const isMonthDay = (v: string | null | undefined): v is string => !!v && MMDD.test(v);

/** Next occurrence (today included) of an 'MM-DD' date, as 'YYYY-MM-DD'. */
export function nextOccurrence(monthDay: string, today = new Date()): string {
  const y = today.getFullYear();
  const todayIso = today.toISOString().slice(0, 10);
  const thisYear = `${y}-${monthDay}`;
  return thisYear >= todayIso ? thisYear : `${y + 1}-${monthDay}`;
}

export function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((Date.parse(`${toIso}T00:00:00Z`) - Date.parse(`${fromIso}T00:00:00Z`)) / 86_400_000);
}

export interface ApplicationWindow {
  /** 'open' = candidatures ouvertes, 'upcoming' = ouverture à venir. */
  status: 'open' | 'upcoming';
  opens: string | null;
  deadline: string;
  days_left: number;
}

/**
 * Where an annual application window stands today. Returns null when no
 * deadline is set. A window is 'open' when today is between the opening
 * (if any) and the deadline.
 */
export function applicationWindow(opens: string | null | undefined, deadline: string | null | undefined, today = new Date()): ApplicationWindow | null {
  if (!isMonthDay(deadline)) return null;
  const todayIso = today.toISOString().slice(0, 10);
  const nextDeadline = nextOccurrence(deadline, today);
  let opening: string | null = null;
  if (isMonthDay(opens)) {
    // Opening of the same cycle: the last occurrence of 'opens' before the deadline.
    const y = Number(nextDeadline.slice(0, 4));
    opening = `${opens <= deadline ? y : y - 1}-${opens}`;
  }
  return {
    status: !opening || opening <= todayIso ? 'open' : 'upcoming',
    opens: opening,
    deadline: nextDeadline,
    days_left: daysBetween(todayIso, nextDeadline),
  };
}

/** 'MM-DD' → '15/01' for display; '15/01' or '15/1' → 'MM-DD' for input. */
export const formatMonthDay = (v: string | null | undefined) => (isMonthDay(v) ? `${v.slice(3)}/${v.slice(0, 2)}` : '');
export function parseMonthDay(input: string): string | null | undefined {
  const s = input.trim();
  if (!s) return null;
  const m = /^(\d{1,2})[/.-](\d{1,2})$/.exec(s);
  if (!m) return undefined;
  const v = `${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return isMonthDay(v) ? v : undefined;
}

import { createHmac, timingSafeEqual } from 'node:crypto';
import { MIN_SECRET_LENGTH } from '@/lib/mcp/auth';

// Token of the calendar feed URL, derived from MCP_SECRET: no extra env var,
// and the URL (shared with the band's agendas) neither reveals MCP_SECRET nor
// gives access to anything but the calendar (read-only).

export function calendarToken(secret = process.env.MCP_SECRET): string | null {
  if (!secret || secret.length < MIN_SECRET_LENGTH) return null;
  return createHmac('sha256', secret).update('kruzberg-calendar-feed-v1').digest('base64url');
}

export function isCalendarToken(candidate: string): boolean {
  const expected = calendarToken();
  if (!expected) return false;
  const a = Buffer.from(candidate);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

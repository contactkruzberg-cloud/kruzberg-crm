import type { VenueType } from '@/types/database';
import type { RadarCategory } from './schemas';

/** Lowercase, strip accents and punctuation, collapse spaces: "Le Café-Concert !" → "le cafe concert". */
export function normalizeName(value: string | null | undefined): string {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' et ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function normalizeEmail(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

/** ISO 3166-1 alpha-2 → French country name, matching how venues.country is stored ("France"). */
export function countryName(iso: string | null | undefined): string {
  const code = (iso ?? 'FR').trim().toUpperCase();
  try {
    return new Intl.DisplayNames(['fr'], { type: 'region' }).of(code) ?? code;
  } catch {
    return code;
  }
}

/** First integer found in a free-text capacity ("300 debout", "~1 200") or null. */
export function parseCapacity(value: string | number | null | undefined): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? Math.round(value) : null;
  const match = (value ?? '').replace(/(\d)[\s.  ](?=\d{3}\b)/g, '$1').match(/\d+/);
  return match ? parseInt(match[0], 10) : null;
}

export function isIsoDate(value: string | null | undefined): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

/** Radar category (+ free-text type) → CRM venue type. */
export function mapVenueType(category: RadarCategory, type?: string | null): VenueType {
  const t = normalizeName(type);
  switch (category) {
    case 'festivals':
      return 'festival';
    case 'presse':
      return 'media';
    case 'tremplins':
      return 'organisateur';
    case 'pros':
      return /\blabel\b/.test(t) ? 'other' : 'organisateur';
    default:
      if (/\bmjc\b/.test(t)) return 'mjc';
      if (/cafe\s*concert/.test(t)) return 'cafe_concert';
      if (/\bbar\b|\bpub\b/.test(t)) return 'bar';
      if (/festival/.test(t)) return 'festival';
      return 'salle';
  }
}

/** Radar fit (1–3) → venue fit_score (1–5). Everything on the radar is pre-qualified. */
export function fitScore(fit: 1 | 2 | 3 | null | undefined): number {
  return fit === 3 ? 5 : fit === 1 ? 3 : 4;
}

export function priorityFromFit(fit: 1 | 2 | 3 | null | undefined): 'low' | 'medium' | 'high' {
  return fit === 3 ? 'high' : fit === 1 ? 'low' : 'medium';
}

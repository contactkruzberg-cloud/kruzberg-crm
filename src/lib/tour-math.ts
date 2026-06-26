// Tour geography & budget helpers. All client-side — nothing stored in DB.
import type { Tour, TourStop, TourExpense } from '@/types/database';

const EARTH_RADIUS_KM = 6371;
const AVG_SPEED_KMH = 80; // rough touring-van average incl. stops

export interface GeoPoint {
  latitude: number | null;
  longitude: number | null;
}

/** As-the-crow-flies distance between two GPS points, in km. */
export function haversineKm(a: GeoPoint, b: GeoPoint): number | null {
  if (
    a.latitude == null ||
    a.longitude == null ||
    b.latitude == null ||
    b.longitude == null
  ) {
    return null;
  }
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

export interface Leg {
  fromIndex: number;
  toIndex: number;
  km: number | null; // road km estimate (crow-flies × road_factor)
  driveMin: number | null;
}

/**
 * Travel legs between consecutive stops (already sorted by order_index).
 * km is null when either endpoint lacks coordinates.
 */
export function legs(stops: TourStop[], roadFactor = 1.3): Leg[] {
  const result: Leg[] = [];
  for (let i = 0; i < stops.length - 1; i++) {
    const crow = haversineKm(stops[i], stops[i + 1]);
    const km = crow == null ? null : crow * roadFactor;
    result.push({
      fromIndex: i,
      toIndex: i + 1,
      km,
      driveMin: km == null ? null : (km / AVG_SPEED_KMH) * 60,
    });
  }
  return result;
}

/** Total road km across all legs that have coordinates. */
export function totalKm(stops: TourStop[], roadFactor = 1.3): number {
  return legs(stops, roadFactor).reduce((sum, l) => sum + (l.km ?? 0), 0);
}

export interface TourBudget {
  revenue: number;
  fuel: number;
  vehicle: number;
  hotels: number;
  perDiems: number;
  otherExpenses: number;
  totalExpenses: number;
  net: number;
  perPerson: number; // net split across members
  km: number;
  days: number;
}

/** Number of inclusive days spanned by the stops (min 1). */
export function tourDays(stops: TourStop[]): number {
  const dates = stops.map((s) => s.stop_date).filter(Boolean).sort();
  if (dates.length === 0) return 0;
  const first = new Date(dates[0]).getTime();
  const last = new Date(dates[dates.length - 1]).getTime();
  return Math.max(1, Math.round((last - first) / 86_400_000) + 1);
}

export function tourBudget(
  tour: Tour,
  stops: TourStop[],
  expenses: TourExpense[]
): TourBudget {
  const km = totalKm(stops, tour.road_factor);
  const revenue = stops
    .filter((s) => s.type === 'show')
    .reduce((sum, s) => sum + (s.fee ?? 0), 0);
  const fuel = (km / 100) * tour.fuel_consumption * tour.fuel_price;
  const hotels = stops.reduce((sum, s) => sum + (s.hotel_cost ?? 0), 0);
  const days = tourDays(stops);
  const vehicle = (tour.vehicle_daily_cost ?? 0) * days;
  const perDiems = tour.per_diem * tour.members_count * days;
  const otherExpenses = expenses.reduce((sum, e) => sum + (e.amount ?? 0), 0);
  const totalExpenses = fuel + vehicle + hotels + perDiems + otherExpenses;
  const net = revenue - totalExpenses;
  return {
    revenue,
    fuel,
    vehicle,
    hotels,
    perDiems,
    otherExpenses,
    totalExpenses,
    net,
    perPerson: tour.members_count > 0 ? net / tour.members_count : net,
    km,
    days,
  };
}

/** Google Maps directions URL chaining the stops' cities/coords in order. */
export function googleMapsUrl(stops: TourStop[]): string | null {
  const points = stops
    .map((s) => {
      if (s.latitude != null && s.longitude != null) {
        return `${s.latitude},${s.longitude}`;
      }
      return s.city || s.venue?.city || null;
    })
    .filter(Boolean) as string[];
  if (points.length < 2) return null;
  return (
    'https://www.google.com/maps/dir/' +
    points.map((p) => encodeURIComponent(p)).join('/')
  );
}

/**
 * Mappy directions URL chaining the stops in order.
 * Mappy (fr) affiche le coût estimé du trajet (péage + carburant), utile pour
 * affiner le budget d'une tournée. Format de route segmenté `#/recherche/A/B/.../`.
 * Les villes sont préférées (entrée documentée), avec repli sur les coordonnées.
 */
export function mappyUrl(stops: TourStop[]): string | null {
  const points = stops
    .map((s) => {
      if (s.city) return s.city;
      if (s.venue?.city) return s.venue.city;
      if (s.latitude != null && s.longitude != null) {
        return `${s.latitude},${s.longitude}`;
      }
      return null;
    })
    .filter(Boolean) as string[];
  if (points.length < 2) return null;
  return (
    'https://fr.mappy.com/itineraire#/recherche/' +
    points.map((p) => encodeURIComponent(p)).join('/') +
    '/'
  );
}

export function formatKm(km: number | null): string {
  if (km == null) return '—';
  return `${Math.round(km)} km`;
}

export function formatDriveTime(min: number | null): string {
  if (min == null) return '—';
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  if (h === 0) return `${m} min`;
  return `${h}h${m.toString().padStart(2, '0')}`;
}

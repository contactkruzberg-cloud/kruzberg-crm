// Generates a printable road book (feuille de route) PDF for a tour.
import { jsPDF } from 'jspdf';
import type { Tour, TourStop } from '@/types/database';
import { STOP_TYPES } from '@/types/database';
import { legs, formatKm, formatDriveTime } from './tour-math';

function fmtDate(date: string | null): string {
  if (!date) return '';
  return new Date(date).toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function stopLabel(stop: TourStop): string {
  if (stop.type !== 'show') {
    return STOP_TYPES.find((t) => t.key === stop.type)?.label || stop.type;
  }
  return stop.venue?.name || stop.city || 'Concert';
}

function stopCity(stop: TourStop): string {
  return stop.venue?.city || stop.city || '';
}

export function generateRoadbook(tour: Tour, stops: TourStop[]) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 18;
  const maxW = pageW - margin * 2;
  let y = margin;

  const ensureSpace = (needed: number) => {
    if (y + needed > pageH - margin) {
      doc.addPage();
      y = margin;
    }
  };

  const line = (
    text: string,
    opts: { size?: number; bold?: boolean; color?: [number, number, number]; gap?: number } = {}
  ) => {
    const { size = 10, bold = false, color = [30, 30, 30], gap = 5.5 } = opts;
    doc.setFontSize(size);
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setTextColor(color[0], color[1], color[2]);
    const wrapped = doc.splitTextToSize(text, maxW);
    ensureSpace(wrapped.length * gap);
    doc.text(wrapped, margin, y);
    y += wrapped.length * gap;
  };

  // --- Cover ---
  line(tour.name, { size: 22, bold: true, gap: 9 });
  const range =
    tour.start_date || tour.end_date
      ? `${fmtDate(tour.start_date)}${tour.end_date ? ' — ' + fmtDate(tour.end_date) : ''}`
      : `${stops.length} date${stops.length > 1 ? 's' : ''}`;
  line(range, { size: 11, color: [110, 110, 110], gap: 7 });
  if (tour.vehicle_label) line(`Véhicule : ${tour.vehicle_label}`, { size: 10, color: [110, 110, 110] });
  line(`${tour.members_count} personne${tour.members_count > 1 ? 's' : ''} en tournée`, {
    size: 10,
    color: [110, 110, 110],
    gap: 8,
  });

  const tourLegs = legs(stops, tour.road_factor);

  // --- One block per stop ---
  stops.forEach((stop, i) => {
    ensureSpace(20);
    y += 2;
    // separator
    doc.setDrawColor(220, 220, 220);
    doc.line(margin, y, pageW - margin, y);
    y += 7;

    const dayNum = `Jour ${i + 1}`;
    line(`${dayNum} · ${fmtDate(stop.stop_date)}`, { size: 9, bold: true, color: [120, 120, 120], gap: 5 });
    line(stopLabel(stop), { size: 15, bold: true, gap: 7 });

    const cityLine = [stopCity(stop), stop.venue?.address].filter(Boolean).join(' — ');
    if (cityLine) line(cityLine, { size: 10, color: [70, 70, 70] });

    if (stop.type === 'show') {
      const schedule = [
        stop.arrival_time && `Arrivée ${stop.arrival_time}`,
        stop.load_in_time && `Load-in ${stop.load_in_time}`,
        stop.soundcheck_time && `Balance ${stop.soundcheck_time}`,
        stop.doors_time && `Portes ${stop.doors_time}`,
        stop.set_time && `Set ${stop.set_time}`,
      ].filter(Boolean) as string[];
      if (schedule.length) line(schedule.join('  ·  '), { size: 10, color: [40, 40, 40] });

      if (stop.on_site_contact || stop.on_site_phone) {
        line(
          `Contact sur place : ${[stop.on_site_contact, stop.on_site_phone].filter(Boolean).join(' · ')}`,
          { size: 10, color: [70, 70, 70] }
        );
      }
      if (stop.fee != null) line(`Cachet : ${stop.fee} €`, { size: 10, color: [70, 70, 70] });
    }

    if (stop.hotel_name || stop.hotel_address) {
      const hotel = [
        `Hôtel : ${stop.hotel_name || '—'}`,
        stop.hotel_address,
        stop.hotel_rooms ? `${stop.hotel_rooms} ch.` : null,
        stop.hotel_booked ? '(réservé)' : '(à réserver)',
      ]
        .filter(Boolean)
        .join(' · ');
      line(hotel, { size: 10, color: [70, 70, 70] });
    }

    if (stop.notes) line(stop.notes, { size: 9, color: [110, 110, 110] });

    // leg to next stop
    const leg = tourLegs[i];
    if (leg) {
      line(
        `↓ Trajet vers l'étape suivante : ${formatKm(leg.km)} · ${formatDriveTime(leg.driveMin)}`,
        { size: 9, bold: true, color: [37, 99, 235], gap: 6 }
      );
    }
  });

  const slug = tour.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  doc.save(`feuille-de-route-${slug || 'tournee'}.pdf`);
}

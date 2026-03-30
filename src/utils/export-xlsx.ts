import * as XLSX from 'xlsx';
import type { Venue, Contact, Deal } from '@/types/database';
import { formatDate } from '@/lib/utils';

const STAGE_LABELS: Record<string, string> = {
  a_contacter: 'À contacter',
  contacte: 'Contacté',
  relance: 'Relancé',
  repondu: 'Répondu',
  confirme: 'Confirmé',
  refuse: 'Refusé',
};

const PRIORITY_LABELS: Record<string, string> = {
  high: 'Haute',
  medium: 'Moyenne',
  low: 'Basse',
};

const TYPE_LABELS: Record<string, string> = {
  bar: 'Bar',
  salle: 'Salle',
  festival: 'Festival',
  cafe_concert: 'Café Concert',
  mjc: 'MJC',
  other: 'Autre',
};

export function exportAllData(venues: Venue[], contacts: Contact[], deals: Deal[]) {
  const wb = XLSX.utils.book_new();

  // ===== VENUES =====
  const venueRows = venues.map((v) => ({
    'Nom': v.name,
    'Type': TYPE_LABELS[v.type] || v.type,
    'Ville': v.city,
    'Pays': v.country,
    'Email': v.email || '',
    'Téléphone': v.phone || '',
    'Instagram': v.instagram || '',
    'Site Web': v.website || '',
    'Capacité': v.capacity || '',
    'Fit (1-5)': v.fit_score,
    'Notes': v.notes || '',
  }));
  const venueSheet = XLSX.utils.json_to_sheet(venueRows);
  XLSX.utils.book_append_sheet(wb, venueSheet, 'Venues');

  // ===== CONTACTS =====
  const contactRows = contacts.map((c) => ({
    'Nom': c.name,
    'Rôle': c.role || '',
    'Lieu': c.venue?.name || '',
    'Email': c.email || '',
    'Téléphone': c.phone || '',
    'Méthode Préférée': c.pref_method,
    'Ton': c.tone === 'tu' ? 'Tutoiement' : 'Vouvoiement',
    'Notes': c.notes || '',
  }));
  const contactSheet = XLSX.utils.json_to_sheet(contactRows);
  XLSX.utils.book_append_sheet(wb, contactSheet, 'Contacts');

  // ===== PIPELINE =====
  const dealRows = deals.map((d) => ({
    'Lieu': d.venue?.name || '',
    'Ville': d.venue?.city || '',
    'Type': d.venue ? (TYPE_LABELS[d.venue.type] || d.venue.type) : '',
    'Contact': d.contact?.name || '',
    'Email': d.contact?.email || d.venue?.email || '',
    'Étape': STAGE_LABELS[d.stage] || d.stage,
    'Priorité': PRIORITY_LABELS[d.priority] || d.priority,
    '1er Contact': d.first_contact_at ? formatDate(d.first_contact_at) : '',
    'Dernier Message': d.last_message_at ? formatDate(d.last_message_at) : '',
    'Prochaine Relance': d.next_relance_at ? formatDate(d.next_relance_at) : '',
    'Date Concert': d.concert_date ? formatDate(d.concert_date) : '',
    'Cachet (€)': d.fee || '',
    'Réponse': d.response || '',
    'Tags': d.tags?.join(', ') || '',
    'Notes': d.notes || '',
  }));
  const dealSheet = XLSX.utils.json_to_sheet(dealRows);
  XLSX.utils.book_append_sheet(wb, dealSheet, 'Pipeline');

  // Auto-size columns
  [venueSheet, contactSheet, dealSheet].forEach((sheet) => {
    const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1');
    const colWidths: number[] = [];
    for (let C = range.s.c; C <= range.e.c; C++) {
      let maxLen = 10;
      for (let R = range.s.r; R <= range.e.r; R++) {
        const cell = sheet[XLSX.utils.encode_cell({ r: R, c: C })];
        if (cell && cell.v) {
          maxLen = Math.max(maxLen, String(cell.v).length);
        }
      }
      colWidths.push(Math.min(maxLen + 2, 40));
    }
    sheet['!cols'] = colWidths.map((w) => ({ wch: w }));
  });

  // Download
  const date = new Date().toISOString().split('T')[0];
  XLSX.writeFile(wb, `KRUZBERG_CRM_export_${date}.xlsx`);
}

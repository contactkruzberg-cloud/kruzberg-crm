import * as XLSX from 'xlsx';
import type { Venue, Contact, Deal } from '@/types/database';
import { RELANCE_METHODS } from '@/types/database';
import type { Task } from '@/types/task';
import { formatDate } from '@/lib/utils';

const STAGE_LABELS: Record<string, string> = {
  a_contacter: 'À contacter',
  contacte: 'Contacté',
  relance: 'Relancé',
  repondu: 'Répondu',
  a_suivre: 'À suivre',
  confirme: 'Confirmé',
  termine: 'Terminé',
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
  organisateur: 'Organisateur',
  media: 'Média',
  other: 'Autre',
};

const METHOD_LABELS: Record<string, string> = {
  email: 'Email',
  phone: 'Téléphone',
  instagram: 'Instagram',
  other: 'Autre',
};

const RELANCE_METHOD_LABELS: Record<string, string> = RELANCE_METHODS.reduce(
  (acc, m) => ({ ...acc, [m.key]: m.label }),
  {}
);

export function downloadImportTemplate() {
  const wb = XLSX.utils.book_new();

  // ===== Sheet "Lieux" =====
  // Headers in French match the import wizard auto-mapping aliases.
  // Two example rows so users see the expected shape; they can delete them.
  const venueExamples = [
    {
      'Nom': 'Le Petit Bain',
      'Type': 'salle',
      'Adresse': '7 Port de la Gare',
      'Code postal': '75013',
      'Ville': 'Paris',
      'Pays': 'France',
      'Email': 'booking@petitbain.org',
      'Téléphone': '01 23 45 67 89',
      'Site web': 'https://petitbain.org',
      'Instagram': '@petitbain',
      'Capacité': 250,
      'Fit (1-5)': 4,
      'Notes': 'Programmation indé / rock',
    },
    {
      'Nom': '',
      'Type': '',
      'Adresse': '',
      'Code postal': '',
      'Ville': '',
      'Pays': '',
      'Email': '',
      'Téléphone': '',
      'Site web': '',
      'Instagram': '',
      'Capacité': '',
      'Fit (1-5)': '',
      'Notes': '',
    },
  ];
  const venueSheet = XLSX.utils.json_to_sheet(venueExamples);
  XLSX.utils.book_append_sheet(wb, venueSheet, 'Lieux');

  // ===== Sheet "Contacts" =====
  const contactExamples = [
    {
      'Nom contact': 'Camille Martin',
      'Rôle': 'Programmatrice',
      'Lieu du contact': 'Le Petit Bain',
      'Email contact': 'camille@petitbain.org',
      'Tél contact': '06 12 34 56 78',
      'Instagram contact': '@camille',
      'Méthode préférée': 'email',
      'Notes contact': 'Préfère un mail le lundi matin',
    },
    {
      'Nom contact': '',
      'Rôle': '',
      'Lieu du contact': '',
      'Email contact': '',
      'Tél contact': '',
      'Instagram contact': '',
      'Méthode préférée': '',
      'Notes contact': '',
    },
  ];
  const contactSheet = XLSX.utils.json_to_sheet(contactExamples);
  XLSX.utils.book_append_sheet(wb, contactSheet, 'Contacts');

  // ===== Sheet "Instructions" =====
  const instructions = [
    { Champ: 'Nom', Obligatoire: 'Oui', Notes: 'Nom du lieu (utilisé pour détecter les doublons)' },
    { Champ: 'Type', Obligatoire: 'Non', Notes: 'bar | salle | festival | cafe_concert | mjc | organisateur | media | other' },
    { Champ: 'Adresse', Obligatoire: 'Non', Notes: 'N° et rue. Sert au géocodage pour la carte.' },
    { Champ: 'Code postal', Obligatoire: 'Non', Notes: '' },
    { Champ: 'Ville', Obligatoire: 'Non (mais utile)', Notes: 'Utilisée pour la détection de doublons avec le nom.' },
    { Champ: 'Pays', Obligatoire: 'Non', Notes: 'Défaut "France" si vide.' },
    { Champ: 'Email / Téléphone / Site web / Instagram', Obligatoire: 'Non', Notes: 'Coordonnées du lieu.' },
    { Champ: 'Capacité', Obligatoire: 'Non', Notes: 'Nombre entier.' },
    { Champ: 'Fit (1-5)', Obligatoire: 'Non', Notes: 'Note de pertinence. Défaut 3.' },
    { Champ: 'Notes', Obligatoire: 'Non', Notes: 'Texte libre.' },
    { Champ: '', Obligatoire: '', Notes: '' },
    { Champ: 'Nom contact', Obligatoire: 'Oui (feuille Contacts)', Notes: 'Nom du contact.' },
    { Champ: 'Lieu du contact', Obligatoire: 'Non', Notes: 'Doit correspondre EXACTEMENT au "Nom" d\'un lieu de la feuille Lieux pour faire le lien.' },
    { Champ: 'Méthode préférée', Obligatoire: 'Non', Notes: 'email | phone | instagram | other' },
    { Champ: '', Obligatoire: '', Notes: '' },
    { Champ: 'Astuce', Obligatoire: '', Notes: 'Vous pouvez supprimer les lignes d\'exemple avant d\'importer. Les colonnes peuvent être renommées : l\'import détecte automatiquement les variantes (Adresse, address, rue…).' },
  ];
  const instructionsSheet = XLSX.utils.json_to_sheet(instructions);
  XLSX.utils.book_append_sheet(wb, instructionsSheet, 'Instructions');

  // Auto-size columns
  [venueSheet, contactSheet, instructionsSheet].forEach((sheet) => {
    const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1');
    const colWidths: number[] = [];
    for (let C = range.s.c; C <= range.e.c; C++) {
      let maxLen = 12;
      for (let R = range.s.r; R <= range.e.r; R++) {
        const cell = sheet[XLSX.utils.encode_cell({ r: R, c: C })];
        if (cell && cell.v) {
          maxLen = Math.max(maxLen, String(cell.v).length);
        }
      }
      colWidths.push(Math.min(maxLen + 2, 50));
    }
    sheet['!cols'] = colWidths.map((w) => ({ wch: w }));
  });

  XLSX.writeFile(wb, 'KRUZBERG_CRM_modele_import.xlsx');
}

export function exportAllData(
  venues: Venue[],
  contacts: Contact[],
  deals: Deal[],
  tasks: Task[] = []
) {
  const wb = XLSX.utils.book_new();

  // ===== LIEUX =====
  const venueRows = venues.map((v) => ({
    'Nom': v.name,
    'Type': TYPE_LABELS[v.type] || v.type,
    'Adresse': v.address || '',
    'Code postal': v.postal_code || '',
    'Ville': v.city,
    'Pays': v.country,
    'Latitude': v.latitude ?? '',
    'Longitude': v.longitude ?? '',
    'Capacité': v.capacity ?? '',
    'Email': v.email || '',
    'Téléphone': v.phone || '',
    'Site Web': v.website || '',
    'Instagram': v.instagram || '',
    'Fit (1-5)': v.fit_score,
    'Notes': v.notes || '',
    'Créé le': formatDate(v.created_at),
    'ID': v.id,
  }));
  const venueSheet = XLSX.utils.json_to_sheet(venueRows);
  XLSX.utils.book_append_sheet(wb, venueSheet, 'Lieux');

  // ===== CONTACTS =====
  const contactRows = contacts.map((c) => ({
    'Nom': c.name,
    'Rôle': c.role || '',
    'Lieu': c.venue?.name || '',
    'Ville du lieu': c.venue?.city || '',
    'Email': c.email || '',
    'Téléphone': c.phone || '',
    'Méthode Préférée': METHOD_LABELS[c.pref_method] || c.pref_method,
    'Ton': c.tone === 'tu' ? 'Tutoiement' : 'Vouvoiement',
    'Notes': c.notes || '',
    'Créé le': formatDate(c.created_at),
    'ID': c.id,
  }));
  const contactSheet = XLSX.utils.json_to_sheet(contactRows);
  XLSX.utils.book_append_sheet(wb, contactSheet, 'Contacts');

  // ===== PIPELINE =====
  const dealRows = deals.map((d) => ({
    'Lieu': d.venue?.name || '',
    'Adresse': d.venue?.address || '',
    'Code postal': d.venue?.postal_code || '',
    'Ville': d.venue?.city || '',
    'Type': d.venue ? (TYPE_LABELS[d.venue.type] || d.venue.type) : '',
    'Contact': d.contact?.name || '',
    'Email': d.contact?.email || d.venue?.email || '',
    'Téléphone': d.contact?.phone || d.venue?.phone || '',
    'Étape': STAGE_LABELS[d.stage] || d.stage,
    'Priorité': PRIORITY_LABELS[d.priority] || d.priority,
    '1er Contact': d.first_contact_at ? formatDate(d.first_contact_at) : '',
    'Dernier Message': d.last_message_at ? formatDate(d.last_message_at) : '',
    'Méthode dernier contact': d.last_relance_method
      ? RELANCE_METHOD_LABELS[d.last_relance_method] || d.last_relance_method
      : '',
    'Prochaine Relance': d.next_relance_at ? formatDate(d.next_relance_at) : '',
    'Date Concert': d.concert_date ? formatDate(d.concert_date) : '',
    'Cachet (€)': d.fee ?? '',
    'Réponse': d.response || '',
    'Tags': d.tags?.join(', ') || '',
    'Notes': d.notes || '',
    'Créé le': formatDate(d.created_at),
    'ID': d.id,
  }));
  const dealSheet = XLSX.utils.json_to_sheet(dealRows);
  XLSX.utils.book_append_sheet(wb, dealSheet, 'Pipeline');

  // ===== TÂCHES =====
  const taskRows = tasks.map((t) => ({
    'Titre': t.title,
    'Description': t.description || '',
    'Lieu': t.deal?.venue?.name || t.venue?.name || '',
    'Ville': t.deal?.venue?.city || '',
    'Étape opportunité': t.deal?.stage ? STAGE_LABELS[t.deal.stage] || t.deal.stage : '',
    'Échéance': t.due_date ? formatDate(t.due_date) : '',
    'Statut': t.completed_at ? 'Terminée' : 'En cours',
    'Terminée le': t.completed_at ? formatDate(t.completed_at) : '',
    'Créée le': formatDate(t.created_at),
    'ID': t.id,
  }));
  const taskSheet = XLSX.utils.json_to_sheet(
    taskRows.length > 0 ? taskRows : [{ Titre: '(Aucune tâche)' }]
  );
  XLSX.utils.book_append_sheet(wb, taskSheet, 'Tâches');

  // Auto-size columns
  [venueSheet, contactSheet, dealSheet, taskSheet].forEach((sheet) => {
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

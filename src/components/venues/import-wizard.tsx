'use client';

import { useState, useCallback, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useVenues, useCreateVenue, useUpdateVenue } from '@/hooks/use-venues';
import { useContacts, useCreateContact } from '@/hooks/use-contacts';
import { Upload, FileSpreadsheet, Check, AlertTriangle, Copy, RefreshCw, SkipForward } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import * as XLSX from 'xlsx';

interface ImportWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type Step = 1 | 2 | 3 | 4 | 5;
type DuplicateAction = 'skip' | 'update' | 'create';

interface ParsedRow {
  [key: string]: string | number | undefined;
}

interface ContactRow {
  [key: string]: string | number | undefined;
}

interface RowWithDuplicate {
  row: ParsedRow;
  index: number;
  duplicateOf: { id: string; name: string; city: string } | null;
  action: DuplicateAction;
}

// All expected venue fields
const VENUE_FIELDS = [
  'name', 'type', 'city', 'country', 'email', 'phone', 'instagram',
  'website', 'capacity', 'fit_score', 'notes',
];

// All expected contact fields
const CONTACT_FIELDS = [
  'contact_name', 'contact_role', 'contact_venue', 'contact_email',
  'contact_phone', 'contact_instagram', 'contact_method', 'contact_notes',
];

const ALL_FIELDS = [...VENUE_FIELDS, ...CONTACT_FIELDS];

const FIELD_LABELS: Record<string, string> = {
  name: 'Nom lieu',
  type: 'Type',
  city: 'Ville',
  country: 'Pays',
  email: 'Email lieu',
  phone: 'Téléphone lieu',
  instagram: 'Instagram',
  website: 'Site web',
  capacity: 'Capacité',
  fit_score: 'Fit (1-5)',
  notes: 'Notes lieu',
  contact_name: 'Nom contact',
  contact_role: 'Rôle',
  contact_venue: 'Lieu du contact',
  contact_email: 'Email contact',
  contact_phone: 'Tél contact',
  contact_instagram: 'Instagram contact',
  contact_method: 'Méthode préférée',
  contact_notes: 'Notes contact',
};

// French aliases for auto-mapping
const FIELD_ALIASES: Record<string, string[]> = {
  name: ['nom', 'nom lieu', 'nom du lieu', 'venue', 'name', 'lieu'],
  type: ['type', 'catégorie', 'categorie'],
  city: ['ville', 'city', 'localité'],
  country: ['pays', 'country'],
  email: ['email', 'mail', 'e-mail', 'email booking', 'courriel'],
  phone: ['téléphone', 'telephone', 'tél', 'tel', 'phone'],
  instagram: ['instagram', 'insta', 'ig'],
  website: ['site web', 'site', 'website', 'url', 'web'],
  capacity: ['capacité', 'capacite', 'capacity', 'jauge'],
  fit_score: ['fit', 'score', 'note', 'fit (1-5)'],
  notes: ['notes', 'commentaire', 'remarques', 'conditions'],
  contact_name: ['nom contact', 'contact', 'prénom', 'prenom', 'prénom / nom', 'nom du contact'],
  contact_role: ['rôle', 'role', 'fonction', 'poste'],
  contact_venue: ['lieu du contact', 'organisation', 'nom lieu', 'venue'],
  contact_email: ['email contact', 'mail contact', 'email du contact'],
  contact_phone: ['tél contact', 'tel contact', 'téléphone contact'],
  contact_instagram: ['instagram contact', 'insta contact'],
  contact_method: ['méthode', 'methode', 'méthode préférée', 'contact préféré', 'method'],
  contact_notes: ['notes contact', 'remarques contact'],
};

function autoDetectMapping(headers: string[], fields: string[]): Record<string, string> {
  const mapping: Record<string, string> = {};
  const usedHeaders = new Set<string>();

  for (const field of fields) {
    const aliases = FIELD_ALIASES[field] || [field];
    for (const alias of aliases) {
      const match = headers.find(
        (h) =>
          !usedHeaders.has(h) &&
          (h.toLowerCase() === alias.toLowerCase() ||
           h.toLowerCase().replace(/[^a-zàâéèêëïîôùûüç]/g, ' ').trim().includes(alias.toLowerCase()))
      );
      if (match) {
        mapping[field] = match;
        usedHeaders.add(match);
        break;
      }
    }
  }
  return mapping;
}

export function ImportWizard({ open, onOpenChange }: ImportWizardProps) {
  const [step, setStep] = useState<Step>(1);
  const [file, setFile] = useState<File | null>(null);
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [hasMultipleSheets, setHasMultipleSheets] = useState(false);

  // Venue data
  const [venueHeaders, setVenueHeaders] = useState<string[]>([]);
  const [venueRows, setVenueRows] = useState<ParsedRow[]>([]);
  const [venueMapping, setVenueMapping] = useState<Record<string, string>>({});

  // Contact data
  const [contactHeaders, setContactHeaders] = useState<string[]>([]);
  const [contactRows, setContactRows] = useState<ContactRow[]>([]);
  const [contactMapping, setContactMapping] = useState<Record<string, string>>({});

  const [importing, setImporting] = useState(false);
  const [imported, setImported] = useState(0);
  const [skipped, setSkipped] = useState(0);
  const [updated, setUpdated] = useState(0);
  const [contactsCreated, setContactsCreated] = useState(0);
  const [rowActions, setRowActions] = useState<Map<number, DuplicateAction>>(new Map());

  const { data: existingVenues } = useVenues();
  const { data: existingContacts } = useContacts();
  const createVenue = useCreateVenue();
  const updateVenue = useUpdateVenue();
  const createContact = useCreateContact();

  // Detect duplicates
  const rowsWithDuplicates: RowWithDuplicate[] = useMemo(() => {
    if (!venueMapping.name) return venueRows.map((row, index) => ({ row, index, duplicateOf: null, action: 'create' as DuplicateAction }));

    return venueRows.map((row, index) => {
      const name = String(row[venueMapping.name] || '').trim().toLowerCase();
      const city = venueMapping.city ? String(row[venueMapping.city] || '').trim().toLowerCase() : '';
      if (!name) return { row, index, duplicateOf: null, action: 'skip' as DuplicateAction };

      const match = (existingVenues || []).find((v) => {
        const vName = v.name.trim().toLowerCase();
        const vCity = v.city.trim().toLowerCase();
        return vName === name && (!city || vCity === city);
      });

      const action = rowActions.get(index) || (match ? 'skip' : 'create');
      return { row, index, duplicateOf: match ? { id: match.id, name: match.name, city: match.city } : null, action };
    });
  }, [venueRows, venueMapping, existingVenues, rowActions]);

  const duplicateCount = rowsWithDuplicates.filter((r) => r.duplicateOf).length;

  const handleFileDrop = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = new Uint8Array(ev.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheets = workbook.SheetNames;
        setSheetNames(sheets);

        // Detect venue sheet
        const venueSheetName = sheets.find((s) =>
          s.toLowerCase().match(/venue|lieu|salle/)
        ) || sheets[0];
        const venueSheet = workbook.Sheets[venueSheetName];
        const venueJson = XLSX.utils.sheet_to_json<ParsedRow>(venueSheet);

        if (venueJson.length > 0) {
          const hdrs = Object.keys(venueJson[0]);
          setVenueHeaders(hdrs);
          setVenueRows(venueJson);
          setVenueMapping(autoDetectMapping(hdrs, VENUE_FIELDS));
        }

        // Detect contact sheet
        const contactSheetName = sheets.find((s) =>
          s.toLowerCase().match(/contact/)
        );

        if (contactSheetName) {
          setHasMultipleSheets(true);
          const contactSheet = workbook.Sheets[contactSheetName];
          const contactJson = XLSX.utils.sheet_to_json<ContactRow>(contactSheet);
          if (contactJson.length > 0) {
            const cHdrs = Object.keys(contactJson[0]);
            setContactHeaders(cHdrs);
            setContactRows(contactJson);
            setContactMapping(autoDetectMapping(cHdrs, CONTACT_FIELDS));
          }
        } else {
          setHasMultipleSheets(false);
          // Single sheet — try to detect contact columns in venue headers
          if (venueJson.length > 0) {
            const hdrs = Object.keys(venueJson[0]);
            const cMapping = autoDetectMapping(hdrs, CONTACT_FIELDS);
            if (cMapping.contact_name || cMapping.contact_email) {
              setContactMapping(cMapping);
            }
          }
        }

        setStep(2);
      } catch {
        toast.error("Erreur lors de la lecture du fichier");
      }
    };
    reader.readAsArrayBuffer(f);
  }, []);

  const setAllDuplicateAction = (action: DuplicateAction) => {
    const newActions = new Map(rowActions);
    rowsWithDuplicates.forEach((r) => {
      if (r.duplicateOf) newActions.set(r.index, action);
    });
    setRowActions(newActions);
  };

  const setRowAction = (index: number, action: DuplicateAction) => {
    setRowActions((prev) => new Map(prev).set(index, action));
  };

  const handleImport = async () => {
    setImporting(true);
    setStep(4);
    let countCreated = 0;
    let countSkipped = 0;
    let countUpdated = 0;
    let countContacts = 0;

    // Map of venue name (lowercase) → venue ID for contact linking
    const venueNameToId = new Map<string, string>();
    (existingVenues || []).forEach((v) => venueNameToId.set(v.name.trim().toLowerCase(), v.id));

    // Import venues
    for (const { row, duplicateOf, action } of rowsWithDuplicates) {
      try {
        const venueName = venueMapping.name ? String(row[venueMapping.name] || '').trim() : '';
        if (!venueName) { countSkipped++; continue; }

        const typeRaw = venueMapping.type ? String(row[venueMapping.type] || 'bar').toLowerCase() : 'bar';
        const typeMap: Record<string, string> = { bar: 'bar', salle: 'salle', festival: 'festival', 'café concert': 'cafe_concert', 'cafe concert': 'cafe_concert', mjc: 'mjc', organisateur: 'organisateur', orga: 'organisateur', media: 'media', 'média': 'media' };
        const venueType = typeMap[typeRaw] || 'other';

        const venueData = {
          name: venueName,
          type: venueType as 'bar',
          city: venueMapping.city ? String(row[venueMapping.city] || '') : '',
          country: venueMapping.country ? String(row[venueMapping.country] || 'France') : 'France',
          email: venueMapping.email ? String(row[venueMapping.email] || '') || null : null,
          phone: venueMapping.phone ? String(row[venueMapping.phone] || '') || null : null,
          instagram: venueMapping.instagram ? String(row[venueMapping.instagram] || '') || null : null,
          website: venueMapping.website ? String(row[venueMapping.website] || '') || null : null,
          capacity: venueMapping.capacity ? parseInt(String(row[venueMapping.capacity] || '0')) || null : null,
          fit_score: venueMapping.fit_score ? parseInt(String(row[venueMapping.fit_score] || '3')) || 3 : 3,
          notes: venueMapping.notes ? String(row[venueMapping.notes] || '') || null : null,
        };

        if (duplicateOf && action === 'skip') {
          countSkipped++;
        } else if (duplicateOf && action === 'update') {
          await updateVenue.mutateAsync({ id: duplicateOf.id, ...venueData });
          venueNameToId.set(venueName.toLowerCase(), duplicateOf.id);
          countUpdated++;
        } else {
          const venue = await createVenue.mutateAsync(venueData);
          venueNameToId.set(venueName.toLowerCase(), venue.id);
          countCreated++;
        }

        // Single-sheet contacts (contact columns in same row)
        if (!hasMultipleSheets && contactMapping.contact_name) {
          const cName = String(row[contactMapping.contact_name] || '').trim();
          if (cName) {
            const venueId = venueNameToId.get(venueName.toLowerCase());
            if (venueId) {
              await createContact.mutateAsync({
                venue_id: venueId,
                name: cName,
                role: contactMapping.contact_role ? String(row[contactMapping.contact_role] || '') || null : null,
                email: contactMapping.contact_email ? String(row[contactMapping.contact_email] || '') || null : null,
                phone: contactMapping.contact_phone ? String(row[contactMapping.contact_phone] || '') || null : null,
                pref_method: mapMethod(contactMapping.contact_method ? String(row[contactMapping.contact_method] || '') : ''),
              });
              countContacts++;
            }
          }
        }

        setImported(countCreated + countUpdated);
        setSkipped(countSkipped);
        setUpdated(countUpdated);
      } catch {
        // Continue
      }
    }

    // Import contacts from separate sheet
    if (hasMultipleSheets && contactRows.length > 0) {
      for (const crow of contactRows) {
        try {
          const cName = contactMapping.contact_name ? String(crow[contactMapping.contact_name] || '').trim() : '';
          if (!cName) continue;

          // Find venue by name
          const venueName = contactMapping.contact_venue ? String(crow[contactMapping.contact_venue] || '').trim().toLowerCase() : '';
          const venueId = venueName ? venueNameToId.get(venueName) : null;

          await createContact.mutateAsync({
            venue_id: venueId || null,
            name: cName,
            role: contactMapping.contact_role ? String(crow[contactMapping.contact_role] || '') || null : null,
            email: contactMapping.contact_email ? String(crow[contactMapping.contact_email] || '') || null : null,
            phone: contactMapping.contact_phone ? String(crow[contactMapping.contact_phone] || '') || null : null,
            pref_method: mapMethod(contactMapping.contact_method ? String(crow[contactMapping.contact_method] || '') : ''),
            notes: contactMapping.contact_notes ? String(crow[contactMapping.contact_notes] || '') || null : null,
          });
          countContacts++;
        } catch {
          // Continue
        }
      }
    }

    setImporting(false);
    setImported(countCreated);
    setSkipped(countSkipped);
    setUpdated(countUpdated);
    setContactsCreated(countContacts);
    setStep(5);
    toast.success('Import terminé !');
  };

  const reset = () => {
    setStep(1);
    setFile(null);
    setSheetNames([]);
    setHasMultipleSheets(false);
    setVenueHeaders([]);
    setVenueRows([]);
    setVenueMapping({});
    setContactHeaders([]);
    setContactRows([]);
    setContactMapping({});
    setImported(0);
    setSkipped(0);
    setUpdated(0);
    setContactsCreated(0);
    setRowActions(new Map());
  };

  // Active fields = those that have headers available
  const activeVenueFields = VENUE_FIELDS;
  const activeContactFields = CONTACT_FIELDS;
  const allHeaders = hasMultipleSheets ? venueHeaders : venueHeaders;
  const allContactHdrs = hasMultipleSheets ? contactHeaders : venueHeaders;

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) reset(); }}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Importer des données</DialogTitle>
          <DialogDescription>
            Étape {step} sur 5 — {step === 1 ? 'Fichier' : step === 2 ? 'Mapping' : step === 3 ? 'Aperçu & doublons' : step === 4 ? 'Import' : 'Terminé'}
          </DialogDescription>
        </DialogHeader>

        <Progress value={(step / 5) * 100} className="mb-4" />

        {/* Step 1: File */}
        {step === 1 && (
          <label className="flex flex-col items-center justify-center h-40 border-2 border-dashed rounded-xl cursor-pointer hover:border-primary/50 transition-colors">
            <Upload className="h-8 w-8 text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">Glissez un fichier .xlsx ou .csv ici</p>
            <p className="text-xs text-muted-foreground mt-1">ou cliquez pour sélectionner</p>
            <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleFileDrop} />
          </label>
        )}

        {/* Step 2: Mapping */}
        {step === 2 && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 flex-wrap">
              <FileSpreadsheet className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium">{file?.name}</span>
              <Badge variant="secondary">{venueRows.length} lieux</Badge>
              {hasMultipleSheets && (
                <Badge variant="secondary">{contactRows.length} contacts</Badge>
              )}
              {sheetNames.length > 1 && (
                <Badge variant="outline" className="text-[10px]">
                  Onglets : {sheetNames.join(', ')}
                </Badge>
              )}
            </div>

            {/* Venue mapping */}
            <div>
              <p className="text-sm font-medium mb-2">Colonnes Lieux</p>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {activeVenueFields.map((field) => (
                  <div key={field} className="flex items-center gap-3">
                    <span className="text-xs w-28 shrink-0 text-muted-foreground">{FIELD_LABELS[field]}</span>
                    <Select
                      value={venueMapping[field] || '_none'}
                      onValueChange={(v) => setVenueMapping((m) => ({ ...m, [field]: v === '_none' ? '' : v }))}
                    >
                      <SelectTrigger className="flex-1 h-8 text-xs">
                        <SelectValue placeholder="— Ignorer —" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="_none">— Ignorer —</SelectItem>
                        {venueHeaders.map((h) => (
                          <SelectItem key={h} value={h}>{h}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
            </div>

            {/* Contact mapping */}
            <div>
              <p className="text-sm font-medium mb-2">
                Colonnes Contacts
                {hasMultipleSheets && <span className="text-xs text-muted-foreground ml-2">(onglet séparé détecté)</span>}
              </p>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {activeContactFields.map((field) => (
                  <div key={field} className="flex items-center gap-3">
                    <span className="text-xs w-28 shrink-0 text-muted-foreground">{FIELD_LABELS[field]}</span>
                    <Select
                      value={contactMapping[field] || '_none'}
                      onValueChange={(v) => setContactMapping((m) => ({ ...m, [field]: v === '_none' ? '' : v }))}
                    >
                      <SelectTrigger className="flex-1 h-8 text-xs">
                        <SelectValue placeholder="— Ignorer —" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="_none">— Ignorer —</SelectItem>
                        {allContactHdrs.map((h) => (
                          <SelectItem key={h} value={h}>{h}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => setStep(1)}>Retour</Button>
              <Button onClick={() => setStep(3)}>Aperçu</Button>
            </div>
          </div>
        )}

        {/* Step 3: Preview + duplicates */}
        {step === 3 && (
          <div className="space-y-4">
            {duplicateCount > 0 ? (
              <div className="rounded-lg border border-orange-500/30 bg-orange-500/5 p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-orange-500" />
                  <span className="text-sm font-medium">
                    {duplicateCount} doublon{duplicateCount > 1 ? 's' : ''} détecté{duplicateCount > 1 ? 's' : ''}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Même nom + ville qu&apos;un lieu existant.
                </p>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" className="text-xs gap-1.5" onClick={() => setAllDuplicateAction('skip')}>
                    <SkipForward className="h-3 w-3" />Tout ignorer
                  </Button>
                  <Button size="sm" variant="outline" className="text-xs gap-1.5" onClick={() => setAllDuplicateAction('update')}>
                    <RefreshCw className="h-3 w-3" />Tout mettre à jour
                  </Button>
                  <Button size="sm" variant="outline" className="text-xs gap-1.5" onClick={() => setAllDuplicateAction('create')}>
                    <Copy className="h-3 w-3" />Tout créer
                  </Button>
                </div>
              </div>
            ) : (
              <div className="rounded-lg border border-green-500/30 bg-green-500/5 p-3 flex items-center gap-2">
                <Check className="h-4 w-4 text-green-500" />
                <span className="text-sm">Aucun doublon détecté</span>
              </div>
            )}

            {/* Venues preview */}
            <div className="rounded-lg border overflow-x-auto max-h-60 overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-card">
                  <tr className="border-b bg-muted/50">
                    <th className="p-2 text-left w-20">Statut</th>
                    {VENUE_FIELDS.filter((f) => venueMapping[f]).map((f) => (
                      <th key={f} className="p-2 text-left">{FIELD_LABELS[f]}</th>
                    ))}
                    {duplicateCount > 0 && <th className="p-2 text-left w-32">Action</th>}
                  </tr>
                </thead>
                <tbody>
                  {rowsWithDuplicates.slice(0, 20).map(({ row, index, duplicateOf, action }) => {
                    const name = venueMapping.name ? String(row[venueMapping.name] || '') : '';
                    if (!name) return null;
                    return (
                      <tr key={index} className={cn('border-b', duplicateOf && 'bg-orange-500/5', action === 'skip' && duplicateOf && 'opacity-50')}>
                        <td className="p-2">
                          <Badge variant={duplicateOf ? 'warning' : 'success'} className="text-[10px]">
                            {duplicateOf ? 'Doublon' : 'Nouveau'}
                          </Badge>
                        </td>
                        {VENUE_FIELDS.filter((f) => venueMapping[f]).map((f) => (
                          <td key={f} className="p-2 max-w-[100px] truncate">{String(row[venueMapping[f]] || '—')}</td>
                        ))}
                        {duplicateCount > 0 && (
                          <td className="p-2">
                            {duplicateOf ? (
                              <Select value={action} onValueChange={(v) => setRowAction(index, v as DuplicateAction)}>
                                <SelectTrigger className="h-7 text-[11px] w-28"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="skip">Ignorer</SelectItem>
                                  <SelectItem value="update">Mettre à jour</SelectItem>
                                  <SelectItem value="create">Créer</SelectItem>
                                </SelectContent>
                              </Select>
                            ) : (
                              <span className="text-muted-foreground text-[11px]">Créer</span>
                            )}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Contact preview */}
            {(hasMultipleSheets ? contactRows.length > 0 : !!contactMapping.contact_name) && (
              <div>
                <p className="text-xs text-muted-foreground mb-1">
                  {hasMultipleSheets ? contactRows.length : venueRows.filter((r) => contactMapping.contact_name && r[contactMapping.contact_name]).length} contacts à importer
                </p>
              </div>
            )}

            <div className="flex items-center justify-between">
              <div className="text-xs text-muted-foreground">
                {venueRows.length} lieux — {duplicateCount} doublon{duplicateCount > 1 ? 's' : ''}
              </div>
              <div className="flex gap-3">
                <Button variant="outline" onClick={() => setStep(2)}>Retour</Button>
                <Button onClick={handleImport}>Lancer l&apos;import</Button>
              </div>
            </div>
          </div>
        )}

        {/* Step 4: Importing */}
        {step === 4 && (
          <div className="text-center py-8 space-y-4">
            <div className="animate-spin rounded-full h-10 w-10 border-2 border-primary border-t-transparent mx-auto" />
            <p className="text-sm">Import en cours...</p>
            <Progress value={((imported + skipped) / Math.max(venueRows.length, 1)) * 100} />
          </div>
        )}

        {/* Step 5: Done */}
        {step === 5 && (
          <div className="text-center py-8 space-y-4">
            <div className="rounded-full h-12 w-12 bg-green-500/10 flex items-center justify-center mx-auto">
              <Check className="h-6 w-6 text-green-500" />
            </div>
            <p className="text-lg font-medium">Import terminé !</p>
            <div className="flex justify-center gap-4 text-sm flex-wrap">
              {imported > 0 && (
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-green-500" />
                  {imported} lieu{imported > 1 ? 'x' : ''} créé{imported > 1 ? 's' : ''}
                </div>
              )}
              {updated > 0 && (
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-blue-500" />
                  {updated} mis à jour
                </div>
              )}
              {skipped > 0 && (
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-gray-400" />
                  {skipped} ignoré{skipped > 1 ? 's' : ''}
                </div>
              )}
              {contactsCreated > 0 && (
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-purple-500" />
                  {contactsCreated} contact{contactsCreated > 1 ? 's' : ''} créé{contactsCreated > 1 ? 's' : ''}
                </div>
              )}
            </div>
            <Button onClick={() => { onOpenChange(false); reset(); }}>Fermer</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function mapMethod(raw: string): 'email' | 'phone' | 'instagram' | 'other' {
  const lower = raw.toLowerCase().trim();
  if (lower.includes('email') || lower.includes('mail')) return 'email';
  if (lower.includes('phone') || lower.includes('tél') || lower.includes('sms')) return 'phone';
  if (lower.includes('instagram') || lower.includes('insta')) return 'instagram';
  if (lower) return 'other';
  return 'email';
}

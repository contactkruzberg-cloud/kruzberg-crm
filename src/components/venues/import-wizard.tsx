'use client';

import { useState, useCallback, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useVenues, useCreateVenue, useUpdateVenue } from '@/hooks/use-venues';
import { useCreateContact } from '@/hooks/use-contacts';
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

interface RowWithDuplicate {
  row: ParsedRow;
  index: number;
  duplicateOf: { id: string; name: string; city: string } | null;
  action: DuplicateAction;
}

const EXPECTED_FIELDS = ['name', 'type', 'city', 'email', 'phone', 'capacity', 'contact_name', 'contact_email'];

const FIELD_LABELS: Record<string, string> = {
  name: 'Nom',
  type: 'Type',
  city: 'Ville',
  email: 'Email',
  phone: 'Téléphone',
  capacity: 'Capacité',
  contact_name: 'Nom contact',
  contact_email: 'Email contact',
};

export function ImportWizard({ open, onOpenChange }: ImportWizardProps) {
  const [step, setStep] = useState<Step>(1);
  const [file, setFile] = useState<File | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [importing, setImporting] = useState(false);
  const [imported, setImported] = useState(0);
  const [skipped, setSkipped] = useState(0);
  const [updated, setUpdated] = useState(0);
  const [rowActions, setRowActions] = useState<Map<number, DuplicateAction>>(new Map());

  const { data: existingVenues } = useVenues();
  const createVenue = useCreateVenue();
  const updateVenue = useUpdateVenue();
  const createContact = useCreateContact();

  // Detect duplicates by matching name + city (case-insensitive)
  const rowsWithDuplicates: RowWithDuplicate[] = useMemo(() => {
    if (!mapping.name) return rows.map((row, index) => ({ row, index, duplicateOf: null, action: 'create' as DuplicateAction }));

    return rows.map((row, index) => {
      const name = String(row[mapping.name] || '').trim().toLowerCase();
      const city = mapping.city ? String(row[mapping.city] || '').trim().toLowerCase() : '';

      if (!name) return { row, index, duplicateOf: null, action: 'skip' as DuplicateAction };

      const match = (existingVenues || []).find((v) => {
        const vName = v.name.trim().toLowerCase();
        const vCity = v.city.trim().toLowerCase();
        return vName === name && (!city || vCity === city);
      });

      const action = rowActions.get(index) || (match ? 'skip' : 'create');
      return {
        row,
        index,
        duplicateOf: match ? { id: match.id, name: match.name, city: match.city } : null,
        action,
      };
    });
  }, [rows, mapping, existingVenues, rowActions]);

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
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json<ParsedRow>(sheet);

        if (json.length > 0) {
          const hdrs = Object.keys(json[0]);
          setHeaders(hdrs);
          setRows(json);

          const autoMap: Record<string, string> = {};
          for (const field of EXPECTED_FIELDS) {
            const match = hdrs.find(
              (h) =>
                h.toLowerCase().includes(field) ||
                h.toLowerCase().replace(/[^a-z]/g, '').includes(field.replace(/_/g, ''))
            );
            if (match) autoMap[field] = match;
          }
          setMapping(autoMap);
          setStep(2);
        }
      } catch {
        toast.error("Erreur lors de la lecture du fichier");
      }
    };
    reader.readAsArrayBuffer(f);
  }, []);

  const setAllDuplicateAction = (action: DuplicateAction) => {
    const newActions = new Map(rowActions);
    rowsWithDuplicates.forEach((r) => {
      if (r.duplicateOf) {
        newActions.set(r.index, action);
      }
    });
    setRowActions(newActions);
  };

  const setRowAction = (index: number, action: DuplicateAction) => {
    setRowActions((prev) => {
      const next = new Map(prev);
      next.set(index, action);
      return next;
    });
  };

  const handleImport = async () => {
    setImporting(true);
    setStep(4);
    let countCreated = 0;
    let countSkipped = 0;
    let countUpdated = 0;

    for (const { row, duplicateOf, action } of rowsWithDuplicates) {
      try {
        const venueName = mapping.name ? String(row[mapping.name] || '').trim() : '';
        if (!venueName) { countSkipped++; continue; }

        const venueData = {
          name: venueName,
          type: (mapping.type ? String(row[mapping.type] || 'bar').toLowerCase() : 'bar') as 'bar',
          city: mapping.city ? String(row[mapping.city] || '') : '',
          email: mapping.email ? String(row[mapping.email] || '') || null : null,
          phone: mapping.phone ? String(row[mapping.phone] || '') || null : null,
          capacity: mapping.capacity ? parseInt(String(row[mapping.capacity] || '0')) || null : null,
        };

        let venueId: string;

        if (duplicateOf && action === 'skip') {
          countSkipped++;
          setImported(countCreated + countUpdated);
          setSkipped(countSkipped);
          continue;
        } else if (duplicateOf && action === 'update') {
          await updateVenue.mutateAsync({ id: duplicateOf.id, ...venueData });
          venueId = duplicateOf.id;
          countUpdated++;
        } else {
          const venue = await createVenue.mutateAsync(venueData);
          venueId = venue.id;
          countCreated++;
        }

        // Create contact if provided
        const contactName = mapping.contact_name ? String(row[mapping.contact_name] || '').trim() : '';
        if (contactName) {
          await createContact.mutateAsync({
            venue_id: venueId,
            name: contactName,
            email: mapping.contact_email ? String(row[mapping.contact_email] || '') || null : null,
          });
        }

        setImported(countCreated + countUpdated);
        setSkipped(countSkipped);
        setUpdated(countUpdated);
      } catch {
        // Continue with next row
      }
    }

    setImporting(false);
    setImported(countCreated);
    setSkipped(countSkipped);
    setUpdated(countUpdated);
    setStep(5);
    toast.success(`Import terminé : ${countCreated} créés, ${countUpdated} mis à jour, ${countSkipped} ignorés`);
  };

  const reset = () => {
    setStep(1);
    setFile(null);
    setHeaders([]);
    setRows([]);
    setMapping({});
    setImported(0);
    setSkipped(0);
    setUpdated(0);
    setRowActions(new Map());
  };

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

        {/* Step 1: File upload */}
        {step === 1 && (
          <label className="flex flex-col items-center justify-center h-40 border-2 border-dashed rounded-xl cursor-pointer hover:border-primary/50 transition-colors">
            <Upload className="h-8 w-8 text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">
              Glissez un fichier .xlsx ou .csv ici
            </p>
            <p className="text-xs text-muted-foreground mt-1">ou cliquez pour sélectionner</p>
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={handleFileDrop}
            />
          </label>
        )}

        {/* Step 2: Column mapping */}
        {step === 2 && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 mb-2">
              <FileSpreadsheet className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium">{file?.name}</span>
              <Badge variant="secondary">{rows.length} lignes</Badge>
            </div>

            <p className="text-sm text-muted-foreground">
              Associez les colonnes du fichier aux champs du CRM :
            </p>

            <div className="space-y-3 max-h-64 overflow-y-auto">
              {EXPECTED_FIELDS.map((field) => (
                <div key={field} className="flex items-center gap-3">
                  <span className="text-sm w-32 shrink-0">
                    {FIELD_LABELS[field]}
                  </span>
                  <Select
                    value={mapping[field] || '_none'}
                    onValueChange={(v) =>
                      setMapping((m) => ({ ...m, [field]: v === '_none' ? '' : v }))
                    }
                  >
                    <SelectTrigger className="flex-1">
                      <SelectValue placeholder="— Ignorer —" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_none">— Ignorer —</SelectItem>
                      {headers.map((h) => (
                        <SelectItem key={h} value={h}>{h}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>

            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => setStep(1)}>Retour</Button>
              <Button onClick={() => setStep(3)}>Aperçu</Button>
            </div>
          </div>
        )}

        {/* Step 3: Preview + duplicate management */}
        {step === 3 && (
          <div className="space-y-4">
            {/* Duplicate summary */}
            {duplicateCount > 0 && (
              <div className="rounded-lg border border-orange-500/30 bg-orange-500/5 p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-orange-500" />
                  <span className="text-sm font-medium">
                    {duplicateCount} doublon{duplicateCount > 1 ? 's' : ''} détecté{duplicateCount > 1 ? 's' : ''}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Ces lieux existent déjà dans votre CRM (même nom + ville). Choisissez quoi faire :
                </p>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" className="text-xs gap-1.5" onClick={() => setAllDuplicateAction('skip')}>
                    <SkipForward className="h-3 w-3" />
                    Tout ignorer
                  </Button>
                  <Button size="sm" variant="outline" className="text-xs gap-1.5" onClick={() => setAllDuplicateAction('update')}>
                    <RefreshCw className="h-3 w-3" />
                    Tout mettre à jour
                  </Button>
                  <Button size="sm" variant="outline" className="text-xs gap-1.5" onClick={() => setAllDuplicateAction('create')}>
                    <Copy className="h-3 w-3" />
                    Tout créer quand même
                  </Button>
                </div>
              </div>
            )}

            {duplicateCount === 0 && (
              <div className="rounded-lg border border-green-500/30 bg-green-500/5 p-3 flex items-center gap-2">
                <Check className="h-4 w-4 text-green-500" />
                <span className="text-sm">Aucun doublon détecté</span>
              </div>
            )}

            {/* Table */}
            <div className="rounded-lg border overflow-x-auto max-h-80 overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-card">
                  <tr className="border-b bg-muted/50">
                    <th className="p-2 text-left w-24">Statut</th>
                    {EXPECTED_FIELDS.filter((f) => mapping[f]).map((f) => (
                      <th key={f} className="p-2 text-left">
                        {FIELD_LABELS[f]}
                      </th>
                    ))}
                    {duplicateCount > 0 && <th className="p-2 text-left w-36">Action</th>}
                  </tr>
                </thead>
                <tbody>
                  {rowsWithDuplicates.map(({ row, index, duplicateOf, action }) => {
                    const name = mapping.name ? String(row[mapping.name] || '') : '';
                    if (!name) return null;

                    return (
                      <tr
                        key={index}
                        className={cn(
                          'border-b',
                          duplicateOf && 'bg-orange-500/5',
                          action === 'skip' && duplicateOf && 'opacity-50'
                        )}
                      >
                        <td className="p-2">
                          {duplicateOf ? (
                            <Badge variant="warning" className="text-[10px]">
                              Doublon
                            </Badge>
                          ) : (
                            <Badge variant="success" className="text-[10px]">
                              Nouveau
                            </Badge>
                          )}
                        </td>
                        {EXPECTED_FIELDS.filter((f) => mapping[f]).map((f) => (
                          <td key={f} className="p-2 max-w-[120px] truncate">
                            {String(row[mapping[f]] || '—')}
                          </td>
                        ))}
                        {duplicateCount > 0 && (
                          <td className="p-2">
                            {duplicateOf ? (
                              <Select
                                value={action}
                                onValueChange={(v) => setRowAction(index, v as DuplicateAction)}
                              >
                                <SelectTrigger className="h-7 text-[11px] w-32">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="skip">Ignorer</SelectItem>
                                  <SelectItem value="update">Mettre à jour</SelectItem>
                                  <SelectItem value="create">Créer quand même</SelectItem>
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

            <div className="flex items-center justify-between">
              <div className="text-xs text-muted-foreground">
                {rows.length} lignes — {duplicateCount} doublon{duplicateCount > 1 ? 's' : ''}
              </div>
              <div className="flex gap-3">
                <Button variant="outline" onClick={() => setStep(2)}>Retour</Button>
                <Button onClick={handleImport}>
                  Lancer l&apos;import
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Step 4: Importing */}
        {step === 4 && (
          <div className="text-center py-8 space-y-4">
            <div className="animate-spin rounded-full h-10 w-10 border-2 border-primary border-t-transparent mx-auto" />
            <p className="text-sm">Import en cours... {imported + skipped}/{rows.length}</p>
            <Progress value={((imported + skipped) / rows.length) * 100} />
          </div>
        )}

        {/* Step 5: Done */}
        {step === 5 && (
          <div className="text-center py-8 space-y-4">
            <div className="rounded-full h-12 w-12 bg-green-500/10 flex items-center justify-center mx-auto">
              <Check className="h-6 w-6 text-green-500" />
            </div>
            <p className="text-lg font-medium">Import terminé !</p>
            <div className="flex justify-center gap-4 text-sm">
              {imported > 0 && (
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-green-500" />
                  {imported} créé{imported > 1 ? 's' : ''}
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
            </div>
            <Button onClick={() => { onOpenChange(false); reset(); }}>
              Fermer
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

'use client';

import { useState, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useCreateVenue } from '@/hooks/use-venues';
import { useCreateContact } from '@/hooks/use-contacts';
import { Upload, FileSpreadsheet, Check, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';

interface ImportWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type Step = 1 | 2 | 3 | 4 | 5;

interface ParsedRow {
  [key: string]: string | number | undefined;
}

const EXPECTED_FIELDS = ['name', 'type', 'city', 'email', 'phone', 'capacity', 'contact_name', 'contact_email'];

export function ImportWizard({ open, onOpenChange }: ImportWizardProps) {
  const [step, setStep] = useState<Step>(1);
  const [file, setFile] = useState<File | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [importing, setImporting] = useState(false);
  const [imported, setImported] = useState(0);

  const createVenue = useCreateVenue();
  const createContact = useCreateContact();

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

          // Auto-detect mapping
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

  const handleImport = async () => {
    setImporting(true);
    setStep(4);
    let count = 0;

    for (const row of rows) {
      try {
        const venueName = mapping.name ? String(row[mapping.name] || '') : '';
        if (!venueName) continue;

        const venue = await createVenue.mutateAsync({
          name: venueName,
          type: (mapping.type ? String(row[mapping.type] || 'bar') : 'bar') as 'bar',
          city: mapping.city ? String(row[mapping.city] || '') : '',
          email: mapping.email ? String(row[mapping.email] || '') : null,
          phone: mapping.phone ? String(row[mapping.phone] || '') : null,
          capacity: mapping.capacity ? parseInt(String(row[mapping.capacity] || '0')) || null : null,
        });

        const contactName = mapping.contact_name ? String(row[mapping.contact_name] || '') : '';
        if (contactName) {
          await createContact.mutateAsync({
            venue_id: venue.id,
            name: contactName,
            email: mapping.contact_email ? String(row[mapping.contact_email] || '') : null,
          });
        }

        count++;
        setImported(count);
      } catch {
        // Continue with next row
      }
    }

    setImporting(false);
    setStep(5);
    toast.success(`${count} lieux importés avec succès`);
  };

  const reset = () => {
    setStep(1);
    setFile(null);
    setHeaders([]);
    setRows([]);
    setMapping({});
    setImported(0);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) reset(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Importer des données</DialogTitle>
          <DialogDescription>
            Étape {step} sur 5 — {step === 1 ? 'Fichier' : step === 2 ? 'Mapping' : step === 3 ? 'Aperçu' : step === 4 ? 'Import' : 'Terminé'}
          </DialogDescription>
        </DialogHeader>

        <Progress value={(step / 5) * 100} className="mb-4" />

        {step === 1 && (
          <div className="space-y-4">
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
          </div>
        )}

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
                  <span className="text-sm w-32 shrink-0 capitalize">
                    {field.replace(/_/g, ' ')}
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

        {step === 3 && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Aperçu des {Math.min(5, rows.length)} premières lignes :
            </p>
            <div className="rounded-lg border overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b bg-muted/50">
                    {EXPECTED_FIELDS.filter((f) => mapping[f]).map((f) => (
                      <th key={f} className="p-2 text-left capitalize">
                        {f.replace(/_/g, ' ')}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 5).map((row, i) => (
                    <tr key={i} className="border-b">
                      {EXPECTED_FIELDS.filter((f) => mapping[f]).map((f) => (
                        <td key={f} className="p-2">
                          {String(row[mapping[f]] || '—')}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => setStep(2)}>Retour</Button>
              <Button onClick={handleImport}>
                Importer {rows.length} lignes
              </Button>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="text-center py-8 space-y-4">
            <div className="animate-spin rounded-full h-10 w-10 border-2 border-primary border-t-transparent mx-auto" />
            <p className="text-sm">Import en cours... {imported}/{rows.length}</p>
            <Progress value={(imported / rows.length) * 100} />
          </div>
        )}

        {step === 5 && (
          <div className="text-center py-8 space-y-4">
            <div className="rounded-full h-12 w-12 bg-green-500/10 flex items-center justify-center mx-auto">
              <Check className="h-6 w-6 text-green-500" />
            </div>
            <p className="text-lg font-medium">Import terminé !</p>
            <p className="text-sm text-muted-foreground">
              {imported} lieux importés avec succès
            </p>
            <Button onClick={() => { onOpenChange(false); reset(); }}>
              Fermer
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

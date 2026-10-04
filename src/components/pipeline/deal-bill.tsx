'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Users, X } from 'lucide-react';
import { toast } from 'sonner';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useBands, useDealBands, useLinkBand, useUnlinkBand } from '@/hooks/use-bands';
import { BAND_ROLES, type BandRole } from '@/types/database';

const NONE = '__none__';

/** "Plateau": friend bands playing on this date (shared bills, date exchanges). */
export function DealBill({ dealId }: { dealId: string }) {
  const { data: bands } = useBands();
  const { data: links } = useDealBands({ dealId });
  const link = useLinkBand();
  const unlink = useUnlinkBand();
  const [role, setRole] = useState<BandRole>('co_bill');

  const linked = new Set((links || []).map((l) => l.band_id));
  const available = (bands || []).filter((b) => !linked.has(b.id));

  return (
    <div className="space-y-2">
      <Label className="text-xs flex items-center gap-1.5">
        <Users className="h-3.5 w-3.5" />
        Plateau — groupes amis ({links?.length ?? 0})
      </Label>
      {!!links?.length && (
        <div className="flex flex-wrap gap-1.5">
          {links.map((l) => (
            <Badge key={l.id} variant="secondary" className="gap-1 py-1">
              <Link href="/groupes" className="hover:underline">{l.band?.name}</Link>
              <span className="text-muted-foreground">· {BAND_ROLES.find((r) => r.key === l.role)?.label}</span>
              <button onClick={() => unlink.mutate(l.id)} title="Retirer du plateau" className="hover:text-destructive">
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
      {available.length > 0 ? (
        <div className="flex gap-2">
          <Select
            value={NONE}
            onValueChange={(bandId) =>
              bandId !== NONE &&
              link.mutate({ dealId, bandId, role }, { onError: () => toast.error("Erreur lors de l'ajout du groupe") })
            }
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>Ajouter un groupe…</SelectItem>
              {available.map((b) => (
                <SelectItem key={b.id} value={b.id}>
                  {b.name}
                  {b.city ? ` (${b.city})` : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={role} onValueChange={(v) => setRole(v as BandRole)}>
            <SelectTrigger className="h-8 text-xs w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {BAND_ROLES.map((r) => (
                <SelectItem key={r.key} value={r.key}>{r.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : (
        !bands?.length && (
          <p className="text-[11px] text-muted-foreground">
            Ajoute d&apos;abord des groupes dans <Link href="/groupes" className="text-primary hover:underline">Groupes amis</Link>.
          </p>
        )
      )}
    </div>
  );
}

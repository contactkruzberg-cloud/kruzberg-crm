'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Users, Plus, Trash2, MapPin, AtSign, Mail, Phone, Globe, ArrowLeftRight } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useBands, useCreateBand, useDealBands, useDeleteBand, useUpdateBand } from '@/hooks/use-bands';
import { BAND_ROLES, EXCHANGE_STATUSES, STAGES, type Band } from '@/types/database';
import { cn, dealLabel, formatDate } from '@/lib/utils';

const EXCHANGE_BADGE: Record<Band['exchange_status'], { label: string; variant: 'secondary' | 'warning' | 'success' } | null> = {
  none: null,
  we_owe: { label: 'On leur doit une date', variant: 'warning' },
  they_owe: { label: 'Ils nous doivent une date', variant: 'success' },
};

function BandDetail({ band }: { band: Band }) {
  const update = useUpdateBand();
  const remove = useDeleteBand();
  const { data: links } = useDealBands({ bandId: band.id });
  const save = (field: keyof Band, value: string | null) => {
    if ((band[field] ?? null) === value) return;
    update.mutate({ id: band.id, [field]: value } as Partial<Band> & { id: string });
  };
  const field = (key: keyof Band, label: string, icon: React.ReactNode, placeholder = '') => (
    <div className="space-y-1.5">
      <Label className="text-xs flex items-center gap-1">{icon} {label}</Label>
      <Input key={`${band.id}-${key}`} defaultValue={(band[key] as string) ?? ''} placeholder={placeholder} onBlur={(e) => save(key, e.target.value.trim() || null)} />
    </div>
  );

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between">
        <div>
          <CardTitle className="text-lg">{band.name}</CardTitle>
          {band.city && (
            <p className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
              <MapPin className="h-3.5 w-3.5" /> {band.city}
            </p>
          )}
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="text-muted-foreground hover:text-destructive"
          onClick={() => {
            if (!confirm(`Supprimer « ${band.name} » ?`)) return;
            remove.mutate(band.id, { onSuccess: () => toast.success('Groupe supprimé') });
          }}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <Label className="text-xs flex items-center gap-1"><ArrowLeftRight className="h-3 w-3" /> Échange de dates</Label>
          <Select value={band.exchange_status} onValueChange={(v) => save('exchange_status', v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {EXCHANGE_STATUSES.map((s) => (
                <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {field('name', 'Nom', <Users className="h-3 w-3" />)}
          {field('city', 'Ville', <MapPin className="h-3 w-3" />, 'Lyon')}
          {field('genre', 'Style', null, 'cold wave, post-punk…')}
          {field('contact_name', 'Contact', null, 'Prénom')}
          {field('email', 'Email', <Mail className="h-3 w-3" />)}
          {field('phone', 'Téléphone', <Phone className="h-3 w-3" />)}
          {field('instagram', 'Instagram', <AtSign className="h-3 w-3" />, '@groupe')}
          {field('website', 'Site / Bandcamp', <Globe className="h-3 w-3" />, 'https://…')}
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Notes</Label>
          <Textarea
            key={`${band.id}-notes`}
            defaultValue={band.notes ?? ''}
            onBlur={(e) => save('notes', e.target.value.trim() || null)}
            placeholder="Contexte, plans en cours, ce qu'on s'est promis…"
            className="min-h-[80px]"
          />
        </div>
        <div>
          <h3 className="text-sm font-medium mb-2">Dates ensemble ({links?.length ?? 0})</h3>
          {!links?.length ? (
            <p className="text-xs text-muted-foreground">
              Aucune date pour l&apos;instant. Ajoute ce groupe au plateau d&apos;une opportunité depuis le pipeline.
            </p>
          ) : (
            <div className="space-y-2">
              {links.map((l) => (
                <Link
                  key={l.id}
                  href={`/pipeline?deal=${l.deal_id}`}
                  className="flex items-center justify-between rounded-lg border p-2.5 text-sm hover:border-primary/50"
                >
                  <span className="truncate">{l.deal ? dealLabel(l.deal) : ''}</span>
                  <span className="flex items-center gap-2 shrink-0 text-xs text-muted-foreground">
                    {l.deal?.concert_date && formatDate(l.deal.concert_date)}
                    <Badge variant="secondary" className="text-[10px]">{BAND_ROLES.find((r) => r.key === l.role)?.label}</Badge>
                    <Badge variant="outline" className="text-[10px]">{STAGES.find((s) => s.key === l.deal?.stage)?.label}</Badge>
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default function GroupesPage() {
  const { data: bands, isLoading } = useBands();
  const create = useCreateBand();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [city, setCity] = useState('');
  const [filter, setFilter] = useState<'all' | 'we_owe' | 'they_owe'>('all');

  const list = (bands || []).filter((b) => filter === 'all' || b.exchange_status === filter);
  const selected = bands?.find((b) => b.id === selectedId) ?? null;

  const add = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    create.mutate(
      { name: name.trim(), city: city.trim() || null },
      {
        onSuccess: (b) => {
          setName('');
          setCity('');
          setSelectedId(b.id);
          toast.success('Groupe ajouté');
        },
        onError: () => toast.error("Erreur lors de l'ajout"),
      },
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Users className="h-6 w-6" /> Groupes amis
        </h1>
        <p className="text-sm text-muted-foreground">Plateaux partagés et échanges de dates avec les groupes de la scène.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-6">
        <div className="space-y-3">
          <form onSubmit={add} className="flex gap-2">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nom du groupe" />
            <Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Ville" className="w-32" />
            <Button type="submit" size="icon" disabled={!name.trim() || create.isPending} title="Ajouter">
              <Plus className="h-4 w-4" />
            </Button>
          </form>
          <div className="flex gap-1 flex-wrap">
            {([
              { key: 'all', label: 'Tous' },
              { key: 'they_owe', label: 'Ils nous doivent une date' },
              { key: 'we_owe', label: 'On leur doit une date' },
            ] as const).map((o) => (
              <button
                key={o.key}
                onClick={() => setFilter(o.key)}
                className={cn(
                  'px-2.5 py-1 rounded-full text-xs font-medium border transition-all',
                  filter === o.key ? 'bg-primary text-primary-foreground border-primary' : 'bg-card text-muted-foreground border-border',
                )}
              >
                {o.label}
              </button>
            ))}
          </div>
          {isLoading ? (
            <Skeleton className="h-40" />
          ) : list.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground border rounded-xl border-dashed text-sm">Aucun groupe</div>
          ) : (
            <div className="space-y-2">
              {list.map((b) => {
                const ex = EXCHANGE_BADGE[b.exchange_status];
                return (
                  <div
                    key={b.id}
                    onClick={() => setSelectedId(b.id)}
                    className={cn(
                      'rounded-lg border p-3 cursor-pointer transition-all hover:shadow-md',
                      selectedId === b.id ? 'border-primary/50 bg-primary/5' : '',
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="font-medium text-sm truncate">{b.name}</h3>
                        <p className="text-xs text-muted-foreground truncate">{[b.city, b.genre].filter(Boolean).join(' · ')}</p>
                      </div>
                      {ex && <Badge variant={ex.variant} className="text-[10px] shrink-0">{ex.label}</Badge>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <div>{selected ? <BandDetail band={selected} /> : <p className="text-sm text-muted-foreground">Sélectionne un groupe.</p>}</div>
      </div>
    </div>
  );
}

'use client';

import { useState } from 'react';
import type { TourStop } from '@/types/database';
import { STOP_TYPES } from '@/types/database';
import { useUpdateTourStop } from '@/hooks/use-tour-stops';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Hotel, Clock, User, AlertCircle } from 'lucide-react';

interface TourLogisticsProps {
  stops: TourStop[];
}

export function TourLogistics({ stops }: TourLogisticsProps) {
  const unbookedHotels = stops.filter((s) => s.hotel_name && !s.hotel_booked).length;

  if (stops.length === 0) {
    return (
      <div className="text-sm text-muted-foreground text-center py-10 border rounded-xl border-dashed">
        Ajoute des dates dans l&apos;onglet Itinéraire pour gérer la logistique.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {unbookedHotels > 0 && (
        <div className="flex items-center gap-2 rounded-lg border border-orange-500/30 bg-orange-500/5 px-3 py-2 text-xs">
          <AlertCircle className="h-4 w-4 text-orange-500" />
          <span>
            {unbookedHotels} hôtel{unbookedHotels > 1 ? 's' : ''} pas encore réservé
            {unbookedHotels > 1 ? 's' : ''}.
          </span>
        </div>
      )}
      {stops.map((stop, i) => (
        <StopLogisticsCard key={stop.id} stop={stop} index={i} />
      ))}
    </div>
  );
}

function StopLogisticsCard({ stop, index }: { stop: TourStop; index: number }) {
  const update = useUpdateTourStop();
  const typeMeta = STOP_TYPES.find((t) => t.key === stop.type);

  // local buffer so typing is smooth; persist on blur
  const [buf, setBuf] = useState({
    arrival_time: stop.arrival_time ?? '',
    load_in_time: stop.load_in_time ?? '',
    soundcheck_time: stop.soundcheck_time ?? '',
    doors_time: stop.doors_time ?? '',
    set_time: stop.set_time ?? '',
    on_site_contact: stop.on_site_contact ?? '',
    on_site_phone: stop.on_site_phone ?? '',
    hotel_name: stop.hotel_name ?? '',
    hotel_address: stop.hotel_address ?? '',
    hotel_cost: stop.hotel_cost?.toString() ?? '',
    hotel_rooms: stop.hotel_rooms?.toString() ?? '',
    notes: stop.notes ?? '',
  });

  const set = (key: keyof typeof buf, value: string) =>
    setBuf((b) => ({ ...b, [key]: value }));

  const saveText = (key: keyof typeof buf, original: string | null) => {
    const value = buf[key].trim();
    if (value === (original ?? '')) return;
    update.mutate({ id: stop.id, [key]: value || null });
  };

  const saveNumber = (key: 'hotel_cost' | 'hotel_rooms', original: number | null) => {
    const raw = buf[key].trim();
    const parsed =
      raw === '' ? null : key === 'hotel_rooms' ? parseInt(raw) : parseFloat(raw);
    if ((parsed ?? null) === (original ?? null)) return;
    update.mutate({ id: stop.id, [key]: parsed });
  };

  const title = stop.venue?.name || stop.city || typeMeta?.label || 'Étape';
  const dateStr = stop.stop_date
    ? new Date(stop.stop_date).toLocaleDateString('fr-FR', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
      })
    : '';

  return (
    <div className="rounded-xl border bg-card p-4 space-y-4">
      {/* header */}
      <div className="flex items-center gap-2 flex-wrap">
        <div
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
          style={{ backgroundColor: typeMeta?.color }}
        >
          {index + 1}
        </div>
        <span className="font-medium">{title}</span>
        {stop.type !== 'show' && (
          <Badge variant="secondary" className="text-[10px]">{typeMeta?.label}</Badge>
        )}
        <span className="text-xs text-muted-foreground capitalize ml-auto">{dateStr}</span>
      </div>

      {stop.type === 'show' && (
        <>
          {/* schedule */}
          <div className="space-y-2">
            <Label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Clock className="h-3.5 w-3.5" />
              Horaires
            </Label>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              {([
                ['arrival_time', 'Arrivée', stop.arrival_time],
                ['load_in_time', 'Load-in', stop.load_in_time],
                ['soundcheck_time', 'Balance', stop.soundcheck_time],
                ['doors_time', 'Portes', stop.doors_time],
                ['set_time', 'Set', stop.set_time],
              ] as const).map(([key, label, original]) => (
                <div key={key} className="space-y-1">
                  <span className="text-[10px] text-muted-foreground">{label}</span>
                  <Input
                    type="time"
                    value={buf[key]}
                    onChange={(e) => set(key, e.target.value)}
                    onBlur={() => saveText(key, original)}
                    className="h-8 text-xs"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* on-site contact */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <User className="h-3.5 w-3.5" />
                Contact sur place
              </Label>
              <Input
                value={buf.on_site_contact}
                onChange={(e) => set('on_site_contact', e.target.value)}
                onBlur={() => saveText('on_site_contact', stop.on_site_contact)}
                placeholder="Nom du régisseur..."
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Téléphone</Label>
              <Input
                value={buf.on_site_phone}
                onChange={(e) => set('on_site_phone', e.target.value)}
                onBlur={() => saveText('on_site_phone', stop.on_site_phone)}
                placeholder="06..."
                className="h-8 text-sm"
              />
            </div>
          </div>
        </>
      )}

      {/* hotel */}
      <div className="space-y-2 rounded-lg bg-muted/30 p-3">
        <div className="flex items-center justify-between">
          <Label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Hotel className="h-3.5 w-3.5" />
            Hébergement
          </Label>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Réservé</span>
            <Switch
              checked={stop.hotel_booked}
              onCheckedChange={(checked) => update.mutate({ id: stop.id, hotel_booked: checked })}
            />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <Input
            value={buf.hotel_name}
            onChange={(e) => set('hotel_name', e.target.value)}
            onBlur={() => saveText('hotel_name', stop.hotel_name)}
            placeholder="Nom de l'hôtel"
            className="h-8 text-sm"
          />
          <Input
            value={buf.hotel_address}
            onChange={(e) => set('hotel_address', e.target.value)}
            onBlur={() => saveText('hotel_address', stop.hotel_address)}
            placeholder="Adresse"
            className="h-8 text-sm"
          />
          <div className="flex gap-2">
            <Input
              type="number"
              value={buf.hotel_cost}
              onChange={(e) => set('hotel_cost', e.target.value)}
              onBlur={() => saveNumber('hotel_cost', stop.hotel_cost)}
              placeholder="Coût €"
              className="h-8 text-sm"
            />
            <Input
              type="number"
              value={buf.hotel_rooms}
              onChange={(e) => set('hotel_rooms', e.target.value)}
              onBlur={() => saveNumber('hotel_rooms', stop.hotel_rooms)}
              placeholder="Chambres"
              className="h-8 text-sm"
            />
          </div>
        </div>
      </div>

      {/* notes */}
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">Notes (backline, parking, catering...)</Label>
        <Textarea
          value={buf.notes}
          onChange={(e) => set('notes', e.target.value)}
          onBlur={() => saveText('notes', stop.notes)}
          className="min-h-[50px] text-sm"
        />
      </div>
    </div>
  );
}

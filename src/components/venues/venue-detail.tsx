'use client';

import { useState, useEffect, useCallback } from 'react';
import { useUpdateVenue, useDeleteVenue } from '@/hooks/use-venues';
import { useDeals } from '@/hooks/use-deals';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { VENUE_TYPES, STAGES, type Venue, type Contact, type VenueType } from '@/types/database';
import { cn, formatDate } from '@/lib/utils';
import { MapPin, Globe, AtSign, Phone, Mail, Star, Trash2, ExternalLink, User } from 'lucide-react';
import { toast } from 'sonner';

interface VenueDetailProps {
  venue: Venue;
  contacts: Contact[];
}

export function VenueDetail({ venue, contacts }: VenueDetailProps) {
  const updateVenue = useUpdateVenue();
  const deleteVenue = useDeleteVenue();
  const { data: deals } = useDeals();
  const [notes, setNotes] = useState(venue.notes || '');

  const venueContacts = contacts.filter((c) => c.venue_id === venue.id);
  const venueDeals = (deals || []).filter((d) => d.venue_id === venue.id);

  useEffect(() => {
    setNotes(venue.notes || '');
  }, [venue.id, venue.notes]);

  const saveField = useCallback(
    (field: string, value: string | number | null) => {
      updateVenue.mutate({ id: venue.id, [field]: value } as Partial<Venue> & { id: string });
    },
    [venue.id, updateVenue]
  );

  // Debounced notes save
  useEffect(() => {
    const timer = setTimeout(() => {
      if (notes !== (venue.notes || '')) {
        saveField('notes', notes);
      }
    }, 800);
    return () => clearTimeout(timer);
  }, [notes, venue.notes, saveField]);

  const handleDelete = () => {
    if (!confirm(`Supprimer "${venue.name}" ?`)) return;
    deleteVenue.mutate(venue.id, {
      onSuccess: () => toast.success('Lieu supprimé'),
    });
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between">
        <div>
          <CardTitle className="text-lg">{venue.name}</CardTitle>
          <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
            <MapPin className="h-3.5 w-3.5" />
            {venue.city}, {venue.country}
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" size="icon" onClick={handleDelete} className="text-muted-foreground hover:text-destructive">
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Quick info */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Type</Label>
            <Select
              value={venue.type}
              onValueChange={(v) => saveField('type', v)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {VENUE_TYPES.map((t) => (
                  <SelectItem key={t.key} value={t.key}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Capacité</Label>
            <Input
              type="number"
              defaultValue={venue.capacity ?? ''}
              onBlur={(e) => saveField('capacity', e.target.value ? parseInt(e.target.value) : null)}
              placeholder="200"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Fit Score</Label>
            <div className="flex items-center gap-1 pt-1">
              {Array.from({ length: 5 }).map((_, i) => (
                <button
                  key={i}
                  onClick={() => saveField('fit_score', i + 1)}
                  className="focus:outline-none"
                >
                  <Star
                    className={cn(
                      'h-5 w-5 transition-colors cursor-pointer',
                      i < venue.fit_score
                        ? 'text-yellow-500 fill-yellow-500'
                        : 'text-muted-foreground/30 hover:text-yellow-300'
                    )}
                  />
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Contact info */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs flex items-center gap-1"><Mail className="h-3 w-3" /> Email</Label>
            <Input
              defaultValue={venue.email || ''}
              onBlur={(e) => saveField('email', e.target.value || null)}
              placeholder="contact@venue.com"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs flex items-center gap-1"><Phone className="h-3 w-3" /> Téléphone</Label>
            <Input
              defaultValue={venue.phone || ''}
              onBlur={(e) => saveField('phone', e.target.value || null)}
              placeholder="06..."
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs flex items-center gap-1"><Globe className="h-3 w-3" /> Site web</Label>
            <Input
              defaultValue={venue.website || ''}
              onBlur={(e) => saveField('website', e.target.value || null)}
              placeholder="https://..."
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs flex items-center gap-1"><AtSign className="h-3 w-3" /> Instagram</Label>
            <Input
              defaultValue={venue.instagram || ''}
              onBlur={(e) => saveField('instagram', e.target.value || null)}
              placeholder="@venue"
            />
          </div>
        </div>

        {/* Notes */}
        <div className="space-y-1.5">
          <Label className="text-xs">Notes</Label>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Notes sur ce lieu..."
            className="min-h-[80px]"
          />
        </div>

        <Separator />

        {/* Linked contacts */}
        <div>
          <h3 className="text-sm font-medium mb-2 flex items-center gap-2">
            <User className="h-4 w-4" />
            Contacts ({venueContacts.length})
          </h3>
          {venueContacts.length === 0 ? (
            <p className="text-xs text-muted-foreground">Aucun contact lié</p>
          ) : (
            <div className="space-y-2">
              {venueContacts.map((c) => (
                <div key={c.id} className="flex items-center justify-between p-2 rounded-lg bg-muted/50">
                  <div>
                    <p className="text-sm font-medium">{c.name}</p>
                    <p className="text-xs text-muted-foreground">{c.role || 'Contact'}</p>
                  </div>
                  <Badge variant={c.tone === 'tu' ? 'default' : 'secondary'} className="text-[10px]">
                    {c.tone}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </div>

        <Separator />

        {/* Pipeline deals */}
        <div>
          <h3 className="text-sm font-medium mb-2">Pipeline ({venueDeals.length})</h3>
          {venueDeals.length === 0 ? (
            <p className="text-xs text-muted-foreground">Aucune opportunité</p>
          ) : (
            <div className="space-y-2">
              {venueDeals.map((d) => {
                const stageInfo = STAGES.find((s) => s.key === d.stage);
                return (
                  <div key={d.id} className="flex items-center justify-between p-2 rounded-lg bg-muted/50">
                    <span className={cn('text-xs font-medium px-2 py-0.5 rounded', stageInfo?.color)}>
                      {stageInfo?.label}
                    </span>
                    {d.concert_date && (
                      <span className="text-xs text-muted-foreground">
                        {formatDate(d.concert_date)}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

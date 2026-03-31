'use client';

import { useState, useEffect, useCallback } from 'react';
import { useUpdateVenue, useDeleteVenue } from '@/hooks/use-venues';
import { useDeals, useCreateDeal } from '@/hooks/use-deals';
import { useCreateContact } from '@/hooks/use-contacts';
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
import { MapPin, Globe, AtSign, Phone, Mail, Star, Trash2, ExternalLink, User, Plus, Send } from 'lucide-react';
import { toast } from 'sonner';

interface VenueDetailProps {
  venue: Venue;
  contacts: Contact[];
}

export function VenueDetail({ venue, contacts }: VenueDetailProps) {
  const updateVenue = useUpdateVenue();
  const deleteVenue = useDeleteVenue();
  const createDeal = useCreateDeal();
  const createContact = useCreateContact();
  const { data: deals } = useDeals();
  const [notes, setNotes] = useState(venue.notes || '');
  const [showAddContact, setShowAddContact] = useState(false);
  const [newContactName, setNewContactName] = useState('');
  const [newContactRole, setNewContactRole] = useState('');
  const [newContactEmail, setNewContactEmail] = useState('');
  const [newContactPhone, setNewContactPhone] = useState('');
  const [newContactTone, setNewContactTone] = useState<'tu' | 'vous'>('vous');

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

  const hasActiveDeal = venueDeals.some((d) => !['confirme', 'refuse'].includes(d.stage));

  const handleAddToPipeline = () => {
    const mainContact = venueContacts[0];
    createDeal.mutate(
      {
        venue_id: venue.id,
        contact_id: mainContact?.id || null,
        stage: 'a_contacter',
        priority: venue.fit_score >= 4 ? 'high' : 'medium',
      },
      {
        onSuccess: () => toast.success(`"${venue.name}" ajouté au pipeline`),
        onError: () => toast.error('Erreur lors de l\'ajout'),
      }
    );
  };

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
        {/* Quick actions */}
        <div className="flex gap-2 flex-wrap">
          {!hasActiveDeal && (
            <Button
              size="sm"
              className="gap-2"
              onClick={handleAddToPipeline}
              disabled={createDeal.isPending}
            >
              <Plus className="h-4 w-4" />
              {createDeal.isPending ? 'Ajout...' : 'Ajouter au pipeline'}
            </Button>
          )}
          {hasActiveDeal && (
            <Badge variant="success" className="text-xs py-1">
              Déjà dans le pipeline
            </Badge>
          )}
        </div>

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
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium flex items-center gap-2">
              <User className="h-4 w-4" />
              Contacts ({venueContacts.length})
            </h3>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-xs h-7"
              onClick={() => setShowAddContact(!showAddContact)}
            >
              <Plus className="h-3 w-3" />
              Ajouter
            </Button>
          </div>

          {/* Inline add contact form */}
          {showAddContact && (
            <div className="rounded-lg border p-3 mb-3 space-y-3 bg-muted/30">
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-[11px]">Nom *</Label>
                  <Input
                    value={newContactName}
                    onChange={(e) => setNewContactName(e.target.value)}
                    placeholder="Jean Dupont"
                    className="h-8 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px]">Rôle</Label>
                  <Input
                    value={newContactRole}
                    onChange={(e) => setNewContactRole(e.target.value)}
                    placeholder="Programmateur"
                    className="h-8 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px]">Email</Label>
                  <Input
                    value={newContactEmail}
                    onChange={(e) => setNewContactEmail(e.target.value)}
                    placeholder="email@venue.com"
                    className="h-8 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px]">Téléphone</Label>
                  <Input
                    value={newContactPhone}
                    onChange={(e) => setNewContactPhone(e.target.value)}
                    placeholder="06..."
                    className="h-8 text-xs"
                  />
                </div>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex gap-1.5">
                  <button
                    onClick={() => setNewContactTone('tu')}
                    className={cn(
                      'px-2.5 py-1 rounded text-xs font-medium border transition-all',
                      newContactTone === 'tu' ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground'
                    )}
                  >
                    Tu
                  </button>
                  <button
                    onClick={() => setNewContactTone('vous')}
                    className={cn(
                      'px-2.5 py-1 rounded text-xs font-medium border transition-all',
                      newContactTone === 'vous' ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground'
                    )}
                  >
                    Vous
                  </button>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs h-7"
                    onClick={() => {
                      setShowAddContact(false);
                      setNewContactName('');
                      setNewContactRole('');
                      setNewContactEmail('');
                      setNewContactPhone('');
                      setNewContactTone('vous');
                    }}
                  >
                    Annuler
                  </Button>
                  <Button
                    size="sm"
                    className="text-xs h-7"
                    disabled={!newContactName.trim() || createContact.isPending}
                    onClick={() => {
                      createContact.mutate(
                        {
                          venue_id: venue.id,
                          name: newContactName.trim(),
                          role: newContactRole.trim() || null,
                          email: newContactEmail.trim() || null,
                          phone: newContactPhone.trim() || null,
                          tone: newContactTone,
                        },
                        {
                          onSuccess: () => {
                            toast.success('Contact ajouté');
                            setShowAddContact(false);
                            setNewContactName('');
                            setNewContactRole('');
                            setNewContactEmail('');
                            setNewContactPhone('');
                            setNewContactTone('vous');
                          },
                        }
                      );
                    }}
                  >
                    {createContact.isPending ? '...' : 'Créer'}
                  </Button>
                </div>
              </div>
            </div>
          )}

          {venueContacts.length === 0 && !showAddContact ? (
            <p className="text-xs text-muted-foreground">Aucun contact lié</p>
          ) : (
            <div className="space-y-2">
              {venueContacts.map((c) => (
                <div key={c.id} className="flex items-center justify-between p-2 rounded-lg bg-muted/50">
                  <div>
                    <p className="text-sm font-medium">{c.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {c.role || 'Contact'}
                      {c.email && ` · ${c.email}`}
                    </p>
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

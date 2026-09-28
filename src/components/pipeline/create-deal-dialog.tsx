'use client';

import { useState } from 'react';
import { useVenues } from '@/hooks/use-venues';
import { useContacts } from '@/hooks/use-contacts';
import { useCreateDeal } from '@/hooks/use-deals';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { STAGES, PRIORITIES, type DealStage, type DealPriority } from '@/types/database';
import { toast } from 'sonner';

const NONE = '__none__';

interface CreateDealDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Prefill from the pipeline search ("no opportunity yet for this venue / contact"). */
  initialVenueId?: string | null;
  initialContactId?: string | null;
}

export function CreateDealDialog({ open, onOpenChange, initialVenueId, initialContactId }: CreateDealDialogProps) {
  const { data: venues } = useVenues();
  const { data: contacts } = useContacts();
  const createDeal = useCreateDeal();
  const [title, setTitle] = useState('');
  // Prefill is read once: the parent remounts the dialog (key) for each new prefill.
  const [venueId, setVenueId] = useState(
    () => initialVenueId || contacts?.find((c) => c.id === initialContactId)?.venue_id || NONE
  );
  const [contactId, setContactId] = useState(initialContactId || NONE);
  const [stage, setStage] = useState<DealStage>('a_contacter');
  const [priority, setPriority] = useState<DealPriority>('medium');
  const [concertDate, setConcertDate] = useState('');
  const [fee, setFee] = useState('');

  const hasVenue = venueId !== NONE;
  // With a venue: its contacts. Without: every contact (deal tied to a person).
  const contactOptions = (contacts || []).filter((c) => !hasVenue || c.venue_id === venueId);

  const handleVenueChange = (value: string) => {
    setVenueId(value);
    const contact = contacts?.find((c) => c.id === contactId);
    if (value !== NONE && contact && contact.venue_id !== value) setContactId(NONE);
  };

  const handleContactChange = (value: string) => {
    setContactId(value);
    // Picking a contact first: attach their venue too, if they have one.
    const contact = contacts?.find((c) => c.id === value);
    if (!hasVenue && contact?.venue_id) setVenueId(contact.venue_id);
  };

  const handleCreate = () => {
    if (!hasVenue && contactId === NONE) {
      toast.error('Choisissez un lieu ou un contact');
      return;
    }

    createDeal.mutate(
      {
        title: title.trim() || null,
        venue_id: hasVenue ? venueId : null,
        contact_id: contactId === NONE ? null : contactId,
        stage,
        priority,
        concert_date: concertDate || null,
        fee: fee ? parseFloat(fee) : null,
        first_contact_at: stage !== 'a_contacter' ? new Date().toISOString() : null,
        last_message_at: stage !== 'a_contacter' ? new Date().toISOString() : null,
      },
      {
        onSuccess: () => {
          toast.success('Opportunité créée');
          onOpenChange(false);
          setTitle('');
          setVenueId(NONE);
          setContactId(NONE);
          setStage('a_contacter');
          setPriority('medium');
          setConcertDate('');
          setFee('');
        },
        onError: () => {
          toast.error('Erreur lors de la création');
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nouvelle opportunité</DialogTitle>
          <DialogDescription>
            Créez une nouvelle opportunité dans votre pipeline
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Nom de l&apos;opportunité</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex. Première partie, Candidature headline… (sinon : nom du lieu)"
            />
          </div>

          <p className="text-xs text-muted-foreground">
            Lieu ou contact obligatoire (au moins l&apos;un des deux).
          </p>

          <div className="space-y-2">
            <Label>Lieu</Label>
            <Select value={venueId} onValueChange={handleVenueChange}>
              <SelectTrigger>
                <SelectValue placeholder="Sélectionner un lieu" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Aucun lieu</SelectItem>
                {venues?.map((v) => (
                  <SelectItem key={v.id} value={v.id}>
                    {v.name} — {v.city}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Contact</Label>
            <Select value={contactId} onValueChange={handleContactChange}>
              <SelectTrigger>
                <SelectValue placeholder="Sélectionner un contact" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Aucun contact</SelectItem>
                {contactOptions.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                    {!hasVenue && c.venue?.name ? ` — ${c.venue.name}` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {hasVenue && contactOptions.length === 0 && (
              <p className="text-[11px] text-muted-foreground">Aucun contact rattaché à ce lieu.</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Stage</Label>
              <Select value={stage} onValueChange={(v) => setStage(v as DealStage)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STAGES.map((s) => (
                    <SelectItem key={s.key} value={s.key}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Priorité</Label>
              <Select value={priority} onValueChange={(v) => setPriority(v as DealPriority)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRIORITIES.map((p) => (
                    <SelectItem key={p.key} value={p.key}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Date de concert</Label>
              <Input
                type="date"
                value={concertDate}
                onChange={(e) => setConcertDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Cachet (€)</Label>
              <Input
                type="number"
                value={fee}
                onChange={(e) => setFee(e.target.value)}
                placeholder="0"
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Annuler
            </Button>
            <Button onClick={handleCreate} disabled={createDeal.isPending}>
              {createDeal.isPending ? 'Création...' : 'Créer'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

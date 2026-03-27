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

interface CreateDealDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateDealDialog({ open, onOpenChange }: CreateDealDialogProps) {
  const { data: venues } = useVenues();
  const { data: contacts } = useContacts();
  const createDeal = useCreateDeal();
  const [venueId, setVenueId] = useState('');
  const [contactId, setContactId] = useState('');
  const [stage, setStage] = useState<DealStage>('a_contacter');
  const [priority, setPriority] = useState<DealPriority>('medium');
  const [concertDate, setConcertDate] = useState('');
  const [fee, setFee] = useState('');

  const venueContacts = contacts?.filter((c) => c.venue_id === venueId) || [];

  const handleCreate = () => {
    if (!venueId) {
      toast.error('Veuillez sélectionner un lieu');
      return;
    }

    createDeal.mutate(
      {
        venue_id: venueId,
        contact_id: contactId || null,
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
          setVenueId('');
          setContactId('');
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
            <Label>Lieu *</Label>
            <Select value={venueId} onValueChange={setVenueId}>
              <SelectTrigger>
                <SelectValue placeholder="Sélectionner un lieu" />
              </SelectTrigger>
              <SelectContent>
                {venues?.map((v) => (
                  <SelectItem key={v.id} value={v.id}>
                    {v.name} — {v.city}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {venueContacts.length > 0 && (
            <div className="space-y-2">
              <Label>Contact</Label>
              <Select value={contactId} onValueChange={setContactId}>
                <SelectTrigger>
                  <SelectValue placeholder="Sélectionner un contact" />
                </SelectTrigger>
                <SelectContent>
                  {venueContacts.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

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

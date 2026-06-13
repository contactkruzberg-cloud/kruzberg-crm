'use client';

import { useState, useMemo, useEffect } from 'react';
import { useVenues } from '@/hooks/use-venues';
import { useCreateContact } from '@/hooks/use-contacts';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { CreateVenueDialog } from './create-venue-dialog';
import { Plus, X } from 'lucide-react';
import type { Contact, ContactMethod, ContactTone, Venue } from '@/types/database';
import { toast } from 'sonner';

interface CreateContactDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // Pre-select a venue (e.g. when opening from a venue context).
  defaultVenueId?: string | null;
  onCreated?: (contact: Contact) => void;
}

const NO_VENUE = '__none__';

export function CreateContactDialog({
  open,
  onOpenChange,
  defaultVenueId,
  onCreated,
}: CreateContactDialogProps) {
  const { data: venues } = useVenues();
  const createContact = useCreateContact();

  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [tone, setTone] = useState<ContactTone>('vous');
  const [prefMethod, setPrefMethod] = useState<ContactMethod>('email');
  const [notes, setNotes] = useState('');
  const [venueId, setVenueId] = useState<string>(defaultVenueId || NO_VENUE);
  const [showCreateVenue, setShowCreateVenue] = useState(false);

  // Sync venueId when defaultVenueId changes or dialog opens
  useEffect(() => {
    if (open) {
      setVenueId(defaultVenueId || NO_VENUE);
    }
  }, [open, defaultVenueId]);

  const sortedVenues = useMemo(() => {
    return [...(venues || [])].sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  }, [venues]);

  const resetForm = () => {
    setName('');
    setRole('');
    setEmail('');
    setPhone('');
    setTone('vous');
    setPrefMethod('email');
    setNotes('');
    setVenueId(NO_VENUE);
  };

  const handleCreate = async () => {
    if (!name.trim()) {
      toast.error('Le nom est requis');
      return;
    }

    try {
      const contact = await createContact.mutateAsync({
        venue_id: venueId === NO_VENUE ? null : venueId,
        name: name.trim(),
        role: role.trim() || null,
        email: email.trim() || null,
        phone: phone.trim() || null,
        tone,
        pref_method: prefMethod,
        notes: notes.trim() || null,
      });

      toast.success(`"${contact.name}" ajouté`);
      onCreated?.(contact);
      onOpenChange(false);
      resetForm();
    } catch {
      toast.error('Erreur lors de la création');
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ajouter un contact</DialogTitle>
            <DialogDescription>
              Un contact peut exister sans lieu associé. Vous pourrez le lier plus tard.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2 col-span-2">
                <Label>Nom *</Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Jean Dupont"
                  autoFocus
                />
              </div>
              <div className="space-y-2">
                <Label>Rôle</Label>
                <Input
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  placeholder="Programmateur"
                />
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="email@..."
                />
              </div>
              <div className="space-y-2">
                <Label>Téléphone</Label>
                <Input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="06..."
                />
              </div>
              <div className="space-y-2">
                <Label>Méthode préférée</Label>
                <Select value={prefMethod} onValueChange={(v) => setPrefMethod(v as ContactMethod)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="email">Email</SelectItem>
                    <SelectItem value="phone">Téléphone</SelectItem>
                    <SelectItem value="instagram">Instagram</SelectItem>
                    <SelectItem value="other">Autre</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2 col-span-2">
                <Label>Ton</Label>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant={tone === 'tu' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setTone('tu')}
                  >
                    Tu
                  </Button>
                  <Button
                    type="button"
                    variant={tone === 'vous' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setTone('vous')}
                  >
                    Vous
                  </Button>
                </div>
              </div>

              {/* Venue association */}
              <div className="space-y-2 col-span-2">
                <Label>Lieu associé (optionnel)</Label>
                <div className="flex gap-2">
                  <div className="flex-1 flex items-center gap-1">
                    <Select value={venueId} onValueChange={setVenueId}>
                      <SelectTrigger className="flex-1">
                        <SelectValue placeholder="Aucun lieu" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NO_VENUE}>Aucun lieu</SelectItem>
                        {sortedVenues.map((v) => (
                          <SelectItem key={v.id} value={v.id}>
                            {v.name}{v.city ? ` — ${v.city}` : ''}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {venueId !== NO_VENUE && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9 text-muted-foreground"
                        onClick={() => setVenueId(NO_VENUE)}
                        title="Retirer l'association"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    className="gap-1.5 shrink-0"
                    onClick={() => setShowCreateVenue(true)}
                  >
                    <Plus className="h-4 w-4" />
                    Lieu
                  </Button>
                </div>
              </div>

              <div className="space-y-2 col-span-2">
                <Label>Notes</Label>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Infos utiles sur ce contact..."
                  className="min-h-[60px]"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Annuler
              </Button>
              <Button onClick={handleCreate} disabled={createContact.isPending}>
                {createContact.isPending ? 'Création...' : 'Créer le contact'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Stacked venue creation dialog */}
      <CreateVenueDialog
        open={showCreateVenue}
        onOpenChange={setShowCreateVenue}
        onCreated={(venue) => setVenueId(venue.id)}
      />
    </>
  );
}

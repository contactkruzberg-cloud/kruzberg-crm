'use client';

import { useState } from 'react';
import { useCreateVenue } from '@/hooks/use-venues';
import { useCreateContact } from '@/hooks/use-contacts';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { VENUE_TYPES, type VenueType } from '@/types/database';
import { toast } from 'sonner';

interface CreateVenueDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateVenueDialog({ open, onOpenChange }: CreateVenueDialogProps) {
  const createVenue = useCreateVenue();
  const createContact = useCreateContact();

  const [name, setName] = useState('');
  const [type, setType] = useState<VenueType>('bar');
  const [city, setCity] = useState('');
  const [email, setEmail] = useState('');
  const [capacity, setCapacity] = useState('');
  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');

  const handleCreate = async () => {
    if (!name.trim()) {
      toast.error('Le nom est requis');
      return;
    }

    try {
      const venue = await createVenue.mutateAsync({
        name: name.trim(),
        type,
        city: city.trim(),
        email: email || null,
        capacity: capacity ? parseInt(capacity) : null,
      });

      // Auto-create linked contact if name provided
      if (contactName.trim()) {
        await createContact.mutateAsync({
          venue_id: venue.id,
          name: contactName.trim(),
          email: contactEmail || email || null,
        });
      }

      toast.success(`"${venue.name}" ajouté`);
      onOpenChange(false);
      resetForm();
    } catch {
      toast.error('Erreur lors de la création');
    }
  };

  const resetForm = () => {
    setName('');
    setType('bar');
    setCity('');
    setEmail('');
    setCapacity('');
    setContactName('');
    setContactEmail('');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Ajouter un lieu</DialogTitle>
          <DialogDescription>
            Ajoutez un nouveau lieu et un contact optionnel
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2 col-span-2">
              <Label>Nom du lieu *</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Le Petit Bain"
              />
            </div>
            <div className="space-y-2">
              <Label>Type</Label>
              <Select value={type} onValueChange={(v) => setType(v as VenueType)}>
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
            <div className="space-y-2">
              <Label>Ville</Label>
              <Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Paris" />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="booking@..." />
            </div>
            <div className="space-y-2">
              <Label>Capacité</Label>
              <Input
                type="number"
                value={capacity}
                onChange={(e) => setCapacity(e.target.value)}
                placeholder="200"
              />
            </div>
          </div>

          <Separator />

          <div className="space-y-3">
            <p className="text-sm font-medium">Contact (optionnel)</p>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Nom</Label>
                <Input
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                  placeholder="Jean Dupont"
                />
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                  placeholder="jean@venue.com"
                />
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Annuler
            </Button>
            <Button onClick={handleCreate} disabled={createVenue.isPending}>
              {createVenue.isPending ? 'Création...' : 'Créer'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

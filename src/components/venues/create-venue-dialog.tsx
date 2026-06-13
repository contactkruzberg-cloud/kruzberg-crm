'use client';

import { useState } from 'react';
import { useCreateVenue } from '@/hooks/use-venues';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { VENUE_TYPES, type Venue, type VenueType } from '@/types/database';
import { UserPlus } from 'lucide-react';
import { toast } from 'sonner';

interface CreateVenueDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // Called after the venue is created (any path).
  onCreated?: (venue: Venue) => void;
  // If provided, a secondary "Créer et ajouter un contact" button is shown
  // and this callback is invoked with the created venue so the parent can
  // open a contact dialog pre-filled with this venue.
  onCreatedAddContact?: (venue: Venue) => void;
}

export function CreateVenueDialog({
  open,
  onOpenChange,
  onCreated,
  onCreatedAddContact,
}: CreateVenueDialogProps) {
  const createVenue = useCreateVenue();

  const [name, setName] = useState('');
  const [type, setType] = useState<VenueType>('bar');
  const [address, setAddress] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [city, setCity] = useState('');
  const [country, setCountry] = useState('France');
  const [capacity, setCapacity] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [website, setWebsite] = useState('');
  const [instagram, setInstagram] = useState('');
  const [notes, setNotes] = useState('');

  const resetForm = () => {
    setName('');
    setType('bar');
    setAddress('');
    setPostalCode('');
    setCity('');
    setCountry('France');
    setCapacity('');
    setEmail('');
    setPhone('');
    setWebsite('');
    setInstagram('');
    setNotes('');
  };

  const handleCreate = async (thenAddContact: boolean) => {
    if (!name.trim()) {
      toast.error('Le nom est requis');
      return;
    }

    try {
      const venue = await createVenue.mutateAsync({
        name: name.trim(),
        type,
        address: address.trim() || null,
        postal_code: postalCode.trim() || null,
        city: city.trim(),
        country: country.trim() || 'France',
        capacity: capacity ? parseInt(capacity) : null,
        email: email.trim() || null,
        phone: phone.trim() || null,
        website: website.trim() || null,
        instagram: instagram.trim() || null,
        notes: notes.trim() || null,
      });

      toast.success(`"${venue.name}" ajouté`);
      onCreated?.(venue);
      onOpenChange(false);
      resetForm();

      if (thenAddContact) {
        onCreatedAddContact?.(venue);
      }
    } catch {
      toast.error('Erreur lors de la création');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Ajouter un lieu</DialogTitle>
          <DialogDescription>
            Renseignez les informations du lieu. Vous pourrez y associer des contacts ensuite.
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
                autoFocus
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
              <Label>Capacité</Label>
              <Input
                type="number"
                value={capacity}
                onChange={(e) => setCapacity(e.target.value)}
                placeholder="200"
              />
            </div>
            <div className="space-y-2 col-span-2">
              <Label>Adresse</Label>
              <Input
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="12 rue de la Musique"
              />
            </div>
            <div className="space-y-2">
              <Label>Code postal</Label>
              <Input
                value={postalCode}
                onChange={(e) => setPostalCode(e.target.value)}
                placeholder="75000"
              />
            </div>
            <div className="space-y-2">
              <Label>Ville</Label>
              <Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Paris" />
            </div>
            <div className="space-y-2 col-span-2">
              <Label>Pays</Label>
              <Input value={country} onChange={(e) => setCountry(e.target.value)} placeholder="France" />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="booking@..." />
            </div>
            <div className="space-y-2">
              <Label>Téléphone</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="06..." />
            </div>
            <div className="space-y-2">
              <Label>Site web</Label>
              <Input value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://..." />
            </div>
            <div className="space-y-2">
              <Label>Instagram</Label>
              <Input value={instagram} onChange={(e) => setInstagram(e.target.value)} placeholder="@lieu" />
            </div>
            <div className="space-y-2 col-span-2">
              <Label>Notes</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Infos utiles, contexte, programmation..."
                className="min-h-[60px]"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2 flex-wrap">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Annuler
            </Button>
            {onCreatedAddContact && (
              <Button
                variant="outline"
                className="gap-2"
                onClick={() => handleCreate(true)}
                disabled={createVenue.isPending}
              >
                <UserPlus className="h-4 w-4" />
                Créer et ajouter un contact
              </Button>
            )}
            <Button onClick={() => handleCreate(false)} disabled={createVenue.isPending}>
              {createVenue.isPending ? 'Création...' : 'Créer le lieu'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

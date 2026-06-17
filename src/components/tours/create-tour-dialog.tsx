'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useCreateTour } from '@/hooks/use-tours';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

interface CreateTourDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateTourDialog({ open, onOpenChange }: CreateTourDialogProps) {
  const createTour = useCreateTour();
  const router = useRouter();

  const [name, setName] = useState('');
  const [membersCount, setMembersCount] = useState('4');
  const [vehicleLabel, setVehicleLabel] = useState('');
  const [fuelConsumption, setFuelConsumption] = useState('8');
  const [fuelPrice, setFuelPrice] = useState('1.8');
  const [perDiem, setPerDiem] = useState('0');

  const resetForm = () => {
    setName('');
    setMembersCount('4');
    setVehicleLabel('');
    setFuelConsumption('8');
    setFuelPrice('1.8');
    setPerDiem('0');
  };

  const handleCreate = async () => {
    if (!name.trim()) {
      toast.error('Le nom est requis');
      return;
    }
    try {
      const tour = await createTour.mutateAsync({
        name: name.trim(),
        members_count: parseInt(membersCount) || 4,
        vehicle_label: vehicleLabel.trim() || null,
        fuel_consumption: parseFloat(fuelConsumption) || 8,
        fuel_price: parseFloat(fuelPrice) || 1.8,
        per_diem: parseFloat(perDiem) || 0,
      });
      toast.success(`Tournée "${tour.name}" créée`);
      onOpenChange(false);
      resetForm();
      router.push(`/tours/${tour.id}`);
    } catch {
      toast.error('Erreur lors de la création');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nouvelle tournée</DialogTitle>
          <DialogDescription>
            Crée une tournée puis ajoute-y tes dates de concert. Les paramètres restent modifiables.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Nom de la tournée *</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Tournée Sud-Ouest Automne 2026"
              autoFocus
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Personnes en tournée</Label>
              <Input
                type="number"
                min="1"
                value={membersCount}
                onChange={(e) => setMembersCount(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Véhicule</Label>
              <Input
                value={vehicleLabel}
                onChange={(e) => setVehicleLabel(e.target.value)}
                placeholder="Van diesel"
              />
            </div>
            <div className="space-y-2">
              <Label>Conso (L/100km)</Label>
              <Input
                type="number"
                step="0.1"
                value={fuelConsumption}
                onChange={(e) => setFuelConsumption(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Prix carburant (€/L)</Label>
              <Input
                type="number"
                step="0.01"
                value={fuelPrice}
                onChange={(e) => setFuelPrice(e.target.value)}
              />
            </div>
            <div className="space-y-2 col-span-2">
              <Label>Per-diem (€/personne/jour)</Label>
              <Input
                type="number"
                step="1"
                value={perDiem}
                onChange={(e) => setPerDiem(e.target.value)}
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Annuler
            </Button>
            <Button onClick={handleCreate} disabled={createTour.isPending}>
              {createTour.isPending ? 'Création...' : 'Créer la tournée'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { useAppStore } from '@/stores/app-store';
import { CreateDealDialog } from '@/components/pipeline/create-deal-dialog';
import { CreateVenueDialog } from '@/components/venues/create-venue-dialog';
import { CreateContactDialog } from '@/components/venues/create-contact-dialog';
import { CreateTourDialog } from '@/components/tours/create-tour-dialog';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useCreateTask } from '@/hooks/use-tasks';
import { useCreateBand } from '@/hooks/use-bands';

/** Quick form for the two entities without a dedicated dialog: task and friend band. */
function QuickCreateDialog({ kind, onClose }: { kind: 'task' | 'band'; onClose: () => void }) {
  const router = useRouter();
  const createTask = useCreateTask();
  const createBand = useCreateBand();
  const [name, setName] = useState('');
  const [extra, setExtra] = useState('');
  const pending = createTask.isPending || createBand.isPending;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    const done = () => onClose();
    if (kind === 'task') {
      createTask.mutate(
        { title: name.trim(), due_date: extra || null, deal_id: null, venue_id: null },
        { onSuccess: () => (toast.success('Tâche ajoutée'), done()), onError: () => toast.error("Erreur lors de l'ajout") },
      );
    } else {
      createBand.mutate(
        { name: name.trim(), city: extra.trim() || null },
        {
          onSuccess: () => {
            toast.success('Groupe ajouté');
            done();
            router.push('/groupes');
          },
          onError: () => toast.error("Erreur lors de l'ajout"),
        },
      );
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{kind === 'task' ? 'Nouvelle tâche' : 'Nouveau groupe ami'}</DialogTitle>
          <DialogDescription>
            {kind === 'task' ? 'Une chose à faire, avec une échéance facultative.' : 'Un groupe de la scène pour les plateaux et échanges de dates.'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label>{kind === 'task' ? 'Tâche' : 'Nom du groupe'}</Label>
            <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder={kind === 'task' ? 'Envoyer l’EPK à…' : 'Rendez-Vous'} />
          </div>
          <div className="space-y-1.5">
            <Label>{kind === 'task' ? 'Échéance' : 'Ville'}</Label>
            <Input type={kind === 'task' ? 'date' : 'text'} value={extra} onChange={(e) => setExtra(e.target.value)} placeholder={kind === 'band' ? 'Lyon' : undefined} />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Annuler
            </Button>
            <Button type="submit" disabled={!name.trim() || pending}>
              Créer
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Dialogs opened by "+ Nouveau" (header) and the ⌘K palette, available on every page. */
export function GlobalCreate() {
  const intent = useAppStore((s) => s.createIntent);
  const openCreate = useAppStore((s) => s.openCreate);
  const close = useAppStore((s) => s.closeCreate);
  const onOpenChange = (open: boolean) => !open && close();

  return (
    <>
      <CreateDealDialog open={intent?.kind === 'deal'} onOpenChange={onOpenChange} initialVenueId={intent?.venueId} />
      <CreateVenueDialog
        open={intent?.kind === 'venue'}
        onOpenChange={onOpenChange}
        onCreatedAddContact={(venue) => openCreate('contact', venue.id)}
      />
      <CreateContactDialog open={intent?.kind === 'contact'} onOpenChange={onOpenChange} defaultVenueId={intent?.venueId ?? null} />
      <CreateTourDialog open={intent?.kind === 'tour'} onOpenChange={onOpenChange} />
      {(intent?.kind === 'task' || intent?.kind === 'band') && <QuickCreateDialog key={intent.kind} kind={intent.kind} onClose={close} />}
    </>
  );
}

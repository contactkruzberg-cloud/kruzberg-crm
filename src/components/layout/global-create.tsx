'use client';

import { useState } from 'react';
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

/** Quick form for the entity without a dedicated dialog: task. */
function QuickTaskDialog({ onClose }: { onClose: () => void }) {
  const createTask = useCreateTask();
  const [name, setName] = useState('');
  const [due, setDue] = useState('');

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    createTask.mutate(
      { title: name.trim(), due_date: due || null, deal_id: null, venue_id: null },
      { onSuccess: () => (toast.success('Tâche ajoutée'), onClose()), onError: () => toast.error("Erreur lors de l'ajout") },
    );
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Nouvelle tâche</DialogTitle>
          <DialogDescription>Une chose à faire, avec une échéance facultative.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Tâche</Label>
            <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Envoyer l’EPK à…" />
          </div>
          <div className="space-y-1.5">
            <Label>Échéance</Label>
            <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Annuler
            </Button>
            <Button type="submit" disabled={!name.trim() || createTask.isPending}>
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
      {intent?.kind === 'task' && <QuickTaskDialog onClose={close} />}
    </>
  );
}

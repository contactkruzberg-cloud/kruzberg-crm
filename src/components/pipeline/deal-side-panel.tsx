'use client';

import { useState, useEffect, useCallback } from 'react';
import { useDeal, useUpdateDeal } from '@/hooks/use-deals';
import { useActivities, useCreateActivity } from '@/hooks/use-activities';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { STAGES, PRIORITIES, type DealStage, type DealPriority } from '@/types/database';
import { formatDate, formatRelativeDate, cn } from '@/lib/utils';
import { X, Calendar, MapPin, Mail, ArrowRightLeft, StickyNote } from 'lucide-react';
import { toast } from 'sonner';
import { motion } from 'framer-motion';

interface DealSidePanelProps {
  dealId: string;
  onClose: () => void;
}

export function DealSidePanel({ dealId, onClose }: DealSidePanelProps) {
  const { data: deal, isLoading } = useDeal(dealId);
  const { data: activities } = useActivities(50);
  const updateDeal = useUpdateDeal();
  const createActivity = useCreateActivity();
  const [notes, setNotes] = useState('');
  const [newNote, setNewNote] = useState('');

  useEffect(() => {
    if (deal?.notes) setNotes(deal.notes);
  }, [deal?.notes]);

  // Debounced auto-save for notes
  const saveNotes = useCallback(
    (value: string) => {
      if (!deal) return;
      const timer = setTimeout(() => {
        updateDeal.mutate({ id: deal.id, notes: value });
      }, 800);
      return () => clearTimeout(timer);
    },
    [deal, updateDeal]
  );

  useEffect(() => {
    const cleanup = saveNotes(notes);
    return cleanup;
  }, [notes, saveNotes]);

  const handleStageChange = (stage: DealStage) => {
    if (!deal) return;
    updateDeal.mutate({ id: deal.id, stage }, {
      onSuccess: () => toast.success(`Stage mis à jour`),
    });
  };

  const handlePriorityChange = (priority: DealPriority) => {
    if (!deal) return;
    updateDeal.mutate({ id: deal.id, priority });
  };

  const handleAddNote = () => {
    if (!deal || !newNote.trim()) return;
    createActivity.mutate({
      deal_id: deal.id,
      venue_id: deal.venue_id,
      contact_id: deal.contact_id,
      type: 'note',
      content: newNote.trim(),
    }, {
      onSuccess: () => {
        setNewNote('');
        toast.success('Note ajoutée');
      },
    });
  };

  const dealActivities = (activities || []).filter(
    (a) => a.deal_id === dealId
  );

  const ACTIVITY_ICONS: Record<string, typeof Mail> = {
    email_sent: Mail,
    reply_received: Mail,
    status_change: ArrowRightLeft,
    note: StickyNote,
  };

  return (
    <motion.div
      initial={{ x: '100%' }}
      animate={{ x: 0 }}
      exit={{ x: '100%' }}
      transition={{ type: 'spring', damping: 25, stiffness: 200 }}
      className="fixed right-0 top-0 z-50 h-screen w-full max-w-md border-l bg-card shadow-2xl"
    >
      <div className="flex items-center justify-between p-4 border-b">
        <h2 className="text-lg font-semibold truncate">
          {isLoading ? <Skeleton className="h-6 w-32" /> : deal?.venue?.name || 'Deal'}
        </h2>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {isLoading ? (
        <div className="p-4 space-y-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-10" />
          ))}
        </div>
      ) : deal ? (
        <ScrollArea className="h-[calc(100vh-57px)]">
          <div className="p-4 space-y-5">
            {/* Venue info */}
            {deal.venue && (
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <MapPin className="h-3.5 w-3.5" />
                  {deal.venue.city}, {deal.venue.country}
                </div>
                {deal.concert_date && (
                  <div className="flex items-center gap-2 text-sm text-primary">
                    <Calendar className="h-3.5 w-3.5" />
                    Concert: {formatDate(deal.concert_date)}
                  </div>
                )}
              </div>
            )}

            <Separator />

            {/* Stage + Priority */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-xs">Stage</Label>
                <Select value={deal.stage} onValueChange={handleStageChange}>
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
                <Label className="text-xs">Priorité</Label>
                <Select value={deal.priority} onValueChange={handlePriorityChange}>
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

            {/* Fee */}
            <div className="space-y-2">
              <Label className="text-xs">Cachet (€)</Label>
              <Input
                type="number"
                value={deal.fee ?? ''}
                onChange={(e) => {
                  const fee = e.target.value ? parseFloat(e.target.value) : null;
                  updateDeal.mutate({ id: deal.id, fee });
                }}
                placeholder="250"
              />
            </div>

            {/* Tags */}
            <div className="space-y-2">
              <Label className="text-xs">Tags</Label>
              <div className="flex gap-1.5 flex-wrap">
                {deal.tags?.map((tag) => (
                  <Badge key={tag} variant="secondary" className="text-xs">
                    {tag}
                  </Badge>
                ))}
                {(!deal.tags || deal.tags.length === 0) && (
                  <span className="text-xs text-muted-foreground">Aucun tag</span>
                )}
              </div>
            </div>

            {/* Notes */}
            <div className="space-y-2">
              <Label className="text-xs">Notes</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Notes sur cette opportunité..."
                className="min-h-[80px]"
              />
              <p className="text-[10px] text-muted-foreground">Sauvegarde automatique</p>
            </div>

            <Separator />

            {/* Add activity note */}
            <div className="space-y-2">
              <Label className="text-xs">Ajouter une note</Label>
              <div className="flex gap-2">
                <Input
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  placeholder="Nouvelle note..."
                  onKeyDown={(e) => e.key === 'Enter' && handleAddNote()}
                />
                <Button size="sm" onClick={handleAddNote} disabled={!newNote.trim()}>
                  +
                </Button>
              </div>
            </div>

            {/* Activity timeline */}
            <div className="space-y-3">
              <Label className="text-xs">Historique</Label>
              {dealActivities.length === 0 ? (
                <p className="text-xs text-muted-foreground">Aucune activité</p>
              ) : (
                <div className="space-y-3">
                  {dealActivities.map((activity) => {
                    const Icon = ACTIVITY_ICONS[activity.type] || StickyNote;
                    return (
                      <div key={activity.id} className="flex items-start gap-3">
                        <div className="rounded-full bg-muted p-1.5 shrink-0">
                          <Icon className="h-3 w-3 text-muted-foreground" />
                        </div>
                        <div>
                          <p className="text-xs">{activity.content}</p>
                          <p className="text-[10px] text-muted-foreground">
                            {formatRelativeDate(activity.created_at)}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </ScrollArea>
      ) : null}
    </motion.div>
  );
}

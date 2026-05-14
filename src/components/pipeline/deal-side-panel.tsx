'use client';

import { useState, useEffect, useRef } from 'react';
import { useDeal, useUpdateDeal, useDeleteDeal } from '@/hooks/use-deals';
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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { STAGES, PRIORITIES, RELANCE_METHODS, type DealStage, type DealPriority, type RelanceMethod } from '@/types/database';
import { formatDate, formatRelativeDate, cn } from '@/lib/utils';
import { X, Calendar, MapPin, Mail, ArrowRightLeft, StickyNote, Send, CheckCircle2, Circle, Plus, Trash2, ListTodo } from 'lucide-react';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import { SendEmailDialog } from '@/components/shared/send-email-dialog';
import { useDealTasks, useCreateTask, useUpdateTask, useDeleteTask } from '@/hooks/use-tasks';

interface DealSidePanelProps {
  dealId: string;
  onClose: () => void;
}

export function DealSidePanel({ dealId, onClose }: DealSidePanelProps) {
  const { data: deal, isLoading } = useDeal(dealId);
  const { data: activities } = useActivities(50);
  const { data: dealTasks } = useDealTasks(dealId);
  const updateDeal = useUpdateDeal();
  const deleteDeal = useDeleteDeal();
  const createActivity = useCreateActivity();
  const createTask = useCreateTask();
  const updateTask = useUpdateTask();
  const deleteTask = useDeleteTask();
  const [notes, setNotes] = useState('');
  const [newNote, setNewNote] = useState('');
  const [emailOpen, setEmailOpen] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [showAddTask, setShowAddTask] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskDue, setNewTaskDue] = useState('');

  // Track which deal is currently loaded so we can reset transient state
  // when switching between opportunities (prevents typed notes/tasks from
  // leaking onto the next deal via the debounced autosave).
  const loadedDealIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!deal) return;
    if (loadedDealIdRef.current === deal.id) return;
    loadedDealIdRef.current = deal.id;
    setNotes(deal.notes ?? '');
    setNewNote('');
    setNewTaskTitle('');
    setNewTaskDue('');
    setShowAddTask(false);
  }, [deal]);

  // Debounced auto-save for notes, scoped strictly to the loaded deal.
  useEffect(() => {
    if (!deal || deal.id !== dealId) return;
    if (loadedDealIdRef.current !== deal.id) return;
    if (notes === (deal.notes ?? '')) return;
    const targetId = deal.id;
    const value = notes;
    const timer = setTimeout(() => {
      updateDeal.mutate({ id: targetId, notes: value });
    }, 800);
    return () => clearTimeout(timer);
  }, [notes, deal, dealId, updateDeal]);

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

  const handleLastRelanceDateChange = (value: string) => {
    if (!deal) return;
    updateDeal.mutate({
      id: deal.id,
      last_message_at: value ? new Date(value).toISOString() : null,
    });
  };

  const handleLastRelanceMethodChange = (method: RelanceMethod) => {
    if (!deal) return;
    updateDeal.mutate({ id: deal.id, last_relance_method: method });
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

            {/* Send Email */}
            <Button
              className="w-full gap-2"
              onClick={() => setEmailOpen(true)}
            >
              <Send className="h-4 w-4" />
              Envoyer un email
            </Button>

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

            {/* Dernier contact */}
            <div className="space-y-2">
              <Label className="text-xs">Dernier contact</Label>
              <div className="grid grid-cols-2 gap-2">
                <Input
                  type="date"
                  value={deal.last_message_at ? deal.last_message_at.slice(0, 10) : ''}
                  onChange={(e) => handleLastRelanceDateChange(e.target.value)}
                />
                <Select
                  value={deal.last_relance_method ?? ''}
                  onValueChange={(v) => handleLastRelanceMethodChange(v as RelanceMethod)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Mode..." />
                  </SelectTrigger>
                  <SelectContent>
                    {RELANCE_METHODS.map((m) => (
                      <SelectItem key={m.key} value={m.key}>
                        {m.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {deal.next_relance_at && (
                <p className="text-[10px] text-muted-foreground">
                  Prochaine relance prévue : {formatDate(deal.next_relance_at)}
                </p>
              )}
            </div>

            {/* Concert date + Fee */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-xs">Date du concert</Label>
                <Input
                  type="date"
                  value={deal.concert_date ? deal.concert_date.slice(0, 10) : ''}
                  onChange={(e) => {
                    updateDeal.mutate({
                      id: deal.id,
                      concert_date: e.target.value || null,
                    });
                  }}
                />
              </div>
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

            {/* Tasks */}
            <Separator />
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-xs flex items-center gap-1.5">
                  <ListTodo className="h-3.5 w-3.5" />
                  Tâches ({dealTasks?.filter((t) => !t.completed_at).length || 0})
                </Label>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-xs gap-1"
                  onClick={() => setShowAddTask(!showAddTask)}
                >
                  <Plus className="h-3 w-3" />
                  Ajouter
                </Button>
              </div>

              {showAddTask && (
                <div className="rounded-lg border p-2.5 space-y-2 bg-muted/30">
                  <Input
                    value={newTaskTitle}
                    onChange={(e) => setNewTaskTitle(e.target.value)}
                    placeholder="Ex: Envoyer le morceau pour diffusion"
                    className="h-8 text-xs"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && newTaskTitle.trim()) {
                        createTask.mutate({
                          deal_id: deal?.id,
                          venue_id: deal?.venue_id,
                          title: newTaskTitle.trim(),
                          due_date: newTaskDue || null,
                        }, {
                          onSuccess: () => {
                            setNewTaskTitle('');
                            setNewTaskDue('');
                            toast.success('Tâche créée');
                          },
                        });
                      }
                    }}
                  />
                  <div className="flex items-center justify-between">
                    <Input
                      type="date"
                      value={newTaskDue}
                      onChange={(e) => setNewTaskDue(e.target.value)}
                      className="h-7 text-xs w-36"
                    />
                    <div className="flex gap-1.5">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => { setShowAddTask(false); setNewTaskTitle(''); setNewTaskDue(''); }}
                      >
                        Annuler
                      </Button>
                      <Button
                        size="sm"
                        className="h-7 text-xs"
                        disabled={!newTaskTitle.trim() || createTask.isPending}
                        onClick={() => {
                          createTask.mutate({
                            deal_id: deal?.id,
                            venue_id: deal?.venue_id,
                            title: newTaskTitle.trim(),
                            due_date: newTaskDue || null,
                          }, {
                            onSuccess: () => {
                              setNewTaskTitle('');
                              setNewTaskDue('');
                              setShowAddTask(false);
                              toast.success('Tâche créée');
                            },
                          });
                        }}
                      >
                        Créer
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {dealTasks && dealTasks.length > 0 ? (
                <div className="space-y-1.5">
                  {dealTasks.map((task) => {
                    const isCompleted = !!task.completed_at;
                    const isOverdue = !isCompleted && task.due_date && new Date(task.due_date) < new Date();
                    return (
                      <div
                        key={task.id}
                        className={cn(
                          'flex items-start gap-2 p-2 rounded-lg group transition-colors',
                          isCompleted ? 'opacity-50' : 'hover:bg-muted/50',
                          isOverdue && 'bg-red-500/5'
                        )}
                      >
                        <button
                          className="mt-0.5 shrink-0"
                          onClick={() => {
                            updateTask.mutate({
                              id: task.id,
                              completed_at: isCompleted ? null : new Date().toISOString(),
                            });
                          }}
                        >
                          {isCompleted ? (
                            <CheckCircle2 className="h-4 w-4 text-primary" />
                          ) : (
                            <Circle className={cn('h-4 w-4', isOverdue ? 'text-red-500' : 'text-muted-foreground')} />
                          )}
                        </button>
                        <div className="flex-1 min-w-0">
                          <p className={cn('text-xs', isCompleted && 'line-through')}>{task.title}</p>
                          {task.due_date && (
                            <p className={cn(
                              'text-[10px] mt-0.5',
                              isOverdue ? 'text-red-500 font-medium' : 'text-muted-foreground'
                            )}>
                              {isOverdue ? 'En retard — ' : ''}{formatDate(task.due_date)}
                            </p>
                          )}
                        </div>
                        <button
                          className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                          onClick={() => deleteTask.mutate(task.id)}
                        >
                          <Trash2 className="h-3 w-3 text-muted-foreground hover:text-destructive" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              ) : !showAddTask ? (
                <p className="text-xs text-muted-foreground">Aucune tâche</p>
              ) : null}
            </div>

            <Separator />

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

            <Separator />

            {/* Delete deal */}
            <div>
              <Button
                variant="ghost"
                size="sm"
                className="w-full gap-2 text-destructive hover:text-destructive hover:bg-destructive/10"
                onClick={() => setConfirmDeleteOpen(true)}
              >
                <Trash2 className="h-4 w-4" />
                Supprimer l&apos;opportunité
              </Button>
            </div>
          </div>
        </ScrollArea>
      ) : null}

      {deal && (
        <>
          <SendEmailDialog
            open={emailOpen}
            onOpenChange={setEmailOpen}
            deal={deal}
            contact={deal.contact}
            venue={deal.venue}
          />
          <Dialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Supprimer l&apos;opportunité ?</DialogTitle>
                <DialogDescription>
                  L&apos;opportunité « {deal.venue?.name || 'Sans lieu'} » sera supprimée définitivement du pipeline, ainsi que toutes ses activités et tâches liées. Cette action ne peut pas être annulée.
                </DialogDescription>
              </DialogHeader>
              <div className="flex justify-end gap-2 mt-4">
                <Button variant="ghost" onClick={() => setConfirmDeleteOpen(false)}>
                  Annuler
                </Button>
                <Button
                  variant="destructive"
                  disabled={deleteDeal.isPending}
                  onClick={() => {
                    deleteDeal.mutate(deal.id, {
                      onSuccess: () => {
                        toast.success('Opportunité supprimée');
                        setConfirmDeleteOpen(false);
                        onClose();
                      },
                      onError: () => {
                        toast.error('Erreur lors de la suppression');
                      },
                    });
                  }}
                >
                  {deleteDeal.isPending ? 'Suppression…' : 'Supprimer'}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </>
      )}
    </motion.div>
  );
}

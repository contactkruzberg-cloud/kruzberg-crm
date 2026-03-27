'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useDeals, useUpdateDeal } from '@/hooks/use-deals';
import { useTemplates } from '@/hooks/use-templates';
import { useCreateActivity } from '@/hooks/use-activities';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { getRelanceUrgency, daysUntil, resolveTemplate, formatRelativeDate } from '@/lib/utils';
import { Target, ArrowRight, Clock, Copy, Check, SkipForward, Pause, Zap, Send } from 'lucide-react';
import { toast } from 'sonner';
import confetti from 'canvas-confetti';
import { SendEmailDialog } from '@/components/shared/send-email-dialog';
import type { Deal, Template } from '@/types/database';

export default function FocusPage() {
  const { data: deals, isLoading: dealsLoading } = useDeals();
  const { data: templates } = useTemplates();
  const updateDeal = useUpdateDeal();
  const createActivity = useCreateActivity();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set());
  const [generatedEmail, setGeneratedEmail] = useState<string | null>(null);
  const [emailDialogOpen, setEmailDialogOpen] = useState(false);

  // Filter urgent relances
  const urgentDeals = (deals || [])
    .filter((d) => {
      if (completedIds.has(d.id)) return false;
      if (['confirme', 'refuse'].includes(d.stage)) return false;
      const urgency = getRelanceUrgency(d.next_relance_at);
      return urgency === 'overdue' || urgency === 'urgent';
    })
    .sort((a, b) => daysUntil(a.next_relance_at!) - daysUntil(b.next_relance_at!));

  const totalTasks = urgentDeals.length + completedIds.size;
  const completedCount = completedIds.size;
  const currentDeal = urgentDeals[0]; // Always show the first non-completed

  const getSuggestedTemplate = (deal: Deal): Template | null => {
    if (!templates) return null;
    if (deal.stage === 'contacte' || deal.stage === 'a_contacter') {
      return templates.find((t) => t.category === 'first_contact') || null;
    }
    if (deal.stage === 'relance') {
      const daysOver = deal.next_relance_at ? Math.abs(daysUntil(deal.next_relance_at)) : 0;
      return templates.find((t) => t.category === (daysOver > 14 ? 'relance_2' : 'relance_1')) || null;
    }
    return templates.find((t) => t.category === 'relance_1') || null;
  };

  const handleGenerateEmail = () => {
    if (!currentDeal) return;
    const template = getSuggestedTemplate(currentDeal);
    if (!template) {
      toast.error('Aucun template adapté trouvé');
      return;
    }
    const variables: Record<string, string> = {
      nom_contact: currentDeal.contact?.name || 'Contact',
      nom_lieu: currentDeal.venue?.name || 'Lieu',
      date_dernier_mail: currentDeal.last_message_at
        ? formatRelativeDate(currentDeal.last_message_at)
        : 'N/A',
      nom_groupe: 'KRUZBERG',
      single: 'Fractures',
    };
    const resolved = resolveTemplate(template.body, variables);
    setGeneratedEmail(resolved);
  };

  const handleCopyAndDone = () => {
    if (generatedEmail) {
      navigator.clipboard.writeText(generatedEmail);
    }
    markDone();
  };

  const markDone = () => {
    if (!currentDeal) return;

    // Update deal
    const now = new Date().toISOString();
    updateDeal.mutate({
      id: currentDeal.id,
      last_message_at: now,
      stage: currentDeal.stage === 'a_contacter' ? 'contacte' : 'relance',
    });

    createActivity.mutate({
      deal_id: currentDeal.id,
      venue_id: currentDeal.venue_id,
      contact_id: currentDeal.contact_id,
      type: 'email_sent',
      content: `Relance envoyée depuis Focus Mode`,
    });

    setCompletedIds((prev) => new Set([...prev, currentDeal.id]));
    setGeneratedEmail(null);
    toast.success('Marqué comme fait !');
  };

  const handleSkip = () => {
    setCompletedIds((prev) => new Set([...prev, currentDeal?.id || '']));
    setGeneratedEmail(null);
  };

  const handleSnooze = () => {
    if (!currentDeal) return;
    const snoozedDate = new Date();
    snoozedDate.setDate(snoozedDate.getDate() + 2);
    updateDeal.mutate({
      id: currentDeal.id,
      next_relance_at: snoozedDate.toISOString(),
    });
    setCompletedIds((prev) => new Set([...prev, currentDeal.id]));
    setGeneratedEmail(null);
    toast.success('Reporté de 2 jours');
  };

  // Confetti when all done
  useEffect(() => {
    if (totalTasks > 0 && completedCount === totalTasks) {
      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 },
      });
    }
  }, [totalTasks, completedCount]);

  if (dealsLoading) {
    return (
      <div className="max-w-2xl mx-auto space-y-6 py-8">
        <Skeleton className="h-8 w-48 mx-auto" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  const allDone = totalTasks > 0 && urgentDeals.length === 0;
  const nothingToDo = totalTasks === 0;

  return (
    <div className="max-w-2xl mx-auto space-y-6 py-8">
      {/* Header */}
      <div className="text-center space-y-2">
        <div className="flex items-center justify-center gap-2">
          <Target className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold">Focus Mode</h1>
        </div>
        <p className="text-muted-foreground text-sm">
          Traitez vos relances urgentes une par une
        </p>
      </div>

      {/* Progress */}
      {totalTasks > 0 && (
        <div className="space-y-2">
          <div className="flex justify-between text-sm text-muted-foreground">
            <span>{completedCount} terminée{completedCount > 1 ? 's' : ''}</span>
            <span>{totalTasks} total</span>
          </div>
          <Progress value={(completedCount / totalTasks) * 100} />
        </div>
      )}

      {/* Current task card */}
      <AnimatePresence mode="wait">
        {nothingToDo ? (
          <motion.div
            key="empty"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="text-center py-16"
          >
            <Zap className="h-12 w-12 mx-auto mb-4 text-primary" />
            <h2 className="text-xl font-bold">Aucune relance urgente</h2>
            <p className="text-muted-foreground mt-2">
              Tout est sous contrôle. Profitez-en pour répéter !
            </p>
          </motion.div>
        ) : allDone ? (
          <motion.div
            key="done"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="text-center py-16"
          >
            <div className="text-6xl mb-4">&#127881;</div>
            <h2 className="text-xl font-bold text-primary">Toutes les relances sont faites !</h2>
            <p className="text-muted-foreground mt-2">
              {completedCount} relance{completedCount > 1 ? 's' : ''} traitée{completedCount > 1 ? 's' : ''} aujourd&apos;hui
            </p>
          </motion.div>
        ) : currentDeal ? (
          <motion.div
            key={currentDeal.id}
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -50 }}
            transition={{ type: 'spring', damping: 20 }}
          >
            <Card className="overflow-hidden">
              <div className="h-1 bg-gradient-to-r from-primary to-purple-500" />
              <CardContent className="p-6 space-y-4">
                <div className="flex items-start justify-between">
                  <div>
                    <h2 className="text-lg font-bold">{currentDeal.venue?.name}</h2>
                    <p className="text-sm text-muted-foreground">
                      {currentDeal.venue?.city}
                    </p>
                  </div>
                  <Badge
                    variant={
                      getRelanceUrgency(currentDeal.next_relance_at) === 'overdue'
                        ? 'destructive'
                        : 'warning'
                    }
                  >
                    <Clock className="h-3 w-3 mr-1" />
                    {currentDeal.next_relance_at
                      ? `${Math.abs(daysUntil(currentDeal.next_relance_at))}j ${daysUntil(currentDeal.next_relance_at) < 0 ? 'de retard' : ''}`
                      : 'À contacter'}
                  </Badge>
                </div>

                <div className="text-sm text-muted-foreground">
                  {currentDeal.last_message_at
                    ? `Dernier message : ${formatRelativeDate(currentDeal.last_message_at)}`
                    : 'Aucun message envoyé'}
                </div>

                {getSuggestedTemplate(currentDeal) && (
                  <div className="text-xs text-muted-foreground flex items-center gap-1">
                    Template suggéré :{' '}
                    <Badge variant="outline" className="text-[10px]">
                      {getSuggestedTemplate(currentDeal)?.name}
                    </Badge>
                  </div>
                )}

                {/* Generated email */}
                {generatedEmail && (
                  <div className="rounded-lg border bg-muted/30 p-4">
                    <p className="text-xs text-muted-foreground mb-2 font-medium">Email généré :</p>
                    <div className="whitespace-pre-wrap text-sm">{generatedEmail}</div>
                  </div>
                )}

                {/* Actions */}
                <div className="flex flex-wrap gap-2">
                  <Button onClick={() => setEmailDialogOpen(true)} className="gap-2">
                    <Send className="h-4 w-4" />
                    Envoyer email
                  </Button>
                  {!generatedEmail ? (
                    <Button variant="outline" onClick={handleGenerateEmail} className="gap-2">
                      <Copy className="h-4 w-4" />
                      Générer & copier
                    </Button>
                  ) : (
                    <Button variant="outline" onClick={handleCopyAndDone} className="gap-2">
                      <Check className="h-4 w-4" />
                      Copier & terminé
                    </Button>
                  )}
                  <Button variant="outline" onClick={markDone} className="gap-2">
                    <Check className="h-4 w-4" />
                    Marquer fait
                  </Button>
                  <Button variant="ghost" onClick={handleSkip} className="gap-2">
                    <SkipForward className="h-4 w-4" />
                    Passer
                  </Button>
                  <Button variant="ghost" onClick={handleSnooze} className="gap-2">
                    <Pause className="h-4 w-4" />
                    +2 jours
                  </Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {currentDeal && (
        <SendEmailDialog
          open={emailDialogOpen}
          onOpenChange={(open) => {
            setEmailDialogOpen(open);
            if (!open) markDone();
          }}
          deal={currentDeal}
          contact={currentDeal.contact}
          venue={currentDeal.venue}
        />
      )}
    </div>
  );
}

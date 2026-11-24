'use client';

import { Sparkles } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useRelanceDocs } from '@/hooks/use-relance';
import { RelanceConversation } from '@/components/relances/relance-conversation';
import { dealLabel, formatDate } from '@/lib/utils';
import type { RelanceDoc } from '@/lib/relance/prompt';
import type { Deal } from '@/types/database';

/** A ready draft written after the last contact (an older one is stale). */
export function freshDraft(doc: RelanceDoc | undefined, deal: Deal) {
  return !!doc && doc.state === 'ready' && (!deal.last_message_at || (doc.requestedAt || '') > deal.last_message_at);
}

/**
 * "Relancer": the conversation with the venue / contact, Claude's follow-up in
 * the reply box. Greg reads it, edits it and sends it himself from the CRM.
 */
export function RelanceDialog({ deal, open, onOpenChange }: { deal: Deal; open: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[min(820px,92dvh)] max-w-2xl flex-col gap-0 p-0">
        <DialogHeader className="border-b px-5 py-3.5 text-left">
          <DialogTitle className="flex items-center gap-2 text-[16px]">
            <Sparkles className="h-4 w-4 text-primary" /> Relancer · {dealLabel(deal, '')}
          </DialogTitle>
          <DialogDescription className="text-[12.5px]">
            <RelanceBasis deal={deal} />
          </DialogDescription>
        </DialogHeader>
        {open && <RelanceConversation deal={deal} autoRequest onSent={() => onOpenChange(false)} className="min-h-0 flex-1 px-3 pb-3" />}
      </DialogContent>
    </Dialog>
  );
}

/** Where the draft comes from (the email it follows up, or the deal's history). */
export function RelanceBasis({ deal }: { deal: Deal }) {
  const doc = useRelanceDocs().data?.get(deal.id);
  if (!doc?.basedOn) return <>Relance personnalisée rédigée par Claude, à relire avant envoi.</>;
  return doc.basedOn.lastSent ? (
    <>
      À partir de ton mail « {doc.basedOn.lastSent.subject} » du {formatDate(doc.basedOn.lastSent.date)}
      {doc.basedOn.relances ? ` · relance n° ${doc.basedOn.relances + 1}` : ''}.
    </>
  ) : (
    <>À partir de la fiche et de l’historique (aucun mail envoyé à {doc.basedOn.addresses?.join(', ') || 'ce contact'} retrouvé dans booking@).</>
  );
}

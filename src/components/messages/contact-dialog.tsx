'use client';

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { ContactLike } from '@/lib/email/messages';
import { ContactConversation } from './entity-conversation';

/** A contact's mail conversation, opened from a list of contacts. */
export function ContactDialog({ contact, onClose }: { contact: (ContactLike & { role?: string | null; venue?: { name: string } | null }) | null; onClose: () => void }) {
  return (
    <Dialog open={!!contact} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex h-[min(760px,90dvh)] max-w-2xl flex-col gap-0 p-0">
        {contact && (
          <>
            <DialogHeader className="border-b px-5 py-3.5 text-left">
              <DialogTitle className="text-[16px]">{contact.name}</DialogTitle>
              <DialogDescription className="text-[12.5px]">
                {[contact.role, contact.venue?.name, contact.email].filter(Boolean).join(' · ') || 'Contact'}
              </DialogDescription>
            </DialogHeader>
            <ContactConversation contact={contact} className="min-h-0 flex-1 px-3 pb-3" />
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

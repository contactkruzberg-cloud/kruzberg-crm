'use client';

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { ContactLike } from '@/lib/email/messages';
import { ContactConversation } from './entity-conversation';
import { KindPicker } from '@/components/contacts/contact-kind';

/** A contact's mail conversation, opened from a list of contacts. */
export function ContactDialog({ contact, onClose }: { contact: (ContactLike & { role?: string | null; kind?: string | null; venue?: { name: string; type?: string | null } | null }) | null; onClose: () => void }) {
  return (
    <Dialog open={!!contact} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex h-[min(760px,90dvh)] max-w-2xl flex-col gap-0 p-0">
        {contact && (
          <>
            <DialogHeader className="border-b px-5 py-3.5 text-left">
              <DialogTitle className="text-[16px]">{contact.name}</DialogTitle>
              <DialogDescription asChild>
                <div className="flex flex-wrap items-center gap-x-1.5 text-[12.5px]">
                  <KindPicker contact={{ id: contact.id, kind: contact.kind ?? null, role: contact.role ?? null, venue: contact.venue }} />
                  {[contact.role, contact.venue?.name, contact.email].filter(Boolean).map((t) => (
                    <span key={t}>· {t}</span>
                  ))}
                </div>
              </DialogDescription>
            </DialogHeader>
            <ContactConversation contact={contact} className="min-h-0 flex-1 px-3 pb-3" />
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

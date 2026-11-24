'use client';

import { Check, ChevronDown } from 'lucide-react';
import { toast } from 'sonner';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useUpdateContact } from '@/hooks/use-contacts';
import { CONTACT_KINDS, contactKind, kindInfo, type ContactKind } from '@/lib/contacts/roles';
import { cn } from '@/lib/utils';
import type { Contact } from '@/types/database';

type KindSource = Pick<Contact, 'kind' | 'role'> & { venue?: { type?: string | null } | null };

/** "● Programmateur·rice" — dimmed with a "?" while it is only a guess. */
export function KindBadge({ contact, className }: { contact: KindSource; className?: string }) {
  const { kind, sure } = contactKind(contact);
  if (!kind) return <span className={cn('text-[12px] text-muted-foreground', className)}>Fonction ?</span>;
  const k = kindInfo(kind);
  return (
    <span className={cn('inline-flex items-center gap-1.5 whitespace-nowrap text-[12px] font-medium', !sure && 'opacity-60', className)} title={sure ? k.hint : `Deviné depuis « ${contact.role || 'le type du lieu'} » : clique pour confirmer`}>
      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: k.color }} />
      {k.label}
      {!sure && <span className="text-muted-foreground">?</span>}
    </span>
  );
}

export const missingKindColumn = (e: unknown) => /kind/.test(String((e as { message?: string })?.message ?? e)) && /column|schema/i.test(String((e as { message?: string })?.message ?? e));

function KindMenu({ value, onPick }: { value: ContactKind | null; onPick: (k: ContactKind) => void }) {
  return (
    <DropdownMenuContent align="start" className="w-64">
      {CONTACT_KINDS.map((k) => (
        <DropdownMenuItem key={k.key} onSelect={() => onPick(k.key)} className="items-start gap-2.5 py-1.5">
          <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: k.color }} />
          <span className="min-w-0 flex-1">
            <span className="block text-[13.5px]">{k.label}</span>
            {k.hint && <span className="block text-[11.5px] leading-snug text-muted-foreground">{k.hint}</span>}
          </span>
          {value === k.key && <Check className="mt-1 h-3.5 w-3.5 text-primary" />}
        </DropdownMenuItem>
      ))}
    </DropdownMenuContent>
  );
}

/** The badge, clickable to set (or confirm) the contact's function. */
export function KindPicker({ contact, className }: { contact: KindSource & { id: string }; className?: string }) {
  const update = useUpdateContact();
  const { kind, sure } = contactKind(contact);
  const pick = (k: ContactKind) =>
    update.mutate(
      { id: contact.id, kind: k },
      {
        onSuccess: () => toast.success(`${kindInfo(k).label}`),
        onError: (e) => toast.error(missingKindColumn(e) ? 'Lance la migration 021 dans Supabase pour enregistrer les fonctions.' : 'Échec de l’enregistrement'),
      },
    );
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          className={cn('group inline-flex items-center gap-0.5 rounded-md px-1 py-0.5 -mx-1 hover:bg-secondary', !sure && 'border border-dashed border-border', className)}
        >
          <KindBadge contact={contact} />
          <ChevronDown className="h-3 w-3 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
        </button>
      </DropdownMenuTrigger>
      <div onClick={(e) => e.stopPropagation()}>
        <KindMenu value={sure ? kind : null} onPick={pick} />
      </div>
    </DropdownMenu>
  );
}

/** Choice in a creation form. */
export function KindSelect({ value, onChange }: { value: ContactKind | null; onChange: (k: ContactKind | null) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {CONTACT_KINDS.filter((k) => k.key !== 'autre').map((k) => (
        <button
          key={k.key}
          type="button"
          title={k.hint}
          onClick={() => onChange(value === k.key ? null : k.key)}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12.5px] transition-colors',
            value === k.key ? 'border-transparent bg-foreground text-background' : 'text-muted-foreground hover:bg-secondary hover:text-foreground',
          )}
        >
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: k.color }} />
          {k.label}
        </button>
      ))}
    </div>
  );
}

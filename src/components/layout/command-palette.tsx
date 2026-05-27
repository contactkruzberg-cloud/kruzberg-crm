'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Command } from 'cmdk';
import { useAppStore } from '@/stores/app-store';
import { useVenues } from '@/hooks/use-venues';
import { useContacts } from '@/hooks/use-contacts';
import { useDeals } from '@/hooks/use-deals';
import { STAGES } from '@/types/database';
import {
  LayoutDashboard,
  Kanban,
  Building2,
  Mail,
  Target,
  BarChart3,
  User,
  FileText,
  Search,
} from 'lucide-react';

const PAGES = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard },
  { name: 'Pipeline', href: '/pipeline', icon: Kanban },
  { name: 'Lieux & Contacts', href: '/venues', icon: Building2 },
  { name: 'Templates', href: '/templates', icon: Mail },
  { name: 'Focus Mode', href: '/focus', icon: Target },
  { name: 'Analytics', href: '/analytics', icon: BarChart3 },
];

export function CommandPalette() {
  const { commandPaletteOpen, setCommandPaletteOpen } = useAppStore();
  const router = useRouter();
  const { data: venues } = useVenues();
  const { data: contacts } = useContacts();
  const { data: deals } = useDeals();
  const [search, setSearch] = useState('');

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setCommandPaletteOpen(!commandPaletteOpen);
      }
      if (e.key === 'Escape') {
        setCommandPaletteOpen(false);
      }
    },
    [commandPaletteOpen, setCommandPaletteOpen]
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  if (!commandPaletteOpen) return null;

  const navigate = (href: string) => {
    setCommandPaletteOpen(false);
    setSearch('');
    router.push(href);
  };

  return (
    <div className="fixed inset-0 z-50">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={() => setCommandPaletteOpen(false)}
      />
      <div className="absolute left-1/2 top-[20%] w-full max-w-lg -translate-x-1/2">
        <Command className="rounded-xl border bg-card shadow-2xl overflow-hidden">
          <div className="flex items-center border-b px-4">
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
            <Command.Input
              autoFocus
              value={search}
              onValueChange={setSearch}
              placeholder="Rechercher lieux, contacts, pages..."
              className="flex h-12 w-full bg-transparent py-3 px-3 text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>
          <Command.List className="max-h-80 overflow-y-auto p-2">
            <Command.Empty className="py-6 text-center text-sm text-muted-foreground">
              Aucun résultat trouvé.
            </Command.Empty>

            <Command.Group heading="Pages" className="text-xs text-muted-foreground px-2 py-1.5">
              {PAGES.map((page) => (
                <Command.Item
                  key={page.href}
                  value={page.name}
                  onSelect={() => navigate(page.href)}
                  className="flex items-center gap-3 px-3 py-2 text-sm rounded-lg cursor-pointer hover:bg-accent aria-selected:bg-accent"
                >
                  <page.icon className="h-4 w-4 text-muted-foreground" />
                  {page.name}
                </Command.Item>
              ))}
            </Command.Group>

            {venues && venues.length > 0 && (
              <Command.Group heading="Lieux" className="text-xs text-muted-foreground px-2 py-1.5">
                {(search ? venues : venues.slice(0, 5)).map((venue) => (
                  <Command.Item
                    key={venue.id}
                    value={`venue-${venue.id} ${venue.name} ${venue.city} ${venue.country || ''}`}
                    onSelect={() => navigate(`/venues?id=${venue.id}`)}
                    className="flex items-center gap-3 px-3 py-2 text-sm rounded-lg cursor-pointer hover:bg-accent aria-selected:bg-accent"
                  >
                    <Building2 className="h-4 w-4 text-muted-foreground" />
                    <span>{venue.name}</span>
                    <span className="ml-auto text-xs text-muted-foreground">{venue.city}</span>
                  </Command.Item>
                ))}
              </Command.Group>
            )}

            {contacts && contacts.length > 0 && (
              <Command.Group heading="Contacts" className="text-xs text-muted-foreground px-2 py-1.5">
                {(search ? contacts : contacts.slice(0, 5)).map((contact) => (
                  <Command.Item
                    key={contact.id}
                    value={`contact-${contact.id} ${contact.name} ${contact.email || ''} ${contact.role || ''} ${contact.venue?.name || ''}`}
                    onSelect={() => navigate(`/venues?contact=${contact.id}`)}
                    className="flex items-center gap-3 px-3 py-2 text-sm rounded-lg cursor-pointer hover:bg-accent aria-selected:bg-accent"
                  >
                    <User className="h-4 w-4 text-muted-foreground" />
                    <span>{contact.name}</span>
                    {contact.venue && (
                      <span className="ml-auto text-xs text-muted-foreground">
                        {contact.venue.name}
                      </span>
                    )}
                  </Command.Item>
                ))}
              </Command.Group>
            )}

            {deals && deals.length > 0 && (
              <Command.Group heading="Opportunités" className="text-xs text-muted-foreground px-2 py-1.5">
                {(search ? deals : deals.slice(0, 5)).map((deal) => {
                  const stageLabel = STAGES.find((s) => s.key === deal.stage)?.label || deal.stage;
                  return (
                    <Command.Item
                      key={deal.id}
                      value={`deal-${deal.id} ${deal.venue?.name || ''} ${deal.venue?.city || ''} ${deal.contact?.name || ''} ${deal.contact?.email || ''} ${stageLabel} ${deal.notes || ''} ${(deal.tags || []).join(' ')}`}
                      onSelect={() => navigate(`/pipeline?deal=${deal.id}`)}
                      className="flex items-center gap-3 px-3 py-2 text-sm rounded-lg cursor-pointer hover:bg-accent aria-selected:bg-accent"
                    >
                      <FileText className="h-4 w-4 text-muted-foreground" />
                      <span>{deal.venue?.name || 'Opportunité'}</span>
                      {deal.contact?.name && (
                        <span className="text-xs text-muted-foreground">· {deal.contact.name}</span>
                      )}
                      <span className="ml-auto text-xs text-muted-foreground">
                        {stageLabel}
                      </span>
                    </Command.Item>
                  );
                })}
              </Command.Group>
            )}
          </Command.List>
        </Command>
      </div>
    </div>
  );
}

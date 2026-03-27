'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Command } from 'cmdk';
import { useAppStore } from '@/stores/app-store';
import { useVenues } from '@/hooks/use-venues';
import { useContacts } from '@/hooks/use-contacts';
import { useDeals } from '@/hooks/use-deals';
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
                {venues.slice(0, 5).map((venue) => (
                  <Command.Item
                    key={venue.id}
                    value={`${venue.name} ${venue.city}`}
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
                {contacts.slice(0, 5).map((contact) => (
                  <Command.Item
                    key={contact.id}
                    value={`${contact.name} ${contact.email || ''}`}
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
                {deals.slice(0, 5).map((deal) => (
                  <Command.Item
                    key={deal.id}
                    value={`${deal.venue?.name || ''} ${deal.stage}`}
                    onSelect={() => navigate(`/pipeline?deal=${deal.id}`)}
                    className="flex items-center gap-3 px-3 py-2 text-sm rounded-lg cursor-pointer hover:bg-accent aria-selected:bg-accent"
                  >
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <span>{deal.venue?.name || 'Deal'}</span>
                    <span className="ml-auto text-xs text-muted-foreground capitalize">
                      {deal.stage.replace('_', ' ')}
                    </span>
                  </Command.Item>
                ))}
              </Command.Group>
            )}
          </Command.List>
        </Command>
      </div>
    </div>
  );
}

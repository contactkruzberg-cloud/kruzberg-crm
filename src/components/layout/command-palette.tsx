'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Command } from 'cmdk';
import { useAppStore } from '@/stores/app-store';
import { useVenues } from '@/hooks/use-venues';
import { useContacts } from '@/hooks/use-contacts';
import { useDeals } from '@/hooks/use-deals';
import { STAGES } from '@/types/database';
import { dealLabel } from '@/lib/utils';
import {
  LayoutDashboard,
  Kanban,
  Building2,
  Mail,
  BarChart3,
  User,
  FileText,
  Search,
  Users,
  Route,
  Plus,
  AlarmClock,
  Settings,
  ListTodo,
} from 'lucide-react';
import { useBands } from '@/hooks/use-bands';
import { useTours } from '@/hooks/use-tours';
import { usePipelineFilters } from '@/components/pipeline/pipeline-filters';
import type { CreateIntent } from '@/stores/app-store';

const PAGES = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard },
  { name: 'Pipeline', href: '/pipeline', icon: Kanban },
  { name: 'Lieux & Contacts', href: '/venues', icon: Building2 },
  { name: 'Tournées', href: '/tours', icon: Route },
  { name: 'Groupes amis', href: '/groupes', icon: Users },
  { name: 'Templates', href: '/templates', icon: Mail },
  { name: 'Analytics', href: '/analytics', icon: BarChart3 },
];

export function CommandPalette() {
  const { commandPaletteOpen, setCommandPaletteOpen, openCreate, setSettingsOpen } = useAppStore();
  const { data: bands } = useBands();
  const { data: tours } = useTours();
  const [pipelineFilters, setPipelineFilters] = usePipelineFilters();
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

  const create = (kind: CreateIntent) => {
    setSearch('');
    openCreate(kind);
  };

  const actions: { name: string; icon: typeof Plus; keywords: string; run: () => void }[] = [
    { name: 'Relances dues', icon: AlarmClock, keywords: 'relancer retard à faire', run: () => {
      setPipelineFilters({ ...pipelineFilters, due: true });
      navigate('/pipeline');
    } },
    { name: 'Nouvelle opportunité', icon: Plus, keywords: 'créer ajouter deal', run: () => create('deal') },
    { name: 'Nouveau lieu', icon: Plus, keywords: 'créer ajouter structure salle festival', run: () => create('venue') },
    { name: 'Nouveau contact', icon: Plus, keywords: 'créer ajouter personne', run: () => create('contact') },
    { name: 'Nouvelle tâche', icon: ListTodo, keywords: 'créer ajouter todo', run: () => create('task') },
    { name: 'Nouveau groupe ami', icon: Plus, keywords: 'créer ajouter band', run: () => create('band') },
    { name: 'Nouvelle tournée', icon: Plus, keywords: 'créer ajouter tour', run: () => create('tour') },
    { name: 'Réglages, corbeille et connexions Claude', icon: Settings, keywords: 'compte paramètres restaurer supprimés', run: () => {
      setCommandPaletteOpen(false);
      setSettingsOpen(true);
    } },
  ];

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
                            placeholder="Rechercher ou lancer une action (relances dues, nouveau lieu…)"
              className="flex h-12 w-full bg-transparent py-3 px-3 text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>
          <Command.List className="max-h-80 overflow-y-auto p-2">
            <Command.Empty className="py-6 text-center text-sm text-muted-foreground">
              Aucun résultat trouvé.
            </Command.Empty>

            <Command.Group heading="Actions" className="text-xs text-muted-foreground px-2 py-1.5">
              {actions.map((a) => (
                <Command.Item
                  key={a.name}
                  value={`action ${a.name} ${a.keywords}`}
                  onSelect={a.run}
                  className="flex items-center gap-3 px-3 py-2 text-sm rounded-lg cursor-pointer hover:bg-accent aria-selected:bg-accent"
                >
                  <a.icon className="h-4 w-4 text-muted-foreground" />
                  {a.name}
                </Command.Item>
              ))}
            </Command.Group>

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
                      value={`deal-${deal.id} ${deal.title || ''} ${deal.venue?.name || ''} ${deal.venue?.city || ''} ${deal.contact?.name || ''} ${deal.contact?.email || ''} ${stageLabel} ${deal.notes || ''} ${(deal.tags || []).join(' ')}`}
                      onSelect={() => navigate(`/pipeline?deal=${deal.id}`)}
                      className="flex items-center gap-3 px-3 py-2 text-sm rounded-lg cursor-pointer hover:bg-accent aria-selected:bg-accent"
                    >
                      <FileText className="h-4 w-4 text-muted-foreground" />
                      <span>{dealLabel(deal)}</span>
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
            {search && bands && bands.length > 0 && (
              <Command.Group heading="Groupes amis" className="text-xs text-muted-foreground px-2 py-1.5">
                {bands.map((band) => (
                  <Command.Item
                    key={band.id}
                    value={`band-${band.id} ${band.name} ${band.city || ''} ${band.genre || ''}`}
                    onSelect={() => navigate(`/groupes?id=${band.id}`)}
                    className="flex items-center gap-3 px-3 py-2 text-sm rounded-lg cursor-pointer hover:bg-accent aria-selected:bg-accent"
                  >
                    <Users className="h-4 w-4 text-muted-foreground" />
                    <span>{band.name}</span>
                    <span className="ml-auto text-xs text-muted-foreground">{band.city}</span>
                  </Command.Item>
                ))}
              </Command.Group>
            )}

            {search && tours && tours.length > 0 && (
              <Command.Group heading="Tournées" className="text-xs text-muted-foreground px-2 py-1.5">
                {tours.map((tour) => (
                  <Command.Item
                    key={tour.id}
                    value={`tour-${tour.id} ${tour.name}`}
                    onSelect={() => navigate(`/tours/${tour.id}`)}
                    className="flex items-center gap-3 px-3 py-2 text-sm rounded-lg cursor-pointer hover:bg-accent aria-selected:bg-accent"
                  >
                    <Route className="h-4 w-4 text-muted-foreground" />
                    <span>{tour.name}</span>
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

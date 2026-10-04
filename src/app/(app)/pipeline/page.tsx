'use client';

import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useDeals } from '@/hooks/use-deals';
import { useVenues } from '@/hooks/use-venues';
import { useContacts } from '@/hooks/use-contacts';
import { contactsByVenue, matchesQuery, searchDeals } from '@/lib/search';
import { KanbanBoard } from '@/components/pipeline/kanban-board';
import { PipelineTable } from '@/components/pipeline/pipeline-table';
import { DealSidePanel } from '@/components/pipeline/deal-side-panel';
import { CreateDealDialog } from '@/components/pipeline/create-deal-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { Plus, Kanban, Table2, Search, X, Building2, User } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { usePersistentState } from '@/lib/persistent-state';
import { applyPipelineFilters, PipelineFilters, usePipelineFilters } from '@/components/pipeline/pipeline-filters';

export default function PipelinePage() {
  const { data: deals, isLoading } = useDeals();
  const [view, setView] = usePersistentState<'kanban' | 'table'>('pipeline:view', 'kanban');
  const [filters, setFilters] = usePipelineFilters();
  const router = useRouter();
  const [selectedDealId, setSelectedDealId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [prefill, setPrefill] = useState<{ venueId?: string; contactId?: string; n: number }>({ n: 0 });
  const [search, setSearch] = useState('');
  const { data: venues } = useVenues();
  const { data: contacts } = useContacts();
  const searchParams = useSearchParams();

  const byVenue = useMemo(() => contactsByVenue(contacts), [contacts]);
  const matches = useMemo(() => searchDeals(deals || [], search, byVenue), [deals, search, byVenue]);
  const filteredDeals = useMemo(() => applyPipelineFilters(matches.map((m) => m.deal), filters), [matches, filters]);
  const hints = useMemo(
    () => new Map(matches.filter((m) => m.hint).map((m) => [m.deal.id, m.hint as string])),
    [matches]
  );

  // Existing venues / contacts matching the search but with no opportunity at all yet.
  const orphans = useMemo(() => {
    if (!search.trim()) return { venues: [], contacts: [] };
    const dealVenues = new Set((deals || []).map((d) => d.venue_id).filter(Boolean));
    const dealContacts = new Set((deals || []).map((d) => d.contact_id).filter(Boolean));
    return {
      venues: (venues || [])
        .filter((v) => !dealVenues.has(v.id))
        .filter((v) => matchesQuery([v.name, v.city, v.postal_code, v.email, v.instagram, v.website], search))
        .slice(0, 5),
      contacts: (contacts || [])
        .filter((c) => !dealContacts.has(c.id) && !(c.venue_id && dealVenues.has(c.venue_id)))
        .filter((c) => matchesQuery([c.name, c.email, c.phone, c.role, c.venue?.name], search))
        .slice(0, 5),
    };
  }, [search, deals, venues, contacts]);

  const openCreate = (p: { venueId?: string; contactId?: string } = {}) => {
    setPrefill((prev) => ({ ...p, n: prev.n + 1 }));
    setCreateOpen(true);
  };

  // Open deal from URL params
  const urlDealId = searchParams.get('deal');
  const activeDealId = selectedDealId || urlDealId;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-6 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-96" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-4">
          <h1 className="text-xl font-bold hidden md:block">Pipeline</h1>
          <Tabs value={view} onValueChange={(v) => setView(v as 'kanban' | 'table')}>
            <TabsList>
              <TabsTrigger value="kanban" className="gap-2">
                <Kanban className="h-3.5 w-3.5" />
                Kanban
              </TabsTrigger>
              <TabsTrigger value="table" className="gap-2">
                <Table2 className="h-3.5 w-3.5" />
                Table
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
        <Button size="sm" className="gap-2" onClick={() => openCreate()}>
          <Plus className="h-4 w-4" />
          Nouvelle opportunité
        </Button>
      </div>

      {/* Search: "have I already created an opportunity for this?" */}
      <div className="space-y-2">
        <div className="relative max-w-xl">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Rechercher un lieu, une ville, un contact, un email, un tag, une note..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && setSearch('')}
            className="pl-9 pr-9"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label="Effacer la recherche"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <PipelineFilters deals={deals || []} filters={filters} setFilters={setFilters} />

        {search.trim() && (
          <div className="rounded-lg border bg-card/50 px-3 py-2 text-sm space-y-2">
            <p className={filteredDeals.length ? 'text-muted-foreground' : 'font-medium'}>
              {filteredDeals.length === 0
                ? `Aucune opportunité ne correspond à « ${search.trim()} ».`
                : `${filteredDeals.length} opportunité${filteredDeals.length > 1 ? 's' : ''} correspond${
                    filteredDeals.length > 1 ? 'ent' : ''
                  } à « ${search.trim()} ».`}
            </p>

            {(orphans.venues.length > 0 || orphans.contacts.length > 0) && (
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">
                  Déjà dans vos lieux &amp; contacts, sans opportunité :
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {orphans.venues.map((v) => (
                    <Button
                      key={v.id}
                      size="sm"
                      variant="outline"
                      className="h-7 gap-1.5 text-xs"
                      onClick={() => openCreate({ venueId: v.id })}
                      title="Créer une opportunité pour ce lieu"
                    >
                      <Building2 className="h-3 w-3" />
                      {v.name}
                      {v.city && <span className="text-muted-foreground">· {v.city}</span>}
                      <Plus className="h-3 w-3" />
                    </Button>
                  ))}
                  {orphans.contacts.map((c) => (
                    <Button
                      key={c.id}
                      size="sm"
                      variant="outline"
                      className="h-7 gap-1.5 text-xs"
                      onClick={() => openCreate({ contactId: c.id })}
                      title="Créer une opportunité pour ce contact"
                    >
                      <User className="h-3 w-3" />
                      {c.name}
                      {c.venue?.name && <span className="text-muted-foreground">· {c.venue.name}</span>}
                      <Plus className="h-3 w-3" />
                    </Button>
                  ))}
                </div>
              </div>
            )}

            {filteredDeals.length === 0 && orphans.venues.length === 0 && orphans.contacts.length === 0 && (
              <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs" onClick={() => openCreate()}>
                <Plus className="h-3 w-3" />
                Créer une nouvelle opportunité
              </Button>
            )}
          </div>
        )}
      </div>

      {/* View */}
      <AnimatePresence mode="wait">
        <motion.div
          key={view}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.2 }}
        >
          {view === 'kanban' ? (
            <KanbanBoard
              deals={filteredDeals}
              hints={hints}
              hideEmptyColumns={!!search.trim() || filteredDeals.length !== (deals || []).length}
              onDealClick={(id) => setSelectedDealId(id)}
            />
          ) : (
            <PipelineTable
              deals={filteredDeals}
              hints={hints}
              onDealClick={(id) => setSelectedDealId(id)}
            />
          )}
        </motion.div>
      </AnimatePresence>

      {/* Side panel */}
      {activeDealId && (
        <DealSidePanel
          dealId={activeDealId}
          onClose={() => {
            setSelectedDealId(null);
            // Opened from a link (?deal=…): drop the param, otherwise the panel can't be closed.
            if (urlDealId) router.replace('/pipeline', { scroll: false });
          }}
        />
      )}

      {/* Create dialog */}
      <CreateDealDialog
        key={prefill.n}
        open={createOpen}
        onOpenChange={setCreateOpen}
        initialVenueId={prefill.venueId}
        initialContactId={prefill.contactId}
      />
    </div>
  );
}

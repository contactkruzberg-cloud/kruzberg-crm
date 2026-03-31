'use client';

import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { useVenues } from '@/hooks/use-venues';
import { useContacts } from '@/hooks/use-contacts';
import { useDeals } from '@/hooks/use-deals';
import { VenueList } from '@/components/venues/venue-list';
import { VenueDetail } from '@/components/venues/venue-detail';
import { CreateVenueDialog } from '@/components/venues/create-venue-dialog';
import { ImportWizard } from '@/components/venues/import-wizard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Plus, Upload, Download, Search, SlidersHorizontal, X, ArrowUpDown } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { exportAllData } from '@/utils/export-xlsx';
import { cn } from '@/lib/utils';
import type { VenueType } from '@/types/database';

const TYPE_OPTIONS: { key: VenueType | 'all'; label: string }[] = [
  { key: 'all', label: 'Tous' },
  { key: 'bar', label: 'Bar' },
  { key: 'salle', label: 'Salle' },
  { key: 'festival', label: 'Festival' },
  { key: 'cafe_concert', label: 'Café Concert' },
  { key: 'mjc', label: 'MJC' },
  { key: 'organisateur', label: 'Organisateur' },
  { key: 'other', label: 'Autre' },
];

type VenueSortKey = 'name' | 'city' | 'fit_score' | 'type' | 'created_at';
type ContactSortKey = 'name' | 'venue' | 'role' | 'created_at';

const VENUE_SORT_OPTIONS: { key: VenueSortKey; label: string }[] = [
  { key: 'fit_score', label: 'Pertinence (Fit)' },
  { key: 'name', label: 'Nom A→Z' },
  { key: 'city', label: 'Ville A→Z' },
  { key: 'type', label: 'Type' },
  { key: 'created_at', label: 'Récent' },
];

const CONTACT_SORT_OPTIONS: { key: ContactSortKey; label: string }[] = [
  { key: 'name', label: 'Nom A→Z' },
  { key: 'venue', label: 'Lieu A→Z' },
  { key: 'role', label: 'Rôle' },
  { key: 'created_at', label: 'Récent' },
];

export default function VenuesPage() {
  const { data: venues, isLoading: venuesLoading } = useVenues();
  const { data: contacts, isLoading: contactsLoading } = useContacts();
  const { data: deals } = useDeals();
  const [selectedVenueId, setSelectedVenueId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState('venues');

  // Venue filters
  const [typeFilter, setTypeFilter] = useState<VenueType | 'all'>('all');
  const [cityFilter, setCityFilter] = useState<string>('all');
  const [fitFilter, setFitFilter] = useState<number | 'all'>('all');
  const [venueSort, setVenueSort] = useState<VenueSortKey>('fit_score');
  const [showFilters, setShowFilters] = useState(false);

  // Contact filters
  const [contactRoleFilter, setContactRoleFilter] = useState<string>('all');
  const [contactSort, setContactSort] = useState<ContactSortKey>('name');

  const isLoading = venuesLoading || contactsLoading;

  // Extract unique cities for filter
  const cities = useMemo(() => {
    const set = new Set((venues || []).map((v) => v.city).filter(Boolean));
    return Array.from(set).sort();
  }, [venues]);

  // Extract unique roles for contact filter
  const roles = useMemo(() => {
    const set = new Set((contacts || []).map((c) => c.role).filter(Boolean) as string[]);
    return Array.from(set).sort();
  }, [contacts]);

  // Count active filters
  const activeFilterCount = [
    typeFilter !== 'all',
    cityFilter !== 'all',
    fitFilter !== 'all',
  ].filter(Boolean).length;

  // Filtered & sorted venues
  const filteredVenues = useMemo(() => {
    let result = [...(venues || [])];

    // Text search
    if (search) {
      const q = search.toLowerCase();
      result = result.filter((v) =>
        v.name.toLowerCase().includes(q) ||
        v.city.toLowerCase().includes(q) ||
        v.type.toLowerCase().includes(q) ||
        v.email?.toLowerCase().includes(q) ||
        v.notes?.toLowerCase().includes(q)
      );
    }

    // Type filter
    if (typeFilter !== 'all') {
      result = result.filter((v) => v.type === typeFilter);
    }

    // City filter
    if (cityFilter !== 'all') {
      result = result.filter((v) => v.city === cityFilter);
    }

    // Fit filter
    if (fitFilter !== 'all') {
      result = result.filter((v) => v.fit_score >= fitFilter);
    }

    // Sort
    result.sort((a, b) => {
      switch (venueSort) {
        case 'fit_score':
          return b.fit_score - a.fit_score;
        case 'name':
          return a.name.localeCompare(b.name, 'fr');
        case 'city':
          return a.city.localeCompare(b.city, 'fr');
        case 'type':
          return a.type.localeCompare(b.type, 'fr');
        case 'created_at':
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        default:
          return 0;
      }
    });

    return result;
  }, [venues, search, typeFilter, cityFilter, fitFilter, venueSort]);

  // Filtered & sorted contacts
  const filteredContacts = useMemo(() => {
    let result = [...(contacts || [])];

    if (search) {
      const q = search.toLowerCase();
      result = result.filter((c) =>
        c.name.toLowerCase().includes(q) ||
        c.email?.toLowerCase().includes(q) ||
        c.venue?.name?.toLowerCase().includes(q) ||
        c.role?.toLowerCase().includes(q) ||
        c.notes?.toLowerCase().includes(q)
      );
    }

    if (contactRoleFilter !== 'all') {
      result = result.filter((c) => c.role === contactRoleFilter);
    }

    result.sort((a, b) => {
      switch (contactSort) {
        case 'name':
          return a.name.localeCompare(b.name, 'fr');
        case 'venue':
          return (a.venue?.name || '').localeCompare(b.venue?.name || '', 'fr');
        case 'role':
          return (a.role || '').localeCompare(b.role || '', 'fr');
        case 'created_at':
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        default:
          return 0;
      }
    });

    return result;
  }, [contacts, search, contactRoleFilter, contactSort]);

  const clearFilters = () => {
    setTypeFilter('all');
    setCityFilter('all');
    setFitFilter('all');
    setSearch('');
    setContactRoleFilter('all');
  };

  const selectedVenue = venues?.find((v) => v.id === selectedVenueId);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1 space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-20" />
            ))}
          </div>
          <div className="lg:col-span-2">
            <Skeleton className="h-96" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-4">
          <h1 className="text-xl font-bold">Lieux & Contacts</h1>
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList>
              <TabsTrigger value="venues">Lieux ({filteredVenues.length}/{venues?.length || 0})</TabsTrigger>
              <TabsTrigger value="contacts">Contacts ({filteredContacts.length}/{contacts?.length || 0})</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() => exportAllData(venues || [], contacts || [], deals || [])}
          >
            <Download className="h-4 w-4" />
            Exporter
          </Button>
          <Button variant="outline" size="sm" className="gap-2" onClick={() => setImportOpen(true)}>
            <Upload className="h-4 w-4" />
            Importer
          </Button>
          <Button size="sm" className="gap-2" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" />
            {tab === 'venues' ? 'Ajouter un lieu' : 'Ajouter un contact'}
          </Button>
        </div>
      </div>

      {/* Search + filter toggle */}
      <div className="flex gap-2 items-center flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Rechercher nom, ville, email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Button
          variant={showFilters || activeFilterCount > 0 ? 'default' : 'outline'}
          size="sm"
          className="gap-2"
          onClick={() => setShowFilters(!showFilters)}
        >
          <SlidersHorizontal className="h-4 w-4" />
          Filtres
          {activeFilterCount > 0 && (
            <Badge variant="secondary" className="ml-1 text-[10px] px-1.5 bg-primary-foreground/20">
              {activeFilterCount}
            </Badge>
          )}
        </Button>

        {/* Sort */}
        <Select
          value={tab === 'venues' ? venueSort : contactSort}
          onValueChange={(v) => {
            if (tab === 'venues') setVenueSort(v as VenueSortKey);
            else setContactSort(v as ContactSortKey);
          }}
        >
          <SelectTrigger className="w-44 h-9 text-xs">
            <ArrowUpDown className="h-3 w-3 mr-1.5" />
            <SelectValue placeholder="Trier par..." />
          </SelectTrigger>
          <SelectContent>
            {(tab === 'venues' ? VENUE_SORT_OPTIONS : CONTACT_SORT_OPTIONS).map((opt) => (
              <SelectItem key={opt.key} value={opt.key}>{opt.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {activeFilterCount > 0 && (
          <Button variant="ghost" size="sm" className="text-xs gap-1 text-muted-foreground" onClick={clearFilters}>
            <X className="h-3 w-3" />
            Effacer
          </Button>
        )}
      </div>

      {/* Filter bar */}
      {showFilters && tab === 'venues' && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          className="flex gap-3 flex-wrap items-end"
        >
          {/* Type pills */}
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Type</p>
            <div className="flex gap-1.5 flex-wrap">
              {TYPE_OPTIONS.map((opt) => {
                const count = opt.key === 'all'
                  ? venues?.length || 0
                  : venues?.filter((v) => v.type === opt.key).length || 0;
                return (
                  <button
                    key={opt.key}
                    onClick={() => setTypeFilter(opt.key)}
                    className={cn(
                      'px-2.5 py-1 rounded-full text-xs font-medium transition-all border',
                      typeFilter === opt.key
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-card text-muted-foreground border-border hover:border-primary/50'
                    )}
                  >
                    {opt.label} ({count})
                  </button>
                );
              })}
            </div>
          </div>

          {/* City */}
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Ville</p>
            <Select value={cityFilter} onValueChange={setCityFilter}>
              <SelectTrigger className="w-44 h-8 text-xs">
                <SelectValue placeholder="Toutes les villes" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toutes les villes</SelectItem>
                {cities.map((city) => {
                  const count = venues?.filter((v) => v.city === city).length || 0;
                  return (
                    <SelectItem key={city} value={city}>
                      {city} ({count})
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>

          {/* Fit score minimum */}
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Fit minimum</p>
            <div className="flex gap-1">
              <button
                onClick={() => setFitFilter('all')}
                className={cn(
                  'px-2 py-1 rounded text-xs border transition-all',
                  fitFilter === 'all' ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground'
                )}
              >
                Tous
              </button>
              {[3, 4, 5].map((score) => (
                <button
                  key={score}
                  onClick={() => setFitFilter(score)}
                  className={cn(
                    'px-2 py-1 rounded text-xs border transition-all',
                    fitFilter === score ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground'
                  )}
                >
                  {score}★+
                </button>
              ))}
            </div>
          </div>
        </motion.div>
      )}

      {/* Contact filters */}
      {showFilters && tab === 'contacts' && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          className="flex gap-3 flex-wrap items-end"
        >
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Rôle</p>
            <Select value={contactRoleFilter} onValueChange={setContactRoleFilter}>
              <SelectTrigger className="w-44 h-8 text-xs">
                <SelectValue placeholder="Tous les rôles" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les rôles</SelectItem>
                {roles.map((role) => (
                  <SelectItem key={role} value={role}>{role}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </motion.div>
      )}

      {/* Content */}
      {tab === 'venues' ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1">
            <VenueList
              venues={filteredVenues}
              selectedId={selectedVenueId}
              onSelect={setSelectedVenueId}
            />
          </div>
          <div className="lg:col-span-2">
            {selectedVenue ? (
              <motion.div
                key={selectedVenue.id}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.2 }}
              >
                <VenueDetail venue={selectedVenue} contacts={contacts || []} />
              </motion.div>
            ) : (
              <div className="flex items-center justify-center h-64 text-muted-foreground border rounded-xl border-dashed">
                <p className="text-sm">Sélectionnez un lieu pour voir les détails</p>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="rounded-xl border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-left p-3 text-xs font-medium text-muted-foreground">Nom</th>
                <th className="text-left p-3 text-xs font-medium text-muted-foreground">Lieu</th>
                <th className="text-left p-3 text-xs font-medium text-muted-foreground">Email</th>
                <th className="text-left p-3 text-xs font-medium text-muted-foreground">Rôle</th>
                <th className="text-left p-3 text-xs font-medium text-muted-foreground">Ton</th>
                <th className="text-left p-3 text-xs font-medium text-muted-foreground">Méthode</th>
              </tr>
            </thead>
            <tbody>
              {filteredContacts.map((contact) => (
                <tr key={contact.id} className="border-b hover:bg-muted/30 transition-colors">
                  <td className="p-3 font-medium">{contact.name}</td>
                  <td className="p-3 text-muted-foreground">{contact.venue?.name || '—'}</td>
                  <td className="p-3 text-muted-foreground text-xs">{contact.email || '—'}</td>
                  <td className="p-3 text-muted-foreground">{contact.role || '—'}</td>
                  <td className="p-3">
                    <span className={`text-xs font-medium ${contact.tone === 'tu' ? 'text-primary' : 'text-muted-foreground'}`}>
                      {contact.tone === 'tu' ? 'Tu' : 'Vous'}
                    </span>
                  </td>
                  <td className="p-3">
                    <Badge variant="outline" className="text-[10px]">
                      {contact.pref_method}
                    </Badge>
                  </td>
                </tr>
              ))}
              {filteredContacts.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-muted-foreground">
                    Aucun contact trouvé
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <CreateVenueDialog open={createOpen} onOpenChange={setCreateOpen} />
      <ImportWizard open={importOpen} onOpenChange={setImportOpen} />
    </div>
  );
}

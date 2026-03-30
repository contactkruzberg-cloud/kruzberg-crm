'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { useVenues } from '@/hooks/use-venues';
import { useContacts } from '@/hooks/use-contacts';
import { VenueList } from '@/components/venues/venue-list';
import { VenueDetail } from '@/components/venues/venue-detail';
import { CreateVenueDialog } from '@/components/venues/create-venue-dialog';
import { ImportWizard } from '@/components/venues/import-wizard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Plus, Upload, Download, Search } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { useDeals } from '@/hooks/use-deals';
import { exportAllData } from '@/utils/export-xlsx';

export default function VenuesPage() {
  const { data: venues, isLoading: venuesLoading } = useVenues();
  const { data: contacts, isLoading: contactsLoading } = useContacts();
  const { data: deals } = useDeals();
  const [selectedVenueId, setSelectedVenueId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState('venues');

  const isLoading = venuesLoading || contactsLoading;

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

  const filteredVenues = (venues || []).filter((v) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      v.name.toLowerCase().includes(q) ||
      v.city.toLowerCase().includes(q) ||
      v.type.toLowerCase().includes(q)
    );
  });

  const filteredContacts = (contacts || []).filter((c) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      c.name.toLowerCase().includes(q) ||
      c.email?.toLowerCase().includes(q) ||
      c.venue?.name?.toLowerCase().includes(q)
    );
  });

  const selectedVenue = venues?.find((v) => v.id === selectedVenueId);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-4">
          <h1 className="text-xl font-bold">Lieux & Contacts</h1>
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList>
              <TabsTrigger value="venues">Lieux ({venues?.length || 0})</TabsTrigger>
              <TabsTrigger value="contacts">Contacts ({contacts?.length || 0})</TabsTrigger>
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

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Rechercher..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

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
              </tr>
            </thead>
            <tbody>
              {filteredContacts.map((contact) => (
                <tr key={contact.id} className="border-b hover:bg-muted/30 transition-colors">
                  <td className="p-3 font-medium">{contact.name}</td>
                  <td className="p-3 text-muted-foreground">{contact.venue?.name || '—'}</td>
                  <td className="p-3 text-muted-foreground">{contact.email || '—'}</td>
                  <td className="p-3 text-muted-foreground">{contact.role || '—'}</td>
                  <td className="p-3">
                    <span className={`text-xs font-medium ${contact.tone === 'tu' ? 'text-primary' : 'text-muted-foreground'}`}>
                      {contact.tone === 'tu' ? 'Tu' : 'Vous'}
                    </span>
                  </td>
                </tr>
              ))}
              {filteredContacts.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-muted-foreground">
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

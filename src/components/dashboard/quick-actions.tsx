'use client';

import { Button } from '@/components/ui/button';
import { Plus, Kanban } from 'lucide-react';
import Link from 'next/link';

export function QuickActions() {
  return (
    <div className="flex flex-wrap gap-3">
      <Button asChild size="sm" className="gap-2">
        <Link href="/venues?new=true">
          <Plus className="h-4 w-4" />
          Ajouter un lieu
        </Link>
      </Button>
      <Button asChild variant="outline" size="sm" className="gap-2">
        <Link href="/pipeline?new=true">
          <Kanban className="h-4 w-4" />
          Créer une opportunité
        </Link>
      </Button>
    </div>
  );
}

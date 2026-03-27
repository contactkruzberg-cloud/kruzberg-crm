'use client';

import { Button } from '@/components/ui/button';
import { Plus, Kanban, Target } from 'lucide-react';
import Link from 'next/link';
import { useAppStore } from '@/stores/app-store';

export function QuickActions() {
  const setFocusModeActive = useAppStore((s) => s.setFocusModeActive);

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
      <Button
        variant="outline"
        size="sm"
        className="gap-2"
        asChild
      >
        <Link href="/focus">
          <Target className="h-4 w-4" />
          Focus Mode
        </Link>
      </Button>
    </div>
  );
}

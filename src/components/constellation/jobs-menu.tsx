'use client';

import { useState } from 'react';
import { AlertTriangle, CheckCircle2, History, Loader2, X } from 'lucide-react';
import type { Job } from '@/lib/constellation/types';
import { Button } from './ui';

const KIND: Record<Job['kind'], string> = { band: 'Parcours', discover: 'Découverte', discover_lyon: 'Découverte', roster: 'Catalogue', synthesis: 'Synthèse' };

function dur(j: Job) {
  if (!j.startedAt) return '';
  const end = j.doneAt ? Date.parse(j.doneAt) : Date.now();
  const s = Math.round((end - Date.parse(j.startedAt)) / 1000);
  return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${s % 60} s`;
}

export function JobsMenu({ jobs, onCancel }: { jobs: Job[]; onCancel: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const cost = jobs.reduce((s, j) => s + (j.costUsd ?? 0), 0);
  return (
    <div className="relative">
      <Button size="sm" onClick={() => setOpen(!open)}>
        <History className="size-3.5" /> Journal
      </Button>
      {open && (
        <div className="absolute right-0 z-40 mt-2 w-96 rounded-xl border border-border bg-card p-2 shadow-2xl">
          {jobs.length === 0 && <p className="p-3 text-sm text-muted-foreground">Aucune recherche lancée.</p>}
          <ul className="max-h-96 overflow-y-auto">
            {jobs.map((j) => (
              <li key={j.id} className="flex items-start gap-2 rounded-md px-2 py-2 text-sm hover:bg-accent/50">
                <span className="mt-0.5">
                  {j.status === 'running' || j.status === 'queued' ? (
                    <Loader2 className={`size-4 ${j.status === 'running' ? 'animate-spin text-primary' : 'text-muted-foreground'}`} />
                  ) : j.status === 'done' ? (
                    <CheckCircle2 className="size-4 text-primary" />
                  ) : (
                    <AlertTriangle className="size-4 text-destructive" />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate">
                    <span className="text-muted-foreground">{KIND[j.kind]} ·</span> {j.label}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {j.status === 'queued' && 'En attente'}
                    {j.status === 'running' && `En cours · ${dur(j)}`}
                    {j.status === 'done' && `${j.added ?? 0} ajout(s) · ${dur(j)}`}
                    {j.status === 'error' && (j.error ?? 'Erreur')}
                  </div>
                </div>
                {j.status === 'queued' && (
                  <button onClick={() => onCancel(j.id)} className="text-muted-foreground hover:text-foreground" aria-label="Annuler">
                    <X className="size-4" />
                  </button>
                )}
              </li>
            ))}
          </ul>
          {cost > 0 && <p className="border-t border-border px-2 pt-2 text-[11px] text-muted-foreground">Équivalent API des recherches : {cost.toFixed(2)} $ (inclus dans l’abonnement Claude).</p>}
        </div>
      )}
    </div>
  );
}

'use client';

import { TodayList } from '@/components/dashboard/today';
import { NextDates, PipelineGlance } from '@/components/dashboard/glance';

// Accueil : ce qu'il faut faire aujourd'hui, puis les prochaines dates et où
// en est le booking. Le reste vit dans sa propre page.
export default function DashboardPage() {
  const date = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <div className="mx-auto max-w-6xl pt-2 md:pt-6">
      <header>
        <p className="text-[13px] font-semibold uppercase tracking-wide text-muted-foreground">{date}</p>
        <h1 className="font-display mt-0.5 text-[34px] font-bold leading-tight">Aujourd’hui</h1>
      </header>

      <div className="mt-8 grid grid-cols-1 gap-x-16 gap-y-12 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <TodayList />
        <div className="space-y-12">
          <NextDates />
          <PipelineGlance />
        </div>
      </div>
    </div>
  );
}

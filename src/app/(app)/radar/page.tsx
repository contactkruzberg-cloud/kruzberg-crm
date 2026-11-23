import { RadarSections } from '@/components/radar/radar-sections';

// KRUZBERG Booking Radar: leads found by the booking search (launched from here),
// triaged, written to and handed to the pipeline from here; plus the Constellation
// (the names that keep coming back around the bands of KRUZBERG's niche).
export default async function RadarPage({ searchParams }: { searchParams: Promise<{ vue?: string | string[] }> }) {
  const { vue } = await searchParams;
  return <RadarSections initial={vue === 'constellation' ? 'constellation' : 'pistes'} />;
}

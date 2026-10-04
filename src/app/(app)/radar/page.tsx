import { RadarView } from '@/components/radar/radar-view';

// KRUZBERG Booking Radar: leads found every morning by the daily search,
// triaged, written to and handed to the pipeline from here. Kept in two-way
// sync with the radar of the claude.ai artifact (see src/lib/mcp/radar-sync.ts).
export default function RadarPage() {
  return <RadarView />;
}

'use client';

import { useAppStore } from '@/stores/app-store';

// KRUZBERG Booking Radar, moved from the claude.ai artifact into the CRM.
// The radar UI (public/radar-app/index.html) runs in a frame so its own styles
// stay isolated; it reads and writes the CRM through /api/radar/* with the
// current session (see public/radar-app/crm-bridge.js).
export default function RadarPage() {
  const theme = useAppStore((s) => s.theme);
  const resolved =
    theme === 'system'
      ? typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light'
      : theme;
  return (
    <div className="-m-3 sm:-m-4 lg:-m-6">
      <iframe
        key={resolved}
        src={`/radar-app/index.html?theme=${resolved}`}
        title="Booking Radar"
        className="block w-full border-0 h-[calc(100vh-7rem)]"
      />
    </div>
  );
}

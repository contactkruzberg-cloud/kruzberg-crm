'use client';

import { useSyncExternalStore } from 'react';

// "Enregistré ✓" indicator: inline-edit mutations (meta.saveIndicator) mark
// the time of their last successful save; the header shows it briefly.

let savedAt = 0;
const listeners = new Set<() => void>();

export function markSaved() {
  savedAt = Date.now();
  listeners.forEach((l) => l());
}

export function useSavedAt() {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => savedAt,
    () => 0,
  );
}

export const SAVE_META = { saveIndicator: true } as const;

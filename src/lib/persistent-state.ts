'use client';

import { useCallback, useMemo, useSyncExternalStore, type SetStateAction } from 'react';

// UI preferences remembered across reloads (view, filters, collapsed
// sections…), stored in localStorage. Built on useSyncExternalStore so the
// server render uses the default and the browser value applies on hydration.

const PREFIX = 'kz:';
const listeners = new Set<() => void>();

function subscribe(cb: () => void) {
  listeners.add(cb);
  window.addEventListener('storage', cb);
  return () => {
    listeners.delete(cb);
    window.removeEventListener('storage', cb);
  };
}

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(PREFIX + key);
  } catch {
    return null;
  }
}

export function usePersistentState<T>(key: string, initial: T): [T, (next: SetStateAction<T>) => void] {
  // Serialized default: stable across renders even for object/array literals.
  const fallback = JSON.stringify(initial);
  const raw = useSyncExternalStore(
    subscribe,
    () => read(key),
    () => null,
  );
  const value = useMemo<T>(() => parse<T>(raw, fallback), [raw, fallback]);

  const set = useCallback(
    (next: SetStateAction<T>) => {
      const current = parse<T>(read(key), fallback);
      const resolved = typeof next === 'function' ? (next as (prev: T) => T)(current) : next;
      try {
        window.localStorage.setItem(PREFIX + key, JSON.stringify(resolved));
      } catch {
        // Private mode / storage full: the preference just won't be remembered.
      }
      listeners.forEach((l) => l());
    },
    [key, fallback],
  );
  return [value, set];
}

function parse<T>(raw: string | null, fallback: string): T {
  try {
    return JSON.parse(raw ?? fallback) as T;
  } catch {
    return JSON.parse(fallback) as T;
  }
}

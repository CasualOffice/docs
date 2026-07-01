/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/**
 * Persistent preference for which counters appear in the status bar.
 * Mirrors Excel's right-click-on-status-bar checklist (and the sibling
 * Casual Sheets implementation at
 * `services/sheet/apps/web/src/shell/use-statbar-prefs.ts`).
 *
 * Stored via a small module-level store so two consumers (the stats
 * row + the right-click customisation popover) always see the same
 * flags without prop-drilling.
 */

import { useSyncExternalStore } from 'react';

export type StatKey = 'page' | 'words' | 'chars' | 'readingTime' | 'readability';

export type StatPrefs = Record<StatKey, boolean>;

const STORAGE_KEY = 'docx-editor-statbar-prefs';

const DEFAULTS: StatPrefs = {
  page: true,
  words: true,
  chars: true,
  readingTime: true,
  readability: false,
};

function read(): StatPrefs {
  if (typeof window === 'undefined') return { ...DEFAULTS };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<StatPrefs>;
    return { ...DEFAULTS, ...parsed };
  } catch {
    return { ...DEFAULTS };
  }
}

let current: StatPrefs = read();
const subs = new Set<() => void>();

function subscribe(fn: () => void): () => void {
  subs.add(fn);
  return () => {
    subs.delete(fn);
  };
}
function snapshot(): StatPrefs {
  return current;
}
function serverSnapshot(): StatPrefs {
  return DEFAULTS;
}

function setPrefs(next: StatPrefs): void {
  current = next;
  try {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    }
  } catch {
    /* Private-mode / quota — preference stays in-memory only. */
  }
  for (const fn of subs) {
    try {
      fn();
    } catch {
      /* Subscriber threw — ignore so one broken consumer doesn't crash the rest. */
    }
  }
}

export function useStatPrefs(): {
  prefs: StatPrefs;
  toggle: (key: StatKey) => void;
} {
  const prefs = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  const toggle = (key: StatKey) => setPrefs({ ...prefs, [key]: !prefs[key] });
  return { prefs, toggle };
}

export const STAT_LABELS: Record<StatKey, string> = {
  page: 'Page indicator',
  words: 'Word count',
  chars: 'Character count',
  readingTime: 'Reading time',
  readability: 'Readability score & sentence highlights',
};

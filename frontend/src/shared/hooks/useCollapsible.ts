import { useState } from 'react';

import { readJson, writeJson } from '@/shared/storage';

/**
 * Open/closed state of a panel section, persisted under `storageKey`.
 * Panels collapse only when the user asks — never automatically.
 */
export function useCollapsible(storageKey: string, defaultOpen = true): [boolean, () => void] {
  const [open, setOpen] = useState(() => readJson(storageKey, defaultOpen));
  const toggle = () => {
    setOpen(!open);
    writeJson(storageKey, !open);
  };
  return [open, toggle];
}

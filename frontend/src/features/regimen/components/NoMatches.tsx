import { Globe } from 'lucide-react';

import type { ResolveMatch } from '@/api/schemas';
import type { RxNormStatus } from '@/features/search';
import { useExplorer } from '@/state';

/** Empty state of a column search: RxNorm "did you mean", or an honest "no match". */
export function NoMatches({
  query,
  needsLive,
  status,
  suggestions,
  onPick,
}: {
  query: string;
  needsLive: boolean;
  status: RxNormStatus;
  suggestions: ResolveMatch[];
  onPick: (id: string) => void;
}) {
  const trimmed = query.trim();
  return (
    <div className="px-3 py-4 text-xs">
      {needsLive && status !== 'done' && (
        <p className="flex items-center gap-1.5 text-muted-foreground">
          <Globe className="size-3.5 animate-pulse" /> Checking RxNorm for “{trimmed}”…
        </p>
      )}
      {needsLive && status === 'done' && suggestions.length > 0 && (
        <>
          <p className="mb-1.5 flex items-center gap-1.5 text-[10px] tracking-wide text-muted-foreground uppercase">
            <Globe className="size-3" /> Did you mean (RxNorm)
          </p>
          {suggestions.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => onPick(m.id)}
              onPointerEnter={() => useExplorer.getState().setHover(m.id, 'list')}
              className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left hover:bg-muted/70"
            >
              <span className="font-medium">{m.name}</span>
              <span className="text-[10px] text-muted-foreground">via {m.via}</span>
            </button>
          ))}
        </>
      )}
      {(!needsLive || (status === 'done' && suggestions.length === 0)) && (
        <p className="py-2 text-center text-muted-foreground">
          No drug matches “{query}” in this dataset or RxNorm.
        </p>
      )}
    </div>
  );
}

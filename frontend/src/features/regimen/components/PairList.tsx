import { useState } from 'react';
import { cn } from 'cn';
import { ChevronRight } from 'lucide-react';

import { DirectionLine } from '@/shared/components/DirectionLine';
import { SeverityChip } from '@/shared/components/SeverityChip';
import { basisLabel, kindLabel } from '@/shared/domain';
import { pairKey, useExplorer } from '@/state';

import type { RegimenPair } from '../lib/pairs';

/** Regimen pairs as an expandable list; click pins the pair in the inspector. */
export function PairList({ pairs, name }: { pairs: RegimenPair[]; name: (id: string) => string }) {
  const overrides = useExplorer((s) => s.overrides);
  const setHover = useExplorer((s) => s.setHover);
  const [open, setOpen] = useState<string | null>(null);
  return (
    <ul>
      {pairs.map((p) => {
        const key = pairKey(p.a, p.b);
        const expanded = open === key;
        const override = overrides[key];
        return (
          <li key={key} className="border-b last:border-b-0">
            <button
              type="button"
              aria-expanded={expanded}
              disabled={!p.info}
              onClick={() => {
                setOpen(expanded ? null : key);
                useExplorer.getState().setInspectPair([p.a, p.b]);
              }}
              onPointerEnter={() => setHover(p.b, 'list')}
              onPointerLeave={() => setHover(null, 'list')}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-muted/60 disabled:cursor-default"
            >
              {p.severity ? (
                <SeverityChip severity={p.severity} compact />
              ) : (
                <span className="w-9 shrink-0 text-center font-mono text-[10px] text-muted-foreground">—</span>
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">
                  {name(p.a)} + {name(p.b)}
                </span>
                <span className="block truncate text-[10px] text-muted-foreground">
                  {!p.loaded
                    ? 'loading…'
                    : p.info
                      ? kindLabel(p.info.kind)
                      : 'not found in this dataset (not a safety claim)'}
                </span>
              </span>
              {p.info && (
                <ChevronRight
                  className={cn('size-3.5 shrink-0 text-muted-foreground transition-transform', expanded && 'rotate-90')}
                />
              )}
            </button>
            {override && (
              <p className="px-3 pb-2 text-[10px] text-muted-foreground">
                Overridden · {override.reason} · {new Date(override.at).toLocaleTimeString()}
              </p>
            )}
            {expanded && p.info && (
              <div className="px-3 pb-2.5 text-[11px] leading-relaxed">
                <p className="text-foreground/85">{p.info.mechanism}</p>
                <p className="mt-1">
                  <DirectionLine roles={p.info.roles} compact />
                </p>
                <p className="mt-1 text-[10px] text-muted-foreground">
                  Severity: {basisLabel(p.info.severity_basis)}
                </p>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

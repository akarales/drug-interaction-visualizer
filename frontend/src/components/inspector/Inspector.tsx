import { useMemo } from 'react';
import { Database, GitCompareArrows, ListTree, Pill, Share2 } from 'lucide-react';

import { InteractionList } from '@/components/inspector/InteractionList';
import { PairCard } from '@/components/inspector/PairCard';
import { Section } from '@/components/inspector/Section';
import { SeverityBar } from '@/components/inspector/SeverityBar';
import { SeverityChip } from '@/components/SeverityChip';
import {
  FAMILY_COLOR,
  FAMILY_LABEL,
  SEVERITY_RANK,
  asSeverity,
  familyOf,
  kindLabel,
  type Severity,
} from '@/lib/domain';
import {
  focusDrugId,
  pairInfo,
  pickedIds,
  useExplorer,
  type NeighborMap,
} from '@/state/explorer';

/** Worst interacting pair among the picked medications (pair-card default). */
function worstRegimenPair(
  picks: readonly string[],
  neighbors: Readonly<Record<string, NeighborMap>>,
): [string, string] | null {
  let best: [string, string] | null = null;
  let bestRank = -2;
  for (let i = 0; i < picks.length; i++)
    for (let j = i + 1; j < picks.length; j++) {
      const { info } = pairInfo(neighbors, picks[i], picks[j]);
      const rank = info ? SEVERITY_RANK[asSeverity(info.severity)] : -1;
      if (rank > bestRank) {
        bestRank = rank;
        best = [picks[i], picks[j]];
      }
    }
  return best;
}

/**
 * Right-hand inspector — one scrollable column of collapsible sections, no
 * tabs: what is focused, the pinned pair, every interaction, shared
 * interactors and dataset context.
 */
export function Inspector() {
  const focus = useExplorer(focusDrugId);
  const slots = useExplorer((s) => s.slots);
  const byId = useExplorer((s) => s.byId);
  const neighbors = useExplorer((s) => s.neighbors);
  const inspectPair = useExplorer((s) => s.inspectPair);

  const picks = useMemo(() => [...new Set(pickedIds(slots))], [slots]);
  const pair = inspectPair ?? worstRegimenPair(picks, neighbors);
  const drug = focus ? byId.get(focus) : undefined;
  const focusMap = focus ? neighbors[focus] : undefined;

  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto">
        <Section id="focus" title="Focus" icon={Pill} meta={drug ? `${drug.degree} interactions` : undefined}>
          {drug ? <FocusSummary id={drug.id} map={focusMap} /> : <Empty text="Pick a medication in a column, or click a node." />}
        </Section>

        <Section
          id="pair"
          title="Pair"
          icon={GitCompareArrows}
          meta={pair ? (inspectPair ? 'pinned' : 'worst in regimen') : undefined}
        >
          {pair ? (
            <PairCard key={`${pair[0]}|${pair[1]}`} a={pair[0]} b={pair[1]} pinned={Boolean(inspectPair)} />
          ) : (
            <Empty text="Click an interaction below, or add a second medication, to inspect a pair." />
          )}
        </Section>

        <Section
          id="interactions"
          title="Interactions"
          icon={ListTree}
          meta={focusMap ? focusMap.size.toLocaleString() : undefined}
        >
          {focus && focusMap ? (
            <InteractionList focus={focus} map={focusMap} />
          ) : (
            <Empty text={focus ? 'Loading interactions…' : 'No medication focused.'} />
          )}
        </Section>

        {pair && (
          <Section id="shared" title="Shared interactors" icon={Share2} defaultOpen={false}>
            <SharedInteractors a={pair[0]} b={pair[1]} />
          </Section>
        )}

        <Section id="dataset" title="Dataset" icon={Database} defaultOpen={false}>
          <DatasetSummary />
        </Section>
      </div>
      <footer className="shrink-0 border-t px-3 py-1.5 text-[10px] leading-snug text-muted-foreground">
        DrugBank-derived data · editorial severity · AI text is grounded in the dataset · not medical
        advice
      </footer>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="py-1 text-xs text-muted-foreground">{text}</p>;
}

function FocusSummary({ id, map }: { id: string; map: NeighborMap | undefined }) {
  const drug = useExplorer((s) => s.byId.get(id));
  const counts = useMemo(() => {
    const c: Partial<Record<Severity, number>> = {};
    for (const n of map?.values() ?? []) {
      const s = asSeverity(n.severity);
      c[s] = (c[s] ?? 0) + 1;
    }
    return c;
  }, [map]);
  if (!drug) return null;
  const family = familyOf(drug.category);
  const brands = (drug.aliases ?? []).slice(0, 6);
  return (
    <div className="flex flex-col gap-2">
      <div>
        <p className="text-base font-semibold">{drug.name}</p>
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="size-2 rounded-full" style={{ background: FAMILY_COLOR[family] }} />
          {FAMILY_LABEL[family]} · mostly {kindLabel(drug.category)}
        </p>
      </div>
      {brands.length > 0 && (
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          <span className="text-foreground/80">Also known as </span>
          {brands.join(', ')}
          {(drug.aliases?.length ?? 0) > brands.length && ` +${(drug.aliases?.length ?? 0) - brands.length}`}
        </p>
      )}
      {map ? <SeverityBar counts={counts} /> : <p className="text-xs text-muted-foreground">Loading…</p>}
    </div>
  );
}

function SharedInteractors({ a, b }: { a: string; b: string }) {
  const neighbors = useExplorer((s) => s.neighbors);
  const byId = useExplorer((s) => s.byId);
  const shared = useMemo(() => {
    const ma = neighbors[a];
    const mb = neighbors[b];
    if (!ma || !mb) return null;
    return [...ma.values()]
      .flatMap((n) => {
        const other = mb.get(n.id);
        return other ? [{ id: n.id, name: n.name, sa: asSeverity(n.severity), sb: asSeverity(other.severity) }] : [];
      })
      .sort(
        (x, y) =>
          Math.max(SEVERITY_RANK[y.sa], SEVERITY_RANK[y.sb]) - Math.max(SEVERITY_RANK[x.sa], SEVERITY_RANK[x.sb]) ||
          x.name.localeCompare(y.name),
      );
  }, [neighbors, a, b]);
  if (!shared) return <Empty text="Loading both interaction lists…" />;
  const name = (id: string) => byId.get(id)?.name ?? id;
  return (
    <div className="flex flex-col gap-1">
      <p className="text-[11px] text-muted-foreground">
        {shared.length.toLocaleString()} drugs interact with both {name(a)} and {name(b)} — adding any
        of them affects the whole pair.
      </p>
      <ul className="max-h-56 overflow-y-auto">
        {shared.slice(0, 40).map((d) => (
          <li
            key={d.id}
            onPointerEnter={() => useExplorer.getState().setHover(d.id, 'list')}
            onPointerLeave={() => useExplorer.getState().setHover(null, 'list')}
            className="flex items-center gap-1.5 rounded px-1 py-1 text-xs hover:bg-muted/60"
          >
            <span className="min-w-0 flex-1 truncate">{d.name}</span>
            <SeverityChip severity={d.sa} compact />
            <SeverityChip severity={d.sb} compact />
          </li>
        ))}
      </ul>
    </div>
  );
}

function DatasetSummary() {
  const stats = useExplorer((s) => s.stats);
  const drugs = useExplorer((s) => s.drugs);
  const hubs = useMemo(() => [...drugs].sort((x, y) => y.degree - x.degree).slice(0, 8), [drugs]);
  if (!stats) return null;
  return (
    <div className="flex flex-col gap-3 text-xs">
      <p className="text-muted-foreground">
        <span className="font-mono text-foreground">{stats.drugs.toLocaleString()}</span> drugs ·{' '}
        <span className="font-mono text-foreground">{stats.interactions.toLocaleString()}</span> pairwise
        interactions (Kaggle, DrugBank-derived)
      </p>
      <SeverityBar counts={stats.severity_mix as Partial<Record<Severity, number>>} />
      <div>
        <p className="mb-1 text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
          Most connected
        </p>
        <ol className="grid grid-cols-2 gap-x-3 gap-y-0.5">
          {hubs.map((h) => (
            <li key={h.id}>
              <button
                type="button"
                onClick={() => {
                  const s = useExplorer.getState();
                  s.pick(s.active, h.id);
                }}
                className="flex w-full items-center justify-between rounded px-1 py-0.5 hover:bg-muted/60"
              >
                <span className="truncate">{h.name}</span>
                <span className="font-mono text-[10px] text-muted-foreground">{h.degree}</span>
              </button>
            </li>
          ))}
        </ol>
      </div>
      <p className="text-[10px] leading-relaxed text-muted-foreground">
        Severity is editorial: a reviewed table by interaction type plus the ONC high-priority
        (contraindicated) pairs (Phansalkar et al., JAMIA 2012) — not clinical grading.
      </p>
    </div>
  );
}

import { Database, GitCompareArrows, ListTree, Pill, Share2 } from 'lucide-react';

import { worstRegimenPair } from '@/features/regimen';
import { focusDrugId, useExplorer, usePicks } from '@/state';

import { InteractionList } from './InteractionList';
import { PairCard } from './PairCard';
import { Section } from './Section';
import { DatasetSummary } from './sections/DatasetSummary';
import { Empty } from './sections/Empty';
import { FocusSummary } from './sections/FocusSummary';
import { SharedInteractors } from './sections/SharedInteractors';

/**
 * Right-hand inspector — one scrollable column of collapsible sections, no
 * tabs: what is focused, the pinned pair, every interaction, shared
 * interactors and dataset context.
 */
export function Inspector() {
  const focus = useExplorer(focusDrugId);
  const byId = useExplorer((s) => s.byId);
  const neighbors = useExplorer((s) => s.neighbors);
  const inspectPair = useExplorer((s) => s.inspectPair);
  const picks = usePicks();

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

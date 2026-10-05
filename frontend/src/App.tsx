import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast, Toaster } from 'sonner';

import { DrugDetail } from '@/components/DrugDetail';
import { InteractionGraph } from '@/components/InteractionGraph';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  fetchChain,
  fetchEgo,
  fetchNeighbors,
  fetchGraph,
  postExplain,
} from '@/api/client';
import type {
  ChainResponse,
  ExplanationResponse,
  GraphData,
  NeighborInfo,
} from '@/api/types';
import { Focus, RotateCcw, SearchX, Stethoscope } from 'lucide-react';

const TOP_OPTIONS = [50, 100, 150, 300];

export default function App() {
  const [top, setTop] = useState(150);
  const [data, setData] = useState<GraphData | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<GraphData | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [neighbors, setNeighbors] = useState<NeighborInfo[] | null>(null);
  const [chain, setChain] = useState<ChainResponse | null>(null);
  const [explanation, setExplanation] = useState<ExplanationResponse | null>(null);
  const [chainTarget, setChainTarget] = useState('');
  const [focusTarget, setFocusTarget] = useState('');
  const [busy, setBusy] = useState(false);
  const [explainBusy, setExplainBusy] = useState(false);
  const [severityFilter, setSeverityFilter] = useState('');
  const focusInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchGraph(top)
      .then((payload) => {
        if (!cancelled) {
          setData(payload);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setLoading(false);
          toast.error('Failed to load dataset', { description: String(err) });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [top]);

  const displayed = view ?? data;

  const selectedNode = useMemo(
    () => displayed?.nodes.find((n) => n.id === selectedId) ?? null,
    [displayed, selectedId],
  );

  const selectDrug = useCallback(async (id: string) => {
    setSelectedId(id);
    setChain(null);
    setExplanation(null);
    try {
      setNeighbors(await fetchNeighbors(id));
    } catch {
      setNeighbors(null);
    }
  }, []);

  const runChain = useCallback(async () => {
    if (!selectedId || !chainTarget.trim()) return;
    setBusy(true);
    try {
      setChain(await fetchChain(selectedId, chainTarget.trim().toLowerCase(), 3));
    } catch {
      setChain(null);
      toast.error(`No drug named "${chainTarget.trim()}"`, {
        description: 'Check the spelling — ids are lowercase, e.g. simvastatin.',
      });
    } finally {
      setBusy(false);
    }
  }, [selectedId, chainTarget]);

  const explainPair = useCallback(async () => {
    if (!selectedId || !chainTarget.trim()) return;
    setExplainBusy(true);
    setExplanation(null);
    try {
      setExplanation(
        await postExplain(selectedId, chainTarget.trim().toLowerCase(), 3),
      );
    } catch {
      toast.error('Explanation failed', { description: 'The API could not be reached.' });
    } finally {
      setExplainBusy(false);
    }
  }, [selectedId, chainTarget]);

  const focusDrug = useCallback(async () => {
    const target = focusTarget.trim().toLowerCase();
    if (!target) return;
    setBusy(true);
    try {
      const [egoGraph, neighborList] = await Promise.all([
        fetchEgo(target, 1),
        fetchNeighbors(target),
      ]);
      setView(egoGraph);
      setSelectedId(target);
      setNeighbors(neighborList);
      focusInputRef.current?.blur();
    } catch {
      toast.error(`No drug named "${focusTarget.trim()}"`, {
        description: 'Try warfarin, simvastatin, fluconazole…',
      });
    } finally {
      setBusy(false);
    }
  }, [focusTarget]);

  const resetView = useCallback(() => {
    setView(null);
    setFocusTarget('');
    setSelectedId(null);
    setNeighbors(null);
    setChain(null);
    setExplanation(null);
  }, []);

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background text-foreground">
      {/* header */}
      <header className="flex h-14 shrink-0 items-center gap-3 border-b px-4">
        <div className="flex min-w-0 items-center gap-2">
          <Stethoscope className="size-5 shrink-0 text-primary" aria-hidden />
          <h1 className="truncate text-sm font-semibold">Drug Interaction Visualizer</h1>
          {data && !loading && (
            <Badge variant="secondary" className="hidden font-mono text-[10px] md:inline-flex">
              {data.stats.drugs.toLocaleString()} drugs ·{' '}
              {data.stats.interactions.toLocaleString()} interactions
            </Badge>
          )}
        </div>

        <div className="ml-auto flex items-center gap-2">
          <Select
            value={String(top)}
            onValueChange={(value) => {
              setTop(Number(value));
              resetView();
            }}
          >
            <SelectTrigger size="sm" className="w-32" aria-label="Top hubs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TOP_OPTIONS.map((option) => (
                <SelectItem key={option} value={String(option)}>
                  Top {option} hubs
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="flex items-center gap-1.5">
            <Input
              ref={focusInputRef}
              value={focusTarget}
              onChange={(e) => setFocusTarget(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void focusDrug();
              }}
              placeholder="focus a drug…"
              className="h-8 w-40 md:w-52"
            />
            <Button
              size="sm"
              onClick={() => void focusDrug()}
              disabled={busy || !focusTarget.trim()}
            >
              <Focus />
              Focus
            </Button>
            {view && (
              <Button size="sm" variant="ghost" onClick={resetView}>
                <RotateCcw />
                Reset
              </Button>
            )}
          </div>
        </div>
      </header>

      {/* body */}
      <main className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <section className="relative min-h-[60vh] flex-1 lg:min-h-0">
          {loading && (
            <div className="flex h-full w-full flex-col gap-4 p-8">
              <Skeleton className="h-full w-full rounded-xl" />
            </div>
          )}
          {!loading && !displayed && (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
              <SearchX className="size-8 opacity-50" aria-hidden />
              No graph data.
            </div>
          )}
          {displayed && (
            <InteractionGraph
              data={displayed}
              selectedId={selectedId}
              onSelect={(id) => void selectDrug(id)}
              severityFilter={severityFilter}
            />
          )}
        </section>

        <aside className="flex min-h-0 shrink-0 flex-col border-t lg:w-96 lg:border-t-0 lg:border-l">
          <div className="min-h-0 flex-1 overflow-y-auto lg:overflow-visible">
            <DrugDetail
              graph={displayed}
              selected={selectedNode}
              neighbors={neighbors}
              chain={chain}
              explanation={explanation}
              chainTarget={chainTarget}
              onChainTargetChange={setChainTarget}
              onRunChain={() => void runChain()}
              onExplain={() => void explainPair()}
              busy={busy}
              explainBusy={explainBusy}
              severityFilter={severityFilter}
              onSeverityFilterChange={setSeverityFilter}
            />
          </div>
        </aside>
      </main>

      <Toaster position="bottom-left" richColors />
    </div>
  );
}

import { useMemo, useState } from 'react';

import type {
  ChainResponse,
  ExplanationResponse,
  GraphData,
  GraphNode,
  NeighborInfo,
} from '@/api/types';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Activity,
  ArrowRight,
  Loader2,
  MessageSquareText,
  Pill,
  Search,
  Sparkles,
} from 'lucide-react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';

interface Props {
  graph: GraphData | null;
  selected: GraphNode | null;
  neighbors: NeighborInfo[] | null;
  chain: ChainResponse | null;
  explanation: ExplanationResponse | null;
  chainTarget: string;
  onChainTargetChange: (value: string) => void;
  onRunChain: () => void;
  onExplain: () => void;
  busy: boolean;
  explainBusy: boolean;
  severityFilter: string;
  onSeverityFilterChange: (value: string) => void;
}

const severityBadge: Record<string, 'destructive' | 'secondary' | 'outline'> = {
  severe: 'destructive',
  moderate: 'secondary',
  mild: 'outline',
};

interface SeverityCount {
  name: string;
  value: number;
  color: string;
}

export function DrugDetail({
  graph,
  selected,
  neighbors,
  chain,
  explanation,
  chainTarget,
  onChainTargetChange,
  onRunChain,
  onExplain,
  busy,
  explainBusy,
  severityFilter,
  onSeverityFilterChange,
}: Props) {
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);

  const severityData = useMemo<SeverityCount[]>(() => {
    if (!graph) return [];
    const counts = { severe: 0, moderate: 0, mild: 0 };
    for (const edge of graph.edges) {
      if (edge.severity in counts) counts[edge.severity as keyof typeof counts] += 1;
    }
    return [
      { name: 'severe', value: counts.severe, color: 'var(--destructive)' },
      { name: 'moderate', value: counts.moderate, color: 'var(--muted-foreground)' },
      { name: 'mild', value: counts.mild, color: 'var(--border)' },
    ];
  }, [graph]);

  const hubs = useMemo(() => graph?.stats.hubs.slice(0, 5) ?? [], [graph]);

  const categoryCounts = useMemo(() => {
    if (!graph) return [] as { name: string; count: number }[];
    const counts = new Map<string, number>();
    for (const node of graph.nodes) {
      const key = node.category.replace('activity:', '');
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, count]) => ({ name, count }));
  }, [graph]);

  const filteredNeighbors = useMemo(() => {
    let list = neighbors ?? [];
    if (severityFilter) list = list.filter((n) => n.severity === severityFilter);
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      list = list.filter((n) => n.name.toLowerCase().includes(q));
    }
    return list;
  }, [neighbors, severityFilter, query]);

  return (
    <div className="flex h-full flex-col">
      <Tabs defaultValue={graph ? 'overview' : 'detail'} className="flex h-full min-h-0 flex-col">
        <TabsList className="m-3 grid w-auto grid-cols-4">
          <TabsTrigger value="overview">
            <Activity />
            Overview
          </TabsTrigger>
          <TabsTrigger value="detail">
            <Pill />
            Drugs
          </TabsTrigger>
          <TabsTrigger value="insights">
            <Sparkles />
            Insights
          </TabsTrigger>
          <TabsTrigger value="filters">
            <Search />
            Filters
          </TabsTrigger>
        </TabsList>

        {/* ============ OVERVIEW ============ */}
        <TabsContent value="overview" className="min-h-0 flex-1">
          <ScrollArea className="h-full">
            <div className="flex flex-col gap-4 p-4">
              <div className="grid grid-cols-3 gap-3">
                <Card className="py-3">
                  <CardContent className="px-3">
                    <p className="text-xs text-muted-foreground">Drugs</p>
                    <p className="text-xl font-semibold">
                      {graph ? graph.stats.drugs.toLocaleString() : '—'}
                    </p>
                  </CardContent>
                </Card>
                <Card className="py-3">
                  <CardContent className="px-3">
                    <p className="text-xs text-muted-foreground">Interactions</p>
                    <p className="text-xl font-semibold">
                      {graph ? graph.stats.interactions.toLocaleString() : '—'}
                    </p>
                  </CardContent>
                </Card>
                <Card className="py-3">
                  <CardContent className="px-3">
                    <p className="text-xs text-muted-foreground">Hubs</p>
                    <p className="text-xl font-semibold">{hubs.length ? 5 : '—'}</p>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Severity distribution</CardTitle>
                  <CardDescription>shown edges by classification</CardDescription>
                </CardHeader>
                <CardContent>
                  {graph ? (
                    <div className="h-40">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={severityData}
                            dataKey="value"
                            nameKey="name"
                            innerRadius="60%"
                            outerRadius="85%"
                            paddingAngle={4}
                            strokeWidth={0}
                          >
                            {severityData.map((entry) => (
                              <Cell key={entry.name} fill={entry.color} />
                            ))}
                          </Pie>
                          <Tooltip
                            contentStyle={{
                              background: 'var(--popover)',
                              border: '1px solid var(--border)',
                              borderRadius: '8px',
                              fontSize: '12px',
                            }}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="mt-1 flex justify-center gap-3 text-xs">
                        {severityData.map((s) => (
                          <span key={s.name} className="flex items-center gap-1.5">
                            <span className="size-2 rounded-full" style={{ background: s.color }} />
                            {s.name} ({s.value})
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <Skeleton className="h-40 w-full" />
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Top interacting drugs</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-1.5">
                  {hubs.map((hub, i) => (
                    <div key={hub.id} className="flex items-center justify-between text-xs">
                      <span className="font-medium">
                        {i + 1}. {hub.name}
                      </span>
                      <Badge variant="outline" className="font-mono text-[10px]">
                        {hub.degree}
                      </Badge>
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Categories in view</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-wrap gap-1.5">
                  {categoryCounts.map((cat) => (
                    <Badge key={cat.name} variant="secondary">
                      {cat.name} · {cat.count}
                    </Badge>
                  ))}
                </CardContent>
              </Card>
            </div>
          </ScrollArea>
        </TabsContent>

        {/* ============ DETAIL ============ */}
        <TabsContent value="detail" className="min-h-0 flex-1">
          <ScrollArea className="h-full">
            <div className="flex flex-col gap-4 p-4">
              {!selected && (
                <Card>
                  <CardContent className="flex flex-col items-center justify-center gap-2 py-10 text-center">
                    <p className="text-sm font-medium">Select a drug to inspect</p>
                    <p className="text-xs text-muted-foreground">
                      Click any node to see its interactions, run chain queries, and get
                      LLM explanations.
                    </p>
                  </CardContent>
                </Card>
              )}
              {selected && (
                <>
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">{selected.name}</CardTitle>
                      <CardDescription>
                        {selected.category.replace('activity:', '')} ·{' '}
                        {selected.degree} known interactions
                      </CardDescription>
                      <CardAction>
                        <Badge variant="outline" className="font-mono text-[10px]">
                          {selected.id}
                        </Badge>
                      </CardAction>
                    </CardHeader>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-sm">Interactions</CardTitle>
                      <CardDescription>
                        {filteredNeighbors.length} shown
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-3">
                      <div className="relative">
                        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          value={query}
                          onChange={(e) => setQuery(e.target.value)}
                          placeholder="Filter by name…"
                          className="pl-8"
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        {filteredNeighbors.map((neighbor) => (
                          <div key={neighbor.id}>
                            <button
                              type="button"
                              className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-xs transition-colors hover:bg-muted/60"
                              onClick={() =>
                                setExpanded(expanded === neighbor.id ? null : neighbor.id)
                              }
                            >
                              <span className="truncate pr-2 font-medium">
                                {neighbor.name}
                              </span>
                              <Badge
                                variant={severityBadge[neighbor.severity] ?? 'outline'}
                              >
                                {neighbor.severity}
                              </Badge>
                            </button>
                            {expanded === neighbor.id && (
                              <p className="mt-1 rounded-md bg-muted/50 p-2 text-xs leading-relaxed text-muted-foreground">
                                <span className="font-mono text-[10px] text-foreground/70">
                                  {neighbor.kind}
                                </span>{' '}
                                — {neighbor.mechanism}
                              </p>
                            )}
                          </div>
                        ))}
                        {filteredNeighbors.length === 0 && (
                          <p className="py-2 text-center text-xs text-muted-foreground">
                            No interactions match this filter.
                          </p>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </>
              )}
            </div>
          </ScrollArea>
        </TabsContent>

        {/* ============ INSIGHTS ============ */}
        <TabsContent value="insights" className="min-h-0 flex-1">
          <ScrollArea className="h-full">
            <div className="flex flex-col gap-4 p-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Chain finder</CardTitle>
                  <CardDescription>
                    shortest interaction path between two drugs
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-2">
                  <div className="flex gap-2">
                    <Input
                      value={chainTarget}
                      onChange={(e) => onChainTargetChange(e.target.value)}
                      placeholder="e.g. simvastatin"
                    />
                    <Button size="sm" onClick={onRunChain} disabled={busy || !chainTarget.trim()}>
                      {busy ? <Loader2 className="animate-spin" /> : <ArrowRight />}
                      Find
                    </Button>
                  </div>
                  {chain && (
                    <div className="flex flex-wrap items-center gap-1.5 rounded-md bg-muted/40 p-2 font-mono text-xs">
                      <Badge variant="outline">{chain.from}</Badge>
                      {chain.steps.map((step, i) => (
                        <span key={i} className="flex items-center gap-1.5">
                          <ArrowRight className="size-3 text-muted-foreground" />
                          <Badge variant={severityBadge[step.severity] ?? 'outline'} className="gap-1">
                            {step.to}
                            <span className="font-normal opacity-70">{step.severity}</span>
                          </Badge>
                        </span>
                      ))}
                      {!chain.connected && (
                        <span className="text-muted-foreground">
                          not connected within {chain.max_hops} hops
                        </span>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">AI explanation</CardTitle>
                  <CardDescription>plain-language, schema-constrained</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-3">
                  <Button
                    onClick={onExplain}
                    disabled={busy || explainBusy || !chainTarget.trim()}
                    className="w-full"
                  >
                    {explainBusy ? (
                      <Loader2 className="animate-spin" />
                    ) : (
                      <MessageSquareText />
                    )}
                    {explanation && !explainBusy ? 'Re-explain' : 'Explain this pair'}
                  </Button>
                  {explainBusy && (
                    <div className="flex flex-col gap-2">
                      <Skeleton className="h-4 w-3/4" />
                      <Skeleton className="h-4 w-full" />
                      <Skeleton className="h-4 w-2/3" />
                    </div>
                  )}
                  {explanation && !explainBusy && (
                    <div className="flex flex-col gap-2">
                      <div className="flex items-center gap-2">
                        <Badge
                          variant={severityBadge[explanation.payload.severity] ?? 'secondary'}
                        >
                          {explanation.payload.severity}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {explanation.direct_interaction
                            ? 'direct'
                            : explanation.chain_length > 0
                              ? `${explanation.chain_length}-hop`
                              : 'none'}{' '}
                          · {explanation.model}
                        </span>
                      </div>
                      <p className="text-xs leading-relaxed">
                        {explanation.payload.explanation}
                      </p>
                      <Separator />
                      <p className="text-xs leading-relaxed text-muted-foreground">
                        <span className="font-medium text-foreground/80">Mechanism: </span>
                        {explanation.payload.mechanism}
                      </p>
                      <p className="text-xs leading-relaxed text-muted-foreground">
                        <span className="font-medium text-foreground/80">Watch for: </span>
                        {explanation.payload.recommendation}
                      </p>
                      <Alert>
                        <AlertDescription className="text-xs">
                          {explanation.disclaimer}
                        </AlertDescription>
                      </Alert>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </ScrollArea>
        </TabsContent>

        {/* ============ FILTERS ============ */}
        <TabsContent value="filters" className="min-h-0 flex-1">
          <ScrollArea className="h-full">
            <div className="flex flex-col gap-4 p-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Severity edges</CardTitle>
                  <CardDescription>dim non-matching edges in the graph</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-3">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="sev-none"
                      checked={severityFilter === ''}
                      onCheckedChange={() => onSeverityFilterChange('')}
                    />
                    <label htmlFor="sev-none" className="text-sm">
                      Show all
                    </label>
                  </div>
                  {(['severe', 'moderate', 'mild'] as const).map((sev) => (
                    <div key={sev} className="flex items-center gap-2">
                      <Checkbox
                        id={`sev-${sev}`}
                        checked={severityFilter === sev}
                        onCheckedChange={() =>
                          onSeverityFilterChange(severityFilter === sev ? '' : sev)
                        }
                      />
                      <label htmlFor={`sev-${sev}`} className="flex items-center gap-2 text-sm">
                        <span
                          className="inline-block h-0.5 w-6 rounded"
                          style={{
                            background:
                              sev === 'severe'
                                ? 'var(--destructive)'
                                : sev === 'moderate'
                                  ? 'var(--muted-foreground)'
                                  : 'var(--border)',
                          }}
                        />
                        {sev}
                      </label>
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Dataset info</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-2 text-xs text-muted-foreground">
                  <p>
                    Real DrugBank-derived data via Kaggle — 1,701 drugs, 191,135
                    interactions, 99.6% classified from source templates.
                  </p>
                  <Separator />
                  <p>
                    Node color = category · node size = interaction count · edge
                    width = severity · hover to isolate a neighborhood.
                  </p>
                </CardContent>
              </Card>
            </div>
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </div>
  );
}

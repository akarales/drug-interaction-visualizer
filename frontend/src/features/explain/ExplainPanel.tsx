import { CircleStop, MessageSquareText, RotateCcw } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import type { Severity } from '@/shared/domain';
import { useExplorer } from '@/state';

import { GeneratedSections } from './GeneratedSections';
import { ModelChooser } from './ModelChooser';
import { runSections, useExplainStream } from './useExplainStream';

/**
 * Model choice + "Explain" for one pair, streamed: the disclaimer and the
 * dataset facts arrive first, text appears as the model writes, Stop
 * cancels the model call, and the validated final payload replaces the
 * streamed text. Runs are kept per pair and model; only the current key is
 * ever shown, so switching pair or model can never display another pair's
 * text.
 */
export function ExplainPanel({
  a,
  b,
  severity,
  ready,
}: {
  a: string;
  b: string;
  /** dataset severity of the pair (the model can never change it) */
  severity: Severity | null;
  /** interaction lists loaded — the explanation is grounded in them */
  ready: boolean;
}) {
  const modelChoice = useExplorer((s) => s.modelChoice);
  const modelKey = modelChoice ? `${modelChoice.provider}:${modelChoice.model}` : 'default';
  const key = `${a}|${b}|${modelKey}`;
  const { runs, start, stop, fallback } = useExplainStream();
  const run = runs[key];
  const streaming = run?.status === 'streaming';
  const sections = run ? runSections(run) : {};
  const hasText = Boolean(sections.clinician || sections.patient);
  const meta = run?.result ?? run?.meta;

  return (
    <div className="flex flex-col gap-2 rounded-lg border bg-muted/20 p-2.5">
      <ModelChooser />
      {streaming ? (
        <Button size="sm" variant="secondary" onClick={stop}>
          <CircleStop /> Stop
        </Button>
      ) : (
        <Button size="sm" onClick={() => start(key, a, b, modelChoice)} disabled={!ready}>
          <MessageSquareText />
          {run ? 'Explain again' : 'Explain for clinician + patient'}
        </Button>
      )}
      {streaming && !hasText && (
        <div className="flex flex-col gap-1.5" aria-hidden>
          <Skeleton className="h-3 w-3/4" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-2/3" />
        </div>
      )}
      {run?.status === 'error' && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-destructive">
          <span>{run.error}</span>
          <Button size="xs" variant="ghost" onClick={() => fallback(key, a, b, modelChoice)}>
            <RotateCcw /> Try without streaming
          </Button>
        </div>
      )}
      {run?.status === 'stopped' && <p className="text-xs text-muted-foreground">Stopped — the model request was cancelled.</p>}
      {hasText && run?.status !== 'error' && (
        <GeneratedSections
          a={a}
          b={b}
          sections={sections}
          model={meta ? `${meta.provider ?? 'llm'} / ${meta.model}` : '…'}
          disclaimer={meta?.disclaimer}
          severity={severity}
          final={run?.status === 'done'}
        />
      )}
    </div>
  );
}

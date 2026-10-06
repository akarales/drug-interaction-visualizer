import { useEffect, useRef, useState } from 'react';

import { postExplain, streamExplain, type ModelChoice } from '@/api/llm';
import type { ExplainMeta, ExplanationPayload, ExplanationResponse } from '@/api/schemas';

export type RunStatus = 'streaming' | 'done' | 'stopped' | 'error';

export interface Run {
  status: RunStatus;
  /** dataset facts + disclaimer, from the first line of the stream */
  meta?: ExplainMeta;
  /** text streamed so far, by field (`clinician.explanation`, …) */
  partial: Record<string, string>;
  /** the validated final payload — replaces the streamed text */
  result?: ExplanationResponse;
  error?: string;
}

export type Sections = { clinician?: Partial<ExplanationPayload>; patient?: Partial<ExplanationPayload> };

/** Streamed fields → section objects (single-audience fields have no prefix). */
export function partialSections(partial: Record<string, string>): Sections {
  const out: Sections = {};
  for (const [field, text] of Object.entries(partial)) {
    const [section, key] = field.includes('.') ? field.split('.', 2) : ['clinician', field];
    if (section !== 'clinician' && section !== 'patient') continue;
    out[section] = { ...out[section], [key]: text };
  }
  return out;
}

/** Sections to render for a run: the validated result once done, else the stream. */
export function runSections(run: Run): Sections {
  if (run.result) return run.result.sections ?? { clinician: run.result.payload ?? undefined };
  return partialSections(run.partial);
}

/**
 * Streamed explanations, one run per key (pair + model). Starting a run
 * cancels the previous one; Stop aborts the request (the server then drops
 * the model call); unmount aborts too.
 */
export function useExplainStream() {
  const [runs, setRuns] = useState<Record<string, Run>>({});
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);

  const update = (key: string, fn: (run: Run) => Run) =>
    setRuns((r) => ({ ...r, [key]: fn(r[key] ?? { status: 'streaming', partial: {} }) }));

  const start = (key: string, a: string, b: string, choice: ModelChoice | null) => {
    controller.current?.abort();
    const ctrl = new AbortController();
    controller.current = ctrl;
    setRuns((r) => ({ ...r, [key]: { status: 'streaming', partial: {} } }));
    streamExplain(
      a,
      b,
      choice,
      (event) => {
        if (event.type === 'start') update(key, (run) => ({ ...run, meta: event }));
        else if (event.type === 'delta')
          update(key, (run) => ({ ...run, partial: { ...run.partial, [event.field]: (run.partial[event.field] ?? '') + event.text } }));
        else if (event.type === 'done') update(key, (run) => ({ ...run, status: 'done', result: event }));
        else update(key, (run) => ({ ...run, status: 'error', error: event.error }));
      },
      ctrl.signal,
    ).catch((err: unknown) => {
      if (ctrl.signal.aborted) update(key, (run) => (run.status === 'streaming' ? { ...run, status: 'stopped' } : run));
      else update(key, (run) => ({ ...run, status: 'error', error: err instanceof Error ? err.message : String(err) }));
    });
  };

  const stop = () => controller.current?.abort();

  /** The non-streaming endpoint, for when streaming fails (e.g. a proxy buffers it). */
  const fallback = (key: string, a: string, b: string, choice: ModelChoice | null) => {
    setRuns((r) => ({ ...r, [key]: { status: 'streaming', partial: {} } }));
    postExplain(a, b, choice, 'both')
      .then((result) => update(key, (run) => ({ ...run, status: 'done', result, meta: result })))
      .catch((err: unknown) => update(key, (run) => ({ ...run, status: 'error', error: err instanceof Error ? err.message : String(err) })));
  };

  return { runs, start, stop, fallback };
}

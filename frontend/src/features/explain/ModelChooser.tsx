import { useEffect, useState } from 'react';
import { Bot, Cloud, Cpu, RefreshCw } from 'lucide-react';

import { fetchModels } from '@/api/llm';
import type { LlmProvider, ModelsResponse } from '@/api/schemas';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useExplorer } from '@/state';

const PROVIDER_LABEL: Record<LlmProvider, string> = {
  anthropic: 'Anthropic (cloud)',
  ollama: 'Ollama (local, shared)',
  stub: 'Offline',
};
const PROVIDER_ICON = { anthropic: Cloud, ollama: Cpu, stub: Bot } as const;

const encode = (provider: LlmProvider, model: string) => `${provider}::${model}`;

/**
 * Pick the provider + model for explanations. Ollama models are discovered
 * read-only from the shared instance; "loaded" models answer immediately
 * without loading anything into its memory.
 */
export function ModelChooser() {
  const choice = useExplorer((s) => s.modelChoice);
  const setChoice = useExplorer((s) => s.setModelChoice);
  const [data, setData] = useState<ModelsResponse | null>(null);
  const [error, setError] = useState(false);
  const [reloadTick, setReloadTick] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    fetchModels(controller.signal)
      .then((body) => {
        setData(body);
        setError(false);
      })
      .catch(() => {
        if (!controller.signal.aborted) setError(true);
      });
    return () => controller.abort();
  }, [reloadTick]);

  const effective = choice ?? data?.default ?? null;
  const value = effective ? encode(effective.provider, effective.model) : undefined;
  const selected = data?.providers
    .flatMap((p) => p.models)
    .find((m) => effective && m.provider === effective.provider && m.id === effective.model);

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-1.5">
        <Select
          value={value}
          onValueChange={(v) => {
            const [provider, ...rest] = v.split('::');
            setChoice({ provider: provider as LlmProvider, model: rest.join('::') });
          }}
          disabled={!data}
        >
          <SelectTrigger size="sm" className="min-w-0 flex-1" aria-label="Explanation model">
            <SelectValue placeholder={error ? 'Models unavailable' : 'Loading models…'} />
          </SelectTrigger>
          <SelectContent>
            {data?.providers.map((p, i) => {
              const Icon = PROVIDER_ICON[p.provider];
              return (
                <SelectGroup key={p.provider}>
                  {i > 0 && <SelectSeparator />}
                  <SelectLabel className="flex items-center gap-1.5">
                    <Icon className="size-3.5" /> {PROVIDER_LABEL[p.provider]}
                    {!p.available && <span className="text-[10px] opacity-70">· unavailable</span>}
                  </SelectLabel>
                  {p.models.map((m) => (
                    <SelectItem
                      key={m.id}
                      value={encode(m.provider, m.id)}
                      disabled={!p.available}
                    >
                      <span className="flex items-center gap-1.5">
                        {m.loaded !== undefined && (
                          <span
                            className={m.loaded ? 'size-1.5 rounded-full bg-chart-3' : 'size-1.5 rounded-full bg-muted-foreground/40'}
                            aria-label={m.loaded ? 'loaded' : 'not loaded'}
                          />
                        )}
                        {m.label}
                        {m.size_gb !== undefined && (
                          <span className="font-mono text-[10px] text-muted-foreground">{m.size_gb} GB</span>
                        )}
                      </span>
                    </SelectItem>
                  ))}
                  {p.note && (
                    <p className="px-2 pb-1 text-[10px] leading-snug text-muted-foreground">{p.note}</p>
                  )}
                </SelectGroup>
              );
            })}
          </SelectContent>
        </Select>
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label="Refresh model list"
          onClick={() => setReloadTick((t) => t + 1)}
        >
          <RefreshCw />
        </Button>
      </div>
      {selected?.provider === 'ollama' && (
        <p className="text-[10px] leading-snug text-muted-foreground">
          {selected.loaded
            ? 'Already loaded in the shared Ollama — no load, no eviction.'
            : 'Not loaded: the first call loads it into the shared Ollama (released after a short keep-alive). Prefer a loaded (green) model to avoid disturbing other apps.'}
        </p>
      )}
    </div>
  );
}

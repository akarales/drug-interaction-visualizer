import { ArrowLeft, ArrowRight, Command as CommandIcon, Keyboard, PanelRight, Pill, Stethoscope } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { MOD } from '@/features/command';
import { useExplorer } from '@/state';
import { useHistoryNav } from '@/state/history';

import type { Drawer } from './layout/Workspace';

/**
 * Title bar: regimen history, dataset size, palette launcher, shortcuts,
 * disclaimer; on small screens also the buttons that open the drawers.
 */
export function AppHeader({ onDrawer }: { onDrawer?: (d: Drawer) => void }) {
  const stats = useExplorer((s) => s.stats);
  const canBack = useHistoryNav((s) => s.canBack);
  const canForward = useHistoryNav((s) => s.canForward);
  return (
    <header className="flex h-11 shrink-0 items-center gap-2 border-b px-2 sm:gap-3 sm:px-4">
      {onDrawer && (
        <Button size="icon-sm" variant="ghost" aria-label="Open medications" onClick={() => onDrawer('rail')}>
          <Pill />
        </Button>
      )}
      <div className="flex items-center gap-0.5">
        {[
          { label: 'Back', hint: 'Previous regimen (Alt+←)', icon: ArrowLeft, enabled: canBack, run: () => window.history.back() },
          { label: 'Forward', hint: 'Next regimen (Alt+→)', icon: ArrowRight, enabled: canForward, run: () => window.history.forward() },
        ].map(({ label, hint, icon: Icon, enabled, run }) => (
          <Tooltip key={label}>
            <TooltipTrigger asChild>
              <Button size="icon-xs" variant="ghost" aria-label={label} disabled={!enabled} onClick={run}>
                <Icon />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{hint}</TooltipContent>
          </Tooltip>
        ))}
      </div>
      <Stethoscope className="size-4 shrink-0 text-primary" aria-hidden />
      <h1 className="truncate text-sm font-semibold">Drug Interaction Visualizer</h1>
      {stats && (
        <Badge variant="secondary" className="hidden font-mono text-[10px] md:inline-flex">
          {stats.drugs.toLocaleString()} drugs · {stats.interactions.toLocaleString()}{' '}
          interactions
        </Badge>
      )}
      <button
        type="button"
        onClick={() => useExplorer.getState().setPaletteOpen(true)}
        className="ml-auto flex h-7 shrink-0 items-center gap-2 rounded-md border bg-muted/40 px-2.5 text-xs whitespace-nowrap text-muted-foreground transition-colors hover:bg-muted hover:text-foreground sm:w-64"
        aria-label="Open command palette"
      >
        <CommandIcon className="size-3.5" />
        <span className="hidden sm:inline">Search drugs &amp; commands…</span>
        <kbd className="ml-auto hidden rounded bg-background/70 px-1.5 font-mono text-[10px] sm:inline">{MOD} K</kbd>
      </button>
      {onDrawer && (
        <Button size="icon-sm" variant="ghost" aria-label="Open regimen check and details" onClick={() => onDrawer('right')}>
          <PanelRight />
        </Button>
      )}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            size="icon-xs"
            variant="ghost"
            aria-label="Keyboard shortcuts"
            onClick={() => useExplorer.getState().setHelpOpen(true)}
          >
            <Keyboard />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Keyboard shortcuts (?)</TooltipContent>
      </Tooltip>
      <span className="hidden truncate text-[11px] text-muted-foreground 2xl:inline">
        Demo data · editorial severity · not medical advice
      </span>
    </header>
  );
}

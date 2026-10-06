import { Network, Waypoints } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useExplorer } from '@/state';

const OPTIONS = [
  {
    value: 'summary' as const,
    icon: Waypoints,
    label: 'Summary edges',
    hint: 'One arc per family (orange = severe, family colour = other; width = count); contraindicated pairs drawn individually; hover a drug for its own edge',
  },
  { value: 'all' as const, icon: Network, label: 'All edges', hint: 'Every interaction of the focused drug' },
];

/** Summary bundles non-severe edges per family; All draws every edge. */
export function EdgeModeToggle() {
  const mode = useExplorer((s) => s.edgeMode);
  const setMode = useExplorer((s) => s.setEdgeMode);
  return (
    <div className="flex items-center gap-0.5 rounded-lg border bg-card/80 p-1 shadow-sm backdrop-blur-md" role="radiogroup" aria-label="Edge display">
      {OPTIONS.map(({ value, icon: Icon, label, hint }) => (
        <Tooltip key={value}>
          <TooltipTrigger asChild>
            <Button
              size="icon-sm"
              variant={mode === value ? 'secondary' : 'ghost'}
              role="radio"
              aria-checked={mode === value}
              aria-label={label}
              onClick={() => setMode(value)}
            >
              <Icon />
            </Button>
          </TooltipTrigger>
          <TooltipContent className="max-w-64">
            <span className="font-medium">{label}</span> — {hint}
          </TooltipContent>
        </Tooltip>
      ))}
    </div>
  );
}

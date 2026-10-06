import { Maximize2, Minus, Plus } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

import type { GraphHandle } from '../types';

export function ZoomControls({ graph }: { graph: GraphHandle | null }) {
  const items = [
    { label: 'Zoom in', icon: Plus, run: () => graph?.zoomIn() },
    { label: 'Zoom out', icon: Minus, run: () => graph?.zoomOut() },
    { label: 'Fit all', icon: Maximize2, run: () => graph?.reset() },
  ];
  return (
    <div className="flex items-center gap-0.5 rounded-lg border bg-card/80 p-1 shadow-sm backdrop-blur-md">
      {items.map(({ label, icon: Icon, run }) => (
        <Tooltip key={label}>
          <TooltipTrigger asChild>
            <Button size="icon-sm" variant="ghost" aria-label={label} onClick={run} disabled={!graph}>
              <Icon />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{label}</TooltipContent>
        </Tooltip>
      ))}
    </div>
  );
}

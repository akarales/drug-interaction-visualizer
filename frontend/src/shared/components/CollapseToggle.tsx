import { cn } from 'cn';
import { ChevronDown } from 'lucide-react';

import { Button } from '@/components/ui/button';

/** Chevron button for collapsible panels (aria-expanded, reduced-motion aware). */
export function CollapseToggle({
  open,
  onToggle,
  label,
}: {
  open: boolean;
  onToggle: () => void;
  /** what is collapsed, e.g. "medication 2" → "Collapse medication 2" */
  label: string;
}) {
  return (
    <Button
      size="icon-xs"
      variant="ghost"
      aria-expanded={open}
      aria-label={`${open ? 'Collapse' : 'Expand'} ${label}`}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
    >
      <ChevronDown className={cn('transition-transform motion-reduce:transition-none', !open && '-rotate-90')} />
    </Button>
  );
}

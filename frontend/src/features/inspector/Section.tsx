import type { ComponentType, ReactNode } from 'react';
import { cn } from 'cn';
import { ChevronRight } from 'lucide-react';

import { useCollapsible } from '@/shared/hooks/useCollapsible';

interface Props {
  id: string;
  title: string;
  icon: ComponentType<{ className?: string }>;
  /** muted count/summary shown in the header */
  meta?: ReactNode;
  /** controls revealed on the right of the header */
  actions?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}

/**
 * Inspector section (Blender/VS Code style): a dense 32 px header that
 * collapses the body; open state persists per section across reloads.
 */
export function Section({ id, title, icon: Icon, meta, actions, defaultOpen = true, children }: Props) {
  const [open, toggle] = useCollapsible(`ddi.section.${id}`, defaultOpen);

  return (
    <section className="border-b" aria-labelledby={`sec-${id}`}>
      <header className="group flex h-8 items-center gap-1.5 pr-2 pl-1.5">
        <button
          type="button"
          id={`sec-${id}`}
          aria-expanded={open}
          onClick={toggle}
          className="flex min-w-0 flex-1 items-center gap-1.5 rounded-md py-1 text-left text-[11px] font-semibold tracking-wider text-muted-foreground uppercase outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60"
        >
          <ChevronRight className={cn('size-3.5 shrink-0 transition-transform', open && 'rotate-90')} />
          <Icon className="size-3.5 shrink-0" />
          <span className="truncate">{title}</span>
          {meta !== undefined && (
            <span className="ml-1 font-mono text-[11px] font-normal tracking-normal normal-case">
              {meta}
            </span>
          )}
        </button>
        {actions && <div className="flex shrink-0 items-center gap-0.5">{actions}</div>}
      </header>
      {open && <div className="px-3 pb-3">{children}</div>}
    </section>
  );
}

import { cn } from 'cn';

import { GRAPH_COLOR, SEVERITY_COLOR, SEVERITY_LABEL, SEVERITY_SHORT, SEVERITY_TEXT, mixHex, type Severity } from '@/shared/domain';

/**
 * Compact severity pill; colour + text (never colour alone). Opaque tint +
 * light text so contrast holds on any row highlight (≥ 6.6:1).
 */
export function SeverityChip({
  severity,
  compact = false,
  className,
}: {
  severity: Severity;
  compact?: boolean;
  className?: string;
}) {
  const color = SEVERITY_COLOR[severity];
  return (
    <span
      title={`${SEVERITY_LABEL[severity]} (editorial grade)`}
      className={cn(
        'inline-flex h-[18px] shrink-0 items-center rounded-sm px-1.5 font-mono text-[10px] leading-none font-semibold tracking-wide',
        className,
      )}
      style={{
        color: SEVERITY_TEXT[severity],
        background: mixHex(color, GRAPH_COLOR.background, 0.14),
        boxShadow: `inset 0 0 0 1px ${color}55`,
      }}
    >
      {compact ? SEVERITY_SHORT[severity] : SEVERITY_LABEL[severity]}
    </span>
  );
}

import { cn } from 'cn';

import { SEVERITY_COLOR, SEVERITY_LABEL, type Severity } from '@/lib/domain';

const SHORT: Record<Severity, string> = {
  contraindicated: 'CI',
  severe: 'SEV',
  moderate: 'MOD',
  mild: 'MILD',
};

/** Compact severity pill; colour + text (never colour alone). */
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
      style={{ color, background: `${color}22`, boxShadow: `inset 0 0 0 1px ${color}55` }}
    >
      {compact ? SHORT[severity] : SEVERITY_LABEL[severity]}
    </span>
  );
}

import { cn } from 'cn';

import { FAMILY_COLOR, type Family } from '@/shared/domain';

/** Small family-colour dot (decorative; the family name is always shown as text nearby). */
export function FamilyDot({ family, className = 'size-2' }: { family: Family; className?: string }) {
  return <span className={cn('rounded-full', className)} style={{ background: FAMILY_COLOR[family] }} />;
}

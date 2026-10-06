import { Inspector } from '@/features/inspector';
import { RegimenPanel } from '@/features/regimen';

/** Right column: the regimen check (main clinical output) on top, inspector sections below. */
export function RightColumn() {
  return (
    <div className="flex h-full flex-col">
      <RegimenPanel />
      <div className="min-h-0 flex-1">
        <Inspector />
      </div>
    </div>
  );
}

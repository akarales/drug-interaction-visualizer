import type { ComponentType } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Download,
  Eraser,
  Filter,
  FolderOpen,
  Grid3x3,
  Keyboard,
  Link2,
  List,
  Maximize2,
  Network,
  Palette,
  Printer,
  Save,
  Trash2,
  Waypoints,
} from 'lucide-react';

import type { GraphHandle } from '@/features/graph';
import { copyRegimenLink, exportRegimenCsv } from '@/features/regimen';
import { FAMILIES, FAMILY_LABEL, SEVERITIES, SEVERITY_LABEL } from '@/shared/domain';
import { useDrugName } from '@/shared/hooks/useDrugName';
import { useExplorer } from '@/state';
import { useHistoryNav } from '@/state/history';

export const ACTION_GROUPS = ['Regimen', 'View', 'Navigate', 'Help'] as const;

export interface Action {
  id: string;
  group: (typeof ACTION_GROUPS)[number];
  label: string;
  icon: ComponentType<{ className?: string }>;
  shortcut?: string;
  keywords?: string;
  run: () => void;
}

/** Every palette command for the current state (labels flip with toggles). */
export function usePaletteActions(picks: readonly string[], graph: GraphHandle | null): Action[] {
  const edgeMode = useExplorer((s) => s.edgeMode);
  const regimenView = useExplorer((s) => s.regimenView);
  const familyFocus = useExplorer((s) => s.familyFocus);
  const severityFilter = useExplorer((s) => s.severityFilter);
  const canBack = useHistoryNav((s) => s.canBack);
  const canForward = useHistoryNav((s) => s.canForward);
  const name = useDrugName();
  const state = useExplorer.getState;

  return [
    ...picks.map((id) => ({
      id: `remove-${id}`,
      group: 'Regimen' as const,
      label: `Remove ${name(id)}`,
      icon: Trash2,
      keywords: 'delete drop medication',
      run: () => state().removeDrug(id),
    })),
    ...(picks.length
      ? [
          { id: 'clear', group: 'Regimen' as const, label: 'Clear regimen', icon: Eraser, keywords: 'reset new', run: () => state().setRegimen([]) },
          { id: 'link', group: 'Regimen' as const, label: 'Copy shareable link', icon: Link2, keywords: 'url share', run: copyRegimenLink },
          { id: 'csv', group: 'Regimen' as const, label: 'Download CSV', icon: Download, keywords: 'export spreadsheet', run: exportRegimenCsv },
          { id: 'save', group: 'Regimen' as const, label: 'Save regimen…', icon: Save, keywords: 'store keep name', run: () => state().setRegimenDialog('save') },
          { id: 'print', group: 'Regimen' as const, label: 'Print report', icon: Printer, keywords: 'pdf paper', run: () => setTimeout(() => window.print(), 150) },
          {
            id: 'view',
            group: 'Regimen' as const,
            label: regimenView === 'list' ? 'Show pair matrix' : 'Show pair list',
            icon: regimenView === 'list' ? Grid3x3 : List,
            shortcut: 'M',
            keywords: 'heatmap table',
            run: () => state().setRegimenView(regimenView === 'list' ? 'matrix' : 'list'),
          },
        ]
      : []),
    { id: 'open', group: 'Regimen', label: 'Open saved regimen…', icon: FolderOpen, keywords: 'load saved list', run: () => state().setRegimenDialog('open') },
    {
      id: 'edges',
      group: 'View',
      label: edgeMode === 'summary' ? 'Show all edges' : 'Show summary edges',
      icon: edgeMode === 'summary' ? Network : Waypoints,
      shortcut: 'E',
      keywords: 'bundle fan lines',
      run: () => state().setEdgeMode(edgeMode === 'summary' ? 'all' : 'summary'),
    },
    { id: 'fit', group: 'View', label: 'Fit graph', icon: Maximize2, shortcut: 'F', keywords: 'zoom reset camera', run: () => graph?.reset() },
    ...FAMILIES.map((f) => ({
      id: `family-${f}`,
      group: 'View' as const,
      label: familyFocus === f ? `Stop focusing ${FAMILY_LABEL[f]}` : `Focus family: ${FAMILY_LABEL[f]}`,
      icon: Palette,
      keywords: 'family colour highlight',
      run: () => state().toggleFamily(f),
    })),
    ...SEVERITIES.map((sev) => ({
      id: `sev-${sev}`,
      group: 'View' as const,
      label: severityFilter === sev ? `Clear severity filter` : `Only ${SEVERITY_LABEL[sev].toLowerCase()} interactions`,
      icon: Filter,
      keywords: 'severity filter',
      run: () => state().setSeverityFilter(severityFilter === sev ? null : sev),
    })),
    ...(canBack ? [{ id: 'back', group: 'Navigate' as const, label: 'Previous regimen', icon: ArrowLeft, shortcut: 'Alt ←', run: () => window.history.back() }] : []),
    ...(canForward ? [{ id: 'fwd', group: 'Navigate' as const, label: 'Next regimen', icon: ArrowRight, shortcut: 'Alt →', run: () => window.history.forward() }] : []),
    { id: 'help', group: 'Help', label: 'Keyboard shortcuts', icon: Keyboard, shortcut: '?', keywords: 'keys help', run: () => state().setHelpOpen(true) },
  ];
}

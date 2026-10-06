/** Single source for the `?` overlay and the palette's shortcut hints. */
export interface Shortcut {
  keys: string[];
  label: string;
}

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
export const MOD = isMac ? '⌘' : 'Ctrl';

export const SHORTCUT_GROUPS: { title: string; items: Shortcut[] }[] = [
  {
    title: 'General',
    items: [
      { keys: [MOD, 'K'], label: 'Command palette' },
      { keys: ['?'], label: 'Keyboard shortcuts' },
      { keys: ['Esc'], label: 'Clear one level (hover → family → filter → pick)' },
      { keys: ['F6'], label: 'Move between medications, map and details' },
    ],
  },
  {
    title: 'Medication cards',
    items: [
      { keys: ['/'], label: 'Search the active card' },
      { keys: ['↑', '↓'], label: 'Move through results (lights the node)' },
      { keys: ['Enter'], label: 'Pick the highlighted drug' },
      { keys: ['Alt', '↑/↓'], label: 'Reorder the focused card' },
      { keys: ['Shift', 'click node'], label: 'Add a drug as a new card' },
    ],
  },
  {
    title: 'View',
    items: [
      { keys: ['E'], label: 'Toggle summary / all edges' },
      { keys: ['M'], label: 'Toggle regimen list / matrix' },
      { keys: ['F'], label: 'Fit the graph' },
    ],
  },
  {
    title: 'History',
    items: [
      { keys: ['Alt', '←'], label: 'Previous regimen' },
      { keys: ['Alt', '→'], label: 'Next regimen' },
    ],
  },
];

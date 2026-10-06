import { useRef, useState, type PointerEvent, type RefObject } from 'react';

/** Final index of an item moved from `from` to the gap before `gap` (0..n). */
export function targetIndex(from: number, gap: number): number {
  return gap > from ? gap - 1 : gap;
}

/** Gap (0..n) a pointer at `y` falls into, from the items' vertical midpoints. */
export function gapAt(y: number, mids: readonly number[]): number {
  const i = mids.findIndex((m) => y < m);
  return i < 0 ? mids.length : i;
}

export interface ReorderState {
  from: number;
  /** gap the item would be dropped into (0..n) */
  gap: number;
  /** y of the insertion line, relative to the list */
  lineY: number;
}

/**
 * Pointer drag-to-reorder for a vertical list whose items carry
 * `data-reorder-item`. Start it from a grip's onPointerDown; `onMove`
 * receives (from, to) on drop. No dependency: ~40 lines instead of a
 * 36 KB drag-and-drop library (keyboard reorder lives on the cards).
 */
export function useReorder(listRef: RefObject<HTMLElement | null>, onMove: (from: number, to: number) => void) {
  const [state, setState] = useState<ReorderState | null>(null);
  const live = useRef<ReorderState | null>(null);

  const start = (from: number, e: PointerEvent<HTMLElement>) => {
    const list = listRef.current;
    if (!list || e.button !== 0) return;
    e.preventDefault();
    const grip = e.currentTarget;
    grip.setPointerCapture(e.pointerId);
    const listTop = list.getBoundingClientRect().top;
    const rects = [...list.querySelectorAll<HTMLElement>('[data-reorder-item]')].map((el) => el.getBoundingClientRect());
    const mids = rects.map((r) => r.top + r.height / 2);
    const lineFor = (gap: number) =>
      (gap < rects.length ? rects[gap].top : (rects.at(-1)?.bottom ?? listTop)) - listTop - 4;
    const update = (clientY: number) => {
      const gap = gapAt(clientY, mids);
      live.current = { from, gap, lineY: lineFor(gap) };
      setState(live.current);
    };
    const move = (ev: globalThis.PointerEvent) => update(ev.clientY);
    const up = () => {
      grip.removeEventListener('pointermove', move);
      grip.removeEventListener('pointerup', up);
      grip.removeEventListener('pointercancel', up);
      const end = live.current;
      live.current = null;
      setState(null);
      if (end) {
        const to = targetIndex(end.from, end.gap);
        if (to !== end.from) onMove(end.from, to);
      }
    };
    grip.addEventListener('pointermove', move);
    grip.addEventListener('pointerup', up);
    grip.addEventListener('pointercancel', up);
    update(e.clientY);
  };

  return { state, start };
}

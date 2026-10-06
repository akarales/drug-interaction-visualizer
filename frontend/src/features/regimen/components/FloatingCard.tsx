import { useState, type KeyboardEvent, type PointerEvent } from 'react';
import { Move } from 'lucide-react';

import { readJson, writeJson } from '@/shared/storage';
import { useExplorer } from '@/state';

import { MedicationCard } from './MedicationCard';

const POS_KEY = 'ddi.float-pos';
const WIDTH = 288;
const STEP = 16;

type Pos = { x: number; y: number };

/** Keep the card's header inside the workspace. */
function clamp(p: Pos, parent: DOMRect | undefined): Pos {
  const maxX = Math.max(0, (parent?.width ?? 1e4) - WIDTH);
  const maxY = Math.max(0, (parent?.height ?? 1e4) - 44);
  return { x: Math.round(Math.min(Math.max(0, p.x), maxX)), y: Math.round(Math.min(Math.max(0, p.y), maxY)) };
}

/** First pop-out: top-left of the map's safe area (measured now, after layout), not over the rail. */
function defaultPos(): Pos {
  const map = document.querySelector('[data-region="map"]')?.getBoundingClientRect();
  const bounds = document.querySelector('[data-float-bounds]')?.getBoundingClientRect();
  return { x: Math.round((map?.left ?? 0) - (bounds?.left ?? 0)) + 16, y: 16 };
}

/**
 * The popped-out medication card: a non-modal floating window over the map.
 * Drag the move handle (or focus it and use the arrow keys); the position
 * is remembered; Esc or "Dock" puts it back in the rail.
 */
export function FloatingCard() {
  const slotKey = useExplorer((s) => s.floatingSlot);
  const index = useExplorer((s) => s.slots.findIndex((x) => x.key === s.floatingSlot));
  const [saved, setPos] = useState<Pos | null>(() => readJson<Pos | null>(POS_KEY, null));
  if (slotKey === null || index < 0) return null;
  const pos = saved ?? defaultPos();

  const parentRect = (el: Element) => el.closest('[data-float-bounds]')?.getBoundingClientRect();
  const commit = (next: Pos) => {
    setPos(next);
    writeJson(POS_KEY, next);
  };

  const startDrag = (e: PointerEvent<HTMLElement>) => {
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    const parent = parentRect(el);
    const start = { x: e.clientX, y: e.clientY };
    const origin = pos;
    let last = origin;
    const move = (ev: globalThis.PointerEvent) => {
      last = clamp({ x: origin.x + ev.clientX - start.x, y: origin.y + ev.clientY - start.y }, parent);
      setPos(last);
    };
    const up = () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      commit(last);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
  };

  const nudge = (e: KeyboardEvent<HTMLElement>) => {
    const d = { ArrowLeft: [-STEP, 0], ArrowRight: [STEP, 0], ArrowUp: [0, -STEP], ArrowDown: [0, STEP] }[e.key];
    if (!d || e.altKey) return;
    e.preventDefault();
    commit(clamp({ x: pos.x + d[0], y: pos.y + d[1] }, parentRect(e.currentTarget)));
  };

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-label={`Floating medication ${index + 1}`}
      className="absolute z-(--z-float)"
      style={{ left: pos.x, top: pos.y, width: WIDTH }}
    >
      <MedicationCard
        index={index}
        floating
        grip={
          <button
            type="button"
            aria-label="Move the floating card (drag, or arrow keys)"
            title="Drag to move (or arrow keys)"
            onPointerDown={startDrag}
            onKeyDown={nudge}
            className="-ml-0.5 flex h-6 w-5 shrink-0 cursor-move touch-none items-center justify-center rounded text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none"
          >
            <Move className="size-3.5" />
          </button>
        }
      />
    </div>
  );
}

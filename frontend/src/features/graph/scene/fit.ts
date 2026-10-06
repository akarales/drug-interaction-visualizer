import type { CameraState } from 'sigma/types';

/** Space kept free inside the safe area (px): room for the legend bar at the bottom. */
export const SAFE_PADDING = { top: 16, right: 16, bottom: 60, left: 16 };

interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** What the fit needs from sigma (kept minimal so it is unit-testable). */
export interface FramedToViewport {
  framedGraphToViewport(
    point: { x: number; y: number },
    override: { cameraState: CameraState },
  ): { x: number; y: number };
}

const BASE: CameraState = { x: 0.5, y: 0.5, ratio: 1, angle: 0 };

/**
 * Camera that shows the whole graph inside `safe` (the part of the canvas
 * not covered by side panels) while the canvas itself stays full-bleed
 * under the translucent panels. At camera (c, r) a framed point p lands at
 * C + (p − c)·k / r (C = canvas centre, k = px per framed unit at r = 1),
 * so we pick r to fit the graph's extent and solve c to centre it on the
 * safe area's centre.
 */
export function safeAreaCamera(sigma: FramedToViewport, canvas: Rect, safe: Rect, pad = SAFE_PADDING): CameraState {
  const centre = sigma.framedGraphToViewport({ x: 0.5, y: 0.5 }, { cameraState: BASE });
  const corner = sigma.framedGraphToViewport({ x: 1, y: 1 }, { cameraState: BASE });
  // px per framed unit at ratio 1 (signed: sigma's y axis points up)
  const kx = 2 * (corner.x - centre.x) || 1;
  const ky = 2 * (corner.y - centre.y) || 1;

  const availW = Math.max(48, safe.width - pad.left - pad.right);
  const availH = Math.max(48, safe.height - pad.top - pad.bottom);
  const ratio = Math.max(Math.abs(kx) / availW, Math.abs(ky) / availH);

  const targetX = safe.left - canvas.left + pad.left + availW / 2;
  const targetY = safe.top - canvas.top + pad.top + availH / 2;
  return {
    x: 0.5 - ((targetX - centre.x) * ratio) / kx,
    y: 0.5 - ((targetY - centre.y) * ratio) / ky,
    ratio,
    angle: 0,
  };
}

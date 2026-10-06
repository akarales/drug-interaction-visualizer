import { describe, expect, it } from 'vitest';
import type { CameraState } from 'sigma/types';

import { safeAreaCamera, type FramedToViewport } from './fit';

/** A sigma-like linear mapping: canvas 1000×600, 1 framed unit = 500 px at ratio 1, y up. */
const fake: FramedToViewport & { project(p: { x: number; y: number }, c: CameraState): { x: number; y: number } } = {
  project(p, c) {
    return { x: 500 + ((p.x - c.x) * 500) / c.ratio, y: 300 - ((p.y - c.y) * 500) / c.ratio };
  },
  framedGraphToViewport(p, { cameraState }) {
    return this.project(p, cameraState);
  },
};
const canvas = { left: 0, top: 0, width: 1000, height: 600 };
const none = { top: 0, right: 0, bottom: 0, left: 0 };

describe('safeAreaCamera', () => {
  it('centres the graph on the safe area and fits its extent', () => {
    const safe = { left: 300, top: 0, width: 400, height: 600 };
    const cam = safeAreaCamera(fake, canvas, safe, none);
    const mid = fake.project({ x: 0.5, y: 0.5 }, cam);
    expect(mid.x).toBeCloseTo(500);
    expect(mid.y).toBeCloseTo(300);
    // the [0,1] framed extent spans exactly the safe width
    const left = fake.project({ x: 0, y: 0.5 }, cam).x;
    const right = fake.project({ x: 1, y: 0.5 }, cam).x;
    expect(right - left).toBeCloseTo(400);
  });

  it('shifts towards an off-centre safe area and keeps the padding free', () => {
    const safe = { left: 300, top: 0, width: 300, height: 600 };
    const cam = safeAreaCamera(fake, canvas, safe, { top: 0, right: 0, bottom: 100, left: 0 });
    const mid = fake.project({ x: 0.5, y: 0.5 }, cam);
    expect(mid.x).toBeCloseTo(450);
    expect(mid.y).toBeCloseTo(250);
    expect(fake.project({ x: 1, y: 0.5 }, cam).x).toBeLessThanOrEqual(600 + 1e-6);
  });
});

// Pins the indoor camera safety clamp (src/game/indoor_camera_clamp.ts): the
// pure math that stops an extreme zoom-out + look up/down from clipping the
// third-person camera through a chapel floor slab into the "slit" view.
import { describe, expect, it } from 'vitest';
import { clampIndoorCamera, INDOOR_CAMERA_LIMITS } from '../src/game/indoor_camera_clamp';

describe('indoor camera clamp', () => {
  it('is a strict pass-through outdoors (outdoor camera unchanged)', () => {
    const out = clampIndoorCamera({ pitch: 1.3, dist: 22 }, false);
    expect(out.pitch).toBe(1.3);
    expect(out.dist).toBe(22);
    const out2 = clampIndoorCamera({ pitch: -0.4, dist: 3 }, false);
    expect(out2.pitch).toBe(-0.4);
    expect(out2.dist).toBe(3);
  });

  it('caps an extreme zoom-out indoors to the indoor max distance', () => {
    const out = clampIndoorCamera({ pitch: 0.3, dist: 22 }, true);
    expect(out.dist).toBe(INDOOR_CAMERA_LIMITS.maxDist);
    expect(out.dist).toBeLessThan(22);
  });

  it('clamps a hard look-down indoors up to the indoor floor (cannot point through the floor below)', () => {
    // The old world allowed pitch down to -0.4; indoors that would fill the
    // frame with the floor slab. It is raised to the indoor minimum.
    const out = clampIndoorCamera({ pitch: -0.4, dist: 5 }, true);
    expect(out.pitch).toBe(INDOOR_CAMERA_LIMITS.minPitch);
    expect(out.pitch).toBeGreaterThan(-0.4);
  });

  it('clamps a hard look-up indoors down to the indoor ceiling (cannot point through the slab above)', () => {
    const out = clampIndoorCamera({ pitch: 1.35, dist: 5 }, true);
    expect(out.pitch).toBe(INDOOR_CAMERA_LIMITS.maxPitch);
    expect(out.pitch).toBeLessThan(1.35);
  });

  it('leaves a normal, safe indoor request untouched (free orbiting within the safe range)', () => {
    const req = { pitch: 0.3, dist: 4 };
    const out = clampIndoorCamera(req, true);
    expect(out.pitch).toBe(0.3);
    expect(out.dist).toBe(4);
  });

  it('the indoor limits form a real, non-degenerate range (not a hard lock)', () => {
    expect(INDOOR_CAMERA_LIMITS.minPitch).toBeLessThan(INDOOR_CAMERA_LIMITS.maxPitch);
    expect(INDOOR_CAMERA_LIMITS.minDist).toBeLessThan(INDOOR_CAMERA_LIMITS.maxDist);
    // Tighter than the open-world zoom-out limit of 22.
    expect(INDOOR_CAMERA_LIMITS.maxDist).toBeLessThan(22);
  });
});

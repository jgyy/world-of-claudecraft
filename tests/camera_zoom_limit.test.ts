import { describe, expect, it } from 'vitest';
import {
  cameraFloorAt,
  clampCamDistForEnclosedSpace,
  ENCLOSED_MAX_CAM_DIST,
} from '../src/render/camera_zoom_limit';
import { groundHeight } from '../src/sim/world';

const SEED = 1;

describe('clampCamDistForEnclosedSpace', () => {
  it('caps a large requested camDist while inside the tunnel crest', () => {
    // vale_marsh_ridge_tunnel crest waypoint, content/tunnels.ts.
    expect(clampCamDistForEnclosedSpace(22, 128, -52.5, 180, SEED)).toBe(ENCLOSED_MAX_CAM_DIST);
  });

  it('leaves a camDist already below the cap untouched inside the tunnel', () => {
    expect(clampCamDistForEnclosedSpace(3, 128, -52.5, 180, SEED)).toBe(3);
  });

  it('leaves camDist untouched out in the open world', () => {
    expect(clampCamDistForEnclosedSpace(22, 0, 0, 0, SEED)).toBe(22);
  });
});

describe('cameraFloorAt', () => {
  it("uses the tunnel's own local floor when the camera itself sits deep under the marsh ridge crest, not the far-overhead surface", () => {
    // vale_marsh_ridge_tunnel crest waypoint: the passage floor sits around
    // y=-57, but the open-world surface directly above sits around y=+35
    // (the ridge crest). A camera actually positioned down near the crest's
    // own floor must clamp against that real nearby floor, not snap all the
    // way up to the far-overhead surface (which would read as the chase
    // camera locking into a near-vertical look-down).
    const floor = cameraFloorAt(128, -52, 180, SEED);
    const surface = groundHeight(128, 180, SEED);
    expect(floor).toBeLessThan(0);
    expect(floor).toBeLessThan(surface - 50);
  });

  it('uses the real outdoor surface, not the buried passage floor, for a camera up in open air over the ridge above the same crest', () => {
    // Same (x, z) column as the crest test above, but the camera's own y is
    // up on the open ridge surface (a wide, steep establishing shot), not
    // down inside the tunnel's own floor/ceiling band: tunnelColumnAt would
    // still report the buried passage as the first solid/air/solid band
    // scanning up from underground, but the camera itself is nowhere near
    // it, so this must fall back to the ordinary ambient surface height.
    const surface = groundHeight(128, 180, SEED);
    expect(cameraFloorAt(128, surface - 2, 180, SEED)).toBeCloseTo(surface + 0.6, 6);
  });

  it('matches plain groundHeight + 0.6 for an ordinary open-world column outside any tunnel', () => {
    expect(cameraFloorAt(0, 0, 0, SEED)).toBeCloseTo(groundHeight(0, 0, SEED) + 0.6, 6);
  });
});

import { describe, expect, it } from 'vitest';
import {
  clampCamDistForEnclosedSpace,
  ENCLOSED_MAX_CAM_DIST,
} from '../src/render/camera_zoom_limit';

const SEED = 1;

describe('clampCamDistForEnclosedSpace', () => {
  it('caps a large requested camDist while inside the tunnel crest', () => {
    // vale_marsh_ridge_tunnel crest waypoint, content/tunnels.ts.
    expect(clampCamDistForEnclosedSpace(22, 110, -35, 180, SEED)).toBe(ENCLOSED_MAX_CAM_DIST);
  });

  it('leaves a camDist already below the cap untouched inside the tunnel', () => {
    expect(clampCamDistForEnclosedSpace(3, 110, -35, 180, SEED)).toBe(3);
  });

  it('leaves camDist untouched out in the open world', () => {
    expect(clampCamDistForEnclosedSpace(22, 0, 0, 0, SEED)).toBe(22);
  });
});

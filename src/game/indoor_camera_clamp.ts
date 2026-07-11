// Pure, host-agnostic third-person camera clamp for when the local player is
// INSIDE the Drowned Chapel (any chapelFloor > 0). It exists to kill one
// specific degenerate view: indoors, with the old open-world limits, a player
// zooming all the way out and pitching hard up or down puts the camera on the
// far side of the floor slab above or the floor below, so the entire frame
// fills with a single ceiling/floor plane and the character vanishes (the
// "slit" view). Reducing the max zoom-out distance and tightening the pitch
// range keeps the camera in the room's open air while still allowing free
// orbiting within that safe range (this is NOT a hard lock to one angle).
//
// Outdoors it is a strict pass-through: outdoor camera behavior is unchanged.
// The math is deterministic and DOM-free so a Vitest imports it directly.

export interface IndoorCameraLimits {
  /** Max zoom-out distance allowed indoors (world units). Much tighter than
   * the open-world max so the camera cannot cross the room's far wall/slab. */
  maxDist: number;
  /** Min zoom-in distance (kept in sync with the normal near limit). */
  minDist: number;
  /** Lowest pitch allowed indoors (radians). Above the floor-below plane so a
   * downward look cannot fill the frame with the floor slab. */
  minPitch: number;
  /** Highest pitch allowed indoors (radians). Below the ceiling-slab plane so
   * an upward look cannot fill the frame with the slab above. */
  maxPitch: number;
}

// Ground story is 5.5 tall, upper 4.5: a max zoom of 6 with a pitch band of
// about [0.06, 0.72] rad keeps the eye/target segment inside one story's open
// volume for every yaw. Tuned to stay well clear of both slabs, not to the
// exact geometry, so it is robust to small dimension tweaks.
export const INDOOR_CAMERA_LIMITS: IndoorCameraLimits = {
  maxDist: 6,
  minDist: 1.2,
  minPitch: 0.06,
  maxPitch: 0.72,
};

export interface CameraClampInput {
  pitch: number;
  dist: number;
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

/**
 * Clamp the requested camera pitch and zoom distance for indoor safety.
 *
 * @param indoors true when the local player is inside the chapel (chapelFloor
 *   > 0). When false this returns the input verbatim (outdoor behavior is
 *   never altered).
 * @param limits the indoor limits to apply (defaults to INDOOR_CAMERA_LIMITS).
 */
export function clampIndoorCamera(
  input: CameraClampInput,
  indoors: boolean,
  limits: IndoorCameraLimits = INDOOR_CAMERA_LIMITS,
): CameraClampInput {
  if (!indoors) return { pitch: input.pitch, dist: input.dist };
  return {
    pitch: clamp(input.pitch, limits.minPitch, limits.maxPitch),
    dist: clamp(input.dist, limits.minDist, limits.maxDist),
  };
}

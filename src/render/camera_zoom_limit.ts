// Caps the chase camera's requested zoom-out distance while the player is
// inside a small enclosed space (currently: an authored tunnel interior,
// see sim/tunnel_traversal.ts). Zoomed out fully, the ordinary camDist
// (up to 22yd, input.ts) regularly places the desired camera position past
// a tunnel's own walls; the per-frame occlusion pull-in in renderer.ts
// already prevents that from ever showing the outside world, but it does so
// reactively (pulling the camera back in only once the requested position
// collides), which reads as the camera fighting the player's zoom input in
// a cramped space. Capping the requested distance here keeps the chase
// camera from ever asking for a position that far out in the first place.
import { TUNNELS } from '../sim/content/tunnels';
import { tunnelSpanAt } from '../sim/tunnel_traversal';
import { groundHeightWithMounds } from '../sim/voxel';

// A tunnel's narrowest authored radius is 2.6yd (vale_kobold_warren); 3.75yd
// keeps the camera comfortably inside every tunnel's walls at any yaw/pitch
// without feeling claustrophobic, and reads as a tighter, better-managed
// chase camera in these cramped spaces than the previous 5yd cap (which could
// still pull the camera far enough past a mound's outer slope near a mouth to
// clip through terrain and reveal the raw scene background/void below it).
export const ENCLOSED_MAX_CAM_DIST = 3.75;

// Chase-cam distance while standing on a mound's own grassy exterior slope
// (the doorway's knoll, see moundHeightBump in voxel.ts): a bit more
// generous than the fully-enclosed interior cap since the player is out in
// the open here, but still short enough that the requested camera position
// never lands past the mound's steep flank and clips into (or through) it.
export const MOUND_EXTERIOR_MAX_CAM_DIST = 9;

// Horizontal distance from a mound's own (x, z) center, in multiples of its
// moundRadius, still counted as "near the mound" for camera purposes: wide
// enough to cover the mound's decayed Gaussian skirt (see moundHeightBump),
// not just the nominal radius, so the chase camera starts easing in before
// it ever reaches the steep part of the slope.
const MOUND_NEARBY_RADIUS_MULT = 1.6;

function nearestMoundDist(px: number, pz: number): number | null {
  let best: number | null = null;
  for (const tunnel of TUNNELS) {
    for (const w of tunnel.waypoints) {
      if (!w.mound) continue;
      const moundRadius = w.moundRadius ?? w.radius + 4;
      const dist = Math.hypot(px - w.x, pz - w.z);
      const nearbyBound = moundRadius * MOUND_NEARBY_RADIUS_MULT;
      if (dist <= nearbyBound && (best === null || dist < best)) best = dist;
    }
  }
  return best;
}

// The camDist to actually use this frame: the player's requested camDist,
// clamped down to ENCLOSED_MAX_CAM_DIST while (px, py, pz) sits inside a
// tunnel's carved interior, clamped down to the more generous
// MOUND_EXTERIOR_MAX_CAM_DIST while standing on a mound's own exterior
// slope (interior takes precedence, since a mouth's mound and its carved
// interior overlap right at the doorway), else unchanged.
export function clampCamDistForEnclosedSpace(
  camDist: number,
  px: number,
  py: number,
  pz: number,
  seed: number,
): number {
  if (tunnelSpanAt(px, py, pz, seed)) return Math.min(camDist, ENCLOSED_MAX_CAM_DIST);
  if (nearestMoundDist(px, pz) !== null) return Math.min(camDist, MOUND_EXTERIOR_MAX_CAM_DIST);
  return camDist;
}

// Floor to clamp the chase camera's own Y position against so it never dips
// below solid ground. Ordinarily the ambient (mound-inclusive) surface
// height, but while the camera's own (cx, cy, cz) sits close to a tunnel's
// carved interior, the open-world surface sits FAR above the tunnel's real
// floor (the marsh ridge crest sits some 80+ yd above the passage below it,
// see content/tunnels.ts): clamping to the open-world height there snaps
// the camera way up above the player, which reads as the view locking into
// an almost-straight-down look whenever the player is deep inside. Using
// the tunnel's own local floor there instead keeps the clamp (and the
// camera) close to the player's actual depth.
//
// The check is on cy (tunnelSpanAt, the same "am I actually near this
// tunnel's floor/ceiling band" test player_motion.ts uses), not just
// whether (cx, cz) sits somewhere in the tunnel's bounding-box footprint:
// tunnelColumnAt reports the FIRST solid/air/solid band scanning up from
// deep underground, which is the tunnel's own passage even for a column
// far overhead on the open ridge surface above it. Gating on cy keeps a
// camera that is actually up in the open air over the ridge (e.g. a wide,
// steep-pitch establishing shot) using the real outdoor surface instead of
// being yanked down to the buried passage floor far beneath it.
//
// Outside any tunnel span, groundHeightWithMounds (not plain groundHeight)
// keeps the same clamp from sinking the camera into a mound's own raised
// exterior slope.
export function cameraFloorAt(cx: number, cy: number, cz: number, seed: number): number {
  const span = tunnelSpanAt(cx, cy, cz, seed);
  if (span) return span.floorY + 0.6;
  return groundHeightWithMounds(cx, cz, seed) + 0.6;
}

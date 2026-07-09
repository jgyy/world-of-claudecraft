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
import { tunnelSpanAt } from '../sim/tunnel_traversal';

// A tunnel's narrowest authored radius is 2.6yd (vale_kobold_warren); 5yd
// keeps the camera comfortably inside every tunnel's walls at any yaw/pitch
// without feeling claustrophobic, and reads as a tighter, better-managed
// chase camera in these cramped spaces than the previous 8yd cap.
export const ENCLOSED_MAX_CAM_DIST = 5;

// The camDist to actually use this frame: the player's requested camDist,
// clamped down to ENCLOSED_MAX_CAM_DIST while (px, py, pz) sits inside a
// tunnel's carved interior, else unchanged.
export function clampCamDistForEnclosedSpace(
  camDist: number,
  px: number,
  py: number,
  pz: number,
  seed: number,
): number {
  if (tunnelSpanAt(px, py, pz, seed)) return Math.min(camDist, ENCLOSED_MAX_CAM_DIST);
  return camDist;
}

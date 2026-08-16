// Per-frame mounted-rider update: the mount animates from the same
// locomotion inputs as its rider (rigged quadrupeds run their baked gait
// clips, clipless mounts bob procedurally), then the rider's visual root is
// positioned onto the saddle, then ambient mount particles fire. Extracted
// out of renderer.ts (a monolith-budget coordinator) so this whole per-mount
// dispatch lands here, not as another branch grown on the per-entity sync
// loop.
//
// Rider positioning: rigs baked with rider-seat sockets (RiderSeatL/R,
// scripts/lib/mount_rider_seat_sockets.mjs) track the mount's ACTUAL animated
// saddle position every frame (twist/stomp included), read live off
// CharacterVisual.mountSeatWorldPosition; a rig without sockets (the clipless
// bob-driven mounts, or any not yet re-baked) falls back to the prior static
// MountVisualSpec.seat/seatFwd offset plus the mount's own procedural bob.
import type * as THREE from 'three';
import type { AnimState, CharacterVisual } from './characters';
import { applyMountFx } from './mount_fx';
import { type MountVisualSpec, mountBobY } from './mount_visuals';
import type { Vfx } from './vfx';

interface MountedRiderView {
  visual: CharacterVisual | null;
  mountVisual: CharacterVisual | null;
  group: THREE.Group;
  mountLift: number;
}

/** No-op when the entity carries no shown mount. `mst` is a caller-owned
 *  scratch AnimState reused across entities; `scratch` a caller-owned
 *  Vector3, likewise reused, for the live saddle-socket read. */
export function updateMountedRiderFrame(
  v: MountedRiderView,
  mountSpec: MountVisualSpec | null,
  mountShown: boolean,
  mst: AnimState,
  riderState: AnimState,
  airborne: boolean,
  dt: number,
  animate: boolean,
  runCharacterPresentation: boolean,
  moving: boolean,
  facing: number,
  vfx: Vfx,
  timeSec: number,
  scratch: THREE.Vector3,
): void {
  if (!v.visual || !v.mountVisual || !mountSpec || !mountShown) return;
  mst.speed = riderState.speed;
  mst.moving = riderState.moving;
  mst.running = riderState.running;
  mst.airborne = airborne;
  mst.backwards = riderState.backwards;
  mst.swimming = riderState.swimming;
  if (!runCharacterPresentation) {
    v.mountVisual.advanceOffscreen(dt);
    return;
  }
  v.mountVisual.update(dt, mst, animate);
  const bob = mountBobY(mountSpec, timeSec, moving);
  v.mountVisual.root.position.y = bob;
  // the rider floats WITH the procedural bob (the hover cycle's idle float),
  // not just the mount body; a live socket read already includes it, since
  // the bob is applied to the mount's root just above
  if (v.mountVisual.mountSeatWorldPosition(scratch)) {
    v.group.worldToLocal(scratch);
    v.visual.root.position.copy(scratch);
  } else {
    v.visual.root.position.y = v.mountLift + bob;
  }
  applyMountFx(vfx, mountSpec.fx, v.group.position, facing, dt, moving, riderState.running);
}

import type * as THREE from 'three';
import type { VfxAnchorPose, VfxAnchorPoseFill } from './vfx_anchor';

// The renderer's VfxAnchorPoseFill: the displayed pose of an entity view that
// every pooled ability VFX (absorb shells, orbit halos, ribbons, impacts)
// resolves its world anchor from. Extracted from renderer.ts so the rider
// offset below has a host-agnostic home a Vitest drives directly.
//
// The pose is the view group's world position lifted by the rider anchor
// (rider_anchor.ts): while mounted the body sits a saddle above the group
// origin, and a shell resolved at the group would wrap the horse's belly.
// The anchor's local offset is expressed in the group's frame, so it rotates
// with the displayed yaw and stretches with the entity scale the group carries.

/** The slice of an entity view this fill reads. */
export interface VfxPoseView {
  group: THREE.Object3D;
  /** Rig height in world units before the entity scale. */
  height: number;
  /** The body-attached aura anchor (rider_anchor.ts), a child of `group`. */
  riderAnchor: THREE.Object3D;
}

/** Fill `pose` with a view group's world position, yaw, and scale (no rider lift). */
export function fillViewGroundPose(
  pose: VfxAnchorPose,
  view: VfxPoseView,
  entityScale: number,
): void {
  pose.x = view.group.position.x;
  pose.y = view.group.position.y;
  pose.z = view.group.position.z;
  pose.height = view.height * entityScale;
  // For local-offset resolves (the drain beams' familiar-side end): the
  // DISPLAYED yaw, so the offset tracks the body actually on screen.
  pose.yaw = view.group.rotation.y;
  pose.scale = entityScale;
}

/**
 * Lift `pose` by a group-local offset (the rider anchor's position): rotated by
 * the pose's displayed yaw and stretched by its scale, the same frame the
 * group applies to its children. A zero offset (dismounted) leaves it untouched.
 */
export function liftPoseByLocalOffset(pose: VfxAnchorPose, local: THREE.Vector3): void {
  if (local.x === 0 && local.y === 0 && local.z === 0) return;
  const yaw = pose.yaw ?? 0;
  const scale = pose.scale ?? 1;
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  // THREE's Y rotation: x' = x cos + z sin, z' = -x sin + z cos.
  pose.x += (local.x * cos + local.z * sin) * scale;
  pose.y += local.y * scale;
  pose.z += (-local.x * sin + local.z * cos) * scale;
}

/**
 * Build the fill over the renderer's live view map and entity lookup. Writes
 * into the caller's pose and allocates nothing per call (the anchor contract).
 */
export function createViewVfxPoseFill(
  views: { get(id: number): VfxPoseView | undefined },
  entities: { get(id: number): { scale: number } | undefined },
): VfxAnchorPoseFill {
  return (id: number, pose: VfxAnchorPose): boolean => {
    const v = views.get(id);
    if (!v) return false;
    fillViewGroundPose(pose, v, entities.get(id)?.scale ?? 1);
    liftPoseByLocalOffset(pose, v.riderAnchor.position);
    return true;
  };
}

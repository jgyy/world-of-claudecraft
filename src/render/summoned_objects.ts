// Summoned world objects: the registry the renderer consults for every ground
// object a player ability summons (Soulwell, Grand Portal, Hellgate). Each
// entry owns its own build/sync/dispose trio behind one seam, keyed by the
// entity's objectItemId (which the sim also uses as templateId), so renderer.ts
// adds a new summoned prop by registering it here rather than growing another
// objectItemId branch. Materials: the shared surfaceMat instances are never
// disposed; only the per-instance materials each build lists as owned.

import type * as THREE from 'three';
import { buildGrandPortal, disposeGrandPortalVisual, syncGrandPortalVisual } from './grand_portal';
import { buildHellgate, disposeHellgateVisual, syncHellgateVisual } from './hellgate';
import { buildSoulwell, disposeSoulwellVisual, syncSoulwellVisual } from './soulwell';

export interface SummonedObjectVisual {
  build(entityId: number): { group: THREE.Group; height: number };
  sync(root: THREE.Object3D, time: number, entityId: number): void;
  dispose(root: THREE.Object3D): void;
}

export const SUMMONED_OBJECT_VISUALS: Readonly<Record<string, SummonedObjectVisual>> = {
  soulwell: { build: buildSoulwell, sync: syncSoulwellVisual, dispose: disposeSoulwellVisual },
  grand_portal: {
    build: buildGrandPortal,
    sync: syncGrandPortalVisual,
    dispose: disposeGrandPortalVisual,
  },
  hellgate: { build: buildHellgate, sync: syncHellgateVisual, dispose: disposeHellgateVisual },
};

export function isSummonedObjectItem(itemId: string | undefined | null): itemId is string {
  return !!itemId && Object.hasOwn(SUMMONED_OBJECT_VISUALS, itemId);
}

export function buildSummonedObject(
  itemId: string,
  entityId: number,
): { group: THREE.Group; height: number } {
  return SUMMONED_OBJECT_VISUALS[itemId].build(entityId);
}

export function syncSummonedObjectVisual(
  itemId: string,
  root: THREE.Object3D,
  time: number,
  entityId: number,
): void {
  SUMMONED_OBJECT_VISUALS[itemId]?.sync(root, time, entityId);
}

/** Idempotent: every entry's dispose is a no-op on a root it does not own. */
export function disposeSummonedObjectVisual(root: THREE.Object3D): void {
  for (const visual of Object.values(SUMMONED_OBJECT_VISUALS)) visual.dispose(root);
}

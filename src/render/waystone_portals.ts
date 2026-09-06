// The waystone arches: one modeled stone arch + portal swirl on EACH side of
// every `gate: 'waystone'` overworld portal (PORTALS, today the Wyrmgate
// Waystone in content/drakelands.ts), so a tolled crossing reads as a gate you
// walk through, not an invisible spot. The body is the dungeon-door family
// (door_portal.ts buildDoorBody: the same arch, plinths, and additive swirl
// every dungeon entrance wears, so the prewarm and shared-material story is
// already paid), seated on the terrain and turned to face its own landing,
// which is the direction a traveler walks through it.
//
// Renderer wiring: one entry of static_world_dressing.ts, attached through
// attachZoneFeature like the Duskfall cave mouths (hollow_gates.ts). That
// attach freezes every matrix in the group, so the swirl spins itself from an
// onBeforeRender hook that recomposes only its own matrices (the jail gate's
// swirl precedent, jail_scene.ts): no per-frame renderer call, no thaw of the
// static arch around it. Opacity is left alone on purpose: the swirl material
// is SHARED with every dungeon door, whose entity update already pulses it.

import * as THREE from 'three';
import { PORTALS } from '../sim/data';
import type { PortalDef, PortalSide } from '../sim/types';
import { terrainHeight } from '../sim/world';
import { buildDoorBody } from './door_portal';

export interface WaystonePortalsView {
  group: THREE.Group;
}

const SWIRL_SPIN_RATE = 1.4; // rad/s, the dungeon-door swirl's rate

/** Yaw that points an arch's walk-through axis (+z of the door body) at the
 *  side's landing, so a traveler crosses the swirl face-on. */
export function waystoneFacing(side: PortalSide): number {
  return Math.atan2(side.landing.x - side.x, side.landing.z - side.z);
}

/** The portals that wear an arch: every `gate: 'waystone'` record. */
export function waystonePortals(portals: readonly PortalDef[] = PORTALS): PortalDef[] {
  return portals.filter((portal) => portal.gate === 'waystone');
}

function spinSwirl(swirl: THREE.Mesh): void {
  swirl.rotation.z = ((performance.now() % 3_600_000) / 1000) * SWIRL_SPIN_RATE;
  // The group is matrix-frozen (attachZoneFeature): recompose this mesh only,
  // against the parent's baked world matrix, before the renderer reads it.
  swirl.updateMatrix();
  if (swirl.parent) swirl.matrixWorld.multiplyMatrices(swirl.parent.matrixWorld, swirl.matrix);
}

export function buildWaystonePortals(
  seed: number,
  lowGfx: boolean,
  portals: readonly PortalDef[] = PORTALS,
): WaystonePortalsView {
  const group = new THREE.Group();
  group.name = 'waystone-portals';
  for (const portal of waystonePortals(portals)) {
    for (const side of [portal.a, portal.b]) {
      const { body, portal: swirl } = buildDoorBody(true, null, lowGfx);
      body.name = `waystone:${portal.id}`;
      body.position.set(side.x, terrainHeight(side.x, side.z, seed), side.z);
      body.rotation.y = waystoneFacing(side);
      if (swirl) {
        swirl.userData.waystoneSwirl = true;
        swirl.onBeforeRender = () => spinSwirl(swirl);
      }
      group.add(body);
    }
  }
  return { group };
}

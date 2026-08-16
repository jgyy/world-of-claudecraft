// Ambient mount particle dispatch: the snail paints its slime path while
// gliding, the hover cycle streams aether exhaust off its tail, the boar
// kicks up hoof dust, the courser trails holy/shadow wisps, the charger
// trails warm solar radiance. Extracted out of
// renderer.ts (a monolith-budget coordinator) so a fifth MountVisualSpec.fx
// kind added later lands here, not as another branch grown on the
// coordinator; the switch's `never` default keeps it exhaustive against the
// fx union at compile time.
import type * as THREE from 'three';
import type { MountVisualSpec } from './mount_visuals';
import type { Vfx } from './vfx';

export function applyMountFx(
  vfx: Vfx,
  fx: MountVisualSpec['fx'],
  position: THREE.Vector3,
  facing: number,
  dt: number,
  moving: boolean,
  running: boolean,
): void {
  switch (fx) {
    case 'slime':
      if (moving) vfx.mountSlimeTrail(position, dt);
      break;
    case 'exhaust':
      vfx.mountExhaust(position, facing, dt, moving);
      break;
    case 'dust':
      if (moving) vfx.mountDustTrail(position, dt, running);
      break;
    case 'wisp':
      if (moving) vfx.mountWispTrail(position, dt);
      break;
    case 'ember':
      if (moving) vfx.mountEmberTrail(position, dt, running);
      break;
    case 'shade':
      if (moving) vfx.mountShadeTrail(position, dt, running);
      break;
    case 'frost':
      if (moving) vfx.mountFrostTrail(position, dt, running);
      break;
    case 'radiance':
      if (moving) vfx.mountRadianceTrail(position, dt, running);
      break;
    case null:
      break;
    default: {
      const _exhaustive: never = fx;
      void _exhaustive;
    }
  }
}

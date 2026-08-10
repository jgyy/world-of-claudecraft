// @vitest-environment jsdom
// Pins the whole-scene resident_scenery_core cull wired into
// src/render/yumi_maze.ts's per-frame update(): a built maze view is never
// disposed (it persists like an authored dungeon copy), so this loop would
// otherwise keep sweeping every wall stub forever, even long after the
// player has left the slot for another zone or match.
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { buildYumiMaze } from '../src/render/yumi_maze';
import { yumiMazeOrigin } from '../src/sim/data';
import { groundHeight } from '../src/sim/world';
import { YUMI_MAZE_WALL_HEIGHT, yumiMazeLayout } from '../src/sim/yumi_maze_layout';
import type { IWorld } from '../src/world_api';

// jsdom ships no canvas 2D backend, and buildYumiMaze builds its wall/floor
// materials through stoneTexture() (src/render/textures.ts), which needs
// one. Hand every 2d request an inert context whose methods no-op, matching
// tests/vale_cup_gate_notes_render.test.ts.
const inertCtx = (): unknown =>
  new Proxy(
    {},
    {
      get(_t, prop) {
        if (prop === 'canvas') return { width: 0, height: 0 };
        if (prop === 'createLinearGradient' || prop === 'createRadialGradient') {
          return () => ({ addColorStop: () => {} });
        }
        if (prop === 'getImageData' || prop === 'createImageData') {
          return () => ({ data: new Uint8ClampedArray(4), width: 1, height: 1 });
        }
        return () => {};
      },
      set() {
        return true;
      },
    },
  );

(HTMLCanvasElement.prototype as unknown as { getContext: unknown }).getContext = inertCtx;

const SEED = 7;
const ORIGIN = yumiMazeOrigin(0);
const FLOOR_Y = groundHeight(ORIGIN.x, ORIGIN.z, SEED);

function makeWorld(yumiA: { x: number; z: number } | null): IWorld {
  return {
    arenaInfo: yumiA
      ? {
          match: {
            yumi: {
              yumiA: { entityId: 1, hp: 1, maxHp: 1, x: yumiA.x, z: yumiA.z, alive: true },
              yumiB: { entityId: 2, hp: 1, maxHp: 1, x: yumiA.x + 4, z: yumiA.z + 4, alive: true },
            },
          },
        }
      : null,
  } as unknown as IWorld;
}

function findWallsMesh(group: THREE.Group): THREE.InstancedMesh {
  let found: THREE.InstancedMesh | null = null;
  group.traverse((o) => {
    if (o instanceof THREE.InstancedMesh) found = o;
  });
  if (!found) throw new Error('yumi maze walls InstancedMesh not found');
  return found;
}

function findBlueBeacon(group: THREE.Group): THREE.Mesh {
  let found: THREE.Mesh | null = null;
  group.traverse((o) => {
    if (o instanceof THREE.Mesh && o.visible === false) {
      const mat = o.material as THREE.MeshBasicMaterial;
      if (mat.color.getHex() === 0x2f6fe0) found = o;
    }
  });
  if (!found) throw new Error('yumi maze blue beacon not found');
  return found;
}

describe('yumi maze resident scenery cull', () => {
  it('skips the beacon anchor write while the eye is far outside the maze reach', () => {
    const view = buildYumiMaze(ORIGIN, SEED, { flames: [], fireLights: [], lowGfx: false });
    const beacon = findBlueBeacon(view.group);
    expect(beacon.visible).toBe(false);

    const yumiA = { x: ORIGIN.x + 3, z: ORIGIN.z + 3 };
    const world = makeWorld(yumiA);

    // Eye and camera thousands of yards from the maze: the maze's own
    // bounding sphere plus the camera's max reach off the eye cannot cover
    // this. If the cull were not wired in, place() would flip the beacon
    // visible here regardless of camera distance (it only reads world state).
    view.update(
      world,
      ORIGIN.x + 50_000,
      FLOOR_Y + 5,
      ORIGIN.z + 50_000,
      ORIGIN.x + 50_000,
      FLOOR_Y + 2,
      ORIGIN.z + 50_000,
      0.05,
      false,
    );
    expect(beacon.visible).toBe(false);
  });

  it('resumes the beacon anchor and the wall occluder fade once the eye is back in reach', () => {
    const view = buildYumiMaze(ORIGIN, SEED, { flames: [], fireLights: [], lowGfx: false });
    const beacon = findBlueBeacon(view.group);
    const walls = findWallsMesh(view.group);
    const layout = yumiMazeLayout();
    const shellStub = layout.shell[0]; // { x: 0, z: -SHELL_CENTER, hw: HALF_EXTENT, hd: WALL_HALF }
    const stubIndex = 0; // walls are built [...shell, ...walls]; shell[0] lands at instance 0

    const visibleMatrix = new THREE.Matrix4();
    walls.getMatrixAt(stubIndex, visibleMatrix);
    const visibleScale = new THREE.Vector3();
    visibleScale.setFromMatrixScale(visibleMatrix);
    expect(visibleScale.y).toBeCloseTo(YUMI_MAZE_WALL_HEIGHT, 5);

    const yumiA = { x: ORIGIN.x + 3, z: ORIGIN.z + 3 };
    const world = makeWorld(yumiA);

    // Eye standing dead center in the north shell wall's footprint, below its
    // top: occluderSegmentHitsBox's eyeInside branch fires on the first
    // frame regardless of the camera's position (occluder_fade_core.ts).
    const eyeX = ORIGIN.x + shellStub.x;
    const eyeZ = ORIGIN.z + shellStub.z;
    view.update(world, ORIGIN.x, FLOOR_Y + 5, ORIGIN.z - 10, eyeX, FLOOR_Y + 1, eyeZ, 0.05, false);

    // Beacon anchor resumed (regression pin: unchanged place() behavior once
    // back in reach, after the earlier skip).
    expect(beacon.visible).toBe(true);
    expect(beacon.position.x).toBeCloseTo(yumiA.x, 5);
    expect(beacon.position.z).toBeCloseTo(yumiA.z, 5);

    // Wall occluder fade resumed too: the stub the eye stands inside swaps
    // to its zero-scale hidden transform on the very same frame.
    const hiddenMatrix = new THREE.Matrix4();
    walls.getMatrixAt(stubIndex, hiddenMatrix);
    const hiddenScale = new THREE.Vector3();
    hiddenScale.setFromMatrixScale(hiddenMatrix);
    expect(hiddenScale.y).toBeCloseTo(0, 5);
  });
});

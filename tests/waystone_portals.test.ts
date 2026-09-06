// The waystone arches (src/render/waystone_portals.ts): every `gate:
// 'waystone'` overworld portal wears a dungeon-door arch + swirl on BOTH
// sides, seated on the terrain and turned to face its landing. Three.js runs
// headless in Node for the procedural arch, so the build is driven directly;
// the renderer wiring (static_world_dressing.ts, one attachZoneFeature entry)
// is a source pin, the hollow_gates.test.ts idiom.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { buildStaticWorldDressing } from '../src/render/static_world_dressing';
import {
  buildWaystonePortals,
  waystoneFacing,
  waystonePortals,
} from '../src/render/waystone_portals';
import { DRAKELANDS_PORTALS } from '../src/sim/content/drakelands';
import { REALM_PORTALS } from '../src/sim/content/realm';
import { PORTALS } from '../src/sim/data';
import { terrainHeight } from '../src/sim/world';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const WYRMGATE = DRAKELANDS_PORTALS[0];

describe('waystonePortals', () => {
  it('selects only the waystone-gated records (the Duskfall cave keeps its own mouths)', () => {
    expect(waystonePortals(PORTALS).map((p) => p.id)).toEqual(['wyrmgate_waystone']);
    expect(waystonePortals(REALM_PORTALS)).toEqual([]);
  });
});

describe('buildWaystonePortals', () => {
  it('builds one arch per side, seated on the terrain and facing its landing', () => {
    const { group } = buildWaystonePortals(42, false);
    expect(group.name).toBe('waystone-portals');
    expect(group.children).toHaveLength(2);
    for (const [i, side] of [WYRMGATE.a, WYRMGATE.b].entries()) {
      const body = group.children[i] as THREE.Group;
      expect(body.name).toBe('waystone:wyrmgate_waystone');
      expect(body.position.x).toBe(side.x);
      expect(body.position.z).toBe(side.z);
      expect(body.position.y).toBeCloseTo(terrainHeight(side.x, side.z, 42), 6);
      expect(body.rotation.y).toBeCloseTo(waystoneFacing(side), 6);
      const swirl = body.children.find((c) => c.userData.waystoneSwirl) as THREE.Mesh;
      expect(swirl).toBeDefined();
      expect(typeof swirl.onBeforeRender).toBe('function');
    }
  });

  it('turns each arch so its walk-through axis (+z) points at its own landing', () => {
    for (const side of [WYRMGATE.a, WYRMGATE.b]) {
      const yaw = waystoneFacing(side);
      // A yaw about y carries the body's +z axis to (sin yaw, cos yaw).
      const dx = side.landing.x - side.x;
      const dz = side.landing.z - side.z;
      const len = Math.hypot(dx, dz);
      expect(Math.sin(yaw)).toBeCloseTo(dx / len, 6);
      expect(Math.cos(yaw)).toBeCloseTo(dz / len, 6);
    }
    // Highwatch's arch opens west into town, Wyrmwatch's northwest at the hub.
    expect(Math.sin(waystoneFacing(WYRMGATE.a))).toBeLessThan(-0.9);
    expect(Math.sin(waystoneFacing(WYRMGATE.b))).toBeLessThan(-0.6);
    expect(Math.cos(waystoneFacing(WYRMGATE.b))).toBeLessThan(-0.6);
  });

  it('the swirl hook recomposes only its own matrices against the frozen parent', () => {
    const { group } = buildWaystonePortals(42, false);
    group.updateMatrixWorld(true);
    const body = group.children[0] as THREE.Group;
    const swirl = body.children.find((c) => c.userData.waystoneSwirl) as THREE.Mesh;
    const parentWorld = body.matrixWorld.clone();
    const before = swirl.matrixWorld.clone();
    swirl.onBeforeRender(
      null as never,
      null as never,
      null as never,
      null as never,
      null as never,
      null as never,
    );
    expect(swirl.rotation.z).not.toBe(0);
    expect(body.matrixWorld.equals(parentWorld)).toBe(true);
    // The recompose is the parent's world matrix times the mesh's own local one.
    const expected = parentWorld.clone().multiply(swirl.matrix);
    expect(swirl.matrixWorld.equals(expected)).toBe(true);
    expect(swirl.matrixWorld.equals(before)).toBe(false);
  });

  it('builds nothing when no portal wears an arch', () => {
    const { group } = buildWaystonePortals(42, false, REALM_PORTALS);
    expect(group.children).toEqual([]);
  });
});

describe('the renderer wiring (source pin)', () => {
  it('lists the waystone arches in the static world dressing after the Duskfall gates', () => {
    const fakeGates = { group: { name: 'hollow-gates' } as THREE.Group };
    const dressing = buildStaticWorldDressing(fakeGates, 42, false);
    expect(dressing[0]).toBe(fakeGates);
    expect(dressing.map((d) => d.group.name)).toContain('waystone-portals');
  });

  it('the renderer attaches every dressing entry through attachZoneFeature', () => {
    const renderer = readFileSync(`${ROOT}src/render/renderer.ts`, 'utf8');
    expect(renderer).toContain("from './static_world_dressing'");
    const start = renderer.indexOf('buildStaticWorldDressing(this.hollowGates');
    expect(start).toBeGreaterThan(-1);
    const tail = renderer.slice(start, start + 400);
    expect(tail).toContain('this.attachZoneFeature(staticFeature)');
  });
});

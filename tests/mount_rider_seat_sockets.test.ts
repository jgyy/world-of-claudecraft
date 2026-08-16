// Regression pin: every rider-lock mount (#3365 follow-up) ships two saddle
// hip-line socket nodes, RiderSeatL/R, children of the rig's own spine bone
// (scripts/lib/mount_rider_seat_sockets.mjs addRiderSeatSockets, called from
// scripts/bake_mount_gaits.mjs for the four gait-baked mounts and from
// scripts/bake_mount_rider_seat.mjs for the Veil-Wraith Courser, whose Idle/
// Walk/Run/Attack/Death clips are authored and must never be rebaked). The
// renderer reads their live world position every frame (CharacterVisual.
// mountSeatWorldPosition) instead of a fixed offset, so the rider tracks the
// mount's ACTUAL animated saddle. This pins the sockets are really present in
// the shipped GLB, are symmetric about the centerline, and reproduce the
// already hand-tuned MOUNT_VISUAL_SPECS seat/seatFwd world point at rest.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import { describe, expect, it } from 'vitest';
import { VISUALS } from '../src/render/characters/manifest';
import { MOUNT_VISUAL_SPECS } from '../src/render/mount_visuals';

const RIDER_LOCK_MOUNT_KEYS = [
  'veil_wraith_courser',
  'grimtusk_boar',
  'cinderhide_hound',
  'nightprowl_panther',
  'windrend_stormveil_shadewolf',
] as const;

describe('rider-seat sockets (RiderSeatL/R) on the rider-lock mounts', () => {
  it.each(RIDER_LOCK_MOUNT_KEYS)(
    '%s: sockets exist, are symmetric, and reproduce the tuned rest seat',
    async (mountKey) => {
      await MeshoptDecoder.ready;
      const io = new NodeIO()
        .registerExtensions(ALL_EXTENSIONS)
        .registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
      const spec = MOUNT_VISUAL_SPECS[mountKey];
      const def = VISUALS[spec.visualKey];
      const doc = await io.read(`public/${def.url}`);
      const root = doc.getRoot();
      const left = root.listNodes().find((n) => n.getName() === 'RiderSeatL');
      const right = root.listNodes().find((n) => n.getName() === 'RiderSeatR');
      expect(left, `${mountKey}: RiderSeatL`).toBeDefined();
      expect(right, `${mountKey}: RiderSeatR`).toBeDefined();
      if (!left || !right) return;

      const parentOf = new Map();
      for (const n of root.listNodes()) for (const c of n.listChildren()) parentOf.set(c, n);
      // Both sockets share ONE parent bone: the renderer's live tracking
      // relies on them inheriting exactly the same animated transform chain.
      expect(parentOf.get(left)?.getName(), `${mountKey}: RiderSeatL parent`).toBe(
        parentOf.get(right)?.getName(),
      );

      const qmul = (a: number[], b: number[]) => [
        a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
        a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
        a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
        a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
      ];
      const rotv = (q: number[], v: number[]) => {
        const [x, y, z, w] = q;
        const uvx = y * v[2] - z * v[1];
        const uvy = z * v[0] - x * v[2];
        const uvz = x * v[1] - y * v[0];
        const uuvx = y * uvz - z * uvy;
        const uuvy = z * uvx - x * uvz;
        const uuvz = x * uvy - y * uvx;
        return [
          v[0] + 2 * (w * uvx + uuvx),
          v[1] + 2 * (w * uvy + uuvy),
          v[2] + 2 * (w * uvz + uuvz),
        ];
      };
      // biome-ignore lint/suspicious/noExplicitAny: glTF-transform's own Node type
      const worldRot = (node: any): number[] => {
        let q = [0, 0, 0, 1];
        for (let n = node; n; n = parentOf.get(n)) q = qmul([...n.getRotation()], q);
        return q;
      };
      // biome-ignore lint/suspicious/noExplicitAny: glTF-transform's own Node type
      const worldPos = (node: any): number[] => {
        const t = [...node.getTranslation()];
        const parent = parentOf.get(node);
        if (!parent) return t;
        const pp = worldPos(parent);
        const r = rotv(worldRot(parent), t);
        return [pp[0] + r[0], pp[1] + r[1], pp[2] + r[2]];
      };
      const wl = worldPos(left);
      const wr = worldPos(right);
      const mid = [(wl[0] + wr[0]) / 2, (wl[1] + wr[1]) / 2, (wl[2] + wr[2]) / 2];

      let minY = Number.POSITIVE_INFINITY;
      let maxY = Number.NEGATIVE_INFINITY;
      const el: number[] = [];
      for (const mesh of root.listMeshes()) {
        for (const prim of mesh.listPrimitives()) {
          const pos = prim.getAttribute('POSITION');
          if (!pos) continue;
          for (let i = 0; i < pos.getCount(); i++) {
            pos.getElement(i, el);
            if (el[1] < minY) minY = el[1];
            if (el[1] > maxY) maxY = el[1];
          }
        }
      }
      const rawHeight = Math.max(1e-3, maxY - minY);
      const normScale = def.height / rawHeight;
      const yOffset = -minY * normScale;
      const yaw = def.yaw ?? 0;
      const cosY = Math.cos(yaw);
      const sinY = Math.sin(yaw);
      const worldX = normScale * (cosY * mid[0] + sinY * mid[2]);
      const worldY = yOffset + normScale * mid[1];
      const worldZ = normScale * (-sinY * mid[0] + cosY * mid[2]);

      expect(worldX, `${mountKey}: seat centered laterally`).toBeCloseTo(0, 2);
      expect(worldY, `${mountKey}: seat height matches the tuned spec`).toBeCloseTo(spec.seat, 2);
      expect(worldZ, `${mountKey}: seat fore/aft matches the tuned spec`).toBeCloseTo(
        spec.seatFwd,
        2,
      );

      const hipWorld = Math.hypot(wr[0] - wl[0], wr[1] - wl[1], wr[2] - wl[2]) * normScale;
      expect(hipWorld, `${mountKey}: sockets are genuinely two distinct points`).toBeGreaterThan(
        0.1,
      );
    },
  );
});

// Regression pin for #3365's known-issue follow-up: the Duskveil Panther's
// raw mesh faces along X, not Z like every other baked mount, and
// scripts/bake_mount_gaits.mjs's leg-swing math assumed a Z-forward rig
// (rotating each leg about world X, the axis that moves a Z-forward foot
// fore-aft but only ever moves an X-forward foot sideways). The result: the
// panther's Walk/Run clips swung the legs left-right instead of forward-back,
// a genuinely different bug from the yaw sign fix in mount_visuals.test.ts /
// characters/manifest.ts. Verified directly off the baked animation data (not
// a screenshot): the front-left foot's displacement across the Walk cycle
// must be dominant on X, matching the rig's own real fore-aft axis.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import { describe, expect, it } from 'vitest';

const qmul = (a: number[], b: number[]): number[] => [
  a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
  a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
  a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
  a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
];
const rotv = (q: number[], v: number[]): number[] => {
  const [x, y, z, w] = q;
  const uvx = y * v[2] - z * v[1];
  const uvy = z * v[0] - x * v[2];
  const uvz = x * v[1] - y * v[0];
  const uuvx = y * uvz - z * uvy;
  const uuvy = z * uvx - x * uvz;
  const uuvz = x * uvy - y * uvx;
  return [v[0] + 2 * (w * uvx + uuvx), v[1] + 2 * (w * uvy + uuvy), v[2] + 2 * (w * uvz + uuvz)];
};

describe('nightprowl_panther gait direction (#3365 follow-up)', () => {
  it('swings the front-left foot fore-aft along X, not sideways along Z', async () => {
    await MeshoptDecoder.ready;
    const io = new NodeIO()
      .registerExtensions(ALL_EXTENSIONS)
      .registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
    const doc = await io.read('public/models/mounts/nightprowl_panther.glb');
    const root = doc.getRoot();
    const nodes = new Map(root.listNodes().map((n) => [n.getName(), n] as const));
    const parentOf = new Map<
      ReturnType<typeof root.listNodes>[number],
      ReturnType<typeof root.listNodes>[number]
    >();
    for (const n of root.listNodes()) for (const c of n.listChildren()) parentOf.set(c, n);

    const worldRotAt = (
      node: ReturnType<typeof root.listNodes>[number],
      overrideRot?: number[],
    ) => {
      let q = [0, 0, 0, 1];
      for (let n: typeof node | undefined = node; n; n = parentOf.get(n)) {
        const r = n === node && overrideRot ? overrideRot : [...n.getRotation()];
        q = qmul(r, q);
      }
      return q;
    };
    const worldPos = (node: ReturnType<typeof root.listNodes>[number]): number[] => {
      const t = [...node.getTranslation()];
      const parent = parentOf.get(node);
      if (!parent) return t;
      const pp = worldPos(parent);
      const r = rotv(worldRotAt(parent), t);
      return [pp[0] + r[0], pp[1] + r[1], pp[2] + r[2]];
    };

    const bone = nodes.get('tripo::0_Left_Limb_0');
    expect(bone, 'front-left upper leg bone').toBeDefined();
    if (!bone) return;
    const restWorldRot = worldRotAt(bone);
    // A synthetic foot point below the bone at rest, fixed in the bone's own
    // local frame so it moves rigidly with it (mirrors the baker's own
    // rest * delta contract: scripts/bake_mount_gaits.mjs header).
    const footLocalOffset = rotv(
      [-restWorldRot[0], -restWorldRot[1], -restWorldRot[2], restWorldRot[3]],
      [0, -0.15, 0],
    );
    const footWorldAt = (animatedLocalRot: number[]) => {
      const wr = worldRotAt(bone, animatedLocalRot);
      const off = rotv(wr, footLocalOffset);
      const p = worldPos(bone);
      return [p[0] + off[0], p[1] + off[1], p[2] + off[2]];
    };

    const anim = root.listAnimations().find((a) => a.getName() === 'Walk');
    expect(anim, 'Walk animation').toBeDefined();
    const channel = anim
      ?.listChannels()
      .find((c) => c.getTargetNode() === bone && c.getTargetPath() === 'rotation');
    expect(channel, 'front-left leg rotation channel').toBeDefined();
    const sampler = channel?.getSampler();
    const times = sampler?.getInput()?.getArray();
    const rots = sampler?.getOutput()?.getArray();
    expect(times && rots).toBeTruthy();
    if (!times || !rots) return;
    const n = times.length;
    const getRot = (i: number) => [rots[i * 4], rots[i * 4 + 1], rots[i * 4 + 2], rots[i * 4 + 3]];

    const p0 = footWorldAt(getRot(0));
    const p1 = footWorldAt(getRot(Math.floor(n / 4)));
    const d = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]];

    expect(Math.abs(d[0]), "X displacement (fore-aft, the rig's real long axis)").toBeGreaterThan(
      0.02,
    );
    expect(
      Math.abs(d[0]),
      'X displacement must dominate Z (a sideways swing is the #3365 bug)',
    ).toBeGreaterThan(Math.abs(d[2]) * 3);
  });
});

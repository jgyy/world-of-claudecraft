// Regression pin: the four rider-lock story mounts with a `twist` entry in
// scripts/bake_mount_gaits.mjs RIGS carry a genuine COMPOUND rotation on
// their rock (spine) bone during Walk/Run: pitch flex (rock) AND a yaw
// torso-twist composed together (addRot's array form), not just the
// pre-existing single-axis pitch. A single-axis rotation keeps a CONSTANT
// rotation axis across every keyframe (up to an antipodal sign flip); a
// compound pitch+yaw rotation, whose relative weight shifts every frame,
// does not. That axis-drift is what this test measures, rather than reading
// off the quaternion's raw components (which mixes in the parent/rest
// sandwich addRot applies and would need re-deriving that math to interpret).
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import { describe, expect, it } from 'vitest';

const TWIST_MOUNT_KEYS = [
  'grimtusk_boar',
  'cinderhide_hound',
  'nightprowl_panther',
  'windrend_stormveil_shadewolf',
] as const;

/** Rotation axis of a unit quaternion [x,y,z,w] (normalized xyz, sign-fixed
 *  to a positive w hemisphere so an antipodal-flip neighbor reads the same
 *  axis instead of its negation). */
function axisOf(q: number[]): [number, number, number] {
  const [x, y, z] = q[3] < 0 ? q.map((v) => -v) : q;
  const len = Math.hypot(x, y, z) || 1;
  return [x / len, y / len, z / len];
}

describe('mount gait torso twist (compound rock+twist rotation, #3365 gait follow-up)', () => {
  it.each(TWIST_MOUNT_KEYS)(
    '%s: Walk carries a genuinely compound rotation on the rock bone, not single-axis pitch alone',
    async (mountKey) => {
      await MeshoptDecoder.ready;
      const io = new NodeIO()
        .registerExtensions(ALL_EXTENSIONS)
        .registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
      const doc = await io.read(`public/models/mounts/${mountKey}.glb`);
      const root = doc.getRoot();
      const walk = root.listAnimations().find((a) => a.getName() === 'Walk');
      expect(walk, `${mountKey}: Walk animation`).toBeDefined();
      if (!walk) return;

      const channel = walk
        .listChannels()
        .find((c) => c.getTargetNode()?.getName() === 'tripo::Spine_1');
      expect(channel, `${mountKey}: rock bone (tripo::Spine_1) channel`).toBeDefined();
      if (!channel) return;

      const output = channel.getSampler()?.getOutput()?.getArray();
      expect(output, `${mountKey}: rock bone output`).toBeDefined();
      if (!output) return;

      const keyCount = output.length / 4;
      expect(keyCount, `${mountKey}: at least a few keyframes`).toBeGreaterThan(4);

      const axes: [number, number, number][] = [];
      for (let i = 0; i < keyCount; i++) {
        axes.push(axisOf(Array.from(output.slice(i * 4, i * 4 + 4))));
      }
      // The axis sweeps SMOOTHLY over the cycle (rock and twist are both
      // continuous sine waves), so consecutive keyframes only differ by a
      // small derivative-sized step: comparing every pair, not just
      // neighbors, is what actually surfaces the total sweep a compound
      // rotation produces over a full stride, versus a single-axis rotation
      // holding the exact same axis at every keyframe.
      let maxAxisDrift = 0;
      for (let i = 0; i < axes.length; i++) {
        for (let j = i + 1; j < axes.length; j++) {
          const dot = axes[i][0] * axes[j][0] + axes[i][1] * axes[j][1] + axes[i][2] * axes[j][2];
          maxAxisDrift = Math.max(maxAxisDrift, 1 - Math.min(1, Math.max(-1, dot)));
        }
      }
      // A pure single-axis rotation (the pre-twist behavior) holds one fixed
      // axis all the way through: drift stays at (numerical-noise) zero. The
      // composed pitch+yaw twist genuinely rotates the axis itself over the
      // cycle, so this must clear a real threshold, not just epsilon.
      expect(
        maxAxisDrift,
        `${mountKey}: rock bone rotation axis must drift (compound rotation), not stay fixed (single-axis)`,
      ).toBeGreaterThan(0.001);
    },
  );
});

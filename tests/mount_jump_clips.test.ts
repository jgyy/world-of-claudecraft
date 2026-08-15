// Regression pin: every scripts/bake_mount_gaits.mjs RIGS entry now bakes a
// looping 'Jump' clip (a held, legs-tucked airborne pose), wired through
// characters/manifest.ts MOUNT_RIGGED_JUMP. This checks the clip is real
// (varies across keyframes), not just present by name: a degenerate all-rest
// clip would still pass the generic "clip resolves" sweep in
// character_clipmaps.test.ts but render as a frozen bind pose in the air.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import { describe, expect, it } from 'vitest';
import { VISUALS } from '../src/render/characters/manifest';

const JUMP_MOUNT_KEYS = [
  'mount_grag_bear',
  'mount_shadowjump_toad',
  'mount_stormfeather_griffin',
  'mount_drakemaw_raptor',
  'mount_grimtusk_boar',
  'mount_cinderhide_hound',
  'mount_nightprowl_panther',
] as const;

describe('mount Jump clips (jump animations for the baked-gait mounts)', () => {
  it('every RIGS-baked mount VisualDef points its jump clip at Jump', () => {
    for (const key of JUMP_MOUNT_KEYS) {
      expect(VISUALS[key].clips.jump, key).toBe('Jump');
    }
  });

  it.each(JUMP_MOUNT_KEYS)('%s: Jump clip is present and genuinely animates', async (key) => {
    await MeshoptDecoder.ready;
    const io = new NodeIO()
      .registerExtensions(ALL_EXTENSIONS)
      .registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
    const path = `public/${VISUALS[key].url}`;
    const doc = await io.read(path);
    const anim = doc
      .getRoot()
      .listAnimations()
      .find((a) => a.getName() === 'Jump');
    expect(anim, `${key}: Jump animation`).toBeDefined();
    if (!anim) return;

    const channels = anim.listChannels();
    expect(channels.length, `${key}: Jump channel count`).toBeGreaterThan(0);

    let anyVaries = false;
    for (const channel of channels) {
      const output = channel.getSampler()?.getOutput()?.getArray();
      expect(output, `${key}: ${channel.getTargetNode()?.getName()} output`).toBeDefined();
      if (!output) continue;
      const values = new Set(Array.from(output).map((v) => v.toFixed(5)));
      if (values.size > 1) anyVaries = true;
    }
    expect(anyVaries, `${key}: at least one Jump channel actually moves`).toBe(true);
  });
});

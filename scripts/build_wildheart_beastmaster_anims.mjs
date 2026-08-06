// Build the Fanglord Beastmaster's own attack/cast clip (issue #2889 round 2).
// mob_wildheart_beastmaster shares the literal TRIPO_BIPED_FULL_RIG ClipMap object, by
// reference, with the other 4 Wildheart Basin mobs in src/render/characters/manifest.ts,
// so this summoner/support beastmaster "attacks" with the exact same generic melee Attack
// swing as the ranged Stalker, the melee Ravager, the caster Hexcaller, and the Zulgar
// boss. This rig ships NO spare/unused donor clips (every one of
// Idle/Walk/Run/Attack/Hit/Cast/Jump/Death is already wired into TRIPO_BIPED_FULL_RIG), so
// the bespoke clip below is authored by pose-sample-and-blend (scripts/anim/pose_blend.mjs)
// off a re-timed, re-mixed re-sampling of THIS rig's own Cast and Hit donors, not a
// new/unused clip: an outward/wide-armed call gesture (sampled at a different Cast phase
// than the Hexcaller's own clip, so the two casters stay visually distinct) into a
// defensive brace. No Blender: same technique, same module, as
// scripts/build_mage_ability_anims.mjs.
//
//   Wildheart_Beastmaster_Attack: raise into a wide-armed Cast-donor pose sampled late in
//   Cast (a different phase than the Hexcaller's early-raise/held-forward sampling),
//   sustain the call, transition into Hit's own early brace pose, hold, settle to idle.
//   Total ~1.30s, reading as a beckoning call to the pack followed by a defensive brace.
//   Wired into both `attack` (the one-shot swing rotation) and `cast` (the looping cast
//   channel).
//
// Usage: node scripts/build_wildheart_beastmaster_anims.mjs [--preview]
// Output: public/models/creatures/wildheart_beastmaster_ability_anims.glb (0 meshes/
// skins, 1 clip: Wildheart_Beastmaster_Attack)
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dedup, prune } from '@gltf-transform/functions';
import {
  bakeClip,
  createGlbIO,
  easeInOutQuad,
  easeOutCubic,
  indexClip,
  mergePoses,
  poseValue,
  pushPoseRamp,
  samplePose,
  stripToAnimationsOnly,
} from './anim/pose_blend.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const SOURCE = resolve(ROOT, 'public/models/creatures/wildheart_beastmaster.glb');
const OUT = resolve(ROOT, 'public/models/creatures/wildheart_beastmaster_ability_anims.glb');
const PREVIEW_OUT = resolve(ROOT, 'tmp/wildheart_beastmaster_anims_preview.glb');
const PREVIEW = process.argv.includes('--preview');

const io = createGlbIO();
const doc = await io.read(SOURCE);
const root = doc.getRoot();

const idleIdx = indexClip(root, 'Idle');
const castIdx = indexClip(root, 'Cast');
const hitIdx = indexClip(root, 'Hit');

const allKeys = new Set([...idleIdx.keys(), ...castIdx.keys(), ...hitIdx.keys()]);
const donorFor = (key) => castIdx.get(key) ?? hitIdx.get(key) ?? idleIdx.get(key);

// Donor poses, sampled within each clip's real duration (Idle 15.375s, Cast 5.375s,
// Hit 0.700s). 4.0s is a distinct later Cast phase than the Hexcaller's own 0.4s/2.6s
// samples, so the two casters read as visually distinct despite sharing a donor clip.
const P_idle = samplePose(idleIdx, 0.3);
const P_wideArmed = samplePose(castIdx, 4.0); // outward/wide-armed call, late-Cast
const P_brace = samplePose(hitIdx, 0.15); // Hit donor's own early brace pose

// Cast (22 channels) and Hit (22 channels) don't animate the same channel set as Idle (39
// channels) on this rig; merge once (pose_blend.mjs mergePoses doc) so every channel any
// donor touches has SOME fallback value instead of null-ing out mid-blend.
const P_all = mergePoses(P_idle, P_wideArmed, P_brace);

const timeline = [[0, (k) => poseValue(P_idle, k, P_wideArmed)]];
pushPoseRamp(timeline, {
  fromTime: 0,
  toTime: 0.5,
  steps: 6,
  ease: easeOutCubic,
  fromPose: P_idle,
  toPose: P_wideArmed,
  fallback: P_all,
});
timeline.push([0.75, (k) => poseValue(P_wideArmed, k, P_idle)]); // sustained call beat
pushPoseRamp(timeline, {
  fromTime: 0.75,
  toTime: 0.95,
  steps: 3,
  ease: easeInOutQuad,
  fromPose: P_wideArmed,
  toPose: P_brace,
  fallback: P_all,
});
timeline.push([1.05, (k) => poseValue(P_brace, k, P_idle)]); // held defensive brace
pushPoseRamp(timeline, {
  fromTime: 1.05,
  toTime: 1.3,
  steps: 3,
  ease: easeOutCubic,
  fromPose: P_brace,
  toPose: P_idle,
  fallback: P_all,
});

const { animation } = bakeClip(doc, {
  clipName: 'Wildheart_Beastmaster_Attack',
  channelKeys: allKeys,
  timeline,
  donorFor,
});

if (PREVIEW) {
  await io.write(PREVIEW_OUT, doc);
  console.log(`wrote preview (mesh + skin + clip): ${PREVIEW_OUT}`);
}

stripToAnimationsOnly(doc, [animation]);
await doc.transform(prune(), dedup());
await io.write(OUT, doc);

const kept = root.listAnimations().map((a) => a.getName());
console.log(`wrote ${OUT}`);
console.log(`clips (${kept.length}): ${kept.join(', ')}`);

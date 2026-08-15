// Rideable-mount view data + the procedural motion math: which VISUALS key a
// sim MountKey renders as, how high the rider sits, and the bob applied to the
// clipless mounts (the hover cycle floats, the griffin canters; the snail
// glides flat). Pure and Node-tested (tests/mount_visuals.test.ts); the
// renderer is a thin consumer. The catalog itself (names, gates, combat
// numbers) is sim content: src/sim/content/mounts.ts.

import type { MountKey } from '../sim/content/mounts';
import { MOUNTS } from '../sim/content/mounts';

export interface MountVisualSpec {
  /** VISUALS key (src/render/characters/manifest.ts, lazyPreload). */
  visualKey: string;
  /** World-unit rider lift onto the saddle at e.scale = 1. */
  seat: number;
  /** World-unit rider shift along facing (negative = toward the tail) for
   *  mounts whose saddle sits off the model origin (the toad's is well back). */
  seatFwd: number;
  /** Carries baked Idle/Walk/Run gait clips (scripts/bake_mount_gaits.mjs).
   *  The clipless rest render their generated standing pose and move via the
   *  bob below. */
  rigged: boolean;
  /** Procedural bob amplitude in world units (0 = none). */
  bobAmp: number;
  /** Bob frequency in cycles per second. */
  bobHz: number;
  /** Bob even while standing (the hover cycle floats in place). */
  bobIdle: boolean;
  /** Suppress the bob while moving (the snail glides flat: bobIdle gives it
   *  idle motion without disturbing its already-flat glide). Default true
   *  (every other bobbed mount also bobs on the move). */
  bobWhileMoving: boolean;
  /** Bob shape: a smooth hover sine, or gallop-style hops (abs sine). */
  bobShape: 'hover' | 'hop';
  /** Ambient particle effect the renderer emits for this mount: the snail's
   *  slime path while moving, the hover cycle's aether exhaust, the boar's
   *  hoof dust, the courser's holy/shadow coat-shift wisps, the hound's
   *  ember-crack sparks, the panther's trailing shadow wisps. */
  fx: 'slime' | 'exhaust' | 'dust' | 'wisp' | 'ember' | 'shade' | 'frost' | null;
}

const spec = (
  visualKey: string,
  seat: number,
  rigged: boolean,
  bob?: {
    amp: number;
    hz: number;
    idle?: boolean;
    shape?: 'hover' | 'hop';
    whileMoving?: boolean;
  },
  seatFwd = 0,
  fx: 'slime' | 'exhaust' | 'dust' | 'wisp' | 'ember' | 'shade' | 'frost' | null = null,
): MountVisualSpec => ({
  visualKey,
  seat,
  seatFwd,
  rigged,
  bobAmp: bob?.amp ?? 0,
  bobHz: bob?.hz ?? 0,
  bobIdle: bob?.idle ?? false,
  bobWhileMoving: bob?.whileMoving ?? true,
  bobShape: bob?.shape ?? 'hop',
  fx,
});

export const MOUNT_VISUAL_SPECS: Record<MountKey, MountVisualSpec> = {
  // seat tuned to the authored horse model: its saddle sits forward of the
  // origin and lower than the old Tripo build, so the rider shifts toward the
  // neck and drops a touch
  valorsteed: spec('mount_valorsteed', 2.4, true, undefined, 0.15),
  grag_bear: spec('mount_grag_bear', 3.35, true, undefined, -0.8),
  // A gentle idle bob (the snail otherwise has no motion at all while
  // standing: rigged is false, so it carries no baked Idle loop, and no bob
  // meant it stood as a frozen statue between glides, the only mount that
  // did). Slow and low-amplitude to read as a slow-breathing glide, not the
  // hover cycle's mechanical float.
  stalkglider_snail: spec(
    'mount_stalkglider_snail',
    2.65,
    false,
    { amp: 0.05, hz: 0.4, idle: true, shape: 'hover', whileMoving: false },
    -0.3,
    'slime',
  ),
  aether_hover_cycle: spec(
    'mount_aether_hover_cycle',
    2.1,
    false,
    { amp: 0.14, hz: 1.1, idle: true, shape: 'hover' },
    0,
    'exhaust',
  ),
  shadowjump_toad: spec('mount_shadowjump_toad', 2.52, true, undefined, -0.5),
  // gait-rigged by bake_mount_gaits.mjs (buildPropRig): real Walk/Run clips
  // replaced the old procedural canter hop
  stormfeather_griffin: spec('mount_stormfeather_griffin', 2.75, true),
  // ships its authored strut cycle as Walk/Run plus a baked breathing Idle;
  // the saddle sits over the hips, behind the neck (hence the rear shift)
  thunderstrut_gobbler: spec('mount_thunderstrut_gobbler', 2.05, true, undefined, -0.15),
  // Compact tracked vehicle with an authored rider socket behind the turret.
  // Its rigid-body clips animate the suspension and track wheels without a
  // procedural bob, keeping the pilot locked to the saddle.
  terrorspark_groundshaker: spec('mount_terrorspark_groundshaker', 2.38, true, undefined, -0.3),
  // The Drakemaw Raptor: authored saddle sits over the hips behind the neck
  // spines (hence the slight rear shift), gait-rigged Walk/Run cycles.
  drakemaw_raptor: spec('mount_drakemaw_raptor', 2.35, true, undefined, -0.1),
  // The Veil-Wraith Courser: a hart-shaped body like the horse, saddle just
  // behind the neck over the withers (small forward shift), real Idle/Walk/
  // Run clips from its own Walk animation (see manifest.ts). 'wisp': its coat
  // shifting between holy radiance and shadow mist is otherwise flavor text
  // with nothing behind it in-world, so it earns the ambient particle trail.
  // seat/seatFwd scaled x1.2 with the +20% model size bump (manifest.ts
  // height 3.9 -> 4.68) so the saddle position holds at the new scale.
  veil_wraith_courser: spec('mount_veil_wraith_courser', 3.12, true, undefined, 0.12, 'wisp'),
  // Grimtusk the Ironhide Boar: a stocky, low-slung quadruped, so the seat
  // sits well under the taller mounts above. Its actual saddle prop rides the
  // back over the haunches, well behind the model origin (the boar's head and
  // shoulders dominate the front half of the mesh), hence the large rearward
  // shift; a seatFwd of 0 left the rider hovering over the neck with the
  // empty saddle visible behind them, and -0.7 (an earlier attempt) still
  // left the rider straddling the front edge of the saddle near the head,
  // short of the visible seat. -1.4 (a later attempt) overshot the other way:
  // a clean top-down capture with the mount clear of every other prop showed
  // the rider sitting past the saddle's rear edge, near the haunches, with no
  // hindquarters visible past them at all. Re-measured the same way with the
  // model isolated: -1.15 centers the rider on the saddle's leather panel
  // (buckle line under the seat, tail and hind legs still visible behind).
  // 'dust': a heavy charging boar kicks up hoof dust the way the snail leaves
  // slime and the hover cycle streams exhaust.
  // seat/seatFwd scaled x1.2 with the +20% model size bump (manifest.ts
  // height 2.6 -> 3.12) so the saddle position holds at the new scale.
  grimtusk_boar: spec('mount_grimtusk_boar', 2.28, true, undefined, -1.02, 'dust'),
  // Ashfang the Cinderhide Hound: a warlock-flavored demonic war-mount (see
  // content/classes.ts, the Cinderhide ability), taller-standing than the
  // boar with the harness/tack riding centered over its shoulders rather
  // than set far back. 'ember': its obsidian hide is fractured with glowing
  // cracks of cooling slag, so it trails rising embers the way the boar
  // kicks up ground dust and the courser streams holy/shadow wisps.
  // seat/seatFwd scaled x1.2 with the +20% model size bump (manifest.ts
  // height 3.1 -> 3.72) so the saddle position holds at the new scale.
  cinderhide_hound: spec('mount_cinderhide_hound', 2.82, true, undefined, -0.42, 'ember'),
  // Nightprowl the Duskveil Panther: a rogue-flavored shadow panther (see
  // content/classes.ts, the Smokestep ability that grants Duskveil stealth),
  // lower-slung and lither than the hound, with a real 3D saddle prop (not
  // baked flat into the hide texture like the boar's/hound's). Its saddle
  // sits over the shoulders. 'shade': it trails wisps of the same shadow it
  // melts into on Smokestep, the way the hound trails embers off its cracked
  // hide and the courser streams holy/shadow wisps off its coat.
  // seat was 2.0, well above the actual spine/back height (measured off the
  // live rig's own spine-bone world position, calibrated against the boar's
  // already-confirmed seat margin above its own spine bone): the rider
  // floated visibly clear of the saddle. 1.59 (at the old 2.3 model height)
  // landed the rider on the back, confirmed with a close low side-on capture
  // matching the boar's own reference framing, not assumed from the math
  // alone. Scaled to 1.908 with the +20% model size bump (manifest.ts height
  // 2.3 -> 2.76) so that fix holds at the new scale.
  nightprowl_panther: spec('mount_nightprowl_panther', 1.908, true, undefined, -0.36, 'shade'),
  // Windrend the Stormveil Shadewolf: a shaman-flavored spectral wolf (see
  // content/classes.ts, the ghost_wolf ability, in-game name "Shadewolf"),
  // leggier and more upright than the panther's low prowl, saddle riding
  // just behind the shoulders like the hound's and courser's (small forward
  // shift, verified live the same way the boar's seat fix was: player.facing
  // pinned, absolute camera angles, not a screenshot read alone). 'frost':
  // its translucent hide sheds a cold spectral mist that spreads outward as
  // it drifts, distinct from every other mount's ambient trail.
  // seat was 2.15, well clear of the actual back height (same live spine-bone
  // measurement + close low side-on re-verification as the panther above).
  // The spine-bone-derived first guess (1.58) still floated visibly on a
  // live capture; the wolf's back sits lower relative to its spine bones
  // than the boar's calibration predicted, so it was walked down further and
  // re-verified against the same close low side-on framing until the rider's
  // legs actually overlapped the saddle: 1.22 (at the old 2.4 model height).
  // Scaled to 1.464 with the +20% model size bump (manifest.ts height
  // 2.4 -> 2.88) so that fix holds at the new scale.
  windrend_stormveil_shadewolf: spec(
    'mount_windrend_stormveil_shadewolf',
    1.464,
    true,
    undefined,
    -0.18,
    'frost',
  ),
};

/** Spec for an entity's active mountKey, or null when dismounted/unknown. */
export function mountVisualSpec(mountKey: string): MountVisualSpec | null {
  return mountKey in MOUNTS ? MOUNT_VISUAL_SPECS[mountKey as MountKey] : null;
}

/** World-unit rider lift for the active mountKey ('' or unknown: 0). */
export function mountSeatLift(mountKey: string): number {
  return mountVisualSpec(mountKey)?.seat ?? 0;
}

/** Procedural vertical offset for a clipless mount at time t (seconds). */
export function mountBobY(spec: MountVisualSpec, timeSec: number, moving: boolean): number {
  if (spec.bobAmp <= 0) return 0;
  if (moving ? !spec.bobWhileMoving : !spec.bobIdle) return 0;
  const wave = Math.sin(timeSec * Math.PI * 2 * spec.bobHz);
  return (spec.bobShape === 'hover' ? wave : Math.abs(wave)) * spec.bobAmp;
}

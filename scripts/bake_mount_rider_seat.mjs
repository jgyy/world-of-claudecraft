// Add rider-seat sockets (RiderSeatL/R, scripts/lib/mount_rider_seat_sockets.mjs)
// to a mount GLB whose clips are AUTHORED (not baked by
// scripts/bake_mount_gaits.mjs) and so must never be regenerated or disposed.
// Today that is only the Veil-Wraith Courser: its Idle/Walk/Run/Attack/Death
// clips come from its own source model's raw Tripo retarget
// (characters/manifest.ts mount_veil_wraith_courser), unlike the other four
// #3365 story mounts, which bake_mount_gaits.mjs's RIGS table handles
// (sockets added alongside the regenerated gait clips, see its
// grimtusk_boar/cinderhide_hound/nightprowl_panther/windrend_stormveil_shadewolf
// riderSeat entries). Idempotent: re-running replaces the two socket nodes and
// touches nothing else in the document.
//
//   node scripts/bake_mount_rider_seat.mjs
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import { addRiderSeatSockets } from './lib/mount_rider_seat_sockets.mjs';

// height/yaw mirror characters/manifest.ts mount_veil_wraith_courser;
// seatY/seatFwd mirror MOUNT_VISUAL_SPECS.veil_wraith_courser
// (src/render/mount_visuals.ts). Same Tripo rig family as the RIGS-baked
// mounts, so tripo::Spine_1 is the same landmark spine bone; hipSpread sits
// between the panther's narrow prowl and the boar's wide stance for this
// hart-shaped body.
const TARGETS = {
  veil_wraith_courser: {
    height: 4.68,
    yaw: Math.PI,
    seatY: 3.12,
    seatFwd: 0.12,
    hipSpread: 0.09,
    parentBoneName: 'tripo::Spine_1',
  },
  // Solmane the Sunveil Charger: the paladin's story mount (Solar Step,
  // src/sim/content/paladin_core_abilities.ts), generated via the
  // asset-pipeline creature lane. This rig's auto-rigger output is a longer,
  // finer Spine_0..Spine_5 chain (vs the courser's Spine_0/1) and an
  // ambiguous, asymmetric leg topology (its "0_Left/Right_Limb" chains climb
  // UPWARD off the head bones rather than descending toward hooves, most
  // likely the flowing mane confusing the limb-detection heuristic, not a
  // usable leg chain), so this mount ships on its Tripo-retargeted Walk/Idle/
  // Run/Attack/Death clips rather than a custom scripts/bake_mount_gaits.mjs
  // RIGS entry (same sanctioned shape as valorsteed/thunderstrut_gobbler's
  // authored clips; see that file's header). height/yaw/seatY/seatFwd start
  // from the Veil-Wraith Courser's own already-tuned values (a similarly
  // proportioned horse-shaped rig, raw bind height ~0.87 vs the courser's
  // ~0.8, scaled to the same 4.68 world-unit height): a reasoned FIRST GUESS,
  // not a live-verified one (this session had no working browser
  // environment to capture a live reference), so re-verify the seat and yaw
  // with a live close side-on capture before merge, the same as every other
  // mount's seat in this PR. yaw: bounding-box measurement shows this rig's
  // long (fore-aft) axis is raw X, nose at the +X extreme (Head_0 sits at the
  // spine chain's own +X end), the same non-standard axis the hound and
  // panther have, so it takes their same -Math.PI/2 correction (swings local
  // +X onto the game's +Z-forward convention) by direct analogy, not an
  // independent live check. tripo::Spine_4 sits near the model's own
  // geometric center along that chain (Spine_0 at the hindquarters, Head_0
  // at the muzzle), a reasonable withers/saddle landmark on a 6-segment
  // spine.
  solmane_charger: {
    height: 4.68,
    yaw: -Math.PI / 2,
    seatY: 3.12,
    seatFwd: 0.12,
    hipSpread: 0.09,
    parentBoneName: 'tripo::Spine_4',
  },
};

await MeshoptDecoder.ready;
await MeshoptEncoder.ready;
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });

const keysArg = process.argv.slice(2);
const targets = keysArg.length ? keysArg : Object.keys(TARGETS);

for (const key of targets) {
  const seat = TARGETS[key];
  if (!seat) {
    console.error(
      `unknown authored-clip mount "${key}" (have: ${Object.keys(TARGETS).join(', ')})`,
    );
    process.exit(1);
  }
  const path = `public/models/mounts/${key}.glb`;
  const doc = await io.read(path);
  addRiderSeatSockets(doc, seat);
  await io.write(path, doc);
  console.log(`${path}: added RiderSeatL/R (authored clips left untouched)`);
}

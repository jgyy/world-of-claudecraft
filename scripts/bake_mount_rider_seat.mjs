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

// Rider-seat sockets: two small child nodes (RiderSeatL/R) on a rideable
// mount's saddle hip line, children of the rig's own spine bone, so the
// renderer's live rider-lock (CharacterVisual.mountSeatWorldPosition,
// src/render/characters/visual.ts) reads the mount's ACTUAL animated saddle
// position every frame instead of a fixed offset applied on top of an
// un-animated rest pose (the "rider stays glued to a fixed point while the
// model twists/stomps under it" bug, #3365). Placed to reproduce the already
// hand-tuned MOUNT_VISUAL_SPECS seat/seatFwd world point at REST (idle
// mounting looks identical to before this change), by inverting the
// renderer's own prepareVisual normalization (normScale = height/rawHeight,
// yOffset = -minY*normScale, then a yaw rotation about Y) back into the rig's
// own raw bind-pose space, then converting that raw-root-space point into a
// local offset under the named spine bone.
//
// Shared by scripts/bake_mount_gaits.mjs (the RIGS-baked mounts, sockets added
// alongside the regenerated gait clips) and scripts/bake_mount_rider_seat.mjs
// (mounts with AUTHORED clips, e.g. the Veil-Wraith Courser, whose animations
// must NOT be touched: this module never disposes or creates animations).

const qmul = (a, b) => [
  a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
  a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
  a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
  a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
];
const qconj = (q) => [-q[0], -q[1], -q[2], q[3]];
const rotv = (q, v) => {
  const [x, y, z, w] = q;
  const uvx = y * v[2] - z * v[1];
  const uvy = z * v[0] - x * v[2];
  const uvz = x * v[1] - y * v[0];
  const uuvx = y * uvz - z * uvy;
  const uuvy = z * uvx - x * uvz;
  const uuvz = x * uvy - y * uvx;
  return [v[0] + 2 * (w * uvx + uuvx), v[1] + 2 * (w * uvy + uuvy), v[2] + 2 * (w * uvz + uuvz)];
};

/** Raw (un-normalized, bind-pose) mesh vertical bounds, scanned over every
 *  primitive's POSITION accessor: the same figure prepareVisual's own bounds
 *  scan reduces to at a rig's bind pose, so normScale/yOffset here match the
 *  renderer's live normalization. */
function rawBoundsY(root) {
  let minY = Infinity;
  let maxY = -Infinity;
  const el = [];
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
  return { minY, maxY };
}

/**
 * Add (or replace) RiderSeatL/R under `parentBoneName`, computed so their
 * rest-pose world-space midpoint equals (0, seatY, seatFwd) once normalized
 * the same way prepareVisual normalizes this rig at render time.
 *
 * @param {import('@gltf-transform/core').Document} doc
 * @param {{height:number, yaw?:number, seatY:number, seatFwd:number, hipSpread:number, parentBoneName:string}} seat
 */
export function addRiderSeatSockets(doc, seat) {
  const root = doc.getRoot();
  for (const n of root.listNodes()) {
    if (n.getName() === 'RiderSeatL' || n.getName() === 'RiderSeatR') n.dispose();
  }

  const nodes = new Map();
  for (const n of root.listNodes()) nodes.set(n.getName(), n);
  const parentOf = new Map();
  for (const n of root.listNodes()) for (const c of n.listChildren()) parentOf.set(c, n);
  const worldRot = (node) => {
    let q = [0, 0, 0, 1];
    for (let n = node; n; n = parentOf.get(n)) q = qmul([...n.getRotation()], q);
    return q;
  };
  const worldPos = (node) => {
    const t = [...node.getTranslation()];
    const parent = parentOf.get(node);
    if (!parent) return t;
    const pp = worldPos(parent);
    const r = rotv(worldRot(parent), t);
    return [pp[0] + r[0], pp[1] + r[1], pp[2] + r[2]];
  };

  const seatBone = nodes.get(seat.parentBoneName);
  if (!seatBone) throw new Error(`riderSeat: bone "${seat.parentBoneName}" not found`);

  const { minY, maxY } = rawBoundsY(root);
  const rawHeight = Math.max(1e-3, maxY - minY);
  const normScale = seat.height / rawHeight;
  const yOffset = -minY * normScale;
  const yaw = seat.yaw ?? 0;
  const cosY = Math.cos(yaw);
  const sinY = Math.sin(yaw);
  const rawY = (seat.seatY - yOffset) / normScale;
  // Ry(yaw) is orthonormal, so its inverse is its transpose: solve the raw
  // (x,z) that lands the CENTERED seat point (world x=0, z=seatFwd).
  const targetZ = seat.seatFwd / normScale;
  const rawXCenter = -sinY * targetZ;
  const rawZCenter = cosY * targetZ;
  const half = seat.hipSpread / 2;
  const parentWP = worldPos(seatBone);
  const parentWR = worldRot(seatBone);

  for (const [name, sign] of [
    ['RiderSeatL', -1],
    ['RiderSeatR', 1],
  ]) {
    // A raw delta of (half*cosY, half*sinY) on (x,z) rotates to exactly
    // (half, 0) in world space: the same Ry(yaw) forward mapping above,
    // applied to a pure lateral offset instead of the seat point itself.
    const raw = [rawXCenter + sign * half * cosY, rawY, rawZCenter + sign * half * sinY];
    const delta = [raw[0] - parentWP[0], raw[1] - parentWP[1], raw[2] - parentWP[2]];
    const local = rotv(qconj(parentWR), delta);
    const node = doc.createNode(name).setTranslation(local);
    seatBone.addChild(node);
  }
}

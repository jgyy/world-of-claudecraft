// Regression coverage for the rider-seat bone lock (#3365 follow-up): before
// this fix, a mounted rider's position was a FIXED offset re-applied every
// frame on top of the mount's un-animated rest pose, so the rider stayed
// glued to a fixed point in space while the mount's baked Walk/Run clips
// twisted, stomped, and bobbed the actual saddle underneath them. The fix
// bakes two socket bones onto the saddle's hip line (RiderSeatL/R, children of
// the mount's own spine bone, scripts/bake_mount_gaits.mjs) and reads their
// LIVE world position every frame (CharacterVisual.mountSeatWorldPosition),
// so the rider tracks the actual animated saddle instead of a static offset.
//
// Assertions below are deliberately relative/qualitative, not pinned to exact
// coordinates: prepareVisual applies its own bounding-box normalization scale
// to the stub rig, which this test does not (and should not) reimplement.
import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';

function stubMountRig(withSockets: boolean): {
  scene: THREE.Group;
  animations: THREE.AnimationClip[];
} {
  const scene = new THREE.Group();
  const root = new THREE.Bone();
  root.name = 'Root';
  const spine = new THREE.Bone();
  spine.name = 'Spine1';
  spine.position.set(0, 1, 0);
  root.add(spine);
  const bones = [root, spine];
  if (withSockets) {
    const seatLeft = new THREE.Bone();
    seatLeft.name = 'RiderSeatL';
    seatLeft.position.set(-0.2, 0.3, -0.1);
    const seatRight = new THREE.Bone();
    seatRight.name = 'RiderSeatR';
    seatRight.position.set(0.2, 0.3, -0.1);
    spine.add(seatLeft, seatRight);
    bones.push(seatLeft, seatRight);
  }
  scene.add(root);
  scene.updateMatrixWorld(true);

  const skeleton = new THREE.Skeleton(bones);
  skeleton.calculateInverses();
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const count = geometry.getAttribute('position').count;
  const skinIndex = new Uint16Array(count * 4);
  const skinWeight = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) skinWeight[i * 4] = 1;
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndex, 4));
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeight, 4));
  const mesh = new THREE.SkinnedMesh(geometry, new THREE.MeshStandardMaterial());
  mesh.name = 'mount_body';
  mesh.bind(skeleton);
  scene.add(mesh);

  const clip = (name: string) =>
    new THREE.AnimationClip(name, 1, [
      new THREE.VectorKeyframeTrack('Spine1.position', [0, 1], [0, 1, 0, 0, 1.1, 0]),
    ]);
  return {
    scene,
    animations: [clip('Idle'), clip('Walk'), clip('Run'), clip('Jump'), clip('Death')],
  };
}

describe('CharacterVisual.mountSeatWorldPosition (rider seat bone lock)', () => {
  async function buildVisual(rig: { scene: THREE.Group; animations: THREE.AnimationClip[] }) {
    vi.resetModules();
    vi.doMock('../src/render/assets/loader', () => ({
      loadGltf: vi.fn(() => Promise.resolve(rig)),
      loadHdr: vi.fn(() => new Promise(() => undefined)),
      loadTexture: vi.fn(() => Promise.resolve(new THREE.Texture())),
      loadKtx2Texture: vi.fn(() => Promise.resolve(new THREE.Texture())),
      releaseGltf: vi.fn(),
    }));
    const { charactersReady, preloadMountAssets } = await import('../src/render/characters/assets');
    await charactersReady();
    await preloadMountAssets('mount_grimtusk_boar');
    const { CharacterVisual } = await import('../src/render/characters/visual');
    const visual = new CharacterVisual('mount_grimtusk_boar', 0xffffff, 0);
    const owner = new THREE.Group();
    owner.add(visual.root);
    owner.updateMatrixWorld(true);
    return { visual, owner };
  }

  it('averages the two hip sockets into a live world-space seat point, centered laterally', async () => {
    const { visual } = await buildVisual(stubMountRig(true));
    const out = new THREE.Vector3();
    expect(visual.mountSeatWorldPosition(out)).toBe(true);
    // The sockets are symmetric about the spine's local x=0 plane (+-0.2), and
    // grimtusk_boar carries no yaw override, so that symmetry survives
    // uniform normalization: the averaged x lands on the mount's centerline.
    expect(out.x).toBeCloseTo(0, 4);
    // Both are above and behind the spine origin (y +0.3, z -0.1 locally, no
    // sign-flipping yaw): the world point must land strictly off the spine
    // origin in those directions, whatever the normalization scale turns out
    // to be, not clamped to some fixed constant.
    expect(out.y).toBeGreaterThan(0);
    expect(out.z).toBeLessThan(0);
  });

  it('tracks the socket bones AFTER the parent bone animates (the whole point of the fix)', async () => {
    const { visual } = await buildVisual(stubMountRig(true));
    const spine = visual.root.getObjectByName('Spine1') as THREE.Bone;
    const before = new THREE.Vector3();
    visual.mountSeatWorldPosition(before);
    // Simulate a mid-stride pose change on the mount's own animated bone (the
    // kind of twist/stomp a baked Walk/Run clip drives every frame): the seat
    // must move WITH it, not stay glued to the pre-animation position.
    spine.position.y = 1.4;
    spine.updateMatrixWorld(true);
    const after = new THREE.Vector3();
    expect(visual.mountSeatWorldPosition(after)).toBe(true);
    expect(after.y).toBeGreaterThan(before.y);
  });

  it('fails soft to false when the rig carries no rider-seat sockets (clipless mounts, un-baked rigs)', async () => {
    const { visual } = await buildVisual(stubMountRig(false));
    const out = new THREE.Vector3();
    expect(visual.mountSeatWorldPosition(out)).toBe(false);
  });

  it('fails soft to false while hidden or the owner is not auto-updating', async () => {
    const { visual, owner } = await buildVisual(stubMountRig(true));
    const out = new THREE.Vector3();
    expect(visual.mountSeatWorldPosition(out)).toBe(true);
    owner.visible = false;
    expect(visual.mountSeatWorldPosition(out)).toBe(false);
    owner.visible = true;
    owner.matrixWorldAutoUpdate = false;
    expect(visual.mountSeatWorldPosition(out)).toBe(false);
    owner.matrixWorldAutoUpdate = true;
    visual.setFar(true);
    expect(visual.mountSeatWorldPosition(out)).toBe(false);
    visual.setFar(false);
    expect(visual.mountSeatWorldPosition(out)).toBe(true);
  });

  it('a non-mount visual key never resolves rider-seat bones, even when the rig has them', async () => {
    // Same stub scene (RiderSeatL/R present and reachable) but a key that
    // does not start with 'mount_': the constructor's lookup is gated on the
    // key prefix, not on whatever nodes happen to exist in the loaded model.
    vi.resetModules();
    vi.doMock('../src/render/assets/loader', () => ({
      loadGltf: vi.fn(() => Promise.resolve(stubMountRig(true))),
      loadHdr: vi.fn(() => new Promise(() => undefined)),
      loadTexture: vi.fn(() => Promise.resolve(new THREE.Texture())),
      loadKtx2Texture: vi.fn(() => Promise.resolve(new THREE.Texture())),
      releaseGltf: vi.fn(),
    }));
    const { charactersReady } = await import('../src/render/characters/assets');
    await charactersReady();
    const { CharacterVisual } = await import('../src/render/characters/visual');
    const visual = new CharacterVisual('form_metamorph', 0xffffff, 0);
    const owner = new THREE.Group();
    owner.add(visual.root);
    owner.updateMatrixWorld(true);
    const out = new THREE.Vector3();
    expect(visual.mountSeatWorldPosition(out)).toBe(false);
  });
});

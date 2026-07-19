import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import type { AnimState } from '../src/render/characters/visual';
import type { Entity } from '../src/sim/types';

// Review feedback on PR #2064 (feat(render): add a dazed pose for hard-CC'd
// entities): a rig with only a single hit-react clip (the mob_training_dummy
// family: clips.hit = ['Hit'], the majority shape across mobs) resolves the
// new 'stunned' base pose to that SAME AnimationAction playHit() uses as its
// one-shot (baseAction()'s stunned -> clips.stunned ?? hit[0] ?? idle
// fallback). Sequence: stun starts, base fades into hit[0] looping; a melee
// hit lands mid-stun, playOneShot() reclamps that action to LoopOnce; when it
// finishes, onFinished() hands back to baseAction(), which is the SAME
// action object, so the old `next === this.current` guard in fadeTo() no-op'd
// and the rig stayed frozen on the hit-react's clamped last frame for the
// rest of the stun instead of resuming the dazed loop.
const dummyEntity = {
  kind: 'mob',
  id: 1,
  templateId: 'training_dummy',
  color: 0xffffff,
  skin: 0,
  mainhandItemId: null,
} as unknown as Entity;

const STUNNED_STATE: AnimState = {
  speed: 0,
  moving: false,
  running: false,
  airborne: false,
  backwards: false,
  dead: false,
  casting: false,
  swimming: false,
  sitting: false,
  stunned: true,
};

async function buildDummyVisual() {
  const stubGltf = () => {
    const scene = new THREE.Group();
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 1), new THREE.MeshStandardMaterial());
    mesh.name = 'body';
    scene.add(mesh);
    // real (non-zero-length) clips: LoopOnce needs actual duration to reach
    // 'finished' via mixer.update() the same way a real hit-react clip would.
    const clip = (name: string) => new THREE.AnimationClip(name, 0.2, []);
    return { scene, animations: ['Idle', 'Walk', 'Run', 'Attack', 'Hit', 'Death'].map(clip) };
  };
  vi.doMock('../src/render/assets/loader', () => ({
    loadGltf: vi.fn(() => Promise.resolve(stubGltf())),
    loadHdr: vi.fn(() => new Promise(() => undefined)),
    loadTexture: vi.fn(() => new Promise(() => undefined)),
    releaseGltf: vi.fn(),
  }));
  const { preloadTrainingDummyAssets } = await import('../src/render/characters/assets');
  await preloadTrainingDummyAssets();
  const { createCharacterVisual } = await import('../src/render/characters/index');
  const visual = createCharacterVisual(dummyEntity);
  if (!visual) throw new Error('expected a visual for the preloaded training dummy');
  return visual;
}

describe('CharacterVisual: dazed pose resumes after a hit-react on a single-clip rig', () => {
  it('does not freeze on the hit-react clamp once the one-shot finishes mid-stun', async () => {
    vi.resetModules();
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const visual = await buildDummyVisual();

    // Enter the stunned pose: base resolves to hit[0] looping (no bespoke
    // 'stunned' clip on this rig).
    visual.update(0.016, STUNNED_STATE, true);
    expect(visual.isMidOneShot).toBe(false);

    // A melee hit lands mid-stun: reclamps that same action as a one-shot.
    visual.playHit();
    expect(visual.isMidOneShot).toBe(true);

    // Drive the mixer well past the (short, real) clip duration so the
    // one-shot naturally fires THREE's 'finished' event and onFinished()
    // hands control back to baseAction().
    for (let i = 0; i < 30; i++) visual.update(0.05, STUNNED_STATE, true);

    // Review feedback on PR #2064 (finding 4): `isMidOneShot` alone does not
    // reproduce the bug. `onFinished()` clears `currentIsOneShot` to false
    // BEFORE calling `fadeTo()`, and nothing on fadeTo's early-return path
    // can set it back, so `isMidOneShot` reads false whether or not the
    // fade actually happened. The real, decisive observable is the
    // underlying THREE.AnimationAction: pre-fix it stays clamped at
    // `loop: LoopOnce, paused: true` on the hit-react's last frame forever;
    // post-fix it resumes looping (`loop: LoopRepeat, paused: false`).
    const current = (visual as unknown as { current: THREE.AnimationAction | null }).current;
    expect(current).not.toBeNull();
    expect(current?.loop).toBe(THREE.LoopRepeat);
    expect(current?.paused).toBe(false);

    errSpy.mockRestore();
  }, 15000);
});

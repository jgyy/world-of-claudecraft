import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import type { AnimState } from '../src/render/characters/visual';
import type { Entity } from '../src/sim/types';

// Review feedback on PR #2064 (feat(render): add a dazed pose for hard-CC'd
// entities): a rig with only a single hit-react clip resolves the new
// 'stunned' base pose to that SAME AnimationAction playHit() uses as its
// one-shot (baseAction()'s stunned -> clips.stunned ?? hit[0] ?? idle
// fallback). Sequence: stun starts, base fades into hit[0] looping; a melee
// hit lands mid-stun, playOneShot() reclamps that action to LoopOnce; when it
// finishes, onFinished() hands back to baseAction(), which is the SAME
// action object, so the old `next === this.current` guard in fadeTo() no-op'd
// and the rig stayed frozen on the hit-react's clamped last frame for the
// rest of the stun instead of resuming the dazed loop.
//
// A LATER review round on this same PR found the hit-react fallback itself
// was over-broad: most rigs' hit[0] clip is a short one-shot flinch (or, for
// Yumi, a block pose), not an idle-style loop, so looping it for the whole
// stun would read as a broken flinch cut every loop boundary. baseAction()
// now only takes the hit-react fallback for rigs whose hit[0] clip is
// authored as a loopable idle-style pose (isLoopableHitReact,
// src/render/characters/anim_state.ts); every other rig falls straight to
// idle when stunned. mob_training_dummy's clip (`Hit`) is one of the
// excluded, non-loopable ones, so its stunned pose no longer collides with
// its hit one-shot at all. mob_wolf (the FAMILY_KEYS.beast fallback, clips
// from the Quaternius `animal()` factory) keeps `Idle_HitReact_Left` as its
// hit[0], which IS loopable, so it is the rig this suite now exercises for
// the same-action collision.
const dummyEntity = {
  kind: 'mob',
  id: 1,
  templateId: 'training_dummy',
  color: 0xffffff,
  skin: 0,
  mainhandItemId: null,
} as unknown as Entity;

// mire_prowler has no MOB_KEYS override, so it dispatches through
// FAMILY_KEYS.beast to mob_wolf (WOLF_BAKED, an `animal()` ClipMap with
// hit: ['Idle_HitReact_Left', 'Idle_HitReact_Right']).
const wolfEntity = {
  kind: 'mob',
  id: 2,
  templateId: 'mire_prowler',
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

function mockLoader(clipNames: string[]): void {
  const stubGltf = () => {
    const scene = new THREE.Group();
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 1), new THREE.MeshStandardMaterial());
    mesh.name = 'body';
    scene.add(mesh);
    // real (non-zero-length) clips: LoopOnce needs actual duration to reach
    // 'finished' via mixer.update() the same way a real hit-react clip would.
    const clip = (name: string) => new THREE.AnimationClip(name, 0.2, []);
    return { scene, animations: clipNames.map(clip) };
  };
  vi.doMock('../src/render/assets/loader', () => ({
    loadGltf: vi.fn(() => Promise.resolve(stubGltf())),
    loadHdr: vi.fn(() => new Promise(() => undefined)),
    // Resolved (not left hanging): the eager boot sweep (characters/assets.ts,
    // module-import time) registers a loadTexture() task per player skin atlas
    // with the shared assetsReady() registry, so buildWolfVisual's
    // assetsReady() await would hang forever on an unresolved stub.
    loadTexture: vi.fn(() => Promise.resolve(new THREE.Texture())),
    releaseGltf: vi.fn(),
  }));
}

async function buildDummyVisual() {
  mockLoader(['Idle', 'Walk', 'Run', 'Attack', 'Hit', 'Death']);
  const { preloadTrainingDummyAssets } = await import('../src/render/characters/assets');
  await preloadTrainingDummyAssets();
  const { createCharacterVisual } = await import('../src/render/characters/index');
  const visual = createCharacterVisual(dummyEntity);
  if (!visual) throw new Error('expected a visual for the preloaded training dummy');
  return visual;
}

async function buildWolfVisual() {
  // Every non-lazy manifest url resolves through this same generic stub at
  // module-import time (assets.ts eagerly loadGltf()s the whole preload set);
  // only mob_wolf's key is ever actually assembled below, so the union of
  // clip names below only needs to cover the WOLF_BAKED / animal() vocabulary.
  mockLoader([
    'Idle',
    'Walk',
    'Gallop',
    'Attack',
    'Idle_HitReact_Left',
    'Idle_HitReact_Right',
    'Death',
  ]);
  // Import characters/index FIRST: assets.ts registers its whole eager
  // preload sweep at module-import time, so assetsReady() must be called
  // after that import runs or there is nothing registered yet to await.
  const { createCharacterVisual } = await import('../src/render/characters/index');
  const { assetsReady } = await import('../src/render/assets/preload');
  await assetsReady();
  const visual = createCharacterVisual(wolfEntity);
  if (!visual) throw new Error('expected a visual for the preloaded mire_prowler (mob_wolf)');
  return visual;
}

describe('CharacterVisual: the dazed pose only loops a rig whose hit-react is idle-style', () => {
  it('a one-shot-flinch rig (training dummy) falls to idle instead of freezing on it', async () => {
    vi.resetModules();
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const visual = await buildDummyVisual();

    // Enter the stunned pose. Post-fix, `Hit` is not a loopable idle-style
    // clip, so baseAction() falls all the way to idle, not hit[0].
    visual.update(0.016, STUNNED_STATE, true);
    expect(visual.isMidOneShot).toBe(false);

    const stunnedCurrent = (visual as unknown as { current: THREE.AnimationAction | null }).current;
    expect(stunnedCurrent).not.toBeNull();
    expect(stunnedCurrent?.getClip().name).toBe('Idle');

    // A melee hit lands mid-stun: plays the one-shot on a DIFFERENT action
    // than the base pose, so no same-action collision applies here anymore.
    visual.playHit();
    expect(visual.isMidOneShot).toBe(true);
    for (let i = 0; i < 30; i++) visual.update(0.05, STUNNED_STATE, true);

    const current = (visual as unknown as { current: THREE.AnimationAction | null }).current;
    expect(current).not.toBeNull();
    expect(current?.getClip().name).toBe('Idle');
    expect(current?.loop).toBe(THREE.LoopRepeat);
    expect(current?.paused).toBe(false);

    errSpy.mockRestore();
  }, 15000);

  it('an idle-style hit-react rig (mob_wolf) resumes the dazed loop at full weight, not frozen or a T-pose blend', async () => {
    vi.resetModules();
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const visual = await buildWolfVisual();

    // Enter the stunned pose: base resolves to hit[0] (Idle_HitReact_Left)
    // looping, since mob_wolf has no bespoke 'stunned' clip and its hit-react
    // IS the loopable idle-style pose isLoopableHitReact allows through.
    visual.update(0.016, STUNNED_STATE, true);
    expect(visual.isMidOneShot).toBe(false);
    const stunnedCurrent = (visual as unknown as { current: THREE.AnimationAction | null }).current;
    expect(stunnedCurrent?.getClip().name).toBe('Idle_HitReact_Left');

    // A melee hit lands mid-stun: reclamps that same action as a one-shot.
    visual.playHit();
    expect(visual.isMidOneShot).toBe(true);

    // Drive the mixer well past the (short, real) clip duration so the
    // one-shot naturally fires THREE's 'finished' event and onFinished()
    // hands control back to baseAction() (the SAME action object).
    for (let i = 0; i < 30; i++) visual.update(0.05, STUNNED_STATE, true);

    // Review feedback on PR #2064 (finding 4 in an earlier round): `isMidOneShot`
    // alone does not reproduce the bug: onFinished() clears `currentIsOneShot`
    // to false BEFORE calling `fadeTo()`. The decisive observable is the
    // underlying THREE.AnimationAction: pre-fix (the freeze bug) it stays
    // clamped at `loop: LoopOnce, paused: true` on the hit-react's last frame
    // forever. A LATER round found a second bug on this same hand-off: the
    // loosened `fadeTo` guard still called `fadeIn()` on the prev===next
    // path, which ramps weight 0 -> 1 over the fade with nothing else
    // contributing (a visible T-pose blend for the whole ~0.18s hand-off).
    // Both are pinned here: loop/paused catch the freeze, effective weight
    // catches the T-pose blend.
    const current = (visual as unknown as { current: THREE.AnimationAction | null }).current;
    expect(current).not.toBeNull();
    expect(current?.loop).toBe(THREE.LoopRepeat);
    expect(current?.paused).toBe(false);
    expect(current?.getEffectiveWeight()).toBe(1);

    errSpy.mockRestore();
  }, 15000);
});

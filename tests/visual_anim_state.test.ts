import { describe, expect, it } from 'vitest';
import { isVisuallyDead } from '../src/render/anim_state';
import type { AnimState } from '../src/render/characters/anim_state';
import { dazedPoseActive, desiredBaseState } from '../src/render/characters/anim_state';

describe('render animation state', () => {
  it('treats zero-hp entities as visually dead before the server dead flag arrives', () => {
    expect(isVisuallyDead({ dead: false, hp: 0 })).toBe(true);
    expect(isVisuallyDead({ dead: false, hp: -1 })).toBe(true);
    expect(isVisuallyDead({ dead: false, hp: 1 })).toBe(false);
    expect(isVisuallyDead({ dead: true, hp: 10 })).toBe(true);
  });
});

const BASE: AnimState = {
  speed: 0,
  moving: false,
  running: false,
  airborne: false,
  backwards: false,
  dead: false,
  casting: false,
  swimming: false,
  sitting: false,
  stunned: false,
};

describe('desiredBaseState: stunned precedence', () => {
  it('reads as stunned instead of idle when hard-CC locks the entity', () => {
    expect(desiredBaseState({ ...BASE, stunned: true }, false)).toBe('stunned');
  });

  it('preempts casting, sitting, swimming, and movement', () => {
    expect(desiredBaseState({ ...BASE, stunned: true, casting: true }, false)).toBe('stunned');
    expect(desiredBaseState({ ...BASE, stunned: true, sitting: true }, false)).toBe('stunned');
    expect(desiredBaseState({ ...BASE, stunned: true, swimming: true }, false)).toBe('stunned');
    expect(desiredBaseState({ ...BASE, stunned: true, moving: true, running: true }, false)).toBe(
      'stunned',
    );
  });

  it('yields to airborne: falling/knockback physics still reads over a dazed pose', () => {
    expect(desiredBaseState({ ...BASE, stunned: true, airborne: true }, false)).toBe('jump');
  });
});

describe('desiredBaseState: swim keeps its pre-existing precedence over spin', () => {
  it('reads as swim, not spin, for a self-centered channel (Bladestorm) while swimming', () => {
    expect(desiredBaseState({ ...BASE, swimming: true, spinning: true }, false)).toBe('swim');
  });

  it('spin still wins over cast/sit/move on dry land, unaffected by the stunned insertion', () => {
    expect(desiredBaseState({ ...BASE, spinning: true, casting: true }, false)).toBe('spin');
  });
});

describe('dazedPoseActive: polymorph excluded from the dazed pose', () => {
  // Review feedback on PR #2064: isStunned() returns true for the polymorph
  // aura, but the sheep rig (animal(['Attack_Headbutt'])) has no bespoke
  // `stunned` clip, so it fell back to Idle_HitReact_* and looped a flinch
  // for the whole polymorph. Polymorph already reads as fully incapacitated
  // via the form swap, so the dazed pose must not apply while polymorphed.
  it('suppresses the dazed pose while a polymorph form swap is active', () => {
    expect(dazedPoseActive(true, true, false)).toBe(false);
  });

  it('still applies for every other hard CC (stun/stasis/incapacitate)', () => {
    expect(dazedPoseActive(true, false, false)).toBe(true);
  });

  it('never applies once visually dead, polymorphed or not', () => {
    expect(dazedPoseActive(true, false, true)).toBe(false);
    expect(dazedPoseActive(true, true, true)).toBe(false);
  });

  it('stays false without a hard CC lockout', () => {
    expect(dazedPoseActive(false, false, false)).toBe(false);
    expect(dazedPoseActive(false, true, false)).toBe(false);
  });
});

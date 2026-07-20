import { describe, expect, it } from 'vitest';
import { isVisuallyDead } from '../src/render/anim_state';
import type { AnimState } from '../src/render/characters/anim_state';
import {
  dazedPoseActive,
  desiredBaseState,
  isLoopableHitReact,
} from '../src/render/characters/anim_state';

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

describe('desiredBaseState: airborne-before-swim reorder is inert', () => {
  // Review feedback on PR #2064: airborne now runs ahead of swim (it did not
  // before this PR), which would change behavior if the two were ever both
  // true. They never are: renderer.ts only ever sets `airborne` with a
  // `!swimming` guard, so this pins that the two flags are mutually exclusive
  // inputs by documenting the one real combination (swimming alone) still
  // resolves to swim, same as before the reorder.
  it('still reads as swim when airborne is false', () => {
    expect(desiredBaseState({ ...BASE, swimming: true, airborne: false }, false)).toBe('swim');
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

describe('dazedPoseActive: any active form swap excluded from the dazed pose', () => {
  // Review feedback on PR #2064, two rounds. Round 1: isStunned() returns true
  // for the polymorph aura, but the sheep rig (animal(['Attack_Headbutt']))
  // has no bespoke `stunned` clip, so it fell back to Idle_HitReact_* and
  // looped a flinch for the whole polymorph. Round 2: the fix only excluded
  // `polyed`, but the renderer feeds the SAME AnimState to whichever form
  // visual is active (sheep/bear/cat/travel), and the druid bear
  // (BIPED14, hit: ['HitReact']) and cat/Shadewolf/ghost-wolf
  // (animal(['Attack']), hit: ['Idle_HitReact_Left', ...], the identical
  // clip the sheep fix targeted) have the exact same defect: neither rig
  // has a bespoke `stunned` clip either, and a stunned feral druid keeps its
  // form (isStunned does not strip form auras), so this is reachable, not
  // theoretical. `dazedPoseActive`'s second parameter is generic over "is any
  // form swap active" (renderer.ts computes `formSwapActive = polyed || bear
  // || cat || travel` at the call site), so every case below covers the
  // whole family via the one boolean.
  it('suppresses the dazed pose while any form swap (polymorph/bear/cat/travel) is active', () => {
    expect(dazedPoseActive(true, true, false)).toBe(false);
  });

  it('still applies for every other hard CC (stun/stasis/incapacitate)', () => {
    expect(dazedPoseActive(true, false, false)).toBe(true);
  });

  it('never applies once visually dead, form-swapped or not', () => {
    expect(dazedPoseActive(true, false, true)).toBe(false);
    expect(dazedPoseActive(true, true, true)).toBe(false);
  });

  it('stays false without a hard CC lockout', () => {
    expect(dazedPoseActive(false, false, false)).toBe(false);
    expect(dazedPoseActive(false, true, false)).toBe(false);
  });
});

describe('isLoopableHitReact: which hit[0] clips are safe to loop for the stunned pose', () => {
  // Review feedback on PR #2064, a later round: no rig authors a bespoke
  // `stunned` clip, so baseAction()'s stunned case always falls through to
  // hit[0], looped for the whole stun. Only the Quaternius animal() rig's
  // Idle_HitReact_Left/Right clips are authored as an idle-style pose meant
  // to hold; every other rig's hit[0] is a short one-shot flinch or block
  // pose, so looping it reads as a broken flinch cut every loop boundary.
  it('allows the Idle_HitReact_* family (animal() rig: wolf/fox/deer/stag/...)', () => {
    expect(isLoopableHitReact('Idle_HitReact_Left')).toBe(true);
    expect(isLoopableHitReact('Idle_HitReact_Right')).toBe(true);
  });

  it('excludes the one-shot flinch and block clips named in review (finding 1)', () => {
    expect(isLoopableHitReact('HitReact')).toBe(false); // BIPED14 (orc/frog/demonalt/yetialt)
    expect(isLoopableHitReact('HitRecieve')).toBe(false); // ENEMY7 (goblin/giant)
    expect(isLoopableHitReact('Hurt')).toBe(false); // WILD_BOAR
    expect(isLoopableHitReact('Armature|Block5|baselayer')).toBe(false); // mob_yumi_cat
  });

  it('excludes every other rig family hit clip, including the KayKit/plain "Hit" shapes', () => {
    expect(isLoopableHitReact('Hit_A')).toBe(false); // kaykit() players + humanoid mobs
    expect(isLoopableHitReact('Hit')).toBe(false); // mob_training_dummy, RAID_CASTER, WATER_ELEMENTAL
  });

  it('handles an absent hit[0] (no hit clip authored at all)', () => {
    expect(isLoopableHitReact(undefined)).toBe(false);
    expect(isLoopableHitReact(null)).toBe(false);
  });
});

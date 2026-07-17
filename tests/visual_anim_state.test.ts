import { describe, expect, it } from 'vitest';
import { isVisuallyDead } from '../src/render/anim_state';
import type { AnimState } from '../src/render/characters/anim_state';
import { desiredBaseState } from '../src/render/characters/anim_state';

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

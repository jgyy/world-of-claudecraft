import { describe, expect, it, vi } from 'vitest';
import {
  type AttackCurrentTargetActions,
  driveAttackCurrentTarget,
  planAttackCurrentTarget,
} from '../src/game/attack_current_target';

describe('attack-current-target plan', () => {
  it('stops an active auto-attack regardless of target validity', () => {
    expect(planAttackCurrentTarget(true, true)).toEqual({ kind: 'toggle-off' });
    expect(planAttackCurrentTarget(true, false)).toEqual({ kind: 'toggle-off' });
  });

  it('reports invalid when not attacking and there is no usable target', () => {
    expect(planAttackCurrentTarget(false, false)).toEqual({ kind: 'invalid' });
  });

  it('chases the target when not attacking and the target is valid', () => {
    expect(planAttackCurrentTarget(false, true)).toEqual({ kind: 'chase' });
  });
});

function fakeActions() {
  return {
    stopAutoAttack: vi.fn(),
    startAutoAttack: vi.fn(),
    chaseToMelee: vi.fn(),
  } satisfies AttackCurrentTargetActions;
}

describe('driveAttackCurrentTarget', () => {
  it('stops auto-attack when already attacking, without consulting the target', () => {
    const actions = fakeActions();
    driveAttackCurrentTarget(true, { id: 7, pos: { x: 0, z: 0 } }, actions);
    expect(actions.stopAutoAttack).toHaveBeenCalledOnce();
    expect(actions.startAutoAttack).not.toHaveBeenCalled();
    expect(actions.chaseToMelee).not.toHaveBeenCalled();
  });

  it('reports invalid via startAutoAttack when there is no target', () => {
    const actions = fakeActions();
    driveAttackCurrentTarget(false, null, actions);
    expect(actions.startAutoAttack).toHaveBeenCalledOnce();
    expect(actions.chaseToMelee).not.toHaveBeenCalled();
  });

  it('chases a live target instead of engaging directly', () => {
    const actions = fakeActions();
    driveAttackCurrentTarget(false, { id: 7, pos: { x: 3, z: 4 } }, actions);
    expect(actions.chaseToMelee).toHaveBeenCalledExactlyOnceWith(7, { x: 3, z: 4 });
    expect(actions.startAutoAttack).not.toHaveBeenCalled();
    expect(actions.stopAutoAttack).not.toHaveBeenCalled();
  });
});

// Auto-attack auto-face lock (the Y key): whether PvE auto-attack keeps forcibly
// turning the player onto their target every tick (src/sim/combat/auto_attack.ts).
// Default on (preserves the #3729 fix); flipped off, the PvE branch falls back to
// the same MELEE_ARC facing gate PvP targets already use, so a player can hold a
// deliberate facing away from a target during a "don't look at me" boss mechanic
// or a pillar-activation puzzle. Sim system module behind the SimContext seam,
// the startAutoAttack/stopAutoAttack pattern (src/sim/CLAUDE.md).

import type { SimContext } from './sim_context';

/** Y-key toggle (IWorld.toggleAutoFaceLock; server `toggle_auto_face_lock`).
 *  Flips Entity.autoFaceLocked and toasts the result: unlike weaponStowed this
 *  rides no visible pose, so the toast is the only player feedback. */
export function toggleAutoFaceLock(ctx: SimContext, pid?: number): void {
  const r = ctx.resolve(pid);
  if (!r) return;
  r.e.autoFaceLocked = !r.e.autoFaceLocked;
  if (r.e.autoFaceLocked)
    ctx.notice(r.e.id, 'Auto-face lock on: auto-attack will turn you to face your target.');
  else ctx.notice(r.e.id, 'Auto-face lock off: auto-attack stops turning you to face your target.');
}

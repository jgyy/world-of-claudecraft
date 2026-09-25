// The two click-to-move destination helpers, extracted out of main.ts (a
// monolith-ratchet coordinator, root CLAUDE.md Modularity): both are thin,
// injected-world wrappers over the shared sim pathfinding helpers with no
// other main.ts state, so they belong beside click_move.ts's pure math rather
// than inline in the coordinator.

import { findPlayerPath, resolvePlayerDestination } from '../sim/pathfind';

interface Point2 {
  x: number;
  z: number;
}

export interface ClickMoveTargetWorld {
  cfg: { seed: number };
  player: { pos: Point2 };
  riftCollisionToken: number;
}

/** swim: keep a clicked water destination instead of snapping it to shore. */
export function resolvedClickMoveTarget(world: ClickMoveTargetWorld, target: Point2): Point2 {
  return resolvePlayerDestination(world.cfg.seed, target, true, world.riftCollisionToken);
}

// ignoreFences: the player can hop fences, so route straight over them instead
// of around, resolveMove fires the jump as we reach the rail.
// swim: the player can swim, so let the route cross/enter water.
export function clickMovePathTo(world: ClickMoveTargetWorld, target: Point2): Point2[] {
  return findPlayerPath(
    world.cfg.seed,
    world.player.pos,
    target,
    undefined,
    true,
    true,
    world.riftCollisionToken,
  );
}

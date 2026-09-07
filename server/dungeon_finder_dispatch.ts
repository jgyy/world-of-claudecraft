// The Dungeon Finder command family's wire dispatch (df_*), lifted out of the
// GameServer command switch so the nine arms share one module (the
// bank_wire.ts / rift_forge_dispatch.ts shape). Every arm shape-checks its
// payload (bounded arrays, finite ids, known role/tag vocabularies) and then
// delegates to the Sim, which re-validates every rule on its authoritative
// copy. A malformed frame is a silent no-op, the same silence every other
// malformed command gets. Nothing here trusts client data.

import { isFinderListingTag, isFinderRole } from '../src/sim/content/dungeon_finder';
import type { Sim } from '../src/sim/sim';

type FinderMessage = Readonly<Record<string, unknown>> & { cmd?: string };

type FinderSim = Pick<
  Sim,
  | 'dungeonFinderSetRoles'
  | 'dungeonFinderQueueJoin'
  | 'dungeonFinderQueueLeave'
  | 'dungeonFinderRespond'
  | 'dungeonFinderListingCreate'
  | 'dungeonFinderListingClose'
  | 'dungeonFinderApply'
  | 'dungeonFinderApplyCancel'
  | 'dungeonFinderApplicationRespond'
>;

/** Route one df_* command to the sim; unknown tokens and malformed frames no-op. */
export function dispatchDungeonFinderCommand(
  sim: FinderSim,
  msg: FinderMessage,
  pid: number,
): void {
  switch (msg.cmd) {
    case 'df_roles': {
      if (Array.isArray(msg.roles) && msg.roles.length <= 3) {
        const roles = msg.roles.filter(isFinderRole);
        if (roles.length === msg.roles.length) sim.dungeonFinderSetRoles(roles, pid);
      }
      break;
    }
    case 'df_queue': {
      if (Array.isArray(msg.activities) && msg.activities.length <= 16) {
        const activities = msg.activities.filter(
          (a): a is string => typeof a === 'string' && a.length <= 64,
        );
        if (activities.length === msg.activities.length)
          sim.dungeonFinderQueueJoin(activities, pid);
      }
      break;
    }
    case 'df_queue_leave':
      sim.dungeonFinderQueueLeave(pid);
      break;
    case 'df_proposal':
      sim.dungeonFinderRespond(msg.accept === true, pid);
      break;
    case 'df_list_create': {
      if (
        typeof msg.activity === 'string' &&
        msg.activity.length <= 64 &&
        Array.isArray(msg.tags) &&
        msg.tags.length <= 8
      ) {
        const tags = msg.tags.filter(isFinderListingTag);
        if (tags.length === msg.tags.length)
          sim.dungeonFinderListingCreate(msg.activity, tags, pid);
      }
      break;
    }
    case 'df_list_close':
      sim.dungeonFinderListingClose(pid);
      break;
    case 'df_apply':
      if (typeof msg.listing === 'number' && Number.isFinite(msg.listing))
        sim.dungeonFinderApply(msg.listing, pid);
      break;
    case 'df_apply_cancel':
      sim.dungeonFinderApplyCancel(pid);
      break;
    case 'df_app_respond':
      if (typeof msg.applicant === 'number' && Number.isFinite(msg.applicant))
        sim.dungeonFinderApplicationRespond(msg.applicant, msg.accept === true, pid);
      break;
    default:
      break;
  }
}

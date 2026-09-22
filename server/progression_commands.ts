// The post-cap progression commands' dispatch (server/CLAUDE.md module-first:
// command parsing lives in a host-agnostic module a Vitest imports directly,
// never as a method cluster on GameServer): the argument-free `prestige`
// send and the `hone_item` frame. Shape-only here: a hone frame must carry a
// real equipment key and a real honing stat or it drops whole (the 'equip'
// case's untrusted-input rule); the sim re-validates both tokens and owns
// every gate, the cost, and the one roll (src/sim/progression/honing.ts).
import { type HoningStat, isHoningStat } from '../src/sim/progression/honing_policy';
import type { Sim } from '../src/sim/sim';
import { type EquipSlot, isEquipSlot } from '../src/sim/types';

export interface HoneItemCommand {
  slot: EquipSlot;
  stat: HoningStat;
}

/** The hone_item frame's untrusted-input parse: both tokens usable or null. */
export function parseHoneItemCommand(msg: {
  slot?: unknown;
  stat?: unknown;
}): HoneItemCommand | null {
  const slot = typeof msg.slot === 'string' && isEquipSlot(msg.slot) ? msg.slot : null;
  const stat = isHoningStat(msg.stat) ? msg.stat : null;
  return slot !== null && stat !== null ? { slot, stat } : null;
}

export function dispatchProgressionCommand(
  command: string,
  msg: Record<string, unknown>,
  sim: Pick<Sim, 'prestige' | 'honeItem'>,
  pid: number,
): void {
  if (command === 'prestige') {
    sim.prestige(pid);
    return;
  }
  if (command === 'hone_item') {
    const hone = parseHoneItemCommand(msg);
    if (hone) sim.honeItem(hone.slot, hone.stat, pid);
  }
}

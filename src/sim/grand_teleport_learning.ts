// How a mage LEARNS a Grand Teleport (content/grand_teleports.ts): reading its
// tome, or clearing every quest a city hands out. Both record the destination's
// learn key in questsDone and let refreshKnownAbilities announce the spell.
// Pure sim module (src/sim/CLAUDE.md): no rng, no clock, no DOM.

import { ABILITIES } from './content/classes';
import {
  GRAND_TELEPORT_DESTINATIONS,
  grandTeleportAbilityId,
  grandTeleportDestination,
  grandTeleportDestinationOfAbility,
  grandTeleportLearnKey,
} from './content/grand_teleports';
import { NPCS, QUESTS, ZONES } from './data';
import type { PlayerMeta } from './sim';
import type { SimContext } from './sim_context';

/** The questsDone key an ability's learn is recorded under: the destination's
 *  Grand Teleport key, or a generic `learned:<abilityId>` for any other tome. */
export function learnKeyForAbility(abilityId: string): string {
  const destination = grandTeleportDestinationOfAbility(abilityId);
  return destination ? grandTeleportLearnKey(destination) : `learned:${abilityId}`;
}

/**
 * Item use arm for `{ type: 'learnSpell', abilityId }` (items.ts useItem).
 * Refuses for the wrong class or an already-known spell; otherwise records
 * the learn key, consumes ONE tome and announces the new ability.
 */
export function learnSpellFromTome(
  ctx: SimContext,
  meta: PlayerMeta,
  itemId: string,
  abilityId: string,
): void {
  const def = ABILITIES[abilityId];
  if (!def) return;
  if (def.class !== meta.cls) {
    ctx.error(meta.entityId, 'Only a mage can read that tome.');
    return;
  }
  const key = learnKeyForAbility(abilityId);
  if (meta.questsDone.has(key)) {
    ctx.error(meta.entityId, 'You already know that spell.');
    return;
  }
  meta.questsDone.add(key);
  ctx.removeItem(itemId, 1, meta.entityId);
  ctx.refreshKnownAbilities(meta, true);
  ctx.emit({ type: 'log', text: `You learn ${def.name}.`, color: '#b9f', pid: meta.entityId });
}

const cityQuestCache = new Map<string, readonly string[]>();

/**
 * Every quest id a destination's city hands out: the quest giver's NPC stands
 * inside the destination zone's hub disc, the quest is not class-locked away
 * from mages, not retired and not repeatable. A pure derivation over static
 * content, memoized per destination. Exported for the tests and the wiki.
 */
export function cityQuestIds(destinationId: string): readonly string[] {
  const cached = cityQuestCache.get(destinationId);
  if (cached) return cached;
  const dest = grandTeleportDestination(destinationId);
  const zone = dest ? ZONES.find((z) => z.id === dest.zoneId) : undefined;
  const ids: string[] = [];
  if (zone) {
    const hub = zone.hub;
    for (const quest of Object.values(QUESTS)) {
      if (quest.retired || quest.repeatable) continue;
      if (quest.requiredClass && !quest.requiredClass.includes('mage')) continue;
      const giver = NPCS[quest.giverNpcId];
      if (!giver) continue;
      if (Math.hypot(giver.pos.x - hub.x, giver.pos.z - hub.z) > hub.radius) continue;
      ids.push(quest.id);
    }
  }
  ids.sort();
  const frozen: readonly string[] = Object.freeze(ids);
  cityQuestCache.set(destinationId, frozen);
  return frozen;
}

/**
 * Quest turn-in hook (quests/quest_commands.ts): a mage who has now finished
 * every quest of a city learns its Grand Teleport. Runs BEFORE the turn-in's
 * own refreshKnownAbilities so a single refresh announces the spell; the
 * refresh here is kept so a direct caller also sees the kit update.
 */
export function checkGrandTeleportCityUnlocks(ctx: SimContext, meta: PlayerMeta): void {
  if (meta.cls !== 'mage') return;
  for (const dest of GRAND_TELEPORT_DESTINATIONS) {
    const key = grandTeleportLearnKey(dest.id);
    if (meta.questsDone.has(key)) continue;
    const quests = cityQuestIds(dest.id);
    if (quests.length === 0 || !quests.every((id) => meta.questsDone.has(id))) continue;
    meta.questsDone.add(key);
    ctx.refreshKnownAbilities(meta, true);
    const name = ABILITIES[grandTeleportAbilityId(dest.id)]?.name ?? dest.town;
    ctx.emit({
      type: 'log',
      text: `Having served ${dest.town} faithfully, you learn ${name}.`,
      color: '#b9f',
      pid: meta.entityId,
    });
  }
}

import { GRAND_TELEPORT_ABILITY_IDS } from '../content/grand_teleports';

const SHAMAN_SHOCK_COOLDOWN_IDS = ['earth_shock', 'flame_shock', 'frost_shock'] as const;

export function sharedCooldownIds(abilityId: string): readonly string[] | null {
  if (
    (SHAMAN_SHOCK_COOLDOWN_IDS as readonly string[]).includes(abilityId) ||
    abilityId === 'lightning_shock'
  ) {
    return SHAMAN_SHOCK_COOLDOWN_IDS;
  }
  // Every Grand Teleport arms the one shared 20 minute cooldown
  // (content/grand_teleports.ts is a data leaf, so no import cycle).
  if (GRAND_TELEPORT_ABILITY_IDS.includes(abilityId)) return GRAND_TELEPORT_ABILITY_IDS;
  return null;
}

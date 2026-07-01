import type { PlayerProfessionSkill } from '../sim/professions/types';

// Render-safe projection of a player's professions standing. Stub as of
// #1164: always empty until #1119/#1120 land skill tracking + recipes.
export interface PlayerProfessionsView {
  skills: readonly PlayerProfessionSkill[];
}

// The professions read-surface facet (#1164). `professionsState` stays a stub
// (always empty) pending #1125/#1126/#1140's skill/craft/recipe tracking.
// `nodeHarvestableByMe` (#1121) is the first non-stub member: whether the
// given gather node (see src/sim/content/gather_nodes.ts, #1120) is
// harvestable right now BY THE LOCAL VIEWER specifically. It is per-VIEWER,
// never global: two players asking about the same node id can get different
// answers, because each player's respawn timer for a node is independent (see
// src/sim/professions/gathering.ts).
export interface IWorldProfessions {
  professionsState: PlayerProfessionsView;
  nodeHarvestableByMe(nodeId: string): boolean;
  harvestNode(nodeId: string): void;
}

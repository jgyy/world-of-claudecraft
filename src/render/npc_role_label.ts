// The localized text of an NPC nameplate's role line. Thin i18n consumer over
// the pure rule in src/sim/npc_role.ts: a functional role resolves to its
// hudChrome.nameplate.npcRole.<id> label, an NPC with no functional role falls
// back to its authored flavor title (so "Loremaster" still reads as
// something), and an unknown template id (a mirror ahead of its content
// bundle) draws no line rather than a raw id. Not a *_core: it calls t().

import { NPCS } from '../sim/data';
import { npcRoleFor } from '../sim/npc_role';
import { npcDisplayTitle } from '../ui/entity_display_labels';
import { t } from '../ui/i18n';

export function npcRoleLabel(npcId: string): string {
  const def = NPCS[npcId];
  if (!def) return '';
  const role = npcRoleFor(def);
  if (role) return t(`hudChrome.nameplate.npcRole.${role}`);
  return def.title ? npcDisplayTitle(npcId) : '';
}

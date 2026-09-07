// The Ravenpost pillar as an entity: one interactable `kind:'object'` per
// MailboxDef (templateId 'mailbox', lootable so the interaction layer opens
// the mailbox window, facing from the record). Shared by the Sim ctor's
// sequential mailbox loop and the reserved-id spawners (the Last Keep,
// src/sim/last_keep_garrison.ts) so a town pillar is built one way whichever
// allocator names it. Pure: no rng, no SimContext.
import { createGroundObject } from '../entity';
import type { Entity, MailboxDef, Vec3 } from '../types';

export const MAILBOX_TEMPLATE_ID = 'mailbox';

export function createMailboxEntity(id: number, def: MailboxDef, pos: Vec3): Entity {
  const box = createGroundObject(id, '', 'Mailbox', pos);
  box.templateId = MAILBOX_TEMPLATE_ID;
  box.objectItemId = null;
  box.lootable = true; // interactable
  if (def.facing !== undefined) box.facing = def.facing;
  return box;
}

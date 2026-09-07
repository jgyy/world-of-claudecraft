// src/sim/mail/mailbox_entity.ts: the one way a Ravenpost pillar becomes an
// entity, shared by the Sim ctor's sequential loop and the reserved-id
// spawners. Pins the field contract the interaction layer and renderer key
// off, and both arms of the facing guard (an omitted facing keeps the
// historical default 0).
import { describe, expect, it } from 'vitest';
import { createMailboxEntity, MAILBOX_TEMPLATE_ID } from '../src/sim/mail/mailbox_entity';

describe('createMailboxEntity', () => {
  it('builds an interactable mailbox object at the given spot', () => {
    const e = createMailboxEntity(7, { x: 10, z: 20 }, { x: 10, y: 3, z: 20 });
    expect(e.id).toBe(7);
    expect(e.kind).toBe('object');
    expect(e.templateId).toBe(MAILBOX_TEMPLATE_ID);
    expect(MAILBOX_TEMPLATE_ID).toBe('mailbox');
    expect(e.objectItemId).toBeNull();
    expect(e.lootable).toBe(true);
    expect(e.pos).toEqual({ x: 10, y: 3, z: 20 });
  });

  it('keeps the default yaw when the record has none, and takes the authored one', () => {
    expect(createMailboxEntity(1, { x: 0, z: 0 }, { x: 0, y: 0, z: 0 }).facing).toBe(0);
    expect(
      createMailboxEntity(2, { x: 0, z: 0, facing: Math.PI }, { x: 0, y: 0, z: 0 }).facing,
    ).toBe(Math.PI);
  });
});

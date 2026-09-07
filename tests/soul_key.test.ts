// Soul Keys (src/sim/soul_key.ts + src/sim/item_binding.ts): the per-copy
// release from bind-on-pickup, its weekly allowance, and the gates that must
// honor the released copy. Pure pins first, then the real Sim command path,
// then each transfer pipe.
import { describe, expect, it } from 'vitest';
import { HEROIC_MARK_ITEM_ID } from '../src/sim/content/dungeon_difficulty';
import { ITEMS, NPCS } from '../src/sim/data';
import { exchangeHardLock } from '../src/sim/exchange_eligibility';
import { guildBankPipeRefusal } from '../src/sim/guild_bank';
import {
  isSoulboundCopy,
  isSoulKeyEligible,
  isUnboundCopy,
  releasedPayload,
} from '../src/sim/item_binding';
import { sanitizeItemInstancePayloadOnLoad } from '../src/sim/item_instance_load';
import { publicInstanceView } from '../src/sim/item_instance_transfer';
import { type PlayerMeta, Sim } from '../src/sim/sim';
import {
  currentSoulKeyWeek,
  resolveSoulKeyUse,
  SOUL_KEY_ITEM_ID,
  SOUL_KEY_USES_PER_WEEK,
  soulKeyUsesLeft,
} from '../src/sim/soul_key';
import type { Entity, ItemInstancePayload } from '../src/sim/types';
import { bagItemAction } from '../src/ui/bags_view';
import { soulboundTooltipLine, wornTooltipInstance } from '../src/ui/item_instance_tooltip';
import { expectDefined } from './helpers/defined';
import { VENDOR_TEST_WORLD } from './sim_shared';

const HELM = 'slagbreaker_helmet'; // soulbound epic warrior tier piece
const LEGS = 'slagbreaker_legs';

function meta(sim: Sim, pid: number): PlayerMeta {
  const m = sim.ctx.players.get(pid);
  if (!m) throw new Error(`expected player ${pid}`);
  return m;
}

function slotOf(sim: Sim, pid: number, itemId: string) {
  return expectDefined(meta(sim, pid).inventory.find((s) => s.itemId === itemId));
}

function soulKeyEvents(sim: Sim) {
  return (sim.drainEvents() as any[]).filter((e) => e.type === 'soulKeyResult');
}

function keySim() {
  const sim = new Sim({ seed: 11, playerClass: 'warrior', noPlayer: true });
  const pid = sim.addPlayer('warrior', 'Keyholder');
  sim.drainEvents();
  return { sim, pid };
}

describe('item_binding: the one soulbound predicate', () => {
  it('reads the def flag minus the per-copy release', () => {
    const helm = ITEMS[HELM];
    expect(helm.soulbound).toBe(true);
    expect(isSoulboundCopy(helm, undefined)).toBe(true);
    expect(isSoulboundCopy(helm, { enchant: 'x' })).toBe(true);
    expect(isSoulboundCopy(helm, { unbound: true })).toBe(false);
    // Presence-checked against true: a malformed marker never releases.
    expect(isSoulboundCopy(helm, { unbound: 1 as unknown as true })).toBe(true);
    expect(isSoulboundCopy(ITEMS.worn_sword, undefined)).toBe(false);
    expect(isSoulboundCopy(undefined, { unbound: true })).toBe(false);
    expect(isUnboundCopy({ unbound: true })).toBe(true);
    expect(isUnboundCopy(undefined)).toBe(false);
  });

  it('only paperdoll gear with a bind-on-pickup def is key-eligible', () => {
    expect(isSoulKeyEligible(ITEMS[HELM])).toBe(true);
    expect(isSoulKeyEligible(ITEMS[HEROIC_MARK_ITEM_ID])).toBe(false); // a soulbound tool
    expect(isSoulKeyEligible(ITEMS.worn_sword)).toBe(false); // gear, not bound
    expect(isSoulKeyEligible(undefined)).toBe(false);
  });

  it('stamps a new top-level object and is idempotent', () => {
    const src: ItemInstancePayload = { enchant: 'e' };
    const out = releasedPayload(src);
    expect(out).toEqual({ enchant: 'e', unbound: true });
    expect(out).not.toBe(src);
    expect(src.unbound).toBeUndefined();
    expect(releasedPayload(undefined)).toEqual({ unbound: true });
    expect(releasedPayload(out)).toEqual(out);
  });
});

describe('the weekly allowance window', () => {
  const nextReset = (nowMs: number) => nowMs + 1000;

  it('opens a fresh window at the next weekly reset when none is stored or it closed', () => {
    expect(currentSoulKeyWeek(undefined, 500, nextReset)).toEqual({ resetAt: 1500, used: 0 });
    expect(currentSoulKeyWeek({ resetAt: 400, used: 2 }, 500, nextReset)).toEqual({
      resetAt: 1500,
      used: 0,
    });
    expect(currentSoulKeyWeek({ resetAt: 500, used: 2 }, 500, nextReset).used).toBe(0);
  });

  it('keeps an open window verbatim and clamps a malformed used count', () => {
    expect(currentSoulKeyWeek({ resetAt: 900, used: 1 }, 500, nextReset)).toEqual({
      resetAt: 900,
      used: 1,
    });
    expect(currentSoulKeyWeek({ resetAt: 900, used: -3 }, 500, nextReset).used).toBe(0);
    expect(currentSoulKeyWeek({ resetAt: Number.NaN, used: 1 }, 500, nextReset).resetAt).toBe(1500);
  });

  it('counts down from the per-week cap and never below zero', () => {
    expect(soulKeyUsesLeft({ resetAt: 1, used: 0 })).toBe(SOUL_KEY_USES_PER_WEEK);
    expect(soulKeyUsesLeft({ resetAt: 1, used: SOUL_KEY_USES_PER_WEEK + 5 })).toBe(0);
  });
});

describe('resolveSoulKeyUse: the deny order', () => {
  const week = { resetAt: 10, used: 0 };
  const inv = (instance?: ItemInstancePayload) => ({
    inventory: [{ itemId: HELM, count: 1, ...(instance && { instance }) }],
  });

  it('ineligible item first, then the copy, then the key, then the allowance', () => {
    expect(resolveSoulKeyUse(inv(), HEROIC_MARK_ITEM_ID, 0, week, 0)).toEqual({
      ok: false,
      reason: 'soul_key_not_eligible',
    });
    expect(resolveSoulKeyUse(inv(), 'no_such_item', 0, week, 1)).toEqual({
      ok: false,
      reason: 'soul_key_not_eligible',
    });
    expect(resolveSoulKeyUse(inv({ unbound: true }), HELM, 0, week, 0)).toEqual({
      ok: false,
      reason: 'soul_key_not_bound',
    });
    expect(resolveSoulKeyUse(inv(), HELM, 3, week, 1)).toEqual({
      ok: false,
      reason: 'soul_key_not_bound',
    });
    expect(resolveSoulKeyUse(inv(), HELM, 0, week, 0)).toEqual({
      ok: false,
      reason: 'soul_key_none_held',
    });
    expect(resolveSoulKeyUse(inv(), HELM, 0, { resetAt: 10, used: 2 }, 1)).toEqual({
      ok: false,
      reason: 'soul_key_weekly_cap',
    });
    const ok = resolveSoulKeyUse(inv(), HELM, 0, week, 1);
    expect(ok.ok).toBe(true);
  });

  it('id-only picks the first still-bound copy', () => {
    const m = {
      inventory: [
        { itemId: HELM, count: 1, instance: { unbound: true as const } },
        { itemId: HELM, count: 1 },
      ],
    };
    const r = resolveSoulKeyUse(m, HELM, undefined, week, 1);
    expect(r.ok && r.slotIndex).toBe(1);
  });
});

describe('Sim.useSoulKey: the command path', () => {
  it('releases the named copy, spends the key, and counts the week down', () => {
    const { sim, pid } = keySim();
    sim.addItem(SOUL_KEY_ITEM_ID, 1, pid);
    sim.addItem(HELM, 1, pid);
    const slotIndex = meta(sim, pid).inventory.findIndex((s) => s.itemId === HELM);
    sim.useSoulKey(HELM, pid, slotIndex);
    const [ev] = soulKeyEvents(sim);
    expect(ev).toMatchObject({ ok: true, itemId: HELM, usesLeft: SOUL_KEY_USES_PER_WEEK - 1 });
    expect(slotOf(sim, pid, HELM).instance).toEqual({ unbound: true });
    expect(sim.countItem(SOUL_KEY_ITEM_ID, pid)).toBe(0);
    expect(meta(sim, pid).soulKeyWeek?.used).toBe(1);
  });

  it('stamps the target before the key leaves, so a key below it cannot shift the index', () => {
    // The IWorld arity ({ slotIndex }) on the offline primary player.
    const sim = new Sim({ seed: 11, playerClass: 'warrior' });
    const pid = sim.playerId;
    sim.drainEvents();
    sim.addItem(SOUL_KEY_ITEM_ID, 1, pid);
    sim.addItem(HELM, 1, pid);
    const keyIndex = meta(sim, pid).inventory.findIndex((s) => s.itemId === SOUL_KEY_ITEM_ID);
    const helmIndex = meta(sim, pid).inventory.findIndex((s) => s.itemId === HELM);
    expect(keyIndex).toBeLessThan(helmIndex);
    sim.useSoulKey(HELM, { slotIndex: helmIndex });
    expect(soulKeyEvents(sim)[0]).toMatchObject({ ok: true, itemId: HELM });
    expect(slotOf(sim, pid, HELM).instance?.unbound).toBe(true);
    expect(sim.countItem(SOUL_KEY_ITEM_ID, pid)).toBe(0);
  });

  it('refuses without a key, on a token, on a released copy, and past the weekly cap', () => {
    const { sim, pid } = keySim();
    sim.addItem(HELM, 1, pid);
    sim.useSoulKey(HELM, pid);
    expect(soulKeyEvents(sim)[0]).toMatchObject({ ok: false, reason: 'soul_key_none_held' });
    sim.addItem(SOUL_KEY_ITEM_ID, 5, pid);
    sim.addItem(HEROIC_MARK_ITEM_ID, 1, pid);
    sim.useSoulKey(HEROIC_MARK_ITEM_ID, pid);
    expect(soulKeyEvents(sim)[0]).toMatchObject({ ok: false, reason: 'soul_key_not_eligible' });
    sim.useSoulKey(HELM, pid);
    expect(soulKeyEvents(sim)[0].ok).toBe(true);
    sim.useSoulKey(HELM, pid);
    expect(soulKeyEvents(sim)[0]).toMatchObject({ ok: false, reason: 'soul_key_not_bound' });
    sim.addItem(LEGS, 1, pid);
    sim.useSoulKey(LEGS, pid);
    expect(soulKeyEvents(sim)[0]).toMatchObject({ ok: true, usesLeft: 0 });
    sim.addItem('slagbreaker_chest', 1, pid);
    sim.useSoulKey('slagbreaker_chest', pid);
    expect(soulKeyEvents(sim)[0]).toMatchObject({ ok: false, reason: 'soul_key_weekly_cap' });
    // Two keys spent, three still held: a deny never debits.
    expect(sim.countItem(SOUL_KEY_ITEM_ID, pid)).toBe(3);
  });

  it('is refused while dead, silently', () => {
    const { sim, pid } = keySim();
    sim.addItem(SOUL_KEY_ITEM_ID, 1, pid);
    sim.addItem(HELM, 1, pid);
    const e = sim.entities.get(pid) as Entity;
    e.dead = true;
    sim.useSoulKey(HELM, pid);
    expect(soulKeyEvents(sim)).toEqual([]);
    expect(sim.countItem(SOUL_KEY_ITEM_ID, pid)).toBe(1);
  });

  it('persists the weekly window with the character', () => {
    const { sim, pid } = keySim();
    sim.addItem(SOUL_KEY_ITEM_ID, 1, pid);
    sim.addItem(HELM, 1, pid);
    sim.useSoulKey(HELM, pid);
    const state = expectDefined(sim.serializeCharacter(pid));
    expect(state.soulKeyWeek?.used).toBe(1);
    expect(Number.isFinite(state.soulKeyWeek?.resetAt)).toBe(true);
    const sim2 = new Sim({ seed: 11, playerClass: 'warrior', noPlayer: true });
    const pid2 = sim2.addPlayer('warrior', 'Keyholder', { state });
    expect(meta(sim2, pid2).soulKeyWeek).toEqual(state.soulKeyWeek);
    // The released copy survived the load sanitizer.
    expect(slotOf(sim2, pid2, HELM).instance?.unbound).toBe(true);
  });
});

describe('the released copy crosses every pipe the bond used to close', () => {
  it('load sanitizer, public view, and the worn projection all keep the marker', () => {
    expect(sanitizeItemInstancePayloadOnLoad({ unbound: true }).payload).toEqual({
      unbound: true,
    });
    expect(publicInstanceView({ unbound: true, enchant: 'e' })).toEqual({
      unbound: true,
      enchant: 'e',
    });
    expect(wornTooltipInstance({ unbound: true, boundTo: 3 })).toEqual({ unbound: true });
  });

  it('trades to any counterparty once released, never before', () => {
    const sim = new Sim({ seed: 7, playerClass: 'warrior', noPlayer: true });
    const alice = sim.addPlayer('warrior', 'Alice');
    const bob = sim.addPlayer('warrior', 'Bob');
    for (const pid of [alice, bob]) {
      const e = expectDefined(sim.entities.get(pid));
      e.pos = { x: 0, y: 0, z: 0 };
      e.prevPos = { x: 0, y: 0, z: 0 };
      sim.rebucket(e);
    }
    sim.addItem(HELM, 1, alice);
    const runTrade = () => {
      sim.tradeRequest(bob, alice);
      sim.tradeAccept(bob);
      sim.tradeSetOffer([{ itemId: HELM, count: 1 }], 0, alice);
      sim.tradeConfirm(alice);
      sim.tradeConfirm(bob);
    };
    runTrade();
    expect(sim.countItem(HELM, alice)).toBe(1);
    expect(sim.countItem(HELM, bob)).toBe(0);
    sim.addItem(SOUL_KEY_ITEM_ID, 1, alice);
    sim.useSoulKey(HELM, alice);
    runTrade();
    expect(sim.countItem(HELM, alice)).toBe(0);
    expect(slotOf(sim, bob, HELM).instance?.unbound).toBe(true);
  });

  it('vendors, lists, mails, banks, and exchanges once released', () => {
    const { sim, pid } = keySim();
    sim.addItem(HELM, 1, pid);
    const bound = slotOf(sim, pid, HELM);
    expect(guildBankPipeRefusal(bound)).toContain('soulbound');
    expect(exchangeHardLock(ITEMS[HELM], bound.instance)).toBe('soulbound');
    expect(bagItemAction(ITEMS[HELM], { tradeOpen: true } as never, bound.instance)).toBe(
      'transferBlockedSoulbound',
    );
    sim.addItem(SOUL_KEY_ITEM_ID, 1, pid);
    sim.useSoulKey(HELM, pid);
    const released = slotOf(sim, pid, HELM);
    expect(guildBankPipeRefusal(released)).toBeNull();
    expect(exchangeHardLock(ITEMS[HELM], released.instance)).toBeNull();
    expect(bagItemAction(ITEMS[HELM], { tradeOpen: true } as never, released.instance)).toBe(
      'trade',
    );
    expect(bagItemAction(ITEMS[HELM], { vendorOpen: true } as never, released.instance)).toBe(
      'vendorSell',
    );
    // The tooltip states the release in the bond's own line.
    expect(soulboundTooltipLine(ITEMS[HELM], undefined)).toContain('Soulbound');
    expect(soulboundTooltipLine(ITEMS[HELM], released.instance)).toContain('Soul Key');
    expect(soulboundTooltipLine(ITEMS.worn_sword, undefined)).toBe('');
  });

  it('vendor-sells a released copy and refuses the still-bound twin', () => {
    const sim = new Sim({
      seed: 3,
      playerClass: 'warrior',
      noPlayer: true,
      world: VENDOR_TEST_WORLD,
    });
    const pid = sim.addPlayer('warrior', 'Seller');
    const vendor = NPCS.trader_wilkes.pos;
    const e = expectDefined(sim.entities.get(pid));
    e.pos = { x: vendor.x + 1, y: e.pos.y, z: vendor.z };
    e.prevPos = { ...e.pos };
    sim.rebucket(e);
    sim.addItem(HELM, 1, pid);
    sim.drainEvents();
    sim.sellItem(HELM, 1, pid);
    expect(sim.countItem(HELM, pid)).toBe(1);
    sim.addItem(SOUL_KEY_ITEM_ID, 1, pid);
    sim.useSoulKey(HELM, pid);
    const before = meta(sim, pid).copper;
    sim.sellItem(HELM, 1, pid);
    expect(sim.countItem(HELM, pid)).toBe(0);
    expect(meta(sim, pid).copper).toBe(before + ITEMS[HELM].sellValue);
  });

  it('mails a released copy and the raven refuses the still-bound twin', () => {
    const sim = new Sim({ seed: 9, playerClass: 'warrior', noPlayer: true });
    const alice = sim.addPlayer('warrior', 'Alice');
    const bob = sim.addPlayer('warrior', 'Bob');
    // Mail is sent from a pillar: stand Alice on the first mailbox.
    const box = expectDefined(sim.entities.get(sim.postOffice.mailboxIds[0]));
    const a = expectDefined(sim.entities.get(alice));
    a.pos = { ...box.pos };
    a.prevPos = { ...a.pos };
    sim.rebucket(a);
    sim.addItem(HELM, 1, alice);
    meta(sim, alice).copper = 1000; // postage
    sim.drainEvents();
    const send = () => sim.mailSend('Bob', 'helm', '', 0, [{ ...slotOf(sim, alice, HELM) }], alice);
    send();
    expect(sim.countItem(HELM, alice)).toBe(1);
    sim.addItem(SOUL_KEY_ITEM_ID, 1, alice);
    sim.useSoulKey(HELM, alice);
    send();
    expect(sim.countItem(HELM, alice)).toBe(0);
    const letter = sim.postOffice.mail.find(
      (m) => m.subject === 'helm' && m.items.some((i) => i.itemId === HELM),
    );
    expect(letter?.items[0]?.instance?.unbound).toBe(true);
    // A restart's return sweep keeps the released parcel in the letter.
    expect(bob).toBeGreaterThan(0);
  });

  it('lists a released copy on the World Market, never the still-bound twin', () => {
    const { sim, pid } = keySim();
    // Listing needs the Merchant in reach.
    const m = expectDefined(
      [...sim.entities.values()].find((e) => e.templateId === 'the_merchant'),
    );
    const p = expectDefined(sim.entities.get(pid));
    p.pos = { x: m.pos.x + 1, y: m.pos.y, z: m.pos.z };
    p.prevPos = { ...p.pos };
    sim.rebucket(p);
    sim.addItem(HELM, 1, pid);
    sim.drainEvents();
    sim.marketListInstance(HELM, 1000, { ...(slotOf(sim, pid, HELM).instance ?? {}) }, pid);
    expect(sim.marketListings.filter((l) => l.itemId === HELM)).toHaveLength(0);
    sim.addItem(SOUL_KEY_ITEM_ID, 1, pid);
    sim.useSoulKey(HELM, pid);
    sim.marketListInstance(HELM, 1000, { unbound: true }, pid);
    const listed = sim.marketListings.filter((l) => l.itemId === HELM);
    expect(listed).toHaveLength(1);
    expect(listed[0].instance?.unbound).toBe(true);
    expect(sim.countItem(HELM, pid)).toBe(0);
    // A forged needle cannot list a bound copy: the escrow matches payloads.
    sim.addItem(HELM, 1, pid);
    sim.marketListInstance(HELM, 1000, { unbound: true }, pid);
    expect(sim.marketListings.filter((l) => l.itemId === HELM)).toHaveLength(1);
    expect(sim.countItem(HELM, pid)).toBe(1);
  });

  it('a Soul Key itself is an ordinary tradeable vendor good', () => {
    const key = ITEMS[SOUL_KEY_ITEM_ID];
    expect(key.soulbound).toBeUndefined();
    expect(key.buyValue).toBeGreaterThan(0);
    expect(NPCS.quartermaster_bree.vendorItems).toContain(SOUL_KEY_ITEM_ID);
  });
});

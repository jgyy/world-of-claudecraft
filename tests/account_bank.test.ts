// The Account Bank: an account-wide pooled item store shared across every
// character on the account (src/sim/account_bank.ts). Covers the state model
// (constants, capacity ladder, the sanitizeAccountBankState load path, the
// per-account book map's load/serialize/evict lifecycle), the offline IWorld
// facet arm (inert forever, no account offline), and the three op bodies plus
// the gated info read via the pid+accountId-first server entry points
// (accountBank*For), including reuse of the guild bank's anonymous-pipe item
// policy (guildBankPipeRefusal).
//
// Constants are pinned to LITERAL numbers (never compared to the exported
// constant, which would be a zero-protection self-comparison).
import { describe, expect, it } from 'vitest';
import { ClientWorld } from '../src/net/online';
import {
  ACCOUNT_BANK_BASE_SLOTS,
  ACCOUNT_BANK_EXPANSION_PRICES,
  ACCOUNT_BANK_EXPANSION_SLOTS,
  ACCOUNT_BANK_PURCHASED_SLOTS_MAX,
  accountBankCapacity,
  accountBankNextExpansionPrice,
  createEmptyAccountBankState,
  sanitizeAccountBankState,
} from '../src/sim/account_bank';
import { BUILTIN_WORLD, ITEMS } from '../src/sim/data';
import { Sim } from '../src/sim/sim';
import type { Entity, WorldContent } from '../src/sim/types';

const PRICES = [20000, 50000, 100000, 200000, 400000, 800000];

describe('account bank constants', () => {
  it('pins the base slots, expansion granularity, and price ladder', () => {
    expect(ACCOUNT_BANK_BASE_SLOTS).toBe(24);
    expect(ACCOUNT_BANK_EXPANSION_SLOTS).toBe(6);
    expect([...ACCOUNT_BANK_EXPANSION_PRICES]).toEqual(PRICES);
    expect(ACCOUNT_BANK_PURCHASED_SLOTS_MAX).toBe(36); // 6 rungs * 6 slots
  });

  it('capacity is base plus purchased, and the next price follows the bought-rung count', () => {
    const empty = createEmptyAccountBankState();
    expect(accountBankCapacity(empty)).toBe(24);
    expect(accountBankNextExpansionPrice(empty)).toBe(20000);
    const expanded = { inventory: [], purchasedSlots: 12 };
    expect(accountBankCapacity(expanded)).toBe(36);
    expect(accountBankNextExpansionPrice(expanded)).toBe(100000);
    const maxed = { inventory: [], purchasedSlots: ACCOUNT_BANK_PURCHASED_SLOTS_MAX };
    expect(accountBankNextExpansionPrice(maxed)).toBeNull();
  });
});

describe('sanitizeAccountBankState (the one load path)', () => {
  it('a non-object or missing raw value loads as empty', () => {
    expect(sanitizeAccountBankState(null)).toEqual(createEmptyAccountBankState());
    expect(sanitizeAccountBankState(undefined)).toEqual(createEmptyAccountBankState());
    expect(sanitizeAccountBankState('garbage')).toEqual(createEmptyAccountBankState());
  });

  it('clamps purchasedSlots into range and floors to a whole expansion', () => {
    expect(sanitizeAccountBankState({ purchasedSlots: -5 }).purchasedSlots).toBe(0);
    expect(sanitizeAccountBankState({ purchasedSlots: 9999 }).purchasedSlots).toBe(
      ACCOUNT_BANK_PURCHASED_SLOTS_MAX,
    );
    expect(sanitizeAccountBankState({ purchasedSlots: 13 }).purchasedSlots).toBe(12); // floors to the 6-slot grid
  });

  it('drops malformed inventory rows but keeps well-formed ones (items never destroyed)', () => {
    const raw = {
      inventory: [
        { itemId: 'roasted_boar', count: 3 },
        { itemId: '', count: 1 }, // dropped: empty id
        { notAnItemId: true }, // dropped: no itemId at all
        null,
      ],
      purchasedSlots: 6,
    };
    const state = sanitizeAccountBankState(raw);
    expect(state.inventory).toEqual([{ itemId: 'roasted_boar', count: 3 }]);
    expect(state.purchasedSlots).toBe(6);
  });
});

describe('the offline IWorld facet arm is inert (accounts are a server concept)', () => {
  it('accountBankInfo is null and every command is a no-op on the offline Sim', () => {
    const sim = new Sim({ seed: 1, playerClass: 'warrior', autoEquip: true });
    expect(sim.accountBankInfo).toBeNull();
    expect(() => sim.accountBankDeposit(0)).not.toThrow();
    expect(() => sim.accountBankWithdraw(0)).not.toThrow();
    expect(() => sim.accountBankBuySlots()).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Ops + the gated info read, driven through the pid+accountId-first server
// entry points (accountBank*For) on the REAL Sim, exactly the guild bank
// test's own idiom (tests/guild_bank.test.ts).
// ---------------------------------------------------------------------------

const BANKERS = ['bursar_fernando', 'bursar_petra_vell', 'bursar_aldous_crane'] as const;
const ACCOUNT_BANK_TEST_WORLD: WorldContent = {
  ...BUILTIN_WORLD,
  camps: [],
  npcs: Object.fromEntries(BANKERS.map((id) => [id, BUILTIN_WORLD.npcs[id]])),
  groundObjects: [],
};

const ACCOUNT_ID = 42;

function moveToBanker(sim: Sim, pid = sim.playerId): Entity {
  let banker: Entity | null = null;
  for (const e of sim.entities.values()) {
    if (e.kind === 'npc' && e.templateId === BANKERS[0]) banker = e;
  }
  if (!banker) throw new Error('banker is not spawned in the world');
  const p = sim.entities.get(pid);
  if (!p) throw new Error(`missing player ${pid}`);
  p.pos = { ...banker.pos };
  p.prevPos = { ...p.pos };
  sim.rebucket(p);
  return banker;
}

function moveFarFromBankers(sim: Sim, pid = sim.playerId): void {
  const p = sim.entities.get(pid);
  if (!p) throw new Error(`missing player ${pid}`);
  p.pos = { x: 500, y: p.pos.y, z: 500 };
  p.prevPos = { ...p.pos };
  sim.rebucket(p);
}

// A character standing at a banker with the account's book loaded: the
// baseline every dimension below degrades from one axis at a time.
function makeAccountBankSim(opts: { purchasedSlots?: number } = {}): Sim {
  const sim = new Sim({
    seed: 42,
    playerClass: 'warrior',
    autoEquip: false,
    world: ACCOUNT_BANK_TEST_WORLD,
  });
  moveToBanker(sim);
  sim.loadAccountBank(ACCOUNT_ID, { inventory: [], purchasedSlots: opts.purchasedSlots ?? 0 });
  return sim;
}

const meta = (sim: Sim, pid = sim.playerId) => {
  const m = sim.players.get(pid);
  if (!m) throw new Error(`missing meta ${pid}`);
  return m;
};
const book = (sim: Sim) => {
  const b = sim.accountBanks.get(ACCOUNT_ID);
  if (!b) throw new Error('missing account bank book');
  return b;
};
const hasErr = (evs: { type: string; text?: string }[], text: string) =>
  evs.some((e) => e.type === 'error' && e.text === text);

function fingerprint(sim: Sim): string {
  return JSON.stringify({
    copper: meta(sim).copper,
    inventory: meta(sim).inventory,
    book: sim.accountBanks.get(ACCOUNT_ID) ?? null,
  });
}

const OPS: { name: string; run: (sim: Sim) => void }[] = [
  {
    name: 'accountBankDepositFor',
    run: (sim) => sim.accountBankDepositFor(sim.playerId, ACCOUNT_ID, 0, 1),
  },
  {
    name: 'accountBankWithdrawFor',
    run: (sim) => sim.accountBankWithdrawFor(sim.playerId, ACCOUNT_ID, 0, 1),
  },
  {
    name: 'accountBankBuySlotsFor',
    run: (sim) => sim.accountBankBuySlotsFor(sim.playerId, ACCOUNT_ID),
  },
];

describe('account bank ops: the shared refusal dimensions (every op, one axis at a time)', () => {
  it('dead: every op is silently inert (the market/mail town-service idiom)', () => {
    for (const op of OPS) {
      const sim = makeAccountBankSim();
      sim.addItem('wolf_fang', 3);
      book(sim).inventory.push({ itemId: 'wolf_fang', count: 2 });
      const p = sim.entities.get(sim.playerId);
      if (!p) throw new Error('missing player');
      p.dead = true;
      const before = fingerprint(sim);
      sim.drainEvents();
      op.run(sim);
      expect(fingerprint(sim), op.name).toBe(before);
      expect(sim.drainEvents(), op.name).toEqual([]);
    }
  });

  it('out of range: every op refuses with the banker-distance error and mutates nothing', () => {
    for (const op of OPS) {
      const sim = makeAccountBankSim();
      sim.addItem('wolf_fang', 3);
      book(sim).inventory.push({ itemId: 'wolf_fang', count: 2 });
      moveFarFromBankers(sim);
      const before = fingerprint(sim);
      sim.drainEvents();
      op.run(sim);
      expect(fingerprint(sim), op.name).toBe(before);
      expect(hasErr(sim.drainEvents(), 'You are too far from the banker.'), op.name).toBe(true);
    }
  });

  it('no loaded book: every op returns silently and mutates nothing', () => {
    for (const op of OPS) {
      const sim = makeAccountBankSim();
      sim.evictAccountBank(ACCOUNT_ID);
      sim.addItem('wolf_fang', 3);
      const before = JSON.stringify({ copper: meta(sim).copper, inventory: meta(sim).inventory });
      sim.drainEvents();
      op.run(sim);
      expect(
        JSON.stringify({ copper: meta(sim).copper, inventory: meta(sim).inventory }),
        op.name,
      ).toBe(before);
    }
  });
});

describe('accountBankDepositFor', () => {
  it('moves a carried slot into the book and pokes the quest-inventory recompute', () => {
    const sim = makeAccountBankSim();
    const slot = meta(sim).inventory.length;
    sim.addItem('roasted_boar', 3);
    sim.drainEvents();
    sim.accountBankDepositFor(sim.playerId, ACCOUNT_ID, slot, 2);
    expect(book(sim).inventory).toEqual([{ itemId: 'roasted_boar', count: 2 }]);
    expect(meta(sim).inventory.find((s) => s.itemId === 'roasted_boar')?.count).toBe(1);
  });

  it('refuses a quest item with the account-worded pipe policy (shared WHETHER, own wording)', () => {
    const sim = makeAccountBankSim();
    const questItemId = Object.keys(ITEMS).find((id) => ITEMS[id]?.kind === 'quest');
    if (!questItemId) throw new Error('missing quest fixture');
    const slot = meta(sim).inventory.length;
    meta(sim).inventory.push({ itemId: questItemId, count: 1 });
    sim.drainEvents();
    sim.accountBankDepositFor(sim.playerId, ACCOUNT_ID, slot, 1);
    expect(book(sim).inventory).toEqual([]);
    expect(hasErr(sim.drainEvents(), 'You cannot store quest items in the account bank.')).toBe(
      true,
    );
  });

  it('refuses once the book is full', () => {
    const sim = makeAccountBankSim(); // 0 purchased slots -> 24-slot capacity
    for (let i = 0; i < 24; i++) book(sim).inventory.push({ itemId: `filler_${i}`, count: 1 });
    sim.addItem('wolf_fang', 1);
    sim.drainEvents();
    sim.accountBankDepositFor(sim.playerId, ACCOUNT_ID, 0, 1);
    expect(book(sim).inventory.length).toBe(24);
    expect(hasErr(sim.drainEvents(), 'Your account bank is full.')).toBe(true);
  });
});

describe('accountBankWithdrawFor', () => {
  it('refuses a dormant (pipe-refused) slot with the account-worded withdraw line, never the guild wording', () => {
    // Unreachable through a normal deposit (which refuses the same slot on the
    // way in), but a tampered/legacy row or a later content reclassification
    // must never complete the laundering: the withdraw side re-checks too.
    const sim = makeAccountBankSim();
    const questItemId = Object.keys(ITEMS).find((id) => ITEMS[id]?.kind === 'quest');
    if (!questItemId) throw new Error('missing quest fixture');
    book(sim).inventory.push({ itemId: questItemId, count: 1 });
    sim.drainEvents();
    sim.accountBankWithdrawFor(sim.playerId, ACCOUNT_ID, 0, 1);
    expect(book(sim).inventory.length).toBe(1); // nothing moved
    expect(hasErr(sim.drainEvents(), 'That item cannot be withdrawn from the account bank.')).toBe(
      true,
    );
  });

  it('moves a book slot into the carried bags', () => {
    const sim = makeAccountBankSim();
    book(sim).inventory.push({ itemId: 'wolf_fang', count: 2 });
    sim.drainEvents();
    sim.accountBankWithdrawFor(sim.playerId, ACCOUNT_ID, 0, 2);
    expect(book(sim).inventory).toEqual([]);
    expect(meta(sim).inventory.find((s) => s.itemId === 'wolf_fang')?.count).toBe(2);
  });
});

describe('accountBankBuySlotsFor', () => {
  it('charges the table price and grows the ladder by one expansion', () => {
    const sim = makeAccountBankSim();
    meta(sim).copper = PRICES[0];
    sim.drainEvents();
    sim.accountBankBuySlotsFor(sim.playerId, ACCOUNT_ID);
    expect(book(sim).purchasedSlots).toBe(ACCOUNT_BANK_EXPANSION_SLOTS);
    expect(meta(sim).copper).toBe(0);
  });

  it('refuses when the character cannot afford the next rung', () => {
    const sim = makeAccountBankSim();
    meta(sim).copper = PRICES[0] - 1;
    sim.drainEvents();
    sim.accountBankBuySlotsFor(sim.playerId, ACCOUNT_ID);
    expect(book(sim).purchasedSlots).toBe(0);
    expect(hasErr(sim.drainEvents(), 'You cannot afford that account bank expansion.')).toBe(true);
  });

  it('refuses at the ladder ceiling', () => {
    const sim = makeAccountBankSim({ purchasedSlots: ACCOUNT_BANK_PURCHASED_SLOTS_MAX });
    meta(sim).copper = 100_000_000;
    sim.drainEvents();
    sim.accountBankBuySlotsFor(sim.playerId, ACCOUNT_ID);
    expect(book(sim).purchasedSlots).toBe(ACCOUNT_BANK_PURCHASED_SLOTS_MAX);
    expect(hasErr(sim.drainEvents(), 'Your account bank cannot be expanded further.')).toBe(true);
  });
});

describe('accountBankInfoFor', () => {
  it('is null unless alive, at a banker, and the book is loaded', () => {
    const sim = makeAccountBankSim();
    expect(sim.accountBankInfoFor(sim.playerId, ACCOUNT_ID)).not.toBeNull();
    moveFarFromBankers(sim);
    expect(sim.accountBankInfoFor(sim.playerId, ACCOUNT_ID)).toBeNull();
    moveToBanker(sim);
    const p = sim.entities.get(sim.playerId);
    if (p) p.dead = true;
    expect(sim.accountBankInfoFor(sim.playerId, ACCOUNT_ID)).toBeNull();
    if (p) p.dead = false;
    sim.evictAccountBank(ACCOUNT_ID);
    expect(sim.accountBankInfoFor(sim.playerId, ACCOUNT_ID)).toBeNull();
  });

  it('returns a boundary-cloned snapshot that never aliases the live book', () => {
    const sim = makeAccountBankSim();
    book(sim).inventory.push({ itemId: 'wolf_fang', count: 2 });
    const info = sim.accountBankInfoFor(sim.playerId, ACCOUNT_ID);
    expect(info).toEqual({
      slots: [{ itemId: 'wolf_fang', count: 2 }],
      capacity: 24,
      purchasedSlots: 0,
      nextExpansionPrice: PRICES[0],
    });
    if (info) info.slots[0].count = 999; // mutate the returned view
    expect(book(sim).inventory[0].count).toBe(2); // the live book is untouched
  });
});

describe('load/serialize/evict lifecycle', () => {
  it('loadAccountBank is load-once: a second load for the same account is a no-op', () => {
    const sim = makeAccountBankSim();
    book(sim).inventory.push({ itemId: 'wolf_fang', count: 1 });
    sim.loadAccountBank(ACCOUNT_ID, { inventory: [], purchasedSlots: 30 });
    expect(book(sim).inventory).toEqual([{ itemId: 'wolf_fang', count: 1 }]); // unchanged
  });

  it('serializeAccountBank clones the live book; null once evicted', () => {
    const sim = makeAccountBankSim();
    book(sim).inventory.push({ itemId: 'wolf_fang', count: 1 });
    const saved = sim.serializeAccountBank(ACCOUNT_ID);
    expect(saved).toEqual({ inventory: [{ itemId: 'wolf_fang', count: 1 }], purchasedSlots: 0 });
    if (saved) saved.inventory[0].count = 999;
    expect(book(sim).inventory[0].count).toBe(1); // the live book is untouched
    sim.evictAccountBank(ACCOUNT_ID);
    expect(sim.serializeAccountBank(ACCOUNT_ID)).toBeNull();
  });
});

describe('ClientWorld: the online mirror sends the wire commands', () => {
  it('sends the three account_bank_* tokens', () => {
    // biome-ignore lint/suspicious/noExplicitAny: the sanctioned bare-client-send idiom (tests/guild_bank.test.ts)
    const client: any = Object.create(ClientWorld.prototype);
    const sent: unknown[] = [];
    client.cmd = (payload: unknown) => sent.push(payload);
    client.accountBankDeposit(0, 1);
    client.accountBankWithdraw(0, 1);
    client.accountBankBuySlots();
    expect(sent).toEqual([
      { cmd: 'account_bank_deposit', slot: 0, count: 1 },
      { cmd: 'account_bank_withdraw', slot: 0, count: 1 },
      { cmd: 'account_bank_buy_slots' },
    ]);
  });
});

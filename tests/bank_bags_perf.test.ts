import { describe, expect, it } from 'vitest';
import { bagCapacity } from '../src/sim/bags';
import { BANK_EXPANSION_PRICES, bankCapacity } from '../src/sim/bank';
import { ITEMS } from '../src/sim/data';
import { Sim } from '../src/sim/sim';
import type { Entity, InvSlot } from '../src/sim/types';

const WORLD_SEED = 20064;

// Regression coverage gap this file closes: nothing budgets bankDeposit/bankWithdraw
// (src/sim/bank.ts, moveBetweenContainers -> bags.ts countFit/addStacked) at the
// container's real worst-case shape: a bank expanded to its full 96-slot purchase cap,
// packed with distinct 1-per-slot gear (the container-agnostic move primitive scans the
// WHOLE destination array on every countFit/addStacked call), moving a max-depth stack
// (DEFAULT_STACK = 20) in and out on every op. A flat ceiling alone would not catch an
// O(n^2) regression in that scan (mirrors tests/aura_tick_perf.test.ts's rationale), so
// this also asserts a scaling check across bank population.

// Distinct gear ids (stackSize 1: weapon/armor never merge), used to pack a container
// with N non-mergeable 1-per-slot entries without a real slot ever colliding.
const GEAR_IDS = Object.values(ITEMS)
  .filter((d) => d.kind === 'weapon' || d.kind === 'armor')
  .map((d) => d.id);

function bankerEntity(sim: Sim): Entity {
  for (const id of sim.bankerIds) {
    const e = sim.entities.get(id);
    if (e) return e;
  }
  throw new Error('no banker NPC spawned in the world');
}

// Buy every bank expansion so purchasedSlots reaches the ladder cap (72), giving the
// full 96-slot (24 base + 72 purchased) bank capacity: the real production maximum,
// not a synthetic override.
function maxOutBankSlots(sim: Sim, pid: number): void {
  const meta = sim.meta(pid);
  if (!meta) throw new Error('missing player meta');
  const total = BANK_EXPANSION_PRICES.reduce((s, p) => s + p, 0);
  meta.copper = total + 10_000;
  for (let i = 0; i < BANK_EXPANSION_PRICES.length; i++) sim.bankBuySlots(pid);
}

// Stand a player at a live banker, expand their bank to the 96-slot cap, then pack
// `bankFill` slots of the bank and `bagFill` slots of the backpack with distinct
// 1-per-slot gear, leaving exactly one free slot in each container for the timed
// round-trip target stack. Returns the fixed inventory/bank indices that stack lands
// on for every iteration (stable because only that one stack ever moves).
function buildPackedContainers(
  seed: number,
  bankFill: number,
): { sim: Sim; pid: number; invSlot: number; bankSlot: number } {
  if (GEAR_IDS.length < bankFill) {
    throw new Error(`only ${GEAR_IDS.length} distinct gear ids, need ${bankFill}`);
  }
  const sim = new Sim({ seed, playerClass: 'warrior', noPlayer: true });
  const pid = sim.addPlayer('warrior', 'Hoarder');
  const banker = bankerEntity(sim);
  const p = sim.entities.get(pid);
  if (!p) throw new Error('missing player');
  p.pos = { ...banker.pos };
  p.prevPos = { ...p.pos };
  sim.rebucket(p);

  maxOutBankSlots(sim, pid);
  const meta = sim.meta(pid);
  if (!meta) throw new Error('missing player meta');
  expect(bankCapacity(meta.bank)).toBeGreaterThan(bankFill);

  const bankSlots: InvSlot[] = GEAR_IDS.slice(0, bankFill).map((id) => ({ itemId: id, count: 1 }));
  meta.bank.inventory.push(...bankSlots);

  // Fill the backpack down to one free slot with distinct gear, then push the
  // max-depth ('wolf_fang', DEFAULT_STACK = 20) target stack into that last slot. A
  // fresh warrior spawns with a starting item already occupying a slot, so the fill
  // count is relative to the CURRENT inventory length, not the bare capacity.
  const bagCap = bagCapacity(meta.bags);
  const bagFill = bagCap - meta.inventory.length - 1;
  if (GEAR_IDS.length < bagFill) throw new Error('not enough distinct gear ids for the backpack');
  for (let i = 0; i < bagFill; i++) sim.addItem(GEAR_IDS[i], 1, pid);
  sim.addItem('wolf_fang', 20, pid);
  sim.drainEvents();

  const invSlot = meta.inventory.findIndex((s) => s.itemId === 'wolf_fang');
  expect(invSlot).toBeGreaterThanOrEqual(0);
  expect(meta.inventory[invSlot].count).toBe(20);
  const bankSlot = meta.bank.inventory.length; // the next free bank index the deposit lands on
  return { sim, pid, invSlot, bankSlot };
}

// One deposit + one withdraw of the SAME max-depth stack, at fixed array positions
// (deposit always empties invSlot into the bank's one free slot; withdraw always
// empties that same bank slot back into the freed invSlot), so the containers'
// occupied-slot shape is identical before and after every iteration.
function roundTrip(sim: Sim, pid: number, invSlot: number, bankSlot: number): void {
  sim.bankDeposit(invSlot, undefined, pid);
  sim.bankWithdraw(bankSlot, undefined, pid);
}

function measureRoundTripMedian(seed: number, bankFill: number): number {
  const { sim, pid, invSlot, bankSlot } = buildPackedContainers(seed, bankFill);
  sim.drainEvents();

  for (let i = 0; i < 10; i++) roundTrip(sim, pid, invSlot, bankSlot);

  const SAMPLES = 60;
  const samples: number[] = [];
  for (let i = 0; i < SAMPLES; i++) {
    const t0 = performance.now();
    roundTrip(sim, pid, invSlot, bankSlot);
    samples.push(performance.now() - t0);
  }
  samples.sort((a, b) => a - b);
  return samples[Math.floor(samples.length / 2)];
}

describe('bank/bags container-op high-load regression budget', () => {
  it('bounds deposit+withdraw round-trip cost at max bank slots and max stack depth', () => {
    const BANK_FILL = 95; // 1 short of the 96-slot cap, leaving the round-trip's free slot
    const median = measureRoundTripMedian(WORLD_SEED, BANK_FILL);

    console.log(
      `[bank round-trip perf] bankFill=${BANK_FILL} stackDepth=20 median=${median.toFixed(3)}ms`,
    );

    // Generous by design (see mob_update_perf.test.ts): observed healthy median at this
    // population is well under a millisecond for a two-call round trip; 10ms leaves
    // ample headroom for slow/contended CI hardware while still catching an
    // order-of-magnitude regression.
    expect(median).toBeLessThan(10);
  }, 60_000);

  it('doubling the packed bank population does not more than roughly double the cost', () => {
    const SMALL = 40;
    const LARGE = SMALL * 2;

    const smallMedian = measureRoundTripMedian(WORLD_SEED + 1, SMALL);
    const largeMedian = measureRoundTripMedian(WORLD_SEED + 2, LARGE);

    console.log(
      `[bank round-trip perf] scaling small=${SMALL}(${smallMedian.toFixed(3)}ms) ` +
        `large=${LARGE}(${largeMedian.toFixed(3)}ms) ratio=${(largeMedian / Math.max(smallMedian, 0.001)).toFixed(2)}x`,
    );

    // A doubled packed population doing genuinely linear countFit/addStacked scans
    // should land near 2x; the bound is set generously above that (3.5x) to absorb
    // noise at these small absolute ms magnitudes while still failing hard on
    // quadratic blowup.
    expect(largeMedian).toBeLessThan(Math.max(smallMedian * 3.5, 5));
  }, 60_000);

  it('actually reached max bank capacity and moved the full max-depth stack both ways', () => {
    const BANK_FILL = 95;
    const { sim, pid, invSlot, bankSlot } = buildPackedContainers(WORLD_SEED + 3, BANK_FILL);
    const meta = sim.meta(pid);
    if (!meta) throw new Error('missing player meta');

    expect(bankCapacity(meta.bank)).toBe(96); // 24 base + the full 72-slot purchase ladder
    expect(meta.bank.inventory.length).toBe(BANK_FILL);

    sim.bankDeposit(invSlot, undefined, pid);
    // The whole 20-deep stack left the backpack and landed intact in the bank.
    expect(meta.inventory.some((s) => s.itemId === 'wolf_fang')).toBe(false);
    expect(meta.bank.inventory.length).toBe(BANK_FILL + 1);
    expect(meta.bank.inventory[bankSlot]?.itemId).toBe('wolf_fang');
    expect(meta.bank.inventory[bankSlot]?.count).toBe(20);

    sim.bankWithdraw(bankSlot, undefined, pid);
    expect(meta.bank.inventory.length).toBe(BANK_FILL);
    const back = meta.inventory.find((s) => s.itemId === 'wolf_fang');
    expect(back?.count).toBe(20);

    const errs = sim.drainEvents().filter((e) => e.type === 'error');
    expect(errs.length).toBe(0);
  }, 60_000);
});

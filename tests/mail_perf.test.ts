import { describe, expect, it } from 'vitest';
import {
  MAIL_DELIVERY_SECONDS,
  MAIL_MAX_ATTACHMENTS,
  MAIL_POSTAGE,
} from '../src/sim/mail/post_office';
import { Sim } from '../src/sim/sim';
import type { SimEvent } from '../src/sim/types';

const WORLD_SEED = 20067;

// Regression coverage gap this file closes: nothing budgets the Ravenpost's read path
// (mailInfoFor: deliveredFor's full-book filter, then a sort, then the wire slice) at
// a mailbox's real worst case, MAIL_MAX_PER_RECIPIENT (100) pending letters, each
// carrying real coin + item attachments the way a busy player's inbox actually looks.
// A flat ceiling alone would not catch an O(n^2) regression in that filter/sort chain
// (mirrors tests/aura_tick_perf.test.ts's rationale), so this also asserts a scaling
// check across pending mail count.

function moveToMailbox(sim: Sim, pid: number): void {
  const box = sim.entities.get(sim.postOffice.mailboxIds[0]);
  const p = sim.entities.get(pid);
  if (!box || !p) throw new Error('missing mailbox or player');
  p.pos = { ...box.pos };
  p.prevPos = { ...p.pos };
  sim.rebucket(p);
}

function tickFor(sim: Sim, seconds: number): SimEvent[] {
  const out: SimEvent[] = [];
  for (let i = 0; i < Math.ceil(seconds * 20); i++) out.push(...sim.tick());
  return out;
}

// Build a mailbox with `count` pending letters addressed to one recipient, each
// carrying a copper attachment plus a real item parcel (the max-attachment shape a
// full inbox actually has), sent by a second player standing at the mailbox. Ticks
// past MAIL_DELIVERY_SECONDS so every letter has actually landed (deliverAt <= now)
// before the recipient's read path is measured.
function buildFullMailbox(seed: number, count: number): { sim: Sim; recipient: number } {
  const sim = new Sim({ seed, playerClass: 'warrior', noPlayer: true });
  const sender = sim.addPlayer('warrior', 'Sender');
  const recipient = sim.addPlayer('warrior', 'Recipient');
  moveToMailbox(sim, sender);
  const senderMeta = sim.meta(sender);
  if (!senderMeta) throw new Error('missing sender meta');
  senderMeta.copper = count * (100 + MAIL_POSTAGE) + 10_000;
  sim.addItem('roasted_boar', count, sender);
  sim.drainEvents();

  for (let i = 0; i < count; i++) {
    sim.mailSend(
      'Recipient',
      `Parcel ${i}`,
      'A gift.',
      20,
      [{ itemId: 'roasted_boar', count: 1 }],
      sender,
    );
  }
  sim.drainEvents();
  tickFor(sim, MAIL_DELIVERY_SECONDS + 2);
  moveToMailbox(sim, recipient);
  return { sim, recipient };
}

function measureMailInfoMedian(seed: number, count: number): number {
  const { sim, recipient } = buildFullMailbox(seed, count);
  for (let i = 0; i < 5; i++) sim.mailInfoFor(recipient);

  const SAMPLES = 60;
  const samples: number[] = [];
  for (let i = 0; i < SAMPLES; i++) {
    const t0 = performance.now();
    sim.mailInfoFor(recipient);
    samples.push(performance.now() - t0);
  }
  samples.sort((a, b) => a - b);
  return samples[Math.floor(samples.length / 2)];
}

describe('mail (Ravenpost) mailInfoFor high-load regression budget', () => {
  it('bounds per-call cost at a full 100-letter mailbox', () => {
    const COUNT = 100; // MAIL_MAX_PER_RECIPIENT: the real mailbox cap
    const median = measureMailInfoMedian(WORLD_SEED, COUNT);

    console.log(`[mail.mailInfoFor perf] letters=${COUNT} median=${median.toFixed(3)}ms`);

    // Generous by design (see mob_update_perf.test.ts): observed healthy median at
    // this population is well under a millisecond; 10ms leaves ample headroom for
    // slow/contended CI hardware while still catching an order-of-magnitude
    // regression.
    expect(median).toBeLessThan(10);
  }, 60_000);

  it('doubling pending letter count does not more than roughly double the cost', () => {
    const SMALL = 50;
    const LARGE = SMALL * 2; // still within MAIL_MAX_PER_RECIPIENT = 100

    const smallMedian = measureMailInfoMedian(WORLD_SEED + 1, SMALL);
    const largeMedian = measureMailInfoMedian(WORLD_SEED + 2, LARGE);

    console.log(
      `[mail.mailInfoFor perf] scaling small=${SMALL}(${smallMedian.toFixed(3)}ms) ` +
        `large=${LARGE}(${largeMedian.toFixed(3)}ms) ratio=${(largeMedian / Math.max(smallMedian, 0.001)).toFixed(2)}x`,
    );

    // A doubled letter count doing genuinely linear filter/sort work should land
    // near 2x; the bound is set generously above that (3.5x) to absorb noise at
    // these small absolute ms magnitudes while still failing hard on quadratic
    // blowup.
    expect(largeMedian).toBeLessThan(Math.max(smallMedian * 3.5, 5));
  }, 60_000);

  it('actually filled the mailbox to its cap, delivered attachments, and refused an overflow letter', () => {
    const COUNT = 100;
    const { sim, recipient } = buildFullMailbox(WORLD_SEED + 3, COUNT);

    const info = sim.mailInfoFor(recipient);
    expect(info).not.toBeNull();
    expect(info?.totalCount).toBe(COUNT);
    expect(info?.messages.length).toBeGreaterThan(0);
    expect(info?.messages.every((m) => m.copper === 20)).toBe(true);
    expect(info?.messages.every((m) => m.items.length === 1)).toBe(true);
    expect(MAIL_MAX_ATTACHMENTS).toBeGreaterThanOrEqual(1);

    // The mailbox is at its per-recipient cap: one more send from a second sender is
    // refused outright, and the stored count never exceeds the cap.
    const secondSender = sim.addPlayer('warrior', 'Overflow');
    moveToMailbox(sim, secondSender);
    const senderMeta = sim.meta(secondSender);
    if (!senderMeta) throw new Error('missing sender meta');
    senderMeta.copper = 10_000;
    sim.addItem('roasted_boar', 1, secondSender);
    sim.drainEvents();
    sim.mailSend('Recipient', 'Overflow', 'no room', 0, [], secondSender);
    const events = sim.drainEvents();
    const refusal = events.find(
      (e): e is Extract<SimEvent, { type: 'mailResult' }> =>
        e.type === 'mailResult' && e.code === 'recipientBoxFull',
    );
    expect(refusal).toBeDefined();
    expect(sim.mailInfoFor(recipient)?.totalCount).toBe(COUNT);

    // Taking one letter actually credits coin and the item parcel to the recipient.
    const firstId = info?.messages[0]?.id;
    expect(firstId).toBeDefined();
    const meta = sim.meta(recipient);
    if (!meta || firstId === undefined) throw new Error('missing recipient state');
    const copperBefore = meta.copper;
    sim.mailTake(firstId, recipient);
    expect(meta.copper).toBe(copperBefore + 20);
    expect(sim.countItem('roasted_boar', recipient)).toBeGreaterThan(0);
  }, 60_000);
});

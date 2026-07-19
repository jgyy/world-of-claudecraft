import { describe, expect, it } from 'vitest';
import { Sim } from '../src/sim/sim';

const WORLD_SEED = 20064;

// Build `count` players who have all /join-ed the same opt-in channel (world).
// This is the fanout hot path: sim/social/chat.ts's "/world message" / "/lfg
// message" handler walks the ENTIRE ctx.channelSubs map on every send and emits
// one event per subscriber, so a busy world channel is O(subscribers) per message.
function buildChannelCrowd(sim: Sim, count: number): number[] {
  const pids: number[] = [];
  for (let i = 0; i < count; i++) {
    const pid = sim.addPlayer('warrior', `Chatter${i}`);
    sim.chat('/join world', pid);
    pids.push(pid);
  }
  return pids;
}

function medianOf(samples: number[]): number {
  const sorted = [...samples].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

describe('chat channel broadcast fanout high-load regression budget', () => {
  it('bounds one /world broadcast cost against a large joined-channel population', () => {
    const sim = new Sim({ seed: WORLD_SEED, playerClass: 'warrior', noPlayer: true });
    const CROWD = 500;
    const pids = buildChannelCrowd(sim, CROWD);
    const sender = pids[0];

    const SAMPLES = 60;
    const samples: number[] = [];
    for (let i = 0; i < SAMPLES; i++) {
      const start = performance.now();
      sim.chat(`/world load test message ${i}`, sender);
      samples.push(performance.now() - start);
    }
    const median = medianOf(samples);

    console.log(`[chat broadcast perf] channelPopulation=${CROWD} median=${median.toFixed(3)}ms`);

    // Generous by design (see mob_update_perf.test.ts): a single broadcast to a
    // 500-player channel does 500 map-value emits, a low-cost O(n) walk; the
    // healthy median is well under 1ms. 15ms leaves ample CI headroom while
    // still catching an order-of-magnitude sustained regression.
    expect(median).toBeLessThan(15);
  }, 60_000);

  it('doubling the channel population does not more than roughly double one broadcast cost', () => {
    // A flat ceiling alone cannot catch a regression that turns the per-message
    // O(subscribers) fanout into something worse (e.g. a nested scan per
    // recipient); this asserts the cost stays close to linear as the joined
    // population doubles.
    const SMALL = 250;
    const LARGE = SMALL * 2;
    const SAMPLES = 40;

    function measureBroadcastMedian(count: number): number {
      const sim = new Sim({ seed: WORLD_SEED + 1, playerClass: 'warrior', noPlayer: true });
      const pids = buildChannelCrowd(sim, count);
      const sender = pids[0];
      const samples: number[] = [];
      for (let i = 0; i < SAMPLES; i++) {
        const start = performance.now();
        sim.chat(`/world msg ${i}`, sender);
        samples.push(performance.now() - start);
      }
      return medianOf(samples);
    }

    const smallMedian = measureBroadcastMedian(SMALL);
    const largeMedian = measureBroadcastMedian(LARGE);

    console.log(
      `[chat broadcast perf] scaling small=${SMALL}(${smallMedian.toFixed(3)}ms) ` +
        `large=${LARGE}(${largeMedian.toFixed(3)}ms) ` +
        `ratio=${(largeMedian / Math.max(smallMedian, 0.001)).toFixed(2)}x`,
    );

    // A doubled channel population doing genuinely linear per-message fanout
    // should land near 2x; the bound is set generously above that (3.5x,
    // mirroring aura_tick_perf.test.ts) to absorb noise at these small absolute
    // ms magnitudes while still failing hard on superlinear blowup.
    expect(largeMedian).toBeLessThan(Math.max(smallMedian * 3.5, 5));
  }, 60_000);

  it('actually built the large joined-channel population it claims to measure', () => {
    const sim = new Sim({ seed: WORLD_SEED + 2, playerClass: 'warrior', noPlayer: true });
    const CROWD = 500;
    const pids = buildChannelCrowd(sim, CROWD);
    const sender = pids[0];

    const events = sim.chat('/world shape check', sender);
    expect(pids.length).toBe(CROWD);
    expect(events).toEqual({ channel: 'world', message: 'shape check' });

    // Cross-check against the channel subscription map every subscriber counts
    // on: everyone we joined is still subscribed to 'world'.
    const channelSubs = (sim as unknown as { channelSubs: Map<number, Set<string>> }).channelSubs;
    let joinedWorld = 0;
    for (const [subPid, set] of channelSubs) {
      if (pids.includes(subPid) && set.has('world')) joinedWorld++;
    }
    expect(joinedWorld).toBe(CROWD);
  });
});

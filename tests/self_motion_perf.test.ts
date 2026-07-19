import { describe, expect, it } from 'vitest';
import { type SelfMotionFrame, SelfMotionPredictor } from '../src/render/self_motion';
import type { Entity, MoveInput } from '../src/sim/types';

// Perf-budget coverage for the render-side hot path: SelfMotionPredictor.step
// runs once PER RENDERED FRAME for the online local player (main.ts drives it
// every animation frame regardless of population; it does not scale with
// entity count). tests/self_motion.test.ts pins its POLICY (anchoring,
// leashing, teleport snap) against a real lagging Sim; this file pins its
// per-call COST and, since the cost is inherently O(1) per self-entity, checks
// that repeated steady-state calls show NO growth trend rather than running a
// population-scaling check (there is no population to scale here).

const SEED = 42;
const FRAME_DT = 1 / 60;

function mi(over: Partial<MoveInput> = {}): MoveInput {
  return {
    forward: false,
    back: false,
    turnLeft: false,
    turnRight: false,
    strafeLeft: false,
    strafeRight: false,
    jump: false,
    ...over,
  };
}

function makeSelf(): Entity {
  return {
    id: 1,
    kind: 'player',
    pos: { x: 0, y: 0, z: 0 },
    prevPos: { x: 0, y: 0, z: 0 },
    facing: 0,
    dead: false,
    ghost: false,
    sitting: false,
    castingAbility: null,
    maxHp: 100,
    auras: [],
    onGround: true,
    vx: 0,
    vy: 0,
    vz: 0,
  } as unknown as Entity;
}

function makeFrame(_t: number): SelfMotionFrame {
  return {
    enabled: true,
    moveInput: mi({ forward: true }),
    displayFacing: 0,
    echoMs: 80,
    jitterMs: 10,
    alpha: 0.5,
    frameDt: FRAME_DT,
  };
}

function runSteps(predictor: SelfMotionPredictor, self: Entity, count: number): void {
  for (let i = 0; i < count; i++) {
    predictor.step(self, makeFrame(i));
    self.pos.z += 0.01;
    self.prevPos.z += 0.01;
  }
}

describe('self_motion perf: SelfMotionPredictor.step per-frame cost', () => {
  it('bounds the per-frame cost of stepping the self predictor', () => {
    const predictor = new SelfMotionPredictor(SEED);
    const self = makeSelf();

    // Warm up: settle the pose-history ring and scratch actor.
    runSteps(predictor, self, 10);

    const SAMPLES = 60;
    const samples: number[] = [];
    for (let i = 0; i < SAMPLES; i++) {
      const t0 = performance.now();
      predictor.step(self, makeFrame(i));
      samples.push(performance.now() - t0);
      self.pos.z += 0.01;
      self.prevPos.z += 0.01;
    }
    samples.sort((a, b) => a - b);
    const median = samples[Math.floor(samples.length / 2)];

    console.log(`[self_motion perf] median=${median.toFixed(4)}ms`);

    // O(1) per call (fixed-size history ring, no population scaling); the
    // healthy median is a tiny fraction of a ms, so 2ms leaves generous
    // headroom for slow/contended CI hardware while still catching an
    // accidental per-frame O(n) creep (e.g. an unbounded history scan).
    expect(median).toBeLessThan(2);
  }, 30_000);

  it('shows no growth trend across many consecutive steps (drift/leak guard)', () => {
    const predictor = new SelfMotionPredictor(SEED);
    const self = makeSelf();
    runSteps(predictor, self, 10);

    const TOTAL = 400;
    const samples: number[] = [];
    for (let i = 0; i < TOTAL; i++) {
      const t0 = performance.now();
      predictor.step(self, makeFrame(i));
      samples.push(performance.now() - t0);
      self.pos.z += 0.01;
      self.prevPos.z += 0.01;
    }

    const firstTen = samples.slice(0, 10).sort((a, b) => a - b);
    const lastTen = samples.slice(-10).sort((a, b) => a - b);
    const firstMedian = firstTen[Math.floor(firstTen.length / 2)];
    const lastMedian = lastTen[Math.floor(lastTen.length / 2)];

    console.log(
      `[self_motion perf] drift-guard firstMedian=${firstMedian.toFixed(4)}ms ` +
        `lastMedian=${lastMedian.toFixed(4)}ms`,
    );

    // The predictor's pose-history ring is fixed-size (HISTORY_SIZE=128) and
    // its scratch state is preallocated, so per-call cost must stay flat over
    // hundreds of calls; a growing trend would signal an accidental unbounded
    // accumulation (e.g. the history ring or a scratch array growing per call).
    // Bound generously (2x, floor 0.5ms) since both medians are tiny absolute
    // numbers where relative noise dominates.
    expect(lastMedian).toBeLessThan(Math.max(firstMedian * 2, 0.5));
  }, 30_000);

  it('actually advances the self pose every step (shape sanity, non-vacuous)', () => {
    const predictor = new SelfMotionPredictor(SEED);
    const self = makeSelf();
    const startPose = predictor.step(self, makeFrame(0));
    expect(startPose).not.toBeNull();
    const startZ = startPose ? startPose.z : 0;
    let finalPose = startPose;
    for (let i = 1; i < 60; i++) {
      self.pos.z += 0.2;
      self.prevPos.z += 0.2;
      const pose = predictor.step(self, makeFrame(i));
      expect(pose).not.toBeNull();
      finalPose = pose;
    }
    // Held-forward intent over many steps genuinely advances the display pose
    // away from its starting point (proves the crowd/self-motion loop above
    // is exercising real per-frame kernel work, not a no-op predictor).
    expect(finalPose && Math.abs(finalPose.z - startZ)).toBeGreaterThan(0.5);
  });
});

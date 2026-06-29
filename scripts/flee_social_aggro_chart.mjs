// Incorrect/correct top-down view of social aggro while fleeing. A cowardly mob panics
// at low HP and runs directly away from the player down a lane lined with idle
// same-family allies. INCORRECT (a per-tick rally as the fleer runs past) chains in
// every ally down the lane, cascading one pull into a whole-camp wipe. CORRECT (a
// one-shot, local rally at the panic SPOT, mob/social_aggro.ts) pulls only the allies
// that were within the 5yd help radius when the mob broke; the rest of the pack stays
// idle. Same seed/world/geometry for both; the "correct" panel reads the real sim.
//
// The shipped docs/screenshots/flee-social-aggro.png is a hand-drawn version of this
// same comparison; this script is the runnable, source-of-truth derivation of it.

import { FLEE_HELP_RADIUS } from '../src/sim/mob/social_aggro.ts';
import { Sim } from '../src/sim/sim.ts';

const SEED = 42;
const FAMILY_TEMPLATE = 'gravecaller_cultist';
// Allies down the +x escape lane, at increasing distance from the panic spot.
const ALLY_DX = [4, 10, 16, 22, 28];
const dist2d = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

function wildMobs(sim) {
  return [...sim.entities.values()].filter(
    (e) => e.kind === 'mob' && !e.dead && e.ownerId === null,
  );
}

// Stage the scene: a low-HP fleer 3yd from the player and a row of idle same-family
// allies down the lane it will flee along (+x, directly away from the player).
function stage() {
  const sim = new Sim({ seed: SEED, playerClass: 'warrior', autoEquip: true });
  const mobs = wildMobs(sim);
  const fleer = mobs[0];
  fleer.templateId = FAMILY_TEMPLATE;
  fleer.maxHp = 1000;
  fleer.hp = 120;
  fleer.auras = [];
  fleer.enraged = false;
  fleer.hasFled = false;
  fleer.fleeTimer = 0;
  fleer.fleeReturnTimer = 0;
  fleer.pos = { x: sim.player.pos.x + 3, z: sim.player.pos.z, y: sim.player.pos.y };
  fleer.prevPos = { ...fleer.pos };
  fleer.spawnPos = { ...fleer.pos };
  fleer.leashAnchor = { ...fleer.pos };
  fleer.aiState = 'attack';
  fleer.aggroTargetId = sim.playerId;
  fleer.inCombat = true;

  const allies = ALLY_DX.map((dx, i) => {
    const a = mobs[i + 1];
    a.templateId = FAMILY_TEMPLATE;
    a.hostile = true;
    a.dead = false;
    a.aiState = 'idle';
    a.aggroTargetId = null;
    a.pos = { x: fleer.pos.x + dx, z: fleer.pos.z, y: fleer.pos.y };
    a.prevPos = { ...a.pos };
    a.spawnPos = { ...a.pos };
    return a;
  });
  return { sim, fleer, allies };
}

// CORRECT: drive the real sim through the whole flee. The local one-shot rally only
// pulls allies inside the 5yd help radius at the panic spot; running past the rest
// never chains them, so they stay idle.
function runCorrect() {
  const { sim, fleer, allies } = stage();
  const panic = { ...fleer.pos };
  const path = [{ ...fleer.pos }];
  const pulled = allies.map(() => false);
  for (let i = 0; i < 20 * 8; i++) {
    sim.tick();
    path.push({ ...sim.entities.get(fleer.id).pos });
    allies.forEach((a, idx) => {
      if (sim.entities.get(a.id).aiState !== 'idle') pulled[idx] = true;
    });
  }
  return {
    panic,
    path,
    allies: allies.map((a, idx) => ({
      pos: { x: a.spawnPos.x, z: a.spawnPos.z },
      pulled: pulled[idx],
    })),
  };
}

// INCORRECT: the rejected per-tick rally dragged in every same-family ally the fleer
// ran past, so the whole lane lights up. Synthesized (the behavior no longer exists in
// the sim): every ally on the escape lane is pulled.
function deriveIncorrect(correct) {
  return {
    panic: correct.panic,
    path: correct.path,
    allies: correct.allies.map((a) => ({ pos: a.pos, pulled: true })),
  };
}

const correct = runCorrect();
const incorrect = deriveIncorrect(correct);

// ---- render the two panels side by side ----
const VX0 = -6,
  VX1 = 36,
  VZ0 = -10,
  VZ1 = 10,
  S = 11,
  PAD = 30,
  GAP = 40;
const PW = (VX1 - VX0) * S + PAD * 2;
const PH = (VZ1 - VZ0) * S + PAD * 2;
const W = PW * 2 + GAP,
  H = PH + 30;

function panel(ox, data, title, subtitle) {
  const sx = (x) => ox + PAD + (x - VX0) * S;
  const sy = (z) => PAD + 30 + (VZ1 - z) * S;
  let s = `<rect x="${ox}" y="0" width="${PW}" height="${PH + 30}" fill="#11151c"/>`;
  s += `<text x="${ox + 16}" y="24" fill="#e8edf3" font-size="17" font-weight="bold">${title}</text>`;
  s += `<text x="${ox + 16}" y="44" fill="#9aa4b2" font-size="12">${subtitle}</text>`;
  // 5yd help radius around the panic spot
  s += `<circle cx="${sx(data.panic.x)}" cy="${sy(data.panic.z)}" r="${FLEE_HELP_RADIUS * S}" fill="none" stroke="#3a4452" stroke-width="1" stroke-dasharray="4 4"/>`;
  // flee path
  s += `<polyline fill="none" stroke="#5b6b80" stroke-width="2.5" stroke-linejoin="round" points="${data.path.map((q) => `${sx(q.x).toFixed(1)},${sy(q.z).toFixed(1)}`).join(' ')}"/>`;
  // player
  s += `<circle cx="${sx(data.panic.x - 3)}" cy="${sy(data.panic.z)}" r="7" fill="#ffd24a"/>`;
  s += `<text x="${sx(data.panic.x - 3)}" y="${sy(data.panic.z) - 11}" fill="#ffd24a" font-size="11" text-anchor="middle">you</text>`;
  // fleer start
  s += `<circle cx="${sx(data.panic.x)}" cy="${sy(data.panic.z)}" r="6" fill="#e0564b"/>`;
  s += `<text x="${sx(data.panic.x)}" y="${sy(data.panic.z) - 11}" fill="#e0564b" font-size="11" text-anchor="middle">fleer</text>`;
  // allies
  data.allies.forEach((a) => {
    const c = a.pulled ? '#46c97a' : '#6b7280';
    s += `<circle cx="${sx(a.pos.x)}" cy="${sy(a.pos.z)}" r="6" fill="${c}"/>`;
  });
  return s;
}

const nI = incorrect.allies.filter((a) => a.pulled).length;
const nC = correct.allies.filter((a) => a.pulled).length;
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" font-family="sans-serif">
<rect width="${W}" height="${H}" fill="#0c0f14"/>
${panel(0, incorrect, 'Incorrect', `per-tick rally: ${nI}/${ALLY_DX.length} allies chained as the fleer runs through the pack`)}
${panel(PW + GAP, correct, 'Correct', `local one-shot rally: ${nC}/${ALLY_DX.length} allies pulled (only inside the 5yd panic ring)`)}
<text x="16" y="${H - 9}" fill="#9aa4b2" font-size="12">green = rallied into the fight · grey = stayed idle · dashed = 5yd help radius · seed ${SEED}</text>
</svg>`;

import fs from 'node:fs';

const out = process.argv[2] || 'docs/screenshots/flee-social-aggro.svg';
fs.mkdirSync(out.replace(/\/[^/]+$/, ''), { recursive: true });
fs.writeFileSync(out, svg);
console.log(`wrote ${out}  (incorrect ${nI}/${ALLY_DX.length}, correct ${nC}/${ALLY_DX.length})`);

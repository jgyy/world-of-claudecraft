// One-off Tripo AI generation script for the Zone 2 (Mirefen Marsh) ruin ring
// decoration pass. Generates each prop's GLB via text_to_model, downloads the
// pbr_model, then compresses it with @gltf-transform/cli into
// public/models/props/. Not part of the build; run manually with
// `node --env-file=.env scripts/gen_ruin_assets.mjs`.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

const API = 'https://api.tripo3d.ai/v2/openapi';
const KEY = process.env.TRIPO_API_KEY;
if (!KEY) throw new Error('TRIPO_API_KEY not set');

const PROPS = [
  {
    key: 'ruin_archway',
    prompt:
      'weathered ancient stone broken archway, cracked and mossy, fantasy MMO ruins decoration, low-poly game-ready',
  },
  {
    key: 'ruin_altar',
    prompt:
      'cracked ancient stone altar with carved runes, mossy fantasy MMO ruins decoration, low-poly game-ready',
  },
  {
    key: 'ruin_obelisk',
    prompt:
      'toppled broken stone obelisk lying on its side, weathered and mossy, fantasy MMO ruins decoration, low-poly game-ready',
  },
  {
    key: 'ruin_well',
    prompt:
      'crumbling ancient stone well, cracked and overgrown with moss, fantasy MMO ruins decoration, low-poly game-ready',
  },
  {
    key: 'ruin_stairway',
    prompt:
      'partially collapsed ancient stone stairway, weathered and mossy, fantasy MMO ruins decoration, low-poly game-ready',
  },
  {
    key: 'ruin_bench',
    prompt:
      'moss-covered ancient stone bench, cracked fantasy MMO ruins decoration, low-poly game-ready',
  },
  {
    key: 'ruin_brazier',
    prompt:
      'weathered stone brazier firepit, cracked and mossy, fantasy MMO ruins decoration, low-poly game-ready',
  },
  {
    key: 'ruin_grave_marker',
    prompt:
      'weathered ancient stone grave marker, cracked and mossy carved runes, fantasy MMO ruins decoration, low-poly game-ready',
  },
  {
    key: 'ruin_rubble',
    prompt:
      'pile of broken stone masonry rubble, weathered and mossy, fantasy MMO ruins decoration, low-poly game-ready',
  },
  {
    key: 'ruin_pedestal',
    prompt:
      'weathered ancient stone pedestal, cracked and mossy fantasy MMO ruins decoration, low-poly game-ready',
  },
  {
    key: 'ruin_wall_fragment',
    prompt:
      'crumbling carved ancient stone wall fragment, weathered and mossy, fantasy MMO ruins decoration, low-poly game-ready',
  },
  {
    key: 'ruin_urn',
    prompt:
      'weathered ancient stone urn, cracked and mossy, fantasy MMO ruins decoration, low-poly game-ready',
  },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function createTask(prompt) {
  const res = await fetch(`${API}/task`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'text_to_model', prompt }),
  });
  const json = await res.json();
  if (json.code !== 0) throw new Error(`create failed: ${JSON.stringify(json)}`);
  return json.data.task_id;
}

async function pollTask(taskId) {
  for (let i = 0; i < 60; i++) {
    const res = await fetch(`${API}/task/${taskId}`, {
      headers: { Authorization: `Bearer ${KEY}` },
    });
    const json = await res.json();
    const status = json.data.status;
    if (status === 'success') return json.data.output.pbr_model;
    if (status === 'failed' || status === 'banned') {
      throw new Error(`task ${taskId} ${status}`);
    }
    await sleep(5000);
  }
  throw new Error(`task ${taskId} timed out`);
}

fs.mkdirSync('tmp/tripo_raw', { recursive: true });
fs.mkdirSync('public/models/props', { recursive: true });

const results = [];
let ok = 0;
let fail = 0;
for (const p of PROPS) {
  try {
    console.log(`[${p.key}] creating task...`);
    const taskId = await createTask(p.prompt);
    console.log(`[${p.key}] task_id=${taskId}, polling...`);
    const url = await pollTask(taskId);
    console.log(`[${p.key}] generated, downloading...`);
    const rawPath = `tmp/tripo_raw/${p.key}.glb`;
    const buf = await (await fetch(url)).arrayBuffer();
    fs.writeFileSync(rawPath, Buffer.from(buf));
    const outPath = `public/models/props/${p.key}.glb`;
    console.log(`[${p.key}] compressing...`);
    execFileSync(
      'npx',
      [
        '--yes',
        '@gltf-transform/cli',
        'optimize',
        rawPath,
        outPath,
        // meshopt, not draco: the runtime GLTFLoader (src/render/assets/loader.ts)
        // only wires a MeshoptDecoder, no DRACOLoader, so draco-compressed GLBs
        // fail to parse in the client at runtime. 512px textures and a looser
        // simplify tolerance are plenty for a small background ruin prop and
        // cut Tripo's default 2048px/near-lossless output by roughly 10-15x.
        '--compress',
        'meshopt',
        '--texture-compress',
        'webp',
        '--texture-size',
        '512',
        '--simplify-error',
        '0.003',
      ],
      { stdio: 'inherit' },
    );
    const size = fs.statSync(outPath).size;
    console.log(`[${p.key}] done, ${(size / 1024 / 1024).toFixed(2)} MB`);
    results.push({ key: p.key, ok: true, size });
    ok++;
  } catch (e) {
    console.error(`[${p.key}] FAILED: ${e.message}`);
    results.push({ key: p.key, ok: false, error: e.message });
    fail++;
  }
}

console.log(`\n=== done: ${ok} ok, ${fail} failed ===`);
fs.writeFileSync('tmp/tripo_gen_results.json', JSON.stringify(results, null, 2));

// Computed per-key gain-map ceiling for custom (hand-mastered) SFX keys.
//
// The gain map is attenuation-only by default (resolved gain capped at 0dB,
// see playback_profile.mjs) so a category/key trim can never push a normally-
// conformed key back into clipping. That flat 0dB ceiling is unnecessarily
// conservative for a custom key: conform never boosts a `custom: true` key
// (see conform_audio.mjs's conformCustomMaster), only ever pulling its true
// peak DOWN if it exceeds the safety floor, so a quiet custom recording can
// sit well under the floor with real, measurable headroom nobody is using.
//
// This module computes, per custom key, exactly how much of that headroom is
// safe to expose as a gain-map boost: SAFETY_FLOOR_DBFS minus the key's own
// WORST-CASE (loudest) measured true peak across every recorded take, since a
// keyTrimDb boost applies uniformly to every variant of a key, not per-take.
// A key with zero measured headroom (already at/over the floor) gets a 0dB
// ceiling, identical to today's flat behavior; only genuinely quiet custom
// content gets real room. This is the actual enforcement mechanism (consumed
// by playback_profile.mjs's validator), not just documentation: a PR that
// tries to set a keyTrimDb value past the computed ceiling fails outright.
//
// measureSfxTruePeakDb spawns ffmpeg, so re-running this over the whole
// custom-key catalog (every `sfx:manifest` build) is one subprocess per take
// even when nobody touched the audio since the last run. The generated JSON
// therefore also carries each take's fingerprint (a sha256 content hash plus
// byte size) and its measured peak alongside the key's ceiling: a track whose
// fingerprint still matches the stored one reuses the stored peak instead of
// re-invoking ffmpeg, and only a changed (or new) take pays the measurement
// cost. The fingerprint is content-based, not mtime-based, on purpose: git
// does not preserve mtimes, so a fresh clone, a new worktree, or a CI
// checkout would otherwise miss the cache on every single track and rewrite
// this file with machine-local timestamps on the first build.

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { measureSfxTruePeakDb } from './conform_audio.mjs';
import { discoverSfxTracks } from './sfx_manifest_builder.mjs';
import { SFX } from './sfx_prompts.mjs';

export const SFX_GAIN_CEILING_PATH = 'scripts/sfx/sfx_gain_ceiling.generated.json';

// Real headroom before the absolute 0dBFS ceiling, accounting for MP3's own
// inter-sample encoding overshoot: the same margin conform's peak-safety
// enforcement already uses (see conform_audio.mjs's LONG_FORM_LIMIT_DB).
const SAFETY_FLOOR_DBFS = -1;

// Tolerant read used only by the cache lookup: a corrupt or missing file just
// means "nothing cached", never a hard failure (computeSfxGainCeilingRecords
// re-measures everything from scratch in that case).
function readCachedGainCeilingRecords(repoRoot) {
  const path = join(repoRoot, SFX_GAIN_CEILING_PATH);
  if (!existsSync(path)) return {};
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return {};
  }
}

// Strict read used by consumers (the playback_profile.mjs validator): a
// present-but-corrupt ceilings file must fail loudly here, not silently drop
// every custom key to a flat 0dB ceiling and fail later somewhere else with a
// confusing "resolved gain out of range" error.
function readGainCeilingRecords(repoRoot) {
  const path = join(repoRoot, SFX_GAIN_CEILING_PATH);
  if (!existsSync(path)) return {};
  return JSON.parse(readFileSync(path, 'utf8'));
}

// A sha256 content hash is a true fingerprint: it survives a fresh clone, a
// new worktree, or a CI checkout, none of which preserve mtime. Byte size
// rides along purely as a cheap sanity check.
function trackFingerprint(path) {
  const bytes = readFileSync(path);
  return { sha256: createHash('sha256').update(bytes).digest('hex'), size: bytes.length };
}

function fingerprintsMatch(a, b) {
  return !!a && !!b && a.sha256 === b.sha256 && a.size === b.size;
}

// Older (pre-fingerprint) generated files stored a bare number per key; treat
// that shape, or any record missing a matching track, as "nothing cached".
function storedTrackPeakDb(storedRecord, filename, fingerprint) {
  if (!storedRecord || typeof storedRecord !== 'object' || !Array.isArray(storedRecord.tracks)) {
    return null;
  }
  const stored = storedRecord.tracks.find((entry) => entry.filename === filename);
  if (!stored || typeof stored.peakDb !== 'number') return null;
  return fingerprintsMatch(stored, fingerprint) ? stored.peakDb : null;
}

// Full computed records: per-key ceilingDb plus the per-track fingerprint and
// measured peak that produced it, the shape persisted to SFX_GAIN_CEILING_PATH.
export function computeSfxGainCeilingRecords(repoRoot, ffmpegPath) {
  const sfxDirectory = join(repoRoot, 'public/audio/sfx');
  const discovered = discoverSfxTracks(SFX, sfxDirectory);
  const customKeys = new Set(
    SFX.filter((entry) => entry.custom === true).map((entry) => entry.key),
  );
  const stored = readCachedGainCeilingRecords(repoRoot);
  const records = {};
  for (const key of [...customKeys].sort()) {
    const source = discovered.entries[key];
    if (!source) continue;
    let loudestPeakDb = -Infinity;
    const tracks = [];
    for (const track of source.tracks) {
      const path = join(sfxDirectory, track.filename);
      if (!existsSync(path)) continue;
      const fingerprint = trackFingerprint(path);
      const cachedPeakDb = storedTrackPeakDb(stored[key], track.filename, fingerprint);
      const peakDb = cachedPeakDb ?? measureSfxTruePeakDb(path, ffmpegPath);
      tracks.push({ filename: track.filename, ...fingerprint, peakDb });
      if (peakDb > loudestPeakDb) loudestPeakDb = peakDb;
    }
    if (loudestPeakDb === -Infinity) continue;
    const ceilingDb = Math.max(0, SAFETY_FLOOR_DBFS - loudestPeakDb);
    records[key] = { ceilingDb: Number(ceilingDb.toFixed(2)), tracks };
  }
  return records;
}

function ceilingsFromRecords(records) {
  const ceilings = {};
  for (const [key, record] of Object.entries(records)) ceilings[key] = record.ceilingDb;
  return ceilings;
}

export function computeSfxGainCeilings(repoRoot, ffmpegPath) {
  return ceilingsFromRecords(computeSfxGainCeilingRecords(repoRoot, ffmpegPath));
}

export function readSfxGainCeilings(repoRoot) {
  const records = readGainCeilingRecords(repoRoot);
  const ceilings = {};
  for (const [key, value] of Object.entries(records)) {
    ceilings[key] = typeof value === 'number' ? value : value?.ceilingDb;
  }
  return ceilings;
}

export function writeSfxGainCeilings(repoRoot, ffmpegPath) {
  const records = computeSfxGainCeilingRecords(repoRoot, ffmpegPath);
  const path = join(repoRoot, SFX_GAIN_CEILING_PATH);
  const temporary = `${path}.${process.pid}.tmp`;
  try {
    writeFileSync(temporary, `${JSON.stringify(records, null, 2)}\n`);
    renameSync(temporary, path);
  } finally {
    rmSync(temporary, { force: true });
  }
  return { path, ceilings: ceilingsFromRecords(records) };
}

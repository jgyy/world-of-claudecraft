// src/sim/saved_pos_exit.ts: where a durable save resolves on rejoin, and the
// zone id the character list labels each roster row with. The rule used to be
// inline in Sim.addPlayer; extracting it lets the server read the SAME rule, so
// the roster's zone can never disagree with where the character actually lands.
import { describe, expect, it } from 'vitest';
import { DELVE_LIST, DUNGEON_LIST, zoneAt } from '../src/sim/data';
import { resolveSavedPosExit, savedZoneId } from '../src/sim/saved_pos_exit';

// Live band coordinates (data.ts): the instance plane starts at INSTANCE_X_BASE
// 99400 with dungeon 0 (Hollow Crypt) at 100100, the delve band from 104173
// (delve 1, Drowned Litany, at 104823), the battleground band from 129400.
const INSIDE_HOLLOW_CRYPT = { x: 100100, z: 0 };
const INSIDE_DROWNED_LITANY = { x: 104823, z: 0 };
const INSIDE_BATTLEGROUND = { x: 129410, z: 0 };
const LEGACY_SUNKEN_BASTION = { x: 1500, z: 0 };
const OVERWORLD = { x: 12, z: 300 };

const door = (d: { doorPos: { x: number; z: number } }) => ({ x: d.doorPos.x, z: d.doorPos.z - 4 });

describe('resolveSavedPosExit', () => {
  it('keeps an overworld save where it is, with no instance exemption', () => {
    expect(resolveSavedPosExit(OVERWORLD)).toEqual({ pos: { x: 12, z: 300 }, instanceExit: false });
  });

  it('returns no position for a missing save (world start)', () => {
    expect(resolveSavedPosExit(null)).toEqual({ pos: null, instanceExit: false });
    expect(resolveSavedPosExit(undefined)).toEqual({ pos: null, instanceExit: false });
  });

  it('ejects a dungeon save to that dungeon door', () => {
    const crypt = DUNGEON_LIST.find((d) => d.id === 'hollow_crypt');
    if (!crypt) throw new Error('fixture dungeon missing');
    expect(resolveSavedPosExit(INSIDE_HOLLOW_CRYPT)).toEqual({
      pos: door(crypt),
      instanceExit: true,
    });
  });

  it('ejects a delve save to that delve door, never a dungeon door', () => {
    const litany = DELVE_LIST.find((d) => d.id === 'drowned_litany');
    if (!litany) throw new Error('fixture delve missing');
    const r = resolveSavedPosExit(INSIDE_DROWNED_LITANY);
    expect(r).toEqual({ pos: door(litany), instanceExit: true });
    // The delve band sits past the dungeon threshold, so a wrong branch order
    // would send it to DUNGEON_LIST[0]'s door instead.
    expect(r.pos).not.toEqual(door(DUNGEON_LIST[0]));
  });

  it('drops a mid-match battleground save to the world start', () => {
    expect(resolveSavedPosExit(INSIDE_BATTLEGROUND)).toEqual({ pos: null, instanceExit: false });
  });

  it('resolves a pre-move legacy instance save to its door as an instance exit', () => {
    const bastion = DUNGEON_LIST.find((d) => d.id === 'sunken_bastion');
    if (!bastion) throw new Error('fixture dungeon missing');
    expect(resolveSavedPosExit(LEGACY_SUNKEN_BASTION)).toEqual({
      pos: door(bastion),
      instanceExit: true,
    });
  });

  it("does not alias the caller's position object", () => {
    const saved = { ...OVERWORLD };
    const r = resolveSavedPosExit(saved);
    expect(r.pos).not.toBe(saved);
  });
});

describe('savedZoneId', () => {
  it('is the zone of an overworld save', () => {
    expect(savedZoneId(OVERWORLD)).toBe('mirefen_marsh');
    expect(savedZoneId({ x: 0, z: 0 })).toBe('eastbrook_vale');
    expect(savedZoneId(OVERWORLD)).toBe(zoneAt(OVERWORLD.x, OVERWORLD.z).id);
  });

  it('is the door zone for an instance save (the character is not "in" a dungeon)', () => {
    expect(savedZoneId(INSIDE_HOLLOW_CRYPT)).toBe('eastbrook_vale');
    expect(savedZoneId(INSIDE_DROWNED_LITANY)).toBe('mirefen_marsh');
    expect(savedZoneId(LEGACY_SUNKEN_BASTION)).toBe('mirefen_marsh');
  });

  it('is null for a battleground save and for no save at all', () => {
    expect(savedZoneId(INSIDE_BATTLEGROUND)).toBeNull();
    expect(savedZoneId(null)).toBeNull();
    expect(savedZoneId(undefined)).toBeNull();
  });
});

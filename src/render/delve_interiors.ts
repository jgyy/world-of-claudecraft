// Delve module interior placement: reuses the crypt KayKit kit but builds each
// module's OWN delve layout and a per-module ember-themed dressing variant.
// Also owns the residency bookkeeping for the module-interior pool (below):
// which keys the renderer's shared builtInteriors/pendingInteriors sets are
// scoped to, and when a slot's previous occupant must be retired.
import type * as THREE from 'three';
import { DELVE_MODULES, delveModuleZOffset } from '../sim/data';
import { DELVE_MODULE_LAYOUTS, type DelveModuleId } from '../sim/delve_layout';
import {
  delveModuleInteriorKey,
  delveModuleOrderKey,
  isDelveSlotInteriorKey,
  shouldRetireDelveSlot,
} from './delve_interior_residency_core';
import type { DungeonInteriors, DungeonInteriorVariant } from './dungeon';
import { ensureDelveInteriorKit } from './interior_kit';

// Each reliquary module dresses the shared crypt kit differently (ossuary
// shelves, handbell alcoves, defaced saint colonnade, the boss bell-chamber).
const DELVE_MODULE_VARIANT: Record<DelveModuleId, DungeonInteriorVariant> = {
  reliquary_sunken_ossuary: 'delve_ossuary',
  reliquary_bell_niche: 'delve_bell',
  reliquary_saintless_hall: 'delve_hall',
  reliquary_finale: 'delve_finale',
  // Drowned Litany (Phase 2): marsh-ruin dressing. The six trash modules light
  // with sickly bog-green flame (delve_marsh, ossuary-style wet shelves over
  // cracked flags); the apse is the raised boss stage under a colder corpse-glow.
  litany_sluice: 'delve_marsh',
  litany_ledger: 'delve_marsh',
  litany_ring: 'delve_marsh',
  litany_baptistry: 'delve_marsh',
  litany_choir_loft: 'delve_marsh',
  litany_causeway: 'delve_marsh',
  litany_apse: 'delve_marsh_apse',
};

/** Build one delve module at a world origin (crypt KayKit kit + that module's delve layout).
 * Returns the built group so the caller can retire it: delve slots are a fixed,
 * server-wide pool (DELVE_SLOT_COUNT) reused by a new party's run once the prior
 * one ends, and each fresh run re-shuffles its module order (pickDelveModules),
 * so the SAME world origin band can hold a DIFFERENT module's geometry on the
 * next occupant. An untracked, never-retired build leaves the previous
 * occupant's rooms (walls, Blackwater pools, dry islands) parked at that origin
 * forever, stacked under or beside whatever the new run built there. */
export function buildDelveModule(
  dungeons: DungeonInteriors,
  moduleId: DelveModuleId,
  ox: number,
  oz: number,
): Promise<THREE.Group> {
  const mod = DELVE_MODULES[moduleId];
  const interior = mod?.interior ?? 'crypt';
  // Pass the module's own layout so visible geometry matches the collision set
  // sim/colliders.ts derives from the SAME layout. Falling back to the interior
  // default (CRYPT_LAYOUT) was the source of the drifting walls/floor and the
  // out-of-map gaps between modules. The 'delve' variant gives ember-red torches
  // with per-module reliquary dressing.
  const layout = DELVE_MODULE_LAYOUTS[moduleId];
  const variant = DELVE_MODULE_VARIANT[moduleId] ?? 'delve_ossuary';
  // Static Blackwater hazard pools (The Drowned Litany) are authored on the module
  // def; the renderer draws a visible pool at each so the sim's damage zone reads.
  return dungeons.buildInterior(interior, ox, oz, {
    layout,
    variant,
    hazards: mod?.hazards,
    moduleId,
  });
}

// ---------------------------------------------------------------------------
// Residency: the renderer owns the actual Set/Map instances (builtInteriors
// and pendingInteriors are shared with the arena/rift/dungeon interior
// classes too), the functions below own the DELVE-specific bookkeeping over
// them, so the orchestration lives beside the module builder it drives
// instead of growing renderer.ts's coordinator body.
// ---------------------------------------------------------------------------

function scheduleDelveModuleBuild(
  builtInteriors: Set<string>,
  pendingInteriors: Set<string>,
  delveInteriorGroups: Map<string, THREE.Group>,
  dungeons: DungeonInteriors,
  key: string,
  moduleId: DelveModuleId,
  ox: number,
  oz: number,
  onBuildFailed?: (moduleId: DelveModuleId, ox: number, oz: number, err: unknown) => void,
): void {
  if (builtInteriors.has(key) || pendingInteriors.has(key)) return;
  pendingInteriors.add(key);
  void buildDelveModule(dungeons, moduleId, ox, oz)
    .then((group) => {
      delveInteriorGroups.set(key, group);
      builtInteriors.add(key);
      pendingInteriors.delete(key);
    })
    .catch((err) => {
      pendingInteriors.delete(key);
      onBuildFailed?.(moduleId, ox, oz, err);
    });
}

/** Build every module in a delve run at its stacked z offset (parallel async). */
function buildAllDelveModules(
  builtInteriors: Set<string>,
  pendingInteriors: Set<string>,
  delveInteriorGroups: Map<string, THREE.Group>,
  dungeons: DungeonInteriors,
  delveId: string,
  slot: number,
  origin: { x: number; z: number },
  modules: readonly DelveModuleId[],
  onBuildFailed?: (moduleId: DelveModuleId, ox: number, oz: number, err: unknown) => void,
): void {
  void ensureDelveInteriorKit().catch(() => undefined);
  for (let mi = 0; mi < modules.length; mi++) {
    const moduleId = modules[mi];
    const key = delveModuleInteriorKey(delveId, slot, moduleId);
    if (builtInteriors.has(key) || pendingInteriors.has(key)) continue;
    const zOff = delveModuleZOffset(modules, mi);
    scheduleDelveModuleBuild(
      builtInteriors,
      pendingInteriors,
      delveInteriorGroups,
      dungeons,
      key,
      moduleId,
      origin.x,
      origin.z + zOff,
      onBuildFailed,
    );
  }
}

/** Retire every built/pending interior group for one delve slot (a prior
 * occupant's run), so the next occupant's DIFFERENTLY-ordered module chain
 * never finds a stale key and skips rebuilding at its own z-stacked origin. */
function retireDelveSlotInteriors(
  builtInteriors: Set<string>,
  pendingInteriors: Set<string>,
  delveInteriorGroups: Map<string, THREE.Group>,
  delveId: string,
  slot: number,
  retireGroup: (group: THREE.Group) => void,
): void {
  for (const [key, group] of delveInteriorGroups) {
    if (!isDelveSlotInteriorKey(key, delveId, slot)) continue;
    retireGroup(group);
    delveInteriorGroups.delete(key);
  }
  for (const key of [...builtInteriors]) {
    if (isDelveSlotInteriorKey(key, delveId, slot)) builtInteriors.delete(key);
  }
  for (const key of [...pendingInteriors]) {
    if (isDelveSlotInteriorKey(key, delveId, slot)) pendingInteriors.delete(key);
  }
}

/** Everything the renderer needs to track delve interior residency, owned by
 * the caller (Renderer) so the shared builtInteriors/pendingInteriors sets
 * stay reachable from the arena/rift/plain-dungeon interior paths too. */
export interface DelveInteriorResidency {
  builtInteriors: Set<string>;
  pendingInteriors: Set<string>;
  delveInteriorGroups: Map<string, THREE.Group>;
  delveSlotModuleKey: Map<string, string>;
}

/** Prebuild the full module stack when a delve run starts (offline + online).
 * Fires on every 'delveEntered' event, including a party member simply
 * REJOINING a run already in progress, so a module-order comparison gates
 * the retirement: only a genuinely new claim on this slot (a different run,
 * re-shuffled by pickDelveModules) invalidates the previous build. */
export function prebuildDelveModuleResidency(
  residency: DelveInteriorResidency,
  dungeons: DungeonInteriors,
  delveId: string,
  run: {
    delveId: string;
    slot: number;
    origin: { x: number; z: number };
    modules: readonly string[];
  },
  retireGroup: (group: THREE.Group) => void,
  onBuildFailed?: (moduleId: DelveModuleId, ox: number, oz: number, err: unknown) => void,
): void {
  const slotKey = `${delveId}:${run.slot}`;
  const orderKey = delveModuleOrderKey(run.modules);
  if (shouldRetireDelveSlot(residency.delveSlotModuleKey.get(slotKey), orderKey)) {
    retireDelveSlotInteriors(
      residency.builtInteriors,
      residency.pendingInteriors,
      residency.delveInteriorGroups,
      delveId,
      run.slot,
      retireGroup,
    );
    residency.delveSlotModuleKey.set(slotKey, orderKey);
  }
  buildAllDelveModules(
    residency.builtInteriors,
    residency.pendingInteriors,
    residency.delveInteriorGroups,
    dungeons,
    delveId,
    run.slot,
    run.origin,
    run.modules as DelveModuleId[],
    onBuildFailed,
  );
}

/** Build every module reachable from the given delve module chain near a
 * world position, one instance-slot proximity gate (ensureDelveInteriorsNear
 * in renderer.ts): the streaming counterpart to prebuildDelveModuleResidency. */
export function buildDelveModulesInSlot(
  residency: DelveInteriorResidency,
  dungeons: DungeonInteriors,
  delveId: string,
  slot: number,
  origin: { x: number; z: number },
  modules: readonly DelveModuleId[],
  onBuildFailed?: (moduleId: DelveModuleId, ox: number, oz: number, err: unknown) => void,
): void {
  buildAllDelveModules(
    residency.builtInteriors,
    residency.pendingInteriors,
    residency.delveInteriorGroups,
    dungeons,
    delveId,
    slot,
    origin,
    modules,
    onBuildFailed,
  );
}

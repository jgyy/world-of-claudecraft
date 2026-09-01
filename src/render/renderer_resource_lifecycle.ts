import { uninstallOccluderFadeGate } from './occluder_fade_gate';

export interface RendererDisposable {
  dispose(): void;
}

export interface RendererPrewarmAndGroundFxOwner<T extends RendererDisposable> {
  prewarmDepthMaterials: Map<string, T>;
  mageGroundFx?: RendererDisposable;
  warlockMeteorFx?: RendererDisposable;
  vfx?: RendererDisposable;
  abilityVfxFx?: RendererDisposable;
}

/**
 * Dispose the renderer-owned prewarm depth materials and ground VFX independently.
 * The renderer passes itself because these resource fields are private.
 */
export function disposeRendererPrewarmAndGroundFx(
  owner: object,
  bestEffort: (cleanup: () => void) => void,
): void {
  const resources = owner as RendererPrewarmAndGroundFxOwner<RendererDisposable>;
  for (const material of resources.prewarmDepthMaterials.values())
    bestEffort(() => material.dispose());
  resources.prewarmDepthMaterials.clear();
  bestEffort(() => resources.mageGroundFx?.dispose());
  bestEffort(() => resources.warlockMeteorFx?.dispose());
  bestEffort(() => resources.abilityVfxFx?.dispose());
  bestEffort(() => resources.vfx?.dispose());
  // The occluder-fade gate and its twins were linked on this renderer's
  // context; a later renderer installs its own (occluder_fade_gate.ts).
  bestEffort(() => uninstallOccluderFadeGate());
}

export interface RendererWorldViewsOwner {
  terrainView?: RendererDisposable;
  waterView?: RendererDisposable;
  underwaterView?: RendererDisposable;
}

/**
 * Dispose the renderer-owned world-subsystem views (terrain, water,
 * underwater) independently. Without this, a graphics-preset rebuild
 * (electron/main.cjs's context recycle path; see GitHub issue #3750)
 * silently retains every resident terrain chunk, the water simulation, and
 * the underwater overlay's geometry and materials on the JS heap: nothing
 * else in the renderer's teardown ever calls their dispose() methods, so a
 * rebuild permanently steps up memory instead of returning to its pre-rebuild
 * floor. The renderer passes itself because these resource fields are
 * private. Props/foliage are deliberately NOT included here: unlike these
 * three, their geometries and materials are drawn from the shared GLB-cache
 * (`assets/loader.ts`), and disposing a cached resource that another
 * consumer still reads would corrupt live rendering elsewhere; releasing
 * them safely needs its own per-subsystem accounting, tracked separately.
 */
export function disposeRendererWorldViews(
  owner: object,
  bestEffort: (cleanup: () => void) => void,
): void {
  const resources = owner as RendererWorldViewsOwner;
  bestEffort(() => resources.terrainView?.dispose());
  bestEffort(() => resources.waterView?.dispose());
  bestEffort(() => resources.underwaterView?.dispose());
}

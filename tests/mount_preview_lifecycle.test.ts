// The mount preview's GL lifecycle (src/render/mount_preview.ts) and the
// controller's re-target contract (src/ui/mount_inspect_controller.ts), pinned
// as source text the way tests/armory_preview_lifecycle.test.ts pins the Armory
// rig: no GL context exists under Vitest, so the shape of the code is the
// evidence. Every pin is a literal substring of the current source.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const preview = readFileSync(new URL('../src/render/mount_preview.ts', import.meta.url), 'utf8');
const controller = readFileSync(
  new URL('../src/ui/mount_inspect_controller.ts', import.meta.url),
  'utf8',
);

/** The body of a named top-level-ish function, from its header to the next
 *  function keyword at the same indentation (enough for a substring pin). */
function slice(source: string, from: string, to: string): string {
  const start = source.indexOf(from);
  expect(start, `anchor missing: ${from}`).toBeGreaterThanOrEqual(0);
  const end = source.indexOf(to, start + from.length);
  expect(end, `anchor missing after ${from}: ${to}`).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe('mount preview lifecycle', () => {
  it('links and uploads the stage before it is shown', () => {
    const prepare = slice(preview, 'async function prepareStage(', 'function dropMount(');
    expect(prepare).toContain('stage.visible = false;');
    const upload = prepare.indexOf('await uploadTexturesInSlices(');
    const compile = prepare.indexOf('await renderer.compileAsync(scene, camera);');
    const visible = prepare.indexOf('stage.visible = true;');
    expect(upload).toBeGreaterThan(0);
    expect(compile).toBeGreaterThan(upload);
    expect(visible).toBeGreaterThan(compile);
    // The stage never becomes visible before both steps.
    expect(prepare.slice(0, compile)).not.toContain('stage.visible = true');
  });

  it('draws only after the compile step, in source order', () => {
    const compile = preview.indexOf('renderer.compileAsync(scene, camera)');
    const render = preview.indexOf('renderer.render(');
    expect(compile).toBeGreaterThan(0);
    expect(render).toBeGreaterThan(compile);
  });

  it('runs no hidden animation loop', () => {
    expect(preview).toContain('if (disposed || !active) return;');
  });

  it('dispose invalidates in-flight builds and reclaims the GL context', () => {
    const dispose = slice(preview, 'dispose(): void {', 'untrack();');
    expect(dispose).toContain('disposed = true;');
    expect(dispose).toContain('buildGeneration++;');
    expect(dispose).toContain('renderer.dispose();');
    expect(dispose).toContain('renderer.forceContextLoss();');
    expect(preview.slice(preview.indexOf('dispose(): void {'))).toContain('untrack();');
  });

  it('disposes a rig that arrives after a re-target or close', () => {
    const arrival = slice(preview, 'if (disposed || generation !== buildGeneration) {', 'return;');
    expect(arrival).toContain('visual?.dispose();');
  });

  it('parks the rider by position in mount-only mode, never by visibility', () => {
    expect(preview).toContain('const RIDER_PARK_Y = -1000;');
    expect(preview).toContain('rider.root.position.set(0, RIDER_PARK_Y, 0);');
    expect(preview).not.toContain('rider.root.visible');
  });

  it('releases the context and returns null when construction throws', () => {
    const create = slice(
      preview,
      'export function createMountPreview(',
      'function buildMountPreview(',
    );
    expect(create).toContain('): MountPreviewHandle | null {');
    expect(create).toContain('try {');
    expect(create).toContain('} catch (err) {');
    const failure = create.slice(create.indexOf('} catch (err) {'));
    expect(failure).toContain('renderer.forceContextLoss();');
    expect(failure).toContain('untrack();');
    expect(failure).toContain('return null;');
  });
});

describe('mount inspect controller lifecycle', () => {
  it('re-targets through detachOverlay, keeping the stage and its context', () => {
    const open = slice(controller, 'open(skinId: string): void {', 'refresh(): void {');
    expect(open).toContain('if (wasOpen) this.detachOverlay();');
    expect(open).not.toContain('hideOverlay(false)');
    expect(open).not.toContain('.dispose()');
  });

  it('disposes the preview only on hide', () => {
    const detach = slice(controller, 'private detachOverlay(): void {', 'private hideOverlay(');
    expect(detach).not.toContain('dispose');
    const hide = slice(controller, 'private hideOverlay(', 'private syncToggles(');
    expect(hide).toContain('this.preview?.dispose();');
    expect(hide).toContain('this.preview = null;');
    expect(hide).toContain('this.detachOverlay();');
    expect(hide).toContain('this.stage = null;');
  });
});

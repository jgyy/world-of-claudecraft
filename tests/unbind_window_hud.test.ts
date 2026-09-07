// Source pins over the Hud's Maker's Bond integration (the
// train_window_hud.test.ts style: the wiring lives in the hud.ts coordinator,
// so these pin the load-bearing snippets instead of booting the whole Hud):
//  - the unbindResult event arm logs exactly one localized line per outcome,
//    with NO banner/toast/audio (the trainResult single-surface rule), maps
//    every deny reason to ITS OWN key, and repaints the unbind window + bags
//    (the single-copy unbind clears boundTo in place with no loot event);
//  - the commission opt-in is a ONE-SHOT per-craft Set: onCraft consumes via
//    delete (a regression to has() would arm EVERY later craft), the checkbox
//    reads via has, and closing the crafting window clears every armed row;
//  - the unbind window wires gossip -> openUnbind and the fee-confirm dialog
//    to the IWorld seam (sim.unbindItem), never deciding the outcome locally;
//  - both HTML entries declare the #unbind-window container.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const hudSource = readFileSync(resolve(__dirname, '../src/ui/hud.ts'), 'utf8');

function unbindResultArm(): string {
  const start = hudSource.indexOf("case 'unbindResult': {");
  // The arm sits between trainResult and masterwork in drainEvents; slicing
  // to the NEXT case keeps the single-surface pins scoped to this arm alone
  // (a future arm inserted between them must update this anchor).
  // The Soul Key arm (its sibling counter service) follows it directly.
  const end = hudSource.indexOf("case 'soulKeyResult': {", start);
  expect(start, 'unbindResult case arm present in handleEvents').toBeGreaterThan(-1);
  expect(end, 'unbindResult arm precedes the soulKeyResult arm').toBeGreaterThan(start);
  // Comments stripped from the slice (`://` protocol slashes preserved), the
  // repo's raw-source-pin idiom (the codeOnly helper in
  // tests/professions_silent_loot.test.ts). This arm's whole subject is what
  // it deliberately does NOT do, so the odds of a future comment NAMING a cue
  // or a toast here are high, and it would turn the negative pins below red
  // for the wrong reason; on the other side a commented-out key would satisfy
  // the positive pins.
  return hudSource
    .slice(start, end)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

describe('hud.ts unbindResult event arm (source pins)', () => {
  // The copy itself (the ok line, the reason-to-key pairing, the text-free
  // item name and locally formatted fee, the silent reason-less deny) lives in
  // src/ui/counter_service_lines.ts unbindResultLine and is pinned
  // behaviorally in tests/soul_key_ui.test.ts; the arm here is glue.
  it('logs exactly the one line the builder returns', () => {
    const arm = unbindResultArm();
    expect(arm).toContain('unbindResultLine(ev)');
    expect(arm).toContain('if (line) this.log(line.text, line.color);');
  });

  it('stays single-surface: chat log only, no banner, toast, or audio cue in the arm', () => {
    const arm = unbindResultArm();
    expect(arm.match(/this\.log\(/g)?.length, 'exactly the one log call site').toBe(1);
    // ALLOWLIST, not a blocklist (see the history in git: every enumeration
    // of the out-of-chat idioms was one short of the next one added). The
    // arm's entire method surface is the chat line and the two repaints, and
    // #2458 made "one chat line and nothing else" the load-bearing contract
    // on BOTH unbind arms, so anything a contributor adds here has to show
    // up in this list and be argued for by name.
    const selfCalls = [...new Set(arm.match(/\bthis\.\w+\(/g) ?? [])].sort();
    expect(selfCalls, 'the arm calls nothing but the chat line and the two repaints').toEqual([
      'this.log(',
      'this.renderBags(',
      'this.renderUnbind(',
    ]);
    expect(arm).not.toMatch(/\b(audio|sfx|voice)\.\w+\(/);
  });

  it('repaints the open unbind window AND the open bags (no loot event repaints for us)', () => {
    const arm = unbindResultArm();
    expect(arm).toContain('this.renderUnbind();');
    expect(arm).toContain('this.renderBags();');
    expect(arm).toContain("$('#unbind-window').style.display === 'block'");
    expect(arm).toContain("$('#bags').style.display !== 'none'");
  });
});

describe('hud.ts commission opt-in state contract (source pins)', () => {
  it('onCraft consumes the opt-in as a ONE-SHOT delete, never a persistent read', () => {
    // The load-bearing line: delete() both reads AND clears the armed flag,
    // so the checkbox arms exactly one craft. A regression to has() would
    // silently arm every subsequent craft of that recipe and no sim-side pin
    // could catch it (the sim honors whatever flag arrives).
    expect(hudSource).toContain('const commission = this.craftCommissionOptIn.delete(recipeId);');
    expect(hudSource).toContain(
      'this.sim.craftItem(recipeId, commission, Math.max(1, Math.floor(count)));',
    );
  });

  it('the checkbox paints from has() and toggles through add/delete', () => {
    expect(hudSource).toContain(
      'commissionChecked: (recipeId) => this.craftCommissionOptIn.has(recipeId)',
    );
    expect(hudSource).toContain('if (on) this.craftCommissionOptIn.add(recipeId);');
    expect(hudSource).toContain('else this.craftCommissionOptIn.delete(recipeId);');
  });

  it('closing the crafting window drops every armed checkbox (the off-by-default rule)', () => {
    const start = hudSource.indexOf('closeCrafting(): void {');
    expect(start).toBeGreaterThan(-1);
    // Anchor on the METHOD BODY (brace depth), not a fixed byte count: a
    // fixed slice went stale the moment closeCrafting grew unrelated lines.
    let depth = 0;
    let end = start;
    for (let i = hudSource.indexOf('{', start); i < hudSource.length; i++) {
      if (hudSource[i] === '{') depth++;
      else if (hudSource[i] === '}') {
        depth--;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }
    const arm = hudSource.slice(start, end);
    expect(arm).toContain('this.craftCommissionOptIn.clear();');
  });
});

describe('hud.ts unbind window wiring (source pins)', () => {
  it('gossip routes to openUnbind and the confirm dialog sends the command to the seam', () => {
    expect(hudSource).toContain('openUnbind: (npcId) => this.openUnbind(npcId)');
    expect(hudSource).toContain("this.closeOtherWindows('#unbind-window')");
    expect(hudSource).toContain("t('hudChrome.unbind.confirmTitle')");
    expect(hudSource).toContain('() => this.sim.unbindItem(itemId),');
  });
});

describe('#unbind-window container exists in both HTML entries', () => {
  it('index.html and play.html both declare the unbind window panel', () => {
    for (const entry of ['index.html', 'play.html']) {
      const html = readFileSync(resolve(__dirname, '..', entry), 'utf8');
      expect(html, entry).toContain('id="unbind-window"');
      const tag = html.match(/<div[^>]*id="unbind-window"[^>]*>/)?.[0] ?? '';
      expect(tag, `${entry} unbind window is a .window.panel container`).toMatch(
        /class="[^"]*window[^"]*panel[^"]*"/,
      );
    }
  });
});

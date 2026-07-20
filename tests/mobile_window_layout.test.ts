import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const mobileCss = readFileSync(
  new URL('../src/styles/hud.mobile.css', import.meta.url),
  'utf8',
).replace(/\r\n/g, '\n');

describe('mobile window layout CSS', () => {
  it('clamps generic mobile windows to the app viewport and reserves bottom padding', () => {
    const start = mobileCss.indexOf('body.mobile-touch .window {');
    expect(start).toBeGreaterThan(0);
    const block = mobileCss.slice(start, mobileCss.indexOf('}', start));
    expect(block).toContain(
      'max-width: calc(var(--app-vw, 100vw) / var(--window-scale, 1) - 20px);',
    );
    expect(block).toContain(
      'padding-bottom: max(var(--window-pad), calc(18px + env(safe-area-inset-bottom)));',
    );
  });

  it('does not keep the old cramped mobile 100vw minus 170px window width', () => {
    expect(mobileCss).not.toContain('calc(100vw - 170px)');
    expect(mobileCss).toContain(
      'width: min(430px, calc(var(--app-vw) / var(--ui-scale, 1) - 20px));',
    );
    expect(mobileCss).toContain(
      'width: min(560px, calc(var(--app-vw) / var(--ui-scale, 1) - 20px));',
    );
  });

  it('keeps mobile tab and filter rows scrollable instead of clipping labels', () => {
    expect(mobileCss).toMatch(
      /body\.mobile-touch \.bag-chips \{[^}]*flex-wrap: nowrap;[^}]*overflow-x: auto;/,
    );
    expect(mobileCss).toMatch(
      /body\.mobile-touch #social-window \.soc-tabs \{[^}]*flex-wrap: nowrap;[^}]*overflow-x: auto;/,
    );
  });

  it('collapses the char window landscape info-grid back to one column on mobile', () => {
    expect(mobileCss).toMatch(
      /body\.mobile-touch #char-window \.char-info-grid \{[^}]*columns: auto;/,
    );
  });

  it('keeps the char model panel at its pre-widening 172px floor on portrait mobile, not the desktop landscape 340px', () => {
    // Desktop's #char-window .char-model-panel min-height: 340px (components.css) is sized
    // for the wide two-equip-column paperdoll row; without this portrait override it would
    // roughly double the panel's height on a phone held upright and push the stats/
    // progression blocks a full extra screen down.
    const baseStart = mobileCss.indexOf('body.mobile-touch #char-window .char-model-panel {');
    expect(baseStart).toBeGreaterThan(0);
    const baseBlock = mobileCss.slice(baseStart, mobileCss.indexOf('}', baseStart));
    expect(baseBlock).toContain('min-height: 172px;');

    // The landscape media query re-declares the same selector afterward with its own
    // tighter sizing, which must still win in landscape via source order.
    const landscapeStart = mobileCss.indexOf(
      'body.mobile-touch #char-window .char-model-panel {',
      baseStart + 1,
    );
    expect(landscapeStart).toBeGreaterThan(baseStart);
    const landscapeBlock = mobileCss.slice(landscapeStart, mobileCss.indexOf('}', landscapeStart));
    expect(landscapeBlock).toContain('min-height: 132px;');
  });

  it('keeps the mobile char-stats overflow guard reaching nested .cp-stats blocks (talent summary, progression, gathering), not just the top-level info-grid child', () => {
    // Regression guard: an earlier narrowing pass changed this rule's selector to
    // `#char-window > .char-info-grid > .char-stats`, which only matches the top-level
    // stats block and stops matching `.char-stats.cp-stats` nested inside the talent
    // summary (src/ui/hud.ts), progression (src/ui/hud.ts), and gathering
    // (src/ui/char_window.ts) panels. Those panels rely on this rule's grid columns,
    // max-width/box-sizing/overflow-x guard, and the stat-cell min-width/overflow-wrap
    // guard to avoid clipped text on long profession/spec/mastery names on mobile.
    expect(mobileCss).toMatch(
      /body\.mobile-touch #char-window \.char-stats \{[^}]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);[^}]*max-width: 100%;[^}]*box-sizing: border-box;[^}]*overflow-x: hidden;/,
    );
    expect(mobileCss).toMatch(
      /body\.mobile-touch #char-window \.char-stats \.stat-cell \{[^}]*min-width: 0;[^}]*max-width: 100%;[^}]*margin-inline: 0;[^}]*overflow-wrap: anywhere;/,
    );
    // The margin-top rule stays scoped to the top-level block only.
    expect(mobileCss).toMatch(
      /body\.mobile-touch #char-window > \.char-info-grid > \.char-stats \{[^}]*margin-top: 6px;/,
    );
  });

  it('sizes the mobile map from the app viewport so zoom controls do not dominate it', () => {
    const start = mobileCss.indexOf('body.mobile-touch #map-window {');
    expect(start).toBeGreaterThan(0);
    const block = mobileCss.slice(start, mobileCss.indexOf('}', start));
    expect(block).toContain('width: min(330px, calc(var(--app-vw) / var(--ui-scale, 1) - 32px));');
    expect(block).toContain('max-width: calc(var(--app-vw) / var(--ui-scale, 1) - 32px);');
  });

  it('shows all three mobile specializations in one compact grid without horizontal drag', () => {
    expect(mobileCss).not.toMatch(/body\.mobile-touch #talents-window \{[^}]*column-count: 2;/);
    expect(mobileCss).toMatch(
      /body\.mobile-touch #talents-window \{[^}]*width: min\(620px,[^}]*transform: translate\(-50%, -50%\);[^}]*overflow-x: hidden;/,
    );
    expect(mobileCss).toMatch(
      /body\.mobile-touch #talents-window \.ts-specs-grid \{[^}]*display: grid;[^}]*grid-template-columns: repeat\(3, minmax\(0, 1fr\)\);/,
    );
    expect(mobileCss).not.toMatch(
      /body\.mobile-touch #talents-window \.ts-specs-grid \{[^}]*flex-direction: column;/,
    );
    expect(mobileCss).toMatch(
      /body\.mobile-touch #talents-window \.ts-panel \{[^}]*min-height: 150px;/,
    );
  });

  it('places the Claudium wallet card beside the balance in mobile landscape', () => {
    expect(mobileCss).toContain(`@media (orientation: landscape) {
    body.mobile-touch #claudium-window .cl-body:has(> .cl-wallet-connect) {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      align-items: stretch;
      gap: 10px;
    }`);
    expect(mobileCss).toContain(`body.mobile-touch
      #claudium-window
      .cl-body:has(> .cl-wallet-connect)
      > :not(.cl-balance, .cl-wallet-connect) {
      grid-column: 1 / -1;
    }`);
    expect(mobileCss).toContain(`body.mobile-touch #claudium-window .cl-wallet-connect {
      margin-top: 0;
    }`);
  });
});

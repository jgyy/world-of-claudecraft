// Regression test for the misleading landing-page player count: the "Online" realm
// option and the /play online status line showed accounts_created (a lifetime total
// of every account ever registered) under a label that read "Players", right next to
// the green "Online" dot, implying that many players were concurrently online. The
// fix rebinds that element to the live players_online count and its matching,
// already-translated "Players Online" label. Pinned as source greps (matching this
// suite's existing style, e.g. tests/play_online_only.test.ts) since loadProjectStats
// lives inside the src/main.ts coordinator, not an extractable pure module.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (p: string) =>
  readFileSync(new URL(`../${p}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const indexHtml = read('index.html');
const playHtml = read('play.html');
const mainTs = read('src/main.ts');

describe('landing/play online stat shows live players, not lifetime accounts', () => {
  it('index.html and play.html label the stat "Players Online", not "Players"', () => {
    for (const html of [indexHtml, playHtml]) {
      expect(html).toContain('js-stat-players-online');
      expect(html).toContain('data-i18n="stats.playersOnline"');
      expect(html).not.toContain('js-stat-accounts');
      expect(html).not.toContain('data-i18n="stats.accountsCreated"');
    }
  });

  it('main.ts binds the stat to players_online, not accounts_created', () => {
    expect(mainTs).toContain("querySelectorAll<HTMLElement>('.js-stat-players-online')");
    expect(mainTs).toContain('setAll(accountEls, String(cached.players_online));');
    expect(mainTs).toContain('setAll(accountEls, String(data.players_online));');
  });
});

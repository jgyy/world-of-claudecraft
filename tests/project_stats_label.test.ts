// Regression test: the landing page's "Online" realm option and the /play online
// status line used to show accounts_created (a lifetime total of every account ever
// registered) under a label that read "Players", right next to the green "Online" dot,
// implying that many players were concurrently online. That was fixed once to show the
// real players_online count instead, then removed outright: neither page shows any
// player-count figure at all anymore, only the plain "Online"/"Offline" status. Pinned
// as source greps (matching this suite's existing style, e.g.
// tests/play_online_only.test.ts) since this lives inside the src/main.ts coordinator,
// not an extractable pure module.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (p: string) =>
  readFileSync(new URL(`../${p}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const indexHtml = read('index.html');
const playHtml = read('play.html');
const mainTs = read('src/main.ts');

describe('landing/play pages show no player-count stat', () => {
  it('index.html and play.html carry no player-count element or stats-value class', () => {
    for (const html of [indexHtml, playHtml]) {
      expect(html).not.toContain('js-stat-accounts');
      expect(html).not.toContain('js-stat-players-online');
      expect(html).not.toContain('class="stats-value');
      expect(html).not.toContain('data-i18n="stats.accountsCreated"');
      expect(html).not.toContain('data-i18n="stats.playersOnline"');
    }
  });

  it('main.ts has no project-stats fetch/display wiring', () => {
    expect(mainTs).not.toContain('loadProjectStats');
    expect(mainTs).not.toContain('projectStats()');
    expect(mainTs).not.toContain('accounts_created');
    expect(mainTs).not.toContain('players_online');
  });
});

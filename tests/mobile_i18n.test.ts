import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { en, es, de_DE, ja_JP, ru_RU, fr_FR } from '../src/ui/i18n';

// The touch controls shipped with hard-coded English labels even though the
// rest of the client localizes via `data-i18n`/`data-i18n-aria`. These tests
// guard that every mobile button is wired to an existing i18n key and that the
// `game.mobile` namespace stays shared across locales (the gameStrings alias).

const html = readFileSync(fileURLToPath(new URL('../index.html', import.meta.url)), 'utf8');

function resolve(key: string): unknown {
  return key.split('.').reduce<any>((o, k) => (o == null ? undefined : o[k]), en);
}

// The whole on-screen touch control cluster.
const controls = html.slice(html.indexOf('id="mobile-controls"'), html.indexOf('id="mobile-preflight"'));

describe('mobile control i18n wiring', () => {
  it('gives every touch button a localizable visible label', () => {
    const labels = controls.match(/class="mobile-label"[^>]*>/g) ?? [];
    expect(labels.length).toBe(13);
    for (const tag of labels) {
      expect(tag, `label missing data-i18n: ${tag}`).toMatch(/data-i18n="game\.mobile\./);
    }
  });

  it('localizes the accessible name and hover title of every touch button', () => {
    const buttons = controls.match(/<button class="mobile-btn"[^>]*>/g) ?? [];
    expect(buttons.length).toBe(13);
    for (const tag of buttons) {
      expect(tag, `aria not localized: ${tag}`).toMatch(/data-i18n-aria="game\.mobile\./);
      expect(tag, `title not localized: ${tag}`).toMatch(/data-i18n-title="game\.mobile\./);
    }
  });

  it('resolves every game.mobile.* key referenced in the markup to a non-empty string', () => {
    const keys = new Set(Array.from(controls.matchAll(/data-i18n(?:-aria|-title)?="(game\.mobile\.[^"]+)"/g), (m) => m[1]));
    expect(keys.size).toBeGreaterThanOrEqual(13);
    for (const key of keys) {
      const value = resolve(key);
      expect(typeof value, `unresolved key ${key}`).toBe('string');
      expect((value as string).length).toBeGreaterThan(0);
    }
  });

  it('shares the game.mobile namespace across all locales', () => {
    for (const loc of [es, de_DE, ja_JP, ru_RU, fr_FR]) {
      expect(loc.game.mobile).toBe(en.game.mobile);
    }
  });
});

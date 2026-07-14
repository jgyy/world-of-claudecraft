import { describe, expect, it } from 'vitest';
import type { BoolSettingKey } from '../src/game/settings';
import {
  resolveSettingsBodyClasses,
  SETTINGS_BODY_CLASSES,
} from '../src/game/settings_body_classes';

// Regression for #1889: the second hotbar row (body.show-actionbar2) and the
// other Options-menu body classes were only ever applied from the live Esc-menu
// change handler in main.ts, never re-derived from the STORED setting on a fresh
// load. A player who enabled the secondary action bar, then relogged or reloaded,
// saw it vanish (CSS default is hidden) even though the setting still read true.
describe('resolveSettingsBodyClasses', () => {
  it('reports every registered class enabled when every backing setting is on', () => {
    const result = resolveSettingsBodyClasses(() => true);
    expect(result).toEqual(
      SETTINGS_BODY_CLASSES.map(({ className }) => ({ className, enabled: true })),
    );
  });

  it('reports every registered class disabled when every backing setting is off', () => {
    const result = resolveSettingsBodyClasses(() => false);
    expect(result).toEqual(
      SETTINGS_BODY_CLASSES.map(({ className }) => ({ className, enabled: false })),
    );
  });

  it('resolves the second-hotbar class independently from a per-key setting store', () => {
    const stored: Partial<Record<BoolSettingKey, boolean>> = {
      showSecondaryActionBar: true,
      reduceMotion: false,
    };
    const result = resolveSettingsBodyClasses((key) => stored[key] ?? false);
    const secondBar = result.find((r) => r.className === 'show-actionbar2');
    const motion = result.find((r) => r.className === 'reduce-motion');
    expect(secondBar).toEqual({ className: 'show-actionbar2', enabled: true });
    expect(motion).toEqual({ className: 'reduce-motion', enabled: false });
  });
});

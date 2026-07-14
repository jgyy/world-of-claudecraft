// Pure mapping from persisted boolean settings to the body CSS classes that gate
// their HUD chrome. main.ts applies each one, individually, from its Esc-menu
// change handler; this module is the single source of truth for that key/class
// pairing so a fresh page load (login, relog, or a plain reload) can re-derive
// the SAME classes from storage once at boot instead of only reacting to a live
// toggle. Before this existed, a class like body.show-actionbar2 (the second
// hotbar row, #actionbar2 slots 12..22) stayed at its CSS default of hidden on
// every fresh load even when the stored setting was on, until the player
// re-opened Options and flipped the checkbox again in that session.
//
// DOM-free by design (src/game/CLAUDE.md): takes a getter, returns data, never
// touches `document` itself, so it unit-tests without a DOM.
import type { BoolSettingKey } from './settings';

export interface SettingBodyClass {
  readonly key: BoolSettingKey;
  readonly className: string;
}

export const SETTINGS_BODY_CLASSES: readonly SettingBodyClass[] = [
  { key: 'reduceMotion', className: 'reduce-motion' },
  { key: 'highContrastText', className: 'high-contrast-text' },
  { key: 'frostedPanels', className: 'frosted-panels' },
  { key: 'compactChat', className: 'compact-chat' },
  { key: 'showSecondaryActionBar', className: 'show-actionbar2' },
] as const;

export interface BodyClassState {
  readonly className: string;
  readonly enabled: boolean;
}

/** Resolve the class/enabled pairs to apply to `document.body` from the current
 *  settings store. `getBool` is normally `settings.get.bind(settings)`. */
export function resolveSettingsBodyClasses(
  getBool: (key: BoolSettingKey) => boolean,
): BodyClassState[] {
  return SETTINGS_BODY_CLASSES.map(({ key, className }) => ({
    className,
    enabled: getBool(key),
  }));
}

// Shared "safely JSON.parse a localStorage value" core: every persisted-settings
// module here (keybinds.ts, gamepad_bindings.ts, settings.ts) needs the exact same
// try/catch around JSON.parse(localStorage.getItem(key) ?? 'null'), treating a
// missing key, an unavailable/throwing storage backend, and corrupt JSON alike as
// "nothing stored" rather than a thrown error. This module owns only that parse
// step; each caller keeps its own post-parse shape narrowing (object-vs-array
// exclusion, GameSettings field coercion, etc.) unchanged.

/**
 * Parses the JSON stored at `key` in `localStorage` and returns it as `unknown`,
 * or null when the key is missing, storage is unavailable, or the stored value is
 * not valid JSON. Never throws.
 */
export function parseStoredJson(key: string): unknown {
  try {
    return JSON.parse(localStorage.getItem(key) ?? 'null');
  } catch {
    return null;
  }
}

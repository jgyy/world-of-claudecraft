// Shared resolve-and-validate step for the Capacitor native-plugin bridges under
// src/net/native_*.ts. Every bridge duck-types a plugin off
// window.Capacitor.Plugins.<name>: the Capacitor runtime injects each registered
// native plugin there, and a web build, an old shell, or a plugin that has not
// finished registering all look identical (the key is simply absent), so callers
// treat every non-match the same way and no-op fail-soft.

/** The global-scope shape the duck-typed plugin lookup reads. Callers on `window`
 *  pass `window as unknown as NativePluginScope`; a caller that wants to inject a
 *  scope for tests (see native_ota.ts) can pass any object of this shape. */
export interface NativePluginScope {
  Capacitor?: { Plugins?: Record<string, unknown> };
}

/**
 * Resolve `scope.Capacitor.Plugins[pluginName]` and duck-type-validate that every
 * name in `requiredMethods` is present as a function. Returns the candidate typed
 * as `T` when it matches, otherwise `null` (plugin absent, not an object, or
 * missing a required method) so callers can treat every failure mode the same way.
 */
export function resolveNativePlugin<T>(
  scope: NativePluginScope,
  pluginName: string,
  requiredMethods: readonly (keyof T)[],
): T | null {
  const plugin = scope.Capacitor?.Plugins?.[pluginName];
  if (!plugin || typeof plugin !== 'object') return null;
  const candidate = plugin as Partial<T>;
  for (const method of requiredMethods) {
    if (typeof candidate[method] !== 'function') return null;
  }
  return candidate as T;
}

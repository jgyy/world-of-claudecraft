import { deviceMemoryGbFromBytes, storeDeviceMemoryGb } from '../device_memory_hint';
import { type NativePluginScope, resolveNativePlugin } from './native_plugin';
import { NATIVE_APP } from './online';

// Native device-info bridge (iOS): the WKWebView cannot see the device's RAM
// (no navigator.deviceMemory, masked GPU string), so the shell measures
// ProcessInfo.physicalMemory and this glue caches it via device_memory_hint.ts
// for the NEXT boot's synchronous graphics-profile resolution. Same duck-typed
// plugin access as native_app_update.ts: a web build, an old shell, or a
// missing plugin all no-op fail-soft.

interface NativeDeviceInfoPlugin {
  getMemoryInfo(): Promise<{ physicalMemoryBytes?: number }>;
}

function nativePlugin(): NativeDeviceInfoPlugin | null {
  return resolveNativePlugin<NativeDeviceInfoPlugin>(
    window as unknown as NativePluginScope,
    'NativeDeviceInfo',
    ['getMemoryInfo'],
  );
}

/** Measure once per boot and cache; the value is stable hardware truth, so a
 *  failed or absent bridge simply leaves the previous cache (or no hint). */
export async function primeNativeDeviceMemoryHint(): Promise<void> {
  if (!NATIVE_APP) return;
  const plugin = nativePlugin();
  if (!plugin) return;
  try {
    const info = await plugin.getMemoryInfo();
    const gb = deviceMemoryGbFromBytes(Number(info?.physicalMemoryBytes));
    if (gb !== undefined) storeDeviceMemoryGb(gb);
  } catch {
    // Fail-soft: the hint is an optimization, never a boot dependency.
  }
}

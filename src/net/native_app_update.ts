import { type NativePluginScope, resolveNativePlugin } from './native_plugin';
import { NATIVE_APP } from './online';

export interface NativeUpdateStatus {
  platform: 'android' | 'ios';
  available: boolean;
  currentVersion?: string;
  storeVersion?: string;
  storeUrl?: string;
}

interface NativeAppUpdatePlugin {
  checkForUpdate(opts: { currentVersion: string }): Promise<Partial<NativeUpdateStatus>>;
  openUpdate(opts: { storeUrl?: string }): Promise<void>;
}

function nativePlugin(): NativeAppUpdatePlugin | null {
  return resolveNativePlugin<NativeAppUpdatePlugin>(
    window as unknown as NativePluginScope,
    'NativeAppUpdate',
    ['checkForUpdate', 'openUpdate'],
  );
}

function normalizeStatus(value: Partial<NativeUpdateStatus> | null): NativeUpdateStatus | null {
  if (!value || (value.platform !== 'android' && value.platform !== 'ios')) return null;
  return {
    platform: value.platform,
    available: value.available === true,
    currentVersion: typeof value.currentVersion === 'string' ? value.currentVersion : undefined,
    storeVersion: typeof value.storeVersion === 'string' ? value.storeVersion : undefined,
    storeUrl: typeof value.storeUrl === 'string' ? value.storeUrl : undefined,
  };
}

export async function checkNativeAppUpdate(
  currentVersion: string,
): Promise<NativeUpdateStatus | null> {
  if (!NATIVE_APP) return null;
  const plugin = nativePlugin();
  if (!plugin) return null;
  const status = await plugin.checkForUpdate({ currentVersion });
  return normalizeStatus(status);
}

export async function openNativeAppUpdate(storeUrl?: string): Promise<void> {
  if (!NATIVE_APP) return;
  const plugin = nativePlugin();
  if (!plugin) return;
  await plugin.openUpdate({ storeUrl });
}

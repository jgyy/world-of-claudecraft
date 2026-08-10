import { apiUrl, NATIVE_APP } from '../client_origin';
import { type NativePluginScope, resolveNativePlugin } from './native_plugin';

export interface NativeAttestationProof {
  platform: 'android' | 'ios';
  challengeId: string;
  token: string;
  nonce: string;
}

interface ChallengeResponse {
  challengeId?: unknown;
  nonce?: unknown;
}

interface NativeAttestationPlugin {
  getToken(opts: { nonce: string }): Promise<{ platform?: unknown; token?: unknown }>;
}

function nativePlugin(): NativeAttestationPlugin | null {
  return resolveNativePlugin<NativeAttestationPlugin>(
    window as unknown as NativePluginScope,
    'NativeAttestation',
    ['getToken'],
  );
}

export async function createNativeAttestationProof(
  base: string,
  action: string,
): Promise<NativeAttestationProof | null> {
  if (!NATIVE_APP) return null;
  const plugin = nativePlugin();
  if (!plugin) return null;
  const challengeRes = await fetch(apiUrl('/api/native-attestation/challenge', base), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action }),
  });
  if (!challengeRes.ok) return null;
  const challenge = (await challengeRes.json().catch(() => null)) as ChallengeResponse | null;
  if (typeof challenge?.challengeId !== 'string' || typeof challenge.nonce !== 'string')
    return null;
  const token = await plugin.getToken({ nonce: challenge.nonce });
  if ((token.platform !== 'android' && token.platform !== 'ios') || typeof token.token !== 'string')
    return null;
  return {
    platform: token.platform,
    challengeId: challenge.challengeId,
    token: token.token,
    nonce: challenge.nonce,
  };
}

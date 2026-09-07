// One legendary weapon-proc effect fragment (chain arc / attack slow / dot / hot)
// as localized text. Moved byte-for-byte out of hud.ts (Hud.procEffectText): it
// reads only its argument and t(), so it is a host-agnostic sibling the item
// tooltip's proc block (itemProcBlock) composes.

import { formatNumber, t } from './i18n';
import type { WeaponProcEffectDesc } from './weapon_proc_view';

export function procEffectText(e: WeaponProcEffectDesc): string {
  const n = (v: number | undefined): string => formatNumber(v ?? 0, { maximumFractionDigits: 0 });
  switch (e.kind) {
    case 'chainArc':
      return t('hudChrome.itemProc.chainArc', {
        school: e.school ?? '',
        name: e.name ?? '',
        damage: n(e.damage),
        jumps: n(e.jumps),
      });
    case 'attackSlow':
      return t('hudChrome.itemProc.attackSlow', {
        pct: n(e.slowPct),
        duration: n(e.duration),
      });
    case 'dot':
      return t('hudChrome.itemProc.dot', {
        name: e.name ?? '',
        school: e.school ?? '',
        total: n(e.total),
        duration: n(e.duration),
      });
    case 'hot':
      return t('hudChrome.itemProc.hot', {
        name: e.name ?? '',
        total: n(e.total),
        duration: n(e.duration),
      });
  }
}

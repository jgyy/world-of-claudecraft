// The display-name suffix for a copy carrying a rolled item affix
// (content/item_affixes.ts, src/sim/item_affix_roll.ts): appends the affix's
// own localized suffix to an already-resolved base name, e.g. "Platinum
// Sword" + affixSuffix.bear -> "Platinum Sword of the Bear".
//
// Takes the resolved base name as a plain string rather than an `ItemDef`
// deliberately, so it never touches `itemDisplayName`/`tEntity` (which throw
// on an id with no registered i18n entry in dev/test): callers that already
// have a resolved name (item_instance_tooltip.ts's `defName` parameter) can
// use this on a synthetic fixture just as safely as on a real shipped item.
import { ITEM_AFFIXES } from '../sim/content/item_affixes';
import type { ItemInstancePayload } from '../sim/types';
import { type TranslationKey, t } from './i18n';

/** `baseName` with the rolled affix's suffix appended when `instance.affixId`
 *  names a known affix; `baseName` unchanged for an un-rolled copy or an
 *  affixId the live catalog no longer carries (a retuned pool, never a
 *  reason to throw on someone's saved copy). */
export function affixSuffixedName(baseName: string, instance?: ItemInstancePayload): string {
  const affix = instance?.affixId ? ITEM_AFFIXES[instance.affixId] : undefined;
  return affix ? `${baseName} ${t(affix.nameKey as TranslationKey)}` : baseName;
}

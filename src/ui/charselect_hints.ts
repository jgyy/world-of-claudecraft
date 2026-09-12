// The hint lines under a character-select roster row's level line: the zone
// the character stands in (so the owner can see where every character is
// without logging each one in) and the in-world notice for a character another
// session holds. Pure string builder, no DOM: main.ts drops the markup into
// the row it composes.
import type { CharacterSummary } from '../net/character_summary';
import { tEntity } from './entity_i18n';
import { esc } from './esc';
import { t } from './i18n';

export type CharselectHintSource = Pick<CharacterSummary, 'online' | 'zoneId'>;

/** The localized zone name for a roster row, or null when the server sent no
 *  zone (an older server, or a save that resumes at the world start). */
export function charselectZoneLabel(c: CharselectHintSource): string | null {
  return c.zoneId ? tEntity({ kind: 'zone', id: c.zoneId, field: 'name' }) : null;
}

export function charselectHintsHtml(c: CharselectHintSource): string {
  const zone = charselectZoneLabel(c);
  const zoneHint = zone ? `<span class="char-zone-hint">${esc(zone)}</span>` : '';
  // Online characters explain themselves on their own hint line (below the
  // class) instead of a terse "(in world)" suffix, so the reason for the Take
  // Over button is unmissable.
  const inWorldHint = c.online
    ? `<span class="char-inworld-hint">${esc(t('character.inWorldHint'))}</span>`
    : '';
  return `${zoneHint}${inWorldHint}`;
}

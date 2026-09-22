// The df_list_create frame's untrusted-input parse (server/CLAUDE.md
// module-first: command parsing lives in a host-agnostic module a Vitest
// imports directly, never as a method cluster on GameServer). An activity is
// a string under the 64-character ceiling; tags are at most eight, every one
// a known FinderListingTag, or the frame drops whole (one unknown tag never
// launders into a shorter list the sim did not see).
import { type FinderListingTag, isFinderListingTag } from '../src/sim/content/dungeon_finder';

export interface FinderListingCreateCommand {
  activity: string;
  tags: FinderListingTag[];
}

export function parseFinderListingCreate(msg: {
  activity?: unknown;
  tags?: unknown;
}): FinderListingCreateCommand | null {
  if (typeof msg.activity !== 'string' || msg.activity.length > 64) return null;
  if (!Array.isArray(msg.tags) || msg.tags.length > 8) return null;
  const tags = msg.tags.filter(isFinderListingTag);
  return tags.length === msg.tags.length ? { activity: msg.activity, tags } : null;
}

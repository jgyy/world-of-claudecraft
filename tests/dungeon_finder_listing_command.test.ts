// The df_list_create frame's untrusted-input parse
// (server/dungeon_finder_listing_command.ts), extracted from the game.ts
// dispatch switch: the activity ceiling, the tag count ceiling, and the
// all-or-nothing tag filter (one unknown tag drops the frame whole).
import { describe, expect, it } from 'vitest';
import { parseFinderListingCreate } from '../server/dungeon_finder_listing_command';
import { FINDER_LISTING_TAGS } from '../src/sim/content/dungeon_finder';

const tag = FINDER_LISTING_TAGS[0];

describe('parseFinderListingCreate', () => {
  it('accepts an activity within the ceiling and known tags', () => {
    expect(parseFinderListingCreate({ activity: 'Crucible', tags: [tag] })).toEqual({
      activity: 'Crucible',
      tags: [tag],
    });
    expect(parseFinderListingCreate({ activity: 'x'.repeat(64), tags: [] })).toEqual({
      activity: 'x'.repeat(64),
      tags: [],
    });
  });

  it('drops the frame on an overlong activity, a missing or overlong tag list, or one unknown tag', () => {
    expect(parseFinderListingCreate({ activity: 'x'.repeat(65), tags: [] })).toBeNull();
    expect(parseFinderListingCreate({ activity: 7, tags: [] })).toBeNull();
    expect(parseFinderListingCreate({ activity: 'Crucible' })).toBeNull();
    expect(parseFinderListingCreate({ activity: 'Crucible', tags: 'tank' })).toBeNull();
    expect(
      parseFinderListingCreate({
        activity: 'Crucible',
        tags: Array.from({ length: 9 }, () => tag),
      }),
    ).toBeNull();
    expect(parseFinderListingCreate({ activity: 'Crucible', tags: [tag, 'not_a_tag'] })).toBeNull();
  });
});

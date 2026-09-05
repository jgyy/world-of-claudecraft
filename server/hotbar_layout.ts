// Per-character action-bar layout persistence, server side: the join-time read
// of the stored document, the per-profile merge of a client save, and the
// per-character FIFO database write. The document model and its bounds
// validation live in src/world_api/action_bar.ts (shared with the client); this
// module is what server/game.ts composes, so the coordinator carries one store
// field, one session-state spread, and one dispatch line.

import {
  ACTION_BAR_LAYOUT_LEGACY_PROFILE,
  type ActionBarLayoutProfiles,
  type ActionBarLayoutWire,
  actionBarLayoutWire,
  sanitizeActionBarLayout,
  sanitizeActionBarLayoutProfile,
  sanitizeActionBarLayoutProfiles,
  withActionBarLayoutProfile,
} from '../src/world_api/action_bar';
import { setCharacterHotbarLayout } from './db';
import { createKeyedSerialWriter } from './serial_writer';

export interface HotbarLayoutState {
  // Frozen at join: the `hbl` self wire value (the v2 document plus the desktop
  // `forms` mirror for pre-profile clients), or null when the character has
  // never saved one (wires as an explicit "seed from local"). Self-scoped, never
  // an entity/broadcast field; lastSent diffing sends it exactly once, so a
  // later client save never round-trips back to clobber an in-flight edit.
  initialHotbarLayout: ActionBarLayoutWire | null;
  // Live: the stored document every save merges its ONE profile into, so a
  // touch save never clobbers the desktop arrangement (and vice versa).
  hotbarLayout: ActionBarLayoutProfiles | null;
}

/** Session state for a stored column value (untrusted at rest: re-validated
 *  here before it can wire out). Spread into the session at join and assigned
 *  again on a resume, whose auth handshake re-reads the row fresh. */
export function hotbarLayoutState(stored: unknown): HotbarLayoutState {
  const doc = sanitizeActionBarLayoutProfiles(stored);
  return {
    initialHotbarLayout: doc ? actionBarLayoutWire(doc) : null,
    hotbarLayout: doc,
  };
}

/**
 * Merge one client save into the stored document. Returns the new document, or
 * null when the payload is dropped: a malformed/oversized layout, or a profile
 * name outside the known set. A save that names no profile comes from a
 * pre-profile client bundle and lands on the legacy (desktop) profile.
 */
export function mergeHotbarLayoutSave(
  current: ActionBarLayoutProfiles | null,
  msg: { profile?: unknown; layout?: unknown },
): ActionBarLayoutProfiles | null {
  const profile =
    msg.profile === undefined
      ? ACTION_BAR_LAYOUT_LEGACY_PROFILE
      : sanitizeActionBarLayoutProfile(msg.profile);
  if (profile === null) return null;
  const layout = sanitizeActionBarLayout(msg.layout);
  if (layout === null) return null;
  return withActionBarLayoutProfile(current, profile, layout);
}

/** The per-character FIFO writer behind the `save_hotbar_layout` command: two
 *  saves dispatched back to back commit in arrival order, so the newer document
 *  is never overwritten by the older. */
export class HotbarLayoutStore {
  private readonly queues = createKeyedSerialWriter<number>();

  /** Validate + merge a client save into the session's document, then persist
   *  the whole document. A dropped payload never crashes the session. */
  save(session: HotbarLayoutState & { characterId: number }, msg: Record<string, unknown>): void {
    const doc = mergeHotbarLayoutSave(session.hotbarLayout, msg);
    if (doc === null) return;
    session.hotbarLayout = doc;
    void this.queues
      .enqueue(session.characterId, () => setCharacterHotbarLayout(session.characterId, doc))
      .catch((err) => {
        console.error('failed to save hotbar layout:', err);
      });
  }
}

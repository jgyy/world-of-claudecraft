// The debounced, deduped upload of one action-bar layout profile, split out of
// ClientWorld (src/net/online.ts) so the coalescing rule is a unit a Vitest
// drives directly. The controller has already written the localStorage mirror
// by the time save() runs; this pushes the server copy so the arrangement
// restores on the player's other devices of the same surface. Rapid drags
// coalesce to the last layout, and an upload whose serialized form matches the
// last send is skipped, so a re-save during login (or an unchanged bar) never
// amplifies wire/db writes. flush() sends a pending save NOW: the debounce
// timer calls it, and so do session end and page backgrounding, so the final
// sub-debounce edit reaches the server before the socket goes away.

import {
  type ActionBarLayout,
  type ActionBarLayoutProfile,
  type ActionBarLayoutSave,
  sanitizeActionBarLayout,
} from '../world_api/action_bar';

export const ACTION_BAR_SAVE_DEBOUNCE_MS = 1500;

// The `save_hotbar_layout` client command: the profile being arranged plus its
// full layout. A type literal (not an interface) so it satisfies the command
// sender's index signature.
export type ActionBarSaveCommand = {
  cmd: 'save_hotbar_layout';
  profile: ActionBarLayoutProfile;
  layout: ActionBarLayout;
};

export class ActionBarLayoutUploader {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private lastJson: string | null = null;
  private pending: ActionBarLayoutSave | null = null;

  constructor(private readonly send: (command: ActionBarSaveCommand) => void) {}

  /** Queue one profile's layout; a malformed layout is dropped without a send. */
  save(profile: ActionBarLayoutProfile, layout: ActionBarLayout): void {
    const clean = sanitizeActionBarLayout(layout);
    if (!clean) return;
    const pending: ActionBarLayoutSave = { profile, layout: clean };
    const json = JSON.stringify(pending);
    if (json === this.lastJson) return;
    this.lastJson = json;
    this.pending = pending;
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), ACTION_BAR_SAVE_DEBOUNCE_MS);
  }

  /** Send the pending save immediately; a no-op when nothing is pending. */
  flush(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    const pending = this.pending;
    if (pending === null) return;
    this.pending = null;
    this.send({ cmd: 'save_hotbar_layout', profile: pending.profile, layout: pending.layout });
  }
}

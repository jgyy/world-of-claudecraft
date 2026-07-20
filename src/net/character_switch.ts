import type { CharacterSummary } from './online';

// Sequences a Welcome Screen character-switch: confirm (if the target is
// online elsewhere), tear the in-flight session down, take the target over
// if needed, then enter it. Pulled out of main.ts's switchWelcomeCharacter
// closure (root CLAUDE.md: main.ts is a firewall, not a home) so the actual
// switch sequencing is Node-testable via injected collaborators instead of
// only reachable through a live ClientWorld/DOM.
export interface CharacterSwitchCollaborators {
  /** window.confirm (or equivalent) for the take-over prompt. */
  confirmTakeOver: () => boolean;
  /** True while the in-flight session this switch started from is still the
   *  one worth tearing down. The only await before this is checked is the
   *  `takeover` round trip, during which the caller's own state can change
   *  out from under the switch already in progress: the session can proceed
   *  to the game, disconnect, or get torn down for some other reason. When
   *  this reports false, teardown and enter are skipped: there is nothing
   *  left to switch away from, and whatever handler reacted to that other
   *  event has already run its own recovery. */
  isSwitchable: () => boolean;
  /** Tears down the in-flight connection/UI for the character being left. */
  teardown: () => void;
  /** Requests the server take the target character over. */
  takeover: (characterId: number) => Promise<void>;
  /** Enters the world on the given character. */
  enter: (character: CharacterSummary) => Promise<void>;
  /** Called with the takeover error if it rejects; teardown and enter are
   *  skipped, so the in-flight session and Welcome Screen are still up. */
  onTakeoverError: (err: unknown) => void;
  /** Called with the enter error if it rejects. teardown has already run by
   *  this point (entering requires the prior session torn down first), so
   *  there is no world or Welcome Screen left for this handler to preserve. */
  onEnterError: (err: unknown) => void;
}

export async function switchCharacter(
  target: CharacterSummary,
  collaborators: CharacterSwitchCollaborators,
): Promise<void> {
  if (target.online && !collaborators.confirmTakeOver()) return;
  // Take over BEFORE tearing down the in-flight session: a transient takeover
  // failure (network blip, 5xx) then leaves the current world and Welcome
  // Screen intact and recoverable, mirroring the pre-login takeOverAndEnter
  // flow instead of discovering the failure after teardown already ran and
  // there is nothing left to recover to.
  if (target.online) {
    try {
      await collaborators.takeover(target.id);
    } catch (err) {
      collaborators.onTakeoverError(err);
      return;
    }
  }
  // The takeover await above is the only place the in-flight session can end
  // out from under this switch (Continue/Escape/Enter proceeding to the game,
  // a disconnect, a duplicate-session kick): re-check before touching
  // anything, or teardown/enter would run behind whatever terminal handler
  // already fired for that.
  if (!collaborators.isSwitchable()) return;
  collaborators.teardown();
  try {
    await collaborators.enter(target.online ? { ...target, online: false } : target);
  } catch (err) {
    collaborators.onEnterError(err);
  }
}

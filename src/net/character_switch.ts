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
  /** Tears down the in-flight connection/UI for the character being left. */
  teardown: () => void;
  /** Requests the server take the target character over. */
  takeover: (characterId: number) => Promise<void>;
  /** Enters the world on the given character. */
  enter: (character: CharacterSummary) => Promise<void>;
  /** Called with the takeover error if it rejects; enter is skipped. */
  onTakeoverError: (err: unknown) => void;
}

export async function switchCharacter(
  target: CharacterSummary,
  collaborators: CharacterSwitchCollaborators,
): Promise<void> {
  if (target.online && !collaborators.confirmTakeOver()) return;
  collaborators.teardown();
  if (target.online) {
    try {
      await collaborators.takeover(target.id);
    } catch (err) {
      collaborators.onTakeoverError(err);
      return;
    }
    await collaborators.enter({ ...target, online: false });
  } else {
    await collaborators.enter(target);
  }
}

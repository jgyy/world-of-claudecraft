// Which chat pane a 'log' SimEvent's text belongs in: General/Chat, or the Combat
// Log. Pure predicate consumed by hud.ts's `case 'log':` dispatch.
//
// Per the SimEvent comment on the 'log' variant (src/sim/types.ts), `entityId` (when
// set) anchors the line to a specific mob/boss so the server only delivers it to
// nearby players: every such line is combat/encounter flavor chatter (a mob flying
// into a frenzy, fleeing, enraging, unleashing a boss mechanic, or a quest-boss's
// scripted dialogue), never a real chat message. Left in General/Chat it drowns out
// actual player conversation for anyone standing near a busy mob pack. An anchorless
// or pid-only line (ability learned, a world boss's server-wide spawn notice, a
// fishing catch) is a genuine system/chat notice and stays in General/Chat.
export function isCombatFlavorLog(entityId: number | undefined): boolean {
  return entityId !== undefined;
}

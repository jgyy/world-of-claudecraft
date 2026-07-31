// Pure placement for the floating chat input textarea, anchored just above the
// (possibly narrower, moved, or resized) chat log wrap it sits over. #chatlog-wrap
// has a responsive width (`min(370px, calc(50vw - 330px))` in hud.css, further
// narrowed by a manual drag/resize via ChatGeometryController), but #chat-input is
// a sibling element positioned independently in absolute coordinates, so it must
// be re-measured from the wrap's rect on every anchor pass rather than inheriting
// CSS. Before this module existed the DOM consumer (src/main.ts) only copied the
// wrap's top into the input's `bottom`, so a chat box that was never dragged or
// resized kept the textarea's stock 370px width and overhung the wrap's edge on
// any desktop viewport narrower than 1400px (issue #1365). Kept host-agnostic so
// a Vitest unit test can pin the narrow-viewport case without a DOM.
//
// The wrap's own responsive width has no floor (`min(370px, calc(50vw - 330px))`
// keeps shrinking past usability on a narrow windowed / split-screen desktop
// browser, which `mobile-touch` does not catch since that is a capability class,
// not a width breakpoint), so mirroring it verbatim would trade the overhang bug
// for an unusably narrow composer at the tail. Clamp to the same floor the manual
// drag/resize path already enforces (`CHAT_BOX_LIMITS.minWidth` in
// `chat_window.ts`) so the input never gets narrower than a dragged/resized box
// could ever go.

/** The structural slice of a wrap element's measured rect this module reads. */
export interface ChatInputAnchorRect {
  left: number;
  top: number;
  width: number;
}

export interface ChatInputAnchorPlacement {
  left: number;
  width: number;
  bottom: number;
}

// Compute the input's left/width/bottom from the wrap's current rect, the
// viewport height, and the gap to leave between the input's bottom edge and the
// wrap's top edge. Pure arithmetic: rounds every output to whole pixels the way
// the previous inline `Math.round` call on `bottom` already did. `minWidth`
// floors the result so a narrow windowed desktop viewport (below the
// `mobile-touch` capability threshold, so still on this path) never shrinks the
// composer past a usable width; callers pass `CHAT_BOX_LIMITS.minWidth` so the
// floor matches the manual drag/resize path.
export function computeChatInputAnchor(
  wrapRect: ChatInputAnchorRect,
  windowInnerHeight: number,
  gap: number,
  minWidth: number,
): ChatInputAnchorPlacement {
  return {
    left: Math.round(wrapRect.left),
    width: Math.round(Math.max(minWidth, wrapRect.width)),
    bottom: Math.round(windowInnerHeight - wrapRect.top + gap),
  };
}

/** The structural slice of the chat input element this module writes to. */
export interface ChatInputAnchorTarget {
  style: {
    left: string;
    width: string;
    bottom: string;
    removeProperty(property: string): void;
  };
}

// Undo a prior desktop anchor pass. The desktop anchor writes `left`/`width`/
// `bottom` as inline styles, which win over any CSS rule without `!important`
// (including the touch-HUD's own `#chat-input` placement rules in
// hud.mobile.css). If the touch HUD activates mid-session (Interface Mode
// switch, or narrowing below the touch threshold) after a desktop anchor pass
// already ran, those stale inline styles pin the composer to its desktop
// position/width inside the touch panel instead of letting the mobile CSS
// place it. Call this from the mobile-touch early return so control reverts
// to CSS the next time the touch layout applies.
export function clearChatInputAnchor(chatInput: ChatInputAnchorTarget): void {
  chatInput.style.removeProperty('left');
  chatInput.style.removeProperty('width');
  chatInput.style.removeProperty('bottom');
}

/** The structural slice of the chat log wrap element this module reads. */
export interface ChatInputAnchorWrap {
  getBoundingClientRect(): ChatInputAnchorRect & { height: number };
}

// Measure the wrap and apply the resulting placement to the chat input's style.
// Returns false (no write) when the wrap is not laid out yet (height <= 0), the
// same guard src/main.ts used before extraction.
export function anchorChatInputToWrap(
  chatInput: ChatInputAnchorTarget,
  wrap: ChatInputAnchorWrap,
  windowInnerHeight: number,
  gap: number,
  minWidth: number,
): boolean {
  const rect = wrap.getBoundingClientRect();
  if (rect.height <= 0) return false;
  const placement = computeChatInputAnchor(rect, windowInnerHeight, gap, minWidth);
  chatInput.style.left = `${placement.left}px`;
  chatInput.style.width = `${placement.width}px`;
  chatInput.style.bottom = `${placement.bottom}px`;
  return true;
}

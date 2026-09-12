// The thin DOM arm of the Hide Interface toggle: the core decides, this sets
// `body.interface-hidden`, and the enumerated hide set in src/styles/hud.css
// does the rest (every #ui child except the a11y live regions, the nameplate
// layer, the Discord panel, and the touch controls). The class lands on BODY
// because nameplates and the mobile controls are siblings of #ui, not children.

import { INTERFACE_HIDDEN_CLASS, InterfaceVisibility } from './interface_visibility_core';

export interface InterfaceVisibilityHost {
  classList: { toggle(token: string, force?: boolean): boolean };
}

export function createInterfaceVisibility(body: InterfaceVisibilityHost): InterfaceVisibility {
  return new InterfaceVisibility((hidden) => {
    body.classList.toggle(INTERFACE_HIDDEN_CLASS, hidden);
  });
}

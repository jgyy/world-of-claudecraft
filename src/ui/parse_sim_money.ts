// The client-side reverse of the sim's plain-English money fragments (see
// ../sim/format_money.ts, which builds strings like "3g 5s 7c"): sums every
// `Ng`/`Ns`/`Nc` fragment found anywhere in the text into a copper total, so
// the HUD can pull the amount back out of a sim-emitted log/loot line and
// re-render it locale-aware via the i18n formatMoney at the HUD boundary.
//
// Extracted from the hud.ts coordinator, which held the only copy: the
// function needs none of the HUD's private mutable state. Moved verbatim;
// hud.ts imports it back (used by the private Hud.localizeSimMoney).
//
// DOM/Three-free (registered in tests/architecture.test.ts UI_PURE_CORES).

export function parseSimMoney(text: string): number | null {
  let copper = 0;
  let matched = false;
  for (const match of text.matchAll(/(\d+)\s*([gsc])/gi)) {
    matched = true;
    const amount = Number(match[1]);
    const unit = match[2].toLowerCase();
    if (unit === 'g') copper += amount * 10000;
    else if (unit === 's') copper += amount * 100;
    else copper += amount;
  }
  return matched ? copper : null;
}

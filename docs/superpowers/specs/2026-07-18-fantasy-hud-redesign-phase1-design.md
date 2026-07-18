# Fantasy HUD redesign, Phase 1: signature + core primitives

**Status:** Implemented (this branch).
**Supersedes:** PR #2108 (`feature/game-styled-form-controls`), closed/superseded, not merged.
**Relates to:** DESIGN.md (the adopted interface design-language standard).

## Context

PR #2108 restyled a handful of shared form controls (bag chips, search/sort inputs, the
shared dropdown, checkboxes, `button.woc-balance`) toward a "carved-stone-and-gilt" look,
still inside the then-current DESIGN.md visual signature (blue-black translucent panels,
thin 1px gold edge, warm parchment text).

The user supplied three reference screenshots showing a different, more overtly
storybook-fantasy HUD: warm wood-grain and parchment-scroll panel frames, gold-pill tabs,
circular ability icons ringed in gilt bronze, and a warmer, more saturated overall palette.
This is a bigger swing than a forms-only restyle: it changes the panel material and border
weight themselves, which DESIGN.md locks via committed reference images and an explicit
"land in phases, never as isolated fragments" rule.

Decision (confirmed with the user): treat this as a new phase of the *adopted* design
initiative, not a one-off PR. DESIGN.md's reference images and visual-signature section
are updated in this phase; every other window inherits the new primitives in later phases.

## Scope of this phase (Phase 1, implemented)

1. **New reference images.** `docs/design/design-language/hud-style-reference-01.png`
   through `-03.png` added and cited from DESIGN.md section 2 ahead of the two legacy
   images (kept as secondary references, not deleted).
2. **DESIGN.md section 3 (visual signature) rewrite.** "Blue-black translucent + thin
   1px gold edge" replaced with: warm carved-wood umber fill, a heavier bronze-and-gold
   frame with a warm inner bevel highlight, retained warm parchment text and layered
   depth.
3. **Token retune.** `src/ui/theme.ts`'s `classic` preset: `panel` `#15151f` to `#1c130b`,
   `border` `#6f5a2a` to `#8a5c28`. `src/styles/tokens.css` `:root` pre-boot defaults
   synced to match (`--panel-base`, `--panel-bg`, `--panel-edge`, `--color-bg-dark`,
   `--color-bg-input`, `--color-border-default`, `--scrollbar-*`). `tests/theme.test.ts`
   re-pinned for the new "reproduces the shipped gold palette" values; the existing
   "clears AA for text/muted/accent" contrast suite passed unmodified against the new
   panel/border.
4. **New `--control-bg` / `--control-border` tokens**, derived in `themeCssVars` from
   the resolved `panelEdge`/`border` per preset (the PR #2108 mechanism, re-based onto
   the warm palette), plus a matching static pre-boot pair in `tokens.css`. Covered by a
   new `theme.test.ts` case asserting every preset produces valid hex for both.
5. **`.panel` frame shape (`base.css`).** Heavier 3px border (was 2px), 10px radius
   (was 6px), added a warm inner bevel highlight and a subtle bronze inset ring; same
   border + outline + inset-highlight + inset-vignette mechanism, retuned values only.
6. **Core primitives retuned onto `--control-*`:**
   - `.btn` (`components.css`): kept its ember-red action fill (shared "confirm/leave/
     disband" identity across every window that reuses it) but carved its border onto
     `--control-border`, rounder radius, and an embossed raised-bevel shadow.
   - `button.woc-balance`, `.bag-chip`: embossed raised bevel on `--control-bg`/
     `--control-border`.
   - `.hud-select`, `.bag-search`, `.bag-sort`: engraved inset shadow on
     `--control-bg`/`--control-border`.
   - `.ui-dd-btn` inherits `.btn`'s carve (it is composed as `class="btn ui-dd-btn"` in
     `hud.ts`), so no separate edit was needed.
   - Range slider, checkbox/radio accent, and scrollbar thumb/track were left as-is:
     they already consumed theme tokens (`--gold`, `--scrollbar-*`) and cascade to the
     new warm palette automatically; a full custom-appearance checkbox/toggle rebuild
     was scoped out (see Descoped below) as disproportionate to this phase's budget.

Descoped from the original "expand scope" ask, found not to exist as a shared primitive
during implementation:
- `.btn-primary` / `.btn-ghost` / a shared `.chat-tab` tab-strip primitive: DESIGN.md
  section 10.1/10.2 describes these as a *target*, but no such shared class exists in the
  shipped code today (`.btn` itself is the only reused button primitive; tabs are
  per-window ad hoc classes). Introducing a new unified primitive was out of this phase's
  budget; noted as a real gap for a later phase.
- A fully custom carved checkbox/radio widget (rune-square + gilt check, with a
  `forced-colors` native fallback): the native `accent-color: var(--gold)` treatment
  already reads as themed and carries no regression risk; a full custom-appearance
  rebuild is deferred.

Out (Phase 2+, not built this session):
- Party/unit frame chrome (scalloped top edge, portrait frame).
- Chat window frame (wood-grain body, gold-pill tab strip body).
- Minimap frame plus Daily Rewards / quest-tracker card chrome.
- Action bar slot chrome plus circular gilt-ringed ability icons.
- Any other per-window body restyle beyond the shared primitives above.

## Verification

- `npx tsc --noEmit`: clean.
- `npx vitest run tests/theme.test.ts tests/css_value_validity.test.ts
  tests/css_corpus.test.ts tests/styles_extraction.test.ts tests/focus_visible_guard.test.ts
  tests/backdrop_filter_survival.test.ts tests/bank_window.test.ts
  tests/mobile_window_layout.test.ts tests/loot_settings_select_theme.test.ts
  tests/mobile_window_coverage.test.ts tests/mobile_window_transform.test.ts`: all green.
- `npx vite build`: clean (pre-existing chunk-size/i18n-dynamic-import warnings, unrelated).
- Full `npx vitest run`: 12 pre-existing failures across 4 unrelated files
  (`deeds_window_focus.test.ts`, `fixes.test.ts`, `frost_mage_procs.test.ts`,
  `mail.test.ts`), confirmed present on the unmodified `release/v0.28.0` base
  (`deeds_window_focus.test.ts` re-run against the stashed baseline reproduces the same
  9 failures; the other three are timeout flakes under parallel-worker load, the known
  pattern documented in CLAUDE.md).
- Screenshots: `docs/screenshots/fantasy-hud-phase1/{before,after}-bags.png` and
  `{before,after}-hud-desktop.png`, captured via the offline client
  (`scripts/enter_offline_game.mjs` + a one-off bags-window capture mirroring
  `scripts/pr_shot_targets.mjs`'s `inventory` target).

## Open follow-up

- `.btn-primary` / `.btn-ghost` / a shared tab-strip primitive do not exist yet; a later
  phase should either introduce them for real or retire the DESIGN.md section 10.1/10.2
  language describing them as already-shared.
- A fully custom carved checkbox/radio/toggle-switch widget (with its `forced-colors`
  fallback) is still open per DESIGN.md section 10.7's target spec.
- Party/chat/minimap/tracker/action-bar chrome (Phase 2+) is not started.

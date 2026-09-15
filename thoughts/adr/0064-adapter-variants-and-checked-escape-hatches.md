# ADR 0064: Adapter Variants Own Org Looks; Escape Hatches Are Checked

**Status:** Accepted
**Date:** 2026-09-15

Refines [ADR 0063](0063-theme-names-its-adapter.md) (the Theme names its
adapter; the adapter declares its stylesheet; the host owns nothing about the
look). Nothing there changes; this ADR says where an *organization's* look
lives and what happens when a Theme reaches past the design system.

## Context

Three pressures produced the same symptom — patches — from three places.

1. **An org look had no home.** Every real USWDS deployment is a compile-time
   customization (Sass `$theme-*` settings, a partial of house rules). The
   adapter bakes one sheet with fixed settings, so an agency's only routes were
   forking the package or reaching for Theme `cssClass` / `style`. NJ's frames
   (bold body-size sub-heads, a chevron on help links; FINDINGS F10) are org
   rules, not item choices.
2. **The escape hatches are unchecked.** A Theme `cssClass` the adapter sheet
   does not carry renders as nothing, silently; inline `style` bypasses the
   design system with no signal.
3. **Rhythm had two owners.** `formspec-layout.css` is the structural sheet, yet
   it carries flex gaps from the spacing tokens — skin. USWDS carries rhythm in
   component margins, so the adapter had to zero those gaps (edf41f2d).

## Decision

1. **An adapter is a render contract plus a declared stylesheet; a variant
   derives from a base.** The USWDS adapter ships its Sass entry as a
   configurable partial (its settings `!default`; USWDS utilities compiled
   only from an `$output-these-utilities` whitelist, `font-weight` by default)
   and its compile step as a CLI that inlines fonts and icons. `deriveAdapter(
   base, { name, stylesheets })` makes a variant one line. The Theme names the
   variant (`adapter: "uswds-nj"`). Hosts still import no CSS.
2. **Adapters publish their class vocabulary; renderers check it.** The
   vocabulary is generated from the compiled sheet at build time, never
   hand-listed. The renderer warns once per unknown Theme `cssClass` for the
   adapter the Theme names; Studio validation reports the same. Inline `style`
   is the last rung and says so in the Theme spec.
3. **The structural sheet owns structure only** — direction, grid, hidden,
   sr-only, focus. Gaps and margins move to the default skin under the same
   tokens. The USWDS gap override is deleted; USWDS margins are its rhythm.
4. **New Theme knobs pass a rule.** A semantic knob (schema + every adapter)
   only for form meaning that at least two adapters can map — width stops,
   required indicator, label position qualify. A per-item tone or scale → the
   Definition's `styleHints` (core §4.2.5.3), which every adapter maps. An
   org-wide look → variant. Any other per-item look → checked class. `style` →
   last resort.

## Consequences

- NJ becomes a Sass file and one line of code; no fork, nothing patched at
  runtime, and the demo's F10 closes in the variant, not the Theme.
- A class typo fails at authoring instead of rendering blank.
- One rhythm owner per adapter; the default skin's look is unchanged.
- Variant authors compile Sass — USWDS's own workflow, not a new one.
- The Tailwind adapter's vocabulary is its precompiled sheet; JIT classes from
  Theme documents stay out of scope until a host scans them. Its variants take
  the same shape (config in, sheet out) later.
- The Rust/Python lint cannot load npm stylesheets, so the vocabulary check
  lives in TypeScript. A `theme-inline-style` lint warning is a follow-up.

## Done looks like

- A variant fixture compiles from the shipped partial with one changed setting
  and one house rule and yields a sheet that differs only there; `deriveAdapter`
  and the vocabulary artifact have tests; the renderer's unknown-class warning
  has a test.
- `layout.primitives.css` has no `gap` or `margin` rule; the default skin has
  them; Playwright and the unit suites hold; the USWDS demo still measures 40px
  between questions with no adapter-side gap rule.
- The demo ships `uswds-nj`, names it in its Theme, and renders bold sub-heads.

**Amended (fs-1u4n):** `styleHints` was declared and read by nothing, a second
answer to "where does per-item tone live". The resolver now carries it as
`formspec-emphasis-<tone>` / `formspec-size-<size>` classes, and the default,
USWDS and Tailwind sheets each map them at zero specificity — a tone is a
leading bar, muted recedes the text, size scales the item.

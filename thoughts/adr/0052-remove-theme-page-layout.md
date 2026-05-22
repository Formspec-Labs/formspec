# ADR 0052: Remove Page Layout System from Theme Specification

**Status:** Superseded for v1 by [ADR 0063](0063-page-authority-split.md)
**Date:** 2026-03-25

> Historical note: this ADR records the Theme page-layout removal proposal.
> [ADR 0063](0063-page-authority-split.md) supersedes the removal decision for
> v1 by keeping `theme.pages` as the compact page-grid surface and making
> Theme/Component page precedence explicit.

## Context

### The Problem

Formspec has two independent layout systems that never compose — they override:

1. **Theme (Tier 2) page layout** — `pages[]` array with `PageLayout` objects containing `regions[]` on a 12-column grid. References definition items by key with `span`/`start` positioning and responsive breakpoints. Defined in theme-spec.md §6 and `theme.schema.json` (`pages`, `PageLayout`, `Region`).

2. **Component (Tier 3) layout components** — `Stack`, `Grid`, `Columns`, `Page`, `Wizard`, `Tabs`, `Accordion`. Tree-based nesting with arbitrary depth. Components bind to definition items and can interleave structural elements (Cards, Panels, Headings, Dividers) between fields.

When a Component Document exists, Component spec §11.3 states:

> "Layout: Tier 3 component tree completely replaces Tier 2 page layout for bound items."

This means Theme's entire page/grid system becomes dead code whenever Tier 3 is present. The two systems never cooperate — one always discards the other.

### Why This Is a Problem

**Expressiveness gap.** Theme's grid is flat — it positions items on a 12-column plane but cannot express nesting. Theme spec §6.3 acknowledges this: layout *within* a group is controlled by Tier 1 `presentation.layout` properties, "not by the theme's page grid." Component trees can nest `Grid > Card > Stack > Grid` to arbitrary depth with conditional visibility (`when`) at every level. Everything Theme grid can express, Component trees can express. The reverse is not true.

**No renderer consumes Theme pages directly.** The Rust layout planner (`crates/formspec-plan`) generates component trees (LayoutNodes) from Definition + Theme + Component inputs. The webcomponent renders LayoutNodes, not Theme pages. Studio (per ADR-0039) treats `theme.pages` as internal state and generates Component trees from it. Theme pages are always an intermediate representation translated to a component tree before rendering.

**Three tiers declare "pages."** Definition has `formPresentation.pageMode` + group `layout.page` tags (Tier 1 advisory hints). Theme has `pages[]` with grid regions (Tier 2 spatial layout). Components have `Page` and `Wizard` nodes (Tier 3 rendering). Three independently specified systems for the same user-facing concept ("this form has pages") creates authoring confusion and specification redundancy.

**The cascade and layout are already independent.** The Theme schema's `pages` property description says: "The cascade (defaults/selectors/items) still applies regardless of page layout." The cascade resolves per-item presentation (widget, style, tokens, cssClass). Layout resolves spatial positioning. These are orthogonal — removing layout from Theme does not affect the cascade.

### How We Got Here

ADR-0039 (Seamless Page Management) identified this tension from the Studio perspective and resolved it by making Studio the sole document author: `theme.pages` is the authoring surface, and Component trees are derived output. That ADR solved the *tooling* problem but left the *spec* problem intact — two layout systems remain specified, each with its own schema, processing rules, responsive model, and conformance requirements.

The Rust layout planner (ADR-0051) further clarified the architecture: the planner consumes all three tiers and emits a single `LayoutNode` tree. Theme pages are consumed as input to the planner, never as a direct rendering target. The planner already handles the case where Theme pages are absent (Definition-only fallback).

## Decision

**Remove the page layout system from the Theme specification.** Theme retains the cascade (defaults/selectors/items), tokens, breakpoints, and all styling capabilities. Layout structure lives in Tier 3 component trees. Page navigation behavior lives in Tier 1 `formPresentation`.

### What Theme Keeps

- **Cascade** (§5): `defaults` → `selectors` → `items` per-item presentation resolution. This is Theme's unique contribution — no other tier provides multi-level specificity-based presentation resolution.
- **Tokens** (§3): Design system vocabulary (`$token.*` references) shared with Component Documents via the cross-tier token cascade (Component spec §10.3).
- **Breakpoints** (§6.4): Named responsive breakpoints as min-width pixel values. These are already shared with Component Documents and remain useful as a shared vocabulary.
- **Widget selection**: The cascade resolves which widget renders each item. This is orthogonal to layout.
- **Styling**: `style`, `cssClass`, `widgetConfig`, `accessibility`, `labelPosition` — all per-item presentation properties.

### What Theme Loses

- **`pages` property** — the ordered array of `PageLayout` objects.
- **`PageLayout` $def** — `id`, `title`, `description`, `regions[]`.
- **`Region` $def** — `key`, `span`, `start`, `responsive`.
- **Section 6** of theme-spec.md (Page Layout System) — §6.1 Pages Array, §6.2 12-Column Grid Model, §6.3 Regions and Item Keys, §6.4 Responsive Breakpoints (the breakpoint *definitions* stay; the region-specific responsive overrides go), §6.5 Default Layout.

### The New Layout Ownership Model

| Form complexity | Layout mechanism |
|----------------|-----------------|
| **Simple** (no sidecar documents) | Definition items render top-to-bottom. `formPresentation.pageMode` + group `layout.page` tags provide advisory pagination hints. Renderers walk the item tree. |
| **Styled** (Definition + Theme) | Same as simple, but the cascade applies widget selection, tokens, and styling to each item. No spatial rearrangement — items render in definition order with cascade-resolved presentation. |
| **Fully laid out** (Definition + Theme + Component) | Component tree controls all layout. Cascade still applies for tokens, styles, and unbound-item fallback. |

The middle tier (styled forms without component trees) loses the ability to rearrange items spatially via grid regions. This is the primary tradeoff. Forms that need spatial layout must use a Component Document — or, more practically, must use tooling (the Rust planner, Studio) that generates one.

### Tier Responsibility After This Change

| Concern | Owner |
|---------|-------|
| Data structure and semantics | Definition (Tier 1) |
| Behavioral logic (binds, shapes) | Definition (Tier 1) |
| Page navigation behavior | Definition `formPresentation.pageMode` + related mode properties (Tier 1) |
| Advisory/bootstrap page hints | Group `layout.page` (Tier 1) |
| Widget selection | Cascade: Tier 1 `widgetHint` → Tier 2 defaults/selectors/items → Tier 3 component type |
| Styling, tokens, design system | Theme cascade + tokens (Tier 2) |
| Spatial layout and page structure | Component tree (Tier 3) |

## Consequences

### Spec and Schema Changes

| Artifact | Change |
|----------|--------|
| `specs/theme/theme-spec.md` | Remove §6 (Page Layout System). Update §1.1, §2.1, §7.3 step 5 (remove page/region layout computation). Update Appendix A example. |
| `schemas/theme.schema.json` | Remove `pages` property, `PageLayout` and `Region` from `$defs`. Keep `Breakpoints`. |
| `specs/component/component-spec.md` | Update §11.3 — Tier 2 no longer has page layout to replace. Simplify cross-tier interaction description. |
| `specs/locale/locale-spec.md` | Update `$page.<pageId>.title` / `$page.<pageId>.description` key scheme (§3.1.7–3.1.8). These currently reference Theme `PageLayout` objects. Redirect to Component tree `Page` title/description via `$component.*` paths. |
| `specs/core/spec.md` | No changes. `formPresentation.pageMode` and `layout.page` remain as Tier 1 advisory hints. |
| `schemas/definition.schema.json` | No changes. |
| Generated artifacts | Regenerate all `.llm.md`, `.bluf.md`, and reference maps. |

### Implementation Changes

| Artifact | Change |
|----------|--------|
| Layout planner (`packages/formspec-layout`) | Remove theme-page-to-LayoutNode path. The planner already handles Definition-only fallback (`plan_definition_fallback`). Theme pages were an input that got translated to LayoutNodes — that translation step is removed. |
| `formspec-core` handlers (`handlers/pages.ts`) | The 14 page commands (`pages.addPage`, `pages.deletePage`, `pages.addRegion`, etc.) currently write to `theme.pages`. These either move to operate on Component tree nodes directly, or are reimplemented as Component tree generation helpers. |
| `formspec-core` page resolution (`page-resolution.ts`) | Simplify or remove. Currently resolves Theme pages → `ResolvedPageStructure`. With Theme pages gone, page structure is derived from Component tree inspection. |
| `formspec-core` tree reconciler (`tree-reconciler.ts`) | Currently generates `Wizard > Page` component trees FROM `theme.pages`. This becomes the primary authoring path — Studio page commands generate Component tree nodes directly rather than writing to Theme and then deriving a Component tree. |
| `formspec-studio-core` | Own page normalization, migration from legacy `theme.pages`, page queries, and other non-UI authoring logic. `formspec-studio` remains a UI layer only. |
| `formspec-webcomponent` | No changes. Already renders LayoutNodes from the planner, not Theme pages. |
| Python validator (`src/formspec/`) | Remove Theme page validation rules. |
| Test suites | Update conformance tests, schema tests, and E2E fixtures that reference `theme.pages`. |

### Relationship to ADR-0039

ADR-0039 established that Studio is the sole document author and `theme.pages` is the internal representation from which Component trees are derived. This ADR takes that insight to its logical conclusion: if `theme.pages` is always translated to a Component tree before rendering, the specification does not need to standardize `theme.pages` as a spec-level concept. Studio can use any internal representation it wants for page authoring — it does not need a spec-level schema for that intermediate state.

ADR-0039's design principles remain valid:
- "The user edits the form, not documents" — still true.
- "Documents are output artifacts" — still true, and now there are fewer output artifacts to coordinate.
- "Studio-core is the sole writer" — still true.
- "Mode is rendering style, not structure" — still true. `formPresentation.pageMode` stays in Tier 1.

The specific implementation changes from ADR-0039 (page handlers, tree rebuild, `ResolvedPageStructure`) are superseded by this ADR's simpler model where page commands operate on Component tree structure directly.

## Studio Normalization Rule

Studio should normalize page authority one-way:

1. If the Component tree already contains authored `Page` nodes, that tree is authoritative.
2. If there are no authored pages but `theme.pages` exists, Studio may migrate it into a Component-backed page tree once.
3. After migration, Studio stops writing to `theme.pages` and does not attempt bidirectional sync.
4. Tier 1 `layout.page` hints remain bootstrap input only; they are not treated as a concurrent page-authoring surface once Component pages exist.

This avoids the current state where three page representations appear active at once.

### Risks

**Middle-ground forms lose declarative layout without tooling.** A form author who wants "firstName and lastName side-by-side" without writing a component tree currently uses Theme regions. After this change, they need a Component Document (or tooling that generates one). This is mitigated by: (a) the layout planner (`packages/formspec-layout`) already generates component trees from Definition hints, (b) Studio generates component trees from user actions, and (c) the Definition's `layout.columns`/`layout.colSpan` hints on groups/items (Tier 1) provide basic column layout without any sidecar document.

**Existing theme documents with pages become invalid.** Mitigated by: the spec is unreleased (Draft status) with zero external consumers.

**Locale `$page.*` keys need a new anchor.** The locale spec's page title/description keys currently reference Theme `PageLayout` objects. These must be redirected to Component tree `Page` nodes. The `$component.*` locale key scheme already exists and can serve this purpose.

## Alternative: Studio-Only Change (No Spec Modification)

A lighter-weight path exists that solves the practical problem without touching the specification:

**Keep Theme pages in the spec. Change Studio to write directly to `component.json` for all page/layout operations.**

Currently, Studio page commands (`pages.addPage`, `pages.addRegion`, etc.) write to `theme.pages`, then the tree reconciler derives a Component tree from that state. This is the roundtrip that ADR-0039 designed. The alternative eliminates the roundtrip:

- Studio page commands write directly to the Component tree (`Stack > Page*` plus nested `Grid`/`Stack` layout nodes)
- `theme.pages` is no longer written or read by Studio for layout purposes
- Theme keeps its cascade, tokens, and styling role — Studio still writes to Theme for those concerns
- The spec retains `theme.pages` as a valid authoring format for non-Studio consumers (hand-authored forms, simpler tooling, external integrations)
- The layout planner (`packages/formspec-layout`) continues to consume `theme.pages` as input when no Component Document exists, serving the "Definition + Theme only" rendering path

### Why This Might Be the Better Path

1. **Zero spec changes.** No schema modifications, no spec prose updates, no locale key scheme migration, no regeneration of generated artifacts.
2. **Preserves progressive fidelity.** Non-Studio authors who want simple grid layout without writing a full component tree can still use `theme.pages`. The spec serves multiple audiences — Studio is not the only consumer.
3. **Smaller implementation surface.** The change is confined to `formspec-core` handlers and the tree reconciler. The layout planner, webcomponent, Python validator, and conformance tests remain untouched.
4. **ADR-0039's principles still hold.** "The user edits the form, not documents" — Studio just writes to a different document. "Documents are output artifacts" — `component.json` is still an output artifact. "Studio-core is the sole writer" — unchanged.

### What Changes in the Studio-Only Path

| Artifact | Change |
|----------|--------|
| `formspec-core` page handlers (`handlers/pages.ts`) | Rewrite to operate on Component tree nodes instead of `theme.pages`. `pages.addPage` creates a `Page` node in the component tree. `pages.addRegion` places an item-bound component inside a `Page`. `pages.setMode` writes `formPresentation.pageMode` without restructuring the tree. |
| `formspec-core` tree reconciler (`tree-reconciler.ts`) | Remove the `theme.pages` → Component tree derivation path. Page structure is authored directly in the component tree. |
| `formspec-core` page resolution (`page-resolution.ts`) | Rewrite to inspect the Component tree for `Page` nodes plus `formPresentation.pageMode` instead of reading `theme.pages`. |
| Everything else | No changes. Spec, schemas, planner, webcomponent, Python — all untouched. |

### Tradeoff

The spec redundancy (two layout systems) remains. But it stops being a tooling problem — Studio picks one path (Component tree) and never creates the confusing state where `theme.pages` and a Component tree coexist with conflicting layout declarations. The spec-level redundancy is acceptable as progressive fidelity serving different authoring audiences.

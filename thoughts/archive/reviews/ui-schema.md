# UI Schema Review — Cross-Tier Consistency Audit

**Date:** 2026-05-20
**Scope:** [`formspec/schemas/definition.schema.json`](../../schemas/definition.schema.json), [`formspec/schemas/theme.schema.json`](../../schemas/theme.schema.json), [`formspec/schemas/component.schema.json`](../../schemas/component.schema.json)
**Companion:** [`thoughts/specs/2026-05-19-ui-schema.md`](../specs/2026-05-19-ui-schema.md)
**Controlling follow-up:** [`ui-schema-proposed-decisions.md`](./ui-schema-proposed-decisions.md)
**Method:** 16 specialist agents in 4 clusters × 4 lenses (spec-expert, formspec-scout, code-scout with `semi-formal-code-review`, solutions-architect-validator with `semi-formal-architecture-review`)
**Posture:** Greenfield v1 schemas. Refactors are acceptable when they add user value or remove architecture debt.

**How to read this document:** this file is the evidence record and rationale. Use [`ui-schema-proposed-decisions.md`](./ui-schema-proposed-decisions.md) as the implementation reference. If wording diverges, the proposed-decisions file wins.

**Decision update:** Owner review changed several original recommendations. Keep `theme.pages` as the compact page-level grid surface. Rename Component `Page` to `Section`. Remove `Columns` with no deprecation period and no `Row`/`Columns` sugar. Make `Grid` the only Component grid primitive and `Stack` the only Component flow primitive. Keep root `x-*` annotations and `extensions` as separate extension lanes, with Definition/Theme root `x-*` called out as a schema/spec change. Adopt PascalCase built-in widget/component names across tiers.

---

## 1. Context

### 1.1 What was reviewed

The Formspec UI surface — three JSON Schemas governing how a form *looks* and *lays out*:

- **Definition** ([`definition.schema.json`](../../schemas/definition.schema.json)) — the form's structural truth: items, binds, shapes, plus `formPresentation` (Tier -1) and per-item `Item.presentation.layout` (Tier 0) presentation hints.
- **Theme** ([`theme.schema.json`](../../schemas/theme.schema.json)) — Tier 2 sidecar: cascade (defaults → selectors → items), 12-col page-grid via `PageLayout.regions`, widget selection, tokens, breakpoints.
- **Component** ([`component.schema.json`](../../schemas/component.schema.json)) — Tier 3 sidecar: typed parallel component tree (`TextInput`, `Stack`, `Grid`, …), overrides Theme, own tokens/breakpoints.

### 1.2 The cascade authority model

The owner-stated design intent: **lower tiers are authoritative for business logic with renderable-but-overwritable visual hints; higher tiers override visuals without ever touching logic.**

| Tier | Source | Owns | Override authority over |
|---|---|---|---|
| −1 | `Definition.formPresentation` | form-wide defaults (`pageMode`, `labelPosition`, `density`) | — |
| 0 | `Item.presentation.layout` | per-item hints (`flow`, `columns`, `colSpan`, `newRow`, `collapsible`, `page`) | Tier −1 |
| 2 | `Theme` | cascade + 12-col page grid + widget selection + tokens | Tiers −1, 0 |
| 3 | `Component` | typed tree, tokens, breakpoints | Tiers −1, 0, 2 |

### 1.3 User-value lens

Every finding evaluated against two audiences:
- **Analyst** = form author, data modeler, AI co-author writing definitions/themes/components.
- **Respondent** = end user filling rendered forms.

Plus a third axis: **future tech-debt cost** (the owner's economic-model multiplier — see [`../../../CLAUDE.md`](../../../CLAUDE.md) §Behavioral interrupts).

---

## 2. Diagnostic walk that produced the findings

The review began as a single question — *is controlling the layout intuitive?* — and walked the three schemas tier-by-tier:

**Round 1 (Component only).** Initial critique: redundant Stack/Grid/Columns trio, no child-level sizing, `responsive` prop-merge-only, `Spacer` anti-pattern, `position` vs `placement` vocab split, missing first-class padding/background/border on Card/Stack/Page.

**Round 2 (+ Theme).** Most "missing capability" critiques retracted. Theme regions have `span`/`start`/`hidden` per breakpoint — first-class child sizing and responsive hide already exist at Tier 2. Critique sharpened to: *Tier 3 lacks what Tier 2 has — the highest-authority tier can't override what the tier below it already expresses*.

**Round 3 (+ Definition).** Definition's `Item.presentation.layout` already exposes `colSpan` (1–12), `flow`, `columns`, `newRow`, `collapsible`, `page`. Layout *capability* is well-distributed across tiers. **Layout *naming* and *override completeness* are where intuitiveness breaks.** Four-tier vocabulary fragmentation surfaced: same concept expressed up to four different ways across tiers.

**Round 4.** Owner reframed: lower tiers are *authoritative business logic with renderable visual hints*; higher tiers are *overwritable visual authority*. This collapsed most "vocab fragmentation = flaw" critiques into "intentional cost of tier-local ergonomics" — except where the *override* surface at Tier 3 is strictly weaker than what Tier 0 expresses (contradicts the stated authority model).

**Round 5.** 18 candidate findings produced, sorted into 4 clusters:
- **Cluster 1** — Authority & cascade integrity (5)
- **Cluster 2** — Within-tier cleanup (4)
- **Cluster 3** — Cascade rule clarity (4)
- **Cluster 4** — LLMX & DX (5)

**Round 6.** 16 specialist agents dispatched (4 per cluster × 4 lenses), read-only. Each agent applied its lens to the cluster, returning per-finding evaluations grounded in file:line evidence. This document synthesizes the 16 reports.

---

## 3. Findings — verdicts and detail

### Cluster 1 — Authority & Cascade Integrity

#### F1. Close Tier-3 layout-override gap **[ACCEPT]**

**Statement.** `Definition.Item.presentation.layout` exposes `colSpan`/`newRow`/`layout.page` ([`definition.schema.json:1513,1523,1538`](../../schemas/definition.schema.json)). Theme `Region` exposes `span`/`start`/`responsive.{span,start,hidden}` ([`theme.schema.json:611,624,634-668`](../../schemas/theme.schema.json)). `ComponentBase` ([`component.schema.json:232`](../../schemas/component.schema.json)) and its leaves have *no* typed equivalents — overrides require dropping into raw `style` strings.

**Why it's load-bearing.** The cascade promises *higher tier = overwritable visual authority*. Today the highest-authority tier has the weakest typed override vocabulary for layout. Authors hit this any time they need a custom Component tree with mid-grid span control; LLM co-authors hallucinate `colSpan` on children because the concept exists everywhere else.

**Analyst value.** Local, additive per-child overrides instead of restructuring into `Columns` or escaping to `style`.
**Respondent value.** Indirect — Tier-3 trees can reach layout fidelity matching Tier 0+2.
**DX/LLMX.** Removes a top-five LLM authoring hallucination surface.

**Updated implementation sketch.** Add typed grid placement under a grid-scoped object, not as loose universal props. Proposed shape: `layout.grid.{span,start,rowSpan,rowStart}` on children of `Grid` or another documented page-grid context. Keep `responsive.hidden` as a presentation-only override with data-preserving semantics.

**Risk.** Bare `span`/`start` on every component would be meaningless outside a grid parent. Scope placement to grid contexts and lint misuse. Reject blanket top-level `hidden`; visibility lives in `when` or `responsive.hidden`.

**Adjacent bug surfaced.** `Columns.widths` ([`component.schema.json:831`](../../schemas/component.schema.json)) is positional-by-index against `children`. A `when`-hidden child silently misaligns the widths array. Removing `Columns` dissolves this failure mode. → **B6.**

---

#### F2. Unify span vocabulary **[ACCEPT → rename to `span`]**

**Statement.** Definition uses `colSpan` (1–12); Theme `Region` uses `span` (1–12). Same 12-col semantics, two words.

**Disagreement.** spec-expert recommended `colSpan` (matches Tier-1 incumbent + CSS analog). scout / code-scout / arch-validator recommended `span` (shorter, matches the more-frequently-authored Theme region surface, greenfield posture per stack [CLAUDE.md](../../../CLAUDE.md) permits the rename).

**Updated resolution.** **`span`** is the canonical grid-span word, but it must be scoped to grid contexts. Theme regions keep `span`. Component grid placement should use `layout.grid.span`. If Tier-0 layout hints remain, replace flat `colSpan` with a grid-scoped `span` shape rather than adding another free-floating name.

**Analyst value / DX.** Single canonical word for 12-col grid span across all tiers.
**Respondent value.** None.

**Implementation.** Schema rename/reshape + fixture sweep. Per [`formspec/CLAUDE.md`](../../CLAUDE.md), regenerate types (`packages/formspec-types/`), update studio-core (`project-layout.ts`, `helper-types.ts`), planner (`planner-definition-fallback.ts`). Estimated touched files: ~6 sites in studio-core + ~5 fixture files.

---

#### F3. Collapse page/step concept across tiers **[RESHAPE]**

**Statement.** "Page/step" expressed four ways: `formPresentation.pageMode` (Tier −1 enum), `Item.layout.page` (Tier 0 string), Theme `PageLayout.id` (Tier 2 object), Component `Page` (Tier 3 component).

**Strong disagreement among agents.**
- spec-expert: **REJECT** — four expressions are intentional tier separation, each operates at different authority. Add cross-tier reconciliation prose.
- scout: **ACCEPT** — surfaced [ADR 0052](../adr/0052-remove-theme-page-layout.md) which actively proposes killing `theme.pages` + `PageLayout` + `Region`, promoting Tier-3 `Page` as sole structural authority. Three of five cluster-1 findings collapse cleanly under ADR 0052.
- code-scout: **RESHAPE** — drop the *duplicates* (`Item.layout.page` overlaps with `PageLayout`); keep `pageMode` (orthogonal pagination switch); keep both `PageLayout` and Component `Page` (rename per F5).
- arch-validator: **REVERSE** — the "four variants for one idea" framing is wrong; concept is one noun expressed at four authority levels — that's what the tier model wants. Fix via F5 rename + cross-tier pins, not concept collapse.

**Updated resolution.** **RESHAPE — split the question.** `pageMode` is genuinely orthogonal: it is navigation strategy, not page identity. Keep `theme.pages` as the compact page-level grid surface. Rename Component `Page` to `Section`. Drop `Item.layout.page` as runtime page authority; page membership belongs in `theme.pages` or explicit Component structure.

**Recommendation update:** do **not** ratify ADR 0052's removal path for v1. Keep the accepted-alternative path, but make precedence explicit: Component section/page structure wins when present; otherwise `theme.pages` may define page layout. Do not implicitly merge competing page structures.

**Implementation slice added:** Tier-0 page hint demotion must update Definition schema/spec wording, Theme spec references to Tier-0 page hints, layout planner fallback behavior, page-sequence behavior, and lint diagnostics. Decide during implementation whether `Item.presentation.layout.page` is deleted or retained only as import/bootstrap metadata.

**Pin.** [`thoughts/adr/0052-remove-theme-page-layout.md`](../adr/0052-remove-theme-page-layout.md)

---

#### F4. Unify widget vocabulary **[RESHAPE]**

**Statement.** Definition `widgetHint` and Theme `widget` share a lowercase enum (`textInput`, `moneyInput`, `slider`…); Component uses PascalCase types (`TextInput`, `MoneyInput`, `Slider`). Two parallel naming systems.

**Strong disagreement.**
- spec-expert: **REJECT** — dual system is intentional. `widget` is an *open hint string* permitting `x-*`; `component` is a *closed JSON Schema oneOf discriminator*. Different contract kinds.
- scout: **RESHAPE** — adopt PascalCase as canonical across all three tiers. The codebase already maintains `packages/formspec-types/src/widget-vocabulary.ts` as a three-way translation table — that's paid debt today.
- code-scout: **ACCEPT** — extract shared `Widget` enum schema, PascalCase canonical, `$ref` from all three tiers. Also surfaced: `widget` has NO `enum` constraint at Tier 2 ([`theme.schema.json:315-333`](../../schemas/theme.schema.json)) — vocabulary lives in description prose. A typo (`monyeInput`) validates clean.
- arch-validator: **RESHAPE — DO NOT rename.** Publish equivalence table + `x-equivalentComponent` / `x-equivalentWidget` annotations on each side. Zero migration cost.

**Updated resolution.** Adopt PascalCase as the canonical built-in widget/component vocabulary across Definition, Theme, and Component.

Custom widgets remain `x-*`. Authoring tools may accept lowercase aliases outside the spec, but schemas, specs, generated types, fixtures, and lint should emit and validate canonical names. Add schema enum/pattern constraints to Tier 0/2 `widget`/`widgetHint` so typos such as `monyeInput` do not validate.

---

#### F5. Disambiguate Page collision **[ACCEPT → Component `Page` → `Section`]**

**Statement.** Theme `PageLayout` and Component `Page` both occupy the "page" concept-space.

**Convergence.** All four agents land on rename, differing on which side. Arch-validator's diagnosis is sharpest: Component `Page` is *described* in the schema ([`component.schema.json:319-351`](../../schemas/component.schema.json)) as "top-level page/section container … each Page is one step … MAY also be used standalone within a Stack." That's a `Section`/`Step`, not a `Page`. Theme `PageLayout` *is* a page-of-the-form; Definition `pageMode` controls pagination.

**Updated resolution.** Rename Component `Page` → `Section` and remove Component `Page` from the v1 canonical vocabulary. Direct root `Section` children are page-bearing units when `formPresentation.pageMode` renders wizard or tabs navigation; nested `Section` nodes are ordinary structure and MUST NOT shadow `theme.pages`. Update Core spec §4.1.2, Component spec §5.4, `AnyComponent.oneOf`, `Page.properties.component.const`, `Tabs.tabLabels` fallback prose, `CustomComponentRef.not.enum`, generated types, examples, page-sequence/runtime sentinels, Studio page helpers, renderer registries, and lint classifications. Do not carry a deprecation period in v1.

**Analyst / DX.** Closes the highest-frequency LLM authoring conflation in this cluster.

---

### Cluster 2 — Within-Tier Cleanup

#### F6. Remove Columns; use Grid **[ACCEPT]**

**Statement.** `Columns` with `widths: ["1fr","2fr"]` ≈ `Grid` with `columns: "1fr 2fr"`. The schema's own fallback chain (`Columns → Grid`, [`component.schema.json:826`](../../schemas/component.schema.json)) admits the redundancy. The spec at [`specs/component/component-spec.md:1671-1674`](../../specs/component/component-spec.md) names Grid as Columns's canonical fallback.

**Updated implementation.** Remove `Columns` from the canonical Component vocabulary outright. Make `Grid` the only Component-level grid primitive. Let `Grid.columns` accept an integer, an array of track values, or a CSS grid-template string. Prefer array values for authored JSON, e.g. `["2fr", "1fr"]`; treat numeric array entries as `fr` weights. Add `$defs/GridTrack`: string values are CSS track fragments or `$token.*` references; numeric values MUST be greater than 0 and normalize to `fr` weights; `columns` arrays MUST have at least one entry.

Delete `$defs/Columns`, the `AnyComponent` oneOf entry, the `CustomComponentRef.not.enum` entry, generated type entries, renderer registrations, CSS classes, fixtures, and examples. Do not add `Row` or `Columns` syntax sugar; helpers should emit `Stack` or `Grid`.

**Blast radius (per scout + validation).** webcomponent: `layout-plugin-builders.ts:56`, `components/layout.ts:23`, `adapters/default/layout.ts:187-208` delete `renderColumns`. Lint classification at `crates/formspec-lint/src/pass_component/classification.rs:5,12,18` drops "Columns". Also update `packages/formspec-layout/src/node-utils.ts`, planner tests, adapter packages such as USWDS `columns.ts` / shared grid helpers, docs/API generation, examples, e2e fixtures, and studio palette entry at `authoring-helpers.ts:98`.

**Risk.** Low in a greenfield v1. Existing `Columns` fixtures should be migrated to canonical `Grid` fixtures; no compatibility fixture is needed unless a migration tool is introduced.

---

#### F7. Remove Spacer **[ACCEPT — sequenced with F9]**

**Statement.** `Spacer` ([`component.schema.json:435-455`](../../schemas/component.schema.json)) is a layout anti-pattern. The right answer is parent `gap` (Stack/Grid), grid placement, or visual surface padding.

**Sequencing constraint.** code-scout flagged: Stack/Page/Card lack `padding` today, so `Spacer` is sometimes used to fake top/bottom padding. Removing without F9 (visual container props) causes respondent-visible visual regressions. **Co-land F7 + F9.**

**Updated implementation.** Add visual surface props first, then remove `Spacer` from the v1 canonical vocabulary. Delete `$defs/Spacer`, the `AnyComponent.oneOf` entry, classification table entry, studio palette entry, fixtures, and renderer paths. Do not carry a deprecation period; migrate fixtures directly.

**Blast radius.** Small. webcomponent `components/display.ts:32` + `adapters/default/display-components.ts:96`. Lint `classification.rs:9,16`. Studio palette `authoring-helpers.ts:106`.

---

#### F8. Unify position vs placement **[ACCEPT]**

**Statement.** `Tabs.position` ([`component.schema.json:867`](../../schemas/component.schema.json)), `Panel.position` ([`:1360`](../../schemas/component.schema.json)), `Modal.placement` ([`:1415`](../../schemas/component.schema.json)), `Popover.placement` ([`:1452`](../../schemas/component.schema.json)). Same concept; floating-ui/Radix/Popper convention is `placement`.

**Implementation.** Rename `Tabs.position` → `placement`, `Panel.position` → `placement`. Resequence Tabs enum to clockwise (`top,right,bottom,left`) for parity. Update fixtures and generated types directly.

**Subtlety.** Tabs/Panel `position` is *layout-anchored* (chrome lives at this edge); Modal/Popover `placement` is *trigger-anchored* (preferred direction from anchor). Same vocabulary, distinct sub-semantics — add one prose note.

---

#### F9. First-class visual-container props **[ACCEPT — scoped]**

**Statement.** Card has `elevation` only ([`component.schema.json:735-761`](../../schemas/component.schema.json)). Stack has `gap` only. Page/Card/Stack force escape to raw `style` for padding/background/border — the most common visual knobs.

**Updated implementation.** Introduce shared `$defs/VisualSurfaceProps` ($ref'd from Section, Stack, Grid, Card, Panel, and other true containers) with `{padding, background, border, radius, elevation}` — token-able strings. Coordinate with [`theme.schema.json`](../../schemas/theme.schema.json) token namespaces (`spacing.*`, `color.*`, `border.*`, `elevation.*`). Cap the set strictly; `style` remains the escape hatch for anything else.

**Scope discipline.** Keep `margin` out of v1; parent layout should own sibling spacing through `gap` or grid placement. Keep `overflow`, `minHeight`, and detailed CSS controls in `style` unless repeated authoring evidence justifies first-class props.

**Adjacent debt.** `Card.elevation: integer` is opaque (no token binding, no semantic). Fold into token system (`$token.elevation.2`) in the same pass. → **B8.**

---

### Cluster 3 — Cascade Rule Clarity

#### F10. Normalize responsive model **[RESHAPE]**

**Statement.** Theme `Region.responsive` ([`theme.schema.json:634-668`](../../schemas/theme.schema.json)) supports `{span, start, hidden}`. Component `ResponsiveOverrides` ([`component.schema.json:198-204`](../../schemas/component.schema.json)) is freeform prop-shallow-merge; no first-class hide.

**arch-validator's reframing.** The asymmetry is partially load-bearing — Theme regions override layout geometry; Component overrides component props. Different vocabularies belong on different tiers. The real gap is the **shared breakpoint namespace** is unenforced (Theme `breakpoints` and Component `breakpoints` are two declarations; no merge rule when both target the same Definition).

**Resolution.**
1. Add `hidden: boolean` to Component `responsive` allowed keys (the one shared concept; presentation-only; explicit semantics: no DOM removal, data preserved, `relevant=false` still wins).
2. Tighten `ResponsiveOverrides` to *enforce* its prose constraint (`propertyNames: { not: { enum: ["component","bind","when","children","responsive"] }}`). This is resolved in the current working tree. → **B3.**
3. Normative rewrite: replace current Component-over-Theme same-name breakpoint precedence with a shared breakpoint namespace. Resolve breakpoints from Theme plus Component additions; same-name breakpoint values MUST match.
4. Use lint, not giant per-component JSON Schema, to reject responsive props that are invalid for the target component.
5. Responsive overrides may change flow/grid layout props, but MUST NOT change logical child order or binding identity.

---

#### F11. Document `when` vs `relevant` decision tree **[ACCEPT]**

**Statement.** Component `when` ([`component.schema.json:247-250`](../../schemas/component.schema.json)) and Bind `relevant` ([`definition.schema.json:836-844`](../../schemas/definition.schema.json)) are two visibility levers with subtle precedence (`relevant=false` always wins; `when=false` hides but preserves data). The decision tree lives in Component spec §8.2; never appears in Core spec.

**Convergence.** All four agents accept; documentation pass + conformance fixtures, no schema change.

**Implementation.**
1. Hoist precedence rule into both schema descriptions (`Bind.relevant`, `ComponentBase.when`).
2. Add normative decision table to Core spec §4.2.5.5 with `→ Component spec §8.2` pointer.
3. Add 4 conformance fixtures (`relevant × when` quadrant: T/T, T/F, F/T, F/F).
4. Deduplicate null-treatment prose (currently duplicated in `Bind.relevant` and `FELExpression` description). → **B9.**

---

#### F12. Collapse non-relevance trio **[REJECT collapse; RESHAPE group + fixtures]**

**Statement.** `Bind.nonRelevantBehavior` (serialized output), `Bind.excludedValue` (in-memory FEL value), `Bind.disabledDisplay` (visual treatment). Three properties; one lifecycle.

**Convergence on REJECT collapse.** Three distinct downstream consumers in three runtime phases (serializer, evaluator, renderer). Collapsing into a single enum creates Kleppmann-class parity hazard — one shared property requires three consumers to interpret identically; today three properties read by three consumers requires zero coordination. arch-validator's framing: **count consumers before counting properties.**

**Resolution.** Keep three properties. **Reshape:**
1. Group under a doc heading `Non-relevance lifecycle` in spec §5.6 with a 4-line table mapping each to its phase.
2. Add `x-lm.intent` cross-references linking the three property descriptions.
3. Add 4-6 cross-product conformance fixtures (not all 12; only the coherent combos that matter).
4. Add schema-level `allOf` interdependency rules only for mechanically incoherent local combinations, e.g. `nonRelevantBehavior: remove` + `disabledDisplay: protected` when the renderer cannot display a removed value. Keep nuanced lifecycle combinations in docs and fixtures rather than overfitting the schema.

---

#### F13. cssClass union vs style replace asymmetry **[ACCEPT — runtime bug + doc hoist]**

**Statement.** Theme spec ([`theme.schema.json:412-434`](../../schemas/theme.schema.json)) declares `cssClass` accumulates across cascade levels (union semantics); all other properties shallow-replace. The asymmetry is *correct* — classes are tags (set semantics, union is safe); style/widgetConfig are maps (replacement is the safe default).

**CRITICAL BUG surfaced by scout.** `packages/formspec-core/src/theme-cascade.ts:90-93` implemented **replace** for all properties including cssClass — violates spec. Theme authors lose baseline classes silently. This is resolved in the current working tree. → **B2.**

**Resolution.**
1. **Fix the runtime bug.** TDD: red fixture from [`theme-spec.md:607-670`](../../specs/theme/theme-spec.md) cascade pseudocode → green in `theme-cascade.ts`.
2. Hoist "merge strategy is per-property" rule to PresentationBlock `$def` header; enumerate which properties union vs replace and why (CSS class set safety vs CSS property merge unsafety).
3. Pin Theme→Component cssClass cross-tier merge in Component spec §10 (union across all four levels: Tier 1 → Theme defaults → selectors → items → Component → renderer).
4. Add cascade-conformance fixture family at `tests/cascade-conformance/`.

**Reject** any change to `style` replace semantics — deep-merge requires CSS engine knowledge Formspec deliberately doesn't own.

---

### Cluster 4 — LLMX & DX

#### F14. x-lm.critical audit pass **[RESHAPE — typed attention + wire consumer]**

**Statement.** `x-lm.critical: true` appears ~24 times across three schemas. Per [`formspec/CLAUDE.md`](../../CLAUDE.md): "Schema nodes marked `x-lm.critical=true` MUST include both `description` and at least one `examples` entry." Many load-bearing properties unmarked: `Bind.calculate`, `Bind.relevant`, `Bind.constraint`, `Shape.severity`, `Shape.timing`, `Bind.nonRelevantBehavior`, `formPresentation.pageMode`, `layout.flow`, `layout.colSpan`, Component `responsive`, every Component `bind`.

**arch-validator's deeper critique.** Current `critical: boolean` is *primitive obsession*. Three distinct attentions conflated under one flag: (a) cross-tier identity (version pins, targetDefinition), (b) behavioral kernel (binds, calculate, dataType), (c) cascade/merge surprise (cssClass union, fallback drops widgetConfig). One flag, three meanings → dilution is structural.

**scout's blocker.** No consumer reads `x-lm.critical` today. MCP server (`formspec-studio/packages/formspec-mcp/`) doesn't surface it. Audit-without-consumer is theater.

**Resolution.**
1. Replace `critical: boolean` with `attention: "kernel" | "identity" | "cascade-surprise" | null` (closed enum, named seam).
2. Wire MCP consumer that surfaces `attention=kernel` nodes as must-read context in tool descriptions.
3. *Then* audit. Strip `critical` from theme conveniences (`Tokens`, `cssClass` — not actually kernel); add to truly kernel properties.
4. Add authoring lint asserting `attention=kernel` ⟹ `description` + ≥1 `examples`.

---

#### F15. Token namespace enforcement **[LINT, NOT SCHEMA]**

**Statement.** Theme spec recommends namespace prefixes (`color.*, spacing.*, …`); schema validates nothing.

**Convergence (3 of 4) on lint, not schema.** Pattern-locking in JSON Schema upgrades RECOMMENDED → MUST, freezes the catalog at today's 5 categories. Every new category (`motion.*`, `radius.*`, `shadow.*`) becomes a breaking schema change requiring `$formspecTheme` const bump. Fights [`token-registry-spec.md`](../../specs/theme/token-registry-spec.md)'s reason to exist.

**Resolution.** Add lint warning (W7xx range, opt-in) in `crates/formspec-lint/src/pass_theme/` and Python `validate/passes/theme.py`. Token Registry is the authority for category vocabulary; lint reads `tokens` against registered categories + `x-*` escape. Spec stays RECOMMENDED. No schema patternProperties.

---

#### F16. Make extensions discoverable **[ACCEPT — three-pronged]**

**Statement.** Every schema has `extensions` with `x-*` patterns; no registry of known extensions surfaced to authors.

**scout's key discovery.** Infrastructure exists. [`schemas/registry.schema.json`](../../schemas/registry.schema.json) (647 lines), [`specs/registry/extension-registry.md`](../../specs/registry/extension-registry.md), [`thoughts/adr/0056-closed-schemas-extension-registry-as-sole-open-seam.md`](../adr/0056-closed-schemas-extension-registry-as-sole-open-seam.md). `formspec-lint` Pass 3b (E600-E602) already validates extension keys against registry. **Gap is discovery surface, not infrastructure.**

**code-scout's drift call.** Component schema root has `patternProperties: { "^x-": true }` ([`component.schema.json:13-15`](../../schemas/component.schema.json)) and also has nested `extensions` ([`:121-125`](../../schemas/component.schema.json)). Follow-up review found this was not a bug to remove; it is a useful second extension lane when its semantics are documented. → **B4 disposition updated.**

**arch-validator's governance warning.** Reject centralized list (OpenAPI failed at federated cross-vendor governance). Use publisher-namespaced extensions (`x-<publisher>-*`) with optional `$registry` resolution. Federated naming, no central arbiter.

**Resolution.**
1. Keep root `x-*` keys as annotation-only local metadata and keep `extensions` as the governed semantic extension lane.
2. Standardize nested `extensions` shape across all three schemas via shared `$defs/Extensions`.
3. Add MCP tool (`formspec_extension_registry`) wrapping `registry_client::Registry::list` — exposes "what extensions exist?" to LLM authoring.
4. Add `$registry` resolution contract: extension MAY declare `$registry` pointing to a registry URL + entry name; processors MUST warn on unresolved but MUST NOT fail.

---

#### F17. Cross-tier validation lint **[ACCEPT — shared matrix seam]**

**Statement.** JSON Schema can't express "Component `bind: "X"` must reference an Item in target Definition" or "Theme selector `widget: 'moneyInput'` compatible with item `dataType: money`." Most common cross-tier authoring errors.

**scout's partial-shipped finding.** `crates/formspec-lint/src/pass_component/check_input_compat.rs` already implements W800 (bind resolves to item) + E802 (component↔dataType incompatible). `component_matrix.rs` encodes compatibility. **Missing:** Theme-side widget↔dataType equivalent in `pass_theme/`.

**CRITICAL BUG surfaced by code-scout.** `compatibleDataTypes: "number"` should be `"decimal"` on NumberInput ([`component.schema.json:520`](../../schemas/component.schema.json)), Slider ([`:1051`](../../schemas/component.schema.json)), Rating ([`:1079`](../../schemas/component.schema.json)) — Definition uses `decimal`, not `number`. Real schema drift; lint relies on this table. This is resolved in the current working tree. → **B1.**

**arch-validator's seam discipline.** Build a *shared machine-readable compatibility matrix* exported from `x-lm.compatibleDataTypes`. Lint AND runtime consume the SAME matrix. Without shared seam, lint and runtime drift silently.

**Resolution.**
1. **B1 resolved in current working tree** (one-line × 3 sites).
2. Add bind-path `pattern` enforcement to Component `bind`, `Bind.path`, and `Shape.target`: `^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z][a-zA-Z0-9_]*|\[\*\]|\[\d+\])*$` (catches syntactic typos).
3. Keep Theme `Region.key` as item-key resolution, not bind-path syntax, unless the Theme spec intentionally changes. Lint it as an item key reference.
4. Add `pass_theme/check_widget_compat.rs` reusing `component_matrix::classify_compatibility`. Phase 1: literal sites only (no cascade resolution) — catches 80% of LLM errors. Phase 2: port theme cascade to Rust for full fidelity (deferred).
5. Extract shared matrix as the named seam consumed by lint, runtime, AND MCP authoring tool.

---

#### F18. Widget-fallback config carry-forward **[RESHAPE — resolve contradiction]**

**Statement.** Theme spec ([`theme.schema.json:337,405`](../../schemas/theme.schema.json)) says fallback resolution does NOT carry `widgetConfig` forward. Component schema per-component `fallbackNotes` SAY config is preserved: `Columns→Grid` "gap preserved"; `Slider→NumberInput` "min, max, step preserved"; `Panel→Card` "title preserved"; etc.

**CRITICAL CONTRADICTION surfaced by code-scout.** Theme tier and Component tier directly disagree on fallback config policy. The two tiers operate by different rules.

**arch-validator's smell call.** `fallbackNotes: string` is *documentation-as-enforcement* — unenforceable narrative prose embedded in a structured schema. Runtime A and runtime B will silently disagree.

**Resolution.**
1. Replace prose fallback notes with structured fallback policy.
2. Keep a default preservation set: `bind`, `when`, `responsive`, `style`, `cssClass`, `accessibility`, and compatible `children`.
3. For component-specific props, require explicit `carry`, `drop`, or `translate` lists.
4. Unknown component-specific props drop with a warning unless a fallback policy carries or translates them.
5. Schema-enforce: when a custom `x-*` widget/component requires fallback, it must declare one explicitly. Missing required fallback is a lint error. → **B10.**
6. Capture fallback behavior in a small ADR before broad implementation.

---

## 4. Adjacent bugs surfaced (ship independently)

These are real defects the agents found while investigating. Each is independently actionable, separable from the findings above.

| ID | Bug | Fix |
|---|---|---|
| **B1** | `compatibleDataTypes: "number"` on NumberInput ([`component.schema.json:520`](../../schemas/component.schema.json)), Slider ([`:1051`](../../schemas/component.schema.json)), Rating ([`:1079`](../../schemas/component.schema.json)) — Definition uses `decimal` ([`definition.schema.json:589-604`](../../schemas/definition.schema.json)). | **Resolved in current working tree:** renamed to `decimal` × 3 sites. |
| **B2** | `theme-cascade.ts:90-93` replaces `cssClass` instead of unioning. Violates [`theme-spec.md:670`](../../specs/theme/theme-spec.md). Silent visual cascade bug. | **Resolved in current working tree:** cascade now unions/dedupes `cssClass`. |
| **B3** | `ResponsiveOverrides` prose says "MUST NOT contain component/bind/when/children/responsive" ([`component.schema.json:200`](../../schemas/component.schema.json)); `additionalProperties: {object}` accepts them silently. | **Resolved in current working tree:** added `propertyNames: { not: { enum: [...] }}`. |
| **B4** | Component root `x-*` and nested `extensions` looked contradictory in the initial review. Follow-up resolved them as two different extension lanes. | Keep root `x-*` as annotation-only metadata; keep `extensions` for governed semantic extension behavior; document the boundary. |
| **B5** | Definition `Presentation.additionalProperties: true` ([`definition.schema.json:1474`](../../schemas/definition.schema.json)) vs Theme `PresentationBlock.additionalProperties: false` ([`theme.schema.json:312`](../../schemas/theme.schema.json)). Forward-compat asymmetry. | Close schemas by default; add root `x-*` support to Definition/Theme/Component document roots; allow governed `extensions`; reject accidental unknown keys elsewhere unless the object is explicitly open (`style`, `tokens`, `params`, `extensions`). |
| **B6** | `Columns.widths` is positional-by-array-index; `when`-hidden child silently misaligns widths. | Removing `Columns` dissolves this. |
| **B7** | Theme `$ref`s Component schema for `TargetDefinition`, `Tokens`, `AccessibilityBlock`, `Breakpoints` ([`theme.schema.json:305,308,438,685`](../../schemas/theme.schema.json)). Lower-tier depends on higher-tier for primitives. | Promote to schema-bump prerequisite: extract `common.schema.json`; Theme + Component depend on it; include shared `Extensions` and later shared matrices. |
| **B8** | `Card.elevation: integer` is opaque (no token binding, no max). | Fold into token system (`$token.elevation.*`) when F9 lands. |
| **B9** | FEL null-treatment duplicated in `Bind.relevant` prose and `FELExpression` description. Two sources of truth. | Pin to canonical source on `Bind`; `FELExpression` points to it. |
| **B10** | Custom widget fallback chain not schema-enforced — theme spec says `x-*` widgets MUST include fallback; property is optional. | Add `if widget startsWith "x-", then fallback minItems: 1`. |

Plus:
- `widget` (Theme) and `widgetHint` (Definition) have no `enum` constraint — typos validate clean. Fix as part of F4.
- `FELExpression` has unique `x-lm.ref` sub-key (only site). Either promote to convention or drop.

---

## 5. Cross-cluster patterns

### P1. Page ownership is the unlock for cluster 1

F1 + F3 + F5 still share one architectural move, but the owner decision is now the accepted-alternative path, not ADR 0052 removal. Keep `theme.pages` as the compact page-level grid surface, rename Component `Page` to `Section`, drop `Item.layout.page` as runtime page authority, and lint Theme/Component page conflicts instead of merging them implicitly. Direct root `Section` children are page-bearing units under wizard/tabs pageMode; nested `Section` nodes are ordinary structure.

### P2. `x-lm` is a contract surface without a consumer

F14, F16, F17, F18 all converge on **one architectural move**: extract a machine-readable contract surface from `x-lm` (compatibility matrix, fallback policy, attention taxonomy, extension catalog) and let **lint AND runtime AND MCP** consume it as a single named seam. Building this scaffolding once delivers four findings.

### P3. Prose-as-enforcement is the recurring smell

F18 `fallbackNotes`, F10 ResponsiveOverrides prose, F12 NRB lifecycle, B3, B10 — schemas contain English sentences telling readers "MUST NOT" but enforce nothing. Replace narrative with structure where it's machine-checkable.

### P4. Single-runtime cascade collapses the parity hedge

scout cluster 3 confirmed: NRB lives only in Rust (`crates/formspec-eval/src/nrb.rs`); responsive lives only in TS (`packages/formspec-layout/src/responsive.ts`); theme cascade lives only in TS (`packages/formspec-core/src/theme-cascade.ts`). Python evaluator is retired (binary-only via PyO3). **Cross-runtime parity is no longer the load-bearing constraint** it once was for cluster-3 refactors. The "three runtimes must agree" hedge is mostly retired.

### P5. Vocabulary alignment was never done

F2, F4, F5, F8, F10 all trace to no cross-tier vocabulary alignment pass. Same concept named twice or three times (span/colSpan, position/placement, widget/component/widgetHint, page × 4). Cheap to unify, real DX/LLMX gain, zero behavioral change.

### P6. Mistaking proximity for coupling

arch-validator cluster 3 named it: cluster-3 findings (10, 12, half of 13) initially treated *syntactic proximity* as *semantic coupling*. Bind has three NRB properties because three consumers read them in three runtime phases. **Count downstream consumers before counting upstream properties.** Pressure-test future "collapse these N properties" proposals against this rule.

---

## 6. Execution Order

Use [`ui-schema-proposed-decisions.md`](./ui-schema-proposed-decisions.md) as the controlling implementation plan. This review explains why the plan exists.

1. **Bank the independent fixes.** Keep the resolved dataType, `cssClass`, responsive-override, and extension-lane fixes. Close the schema posture gap, rename `position` to `placement`, and add the `when` vs `relevant` decision table.
2. **Extract shared primitives first.** Create `common.schema.json` for `TargetDefinition`, `Tokens`, `AccessibilityBlock`, `Breakpoints`, shared `Extensions`, and later compatibility/fallback matrices. Do this before the larger UI-schema bump so Theme no longer depends upward on Component.
3. **Land one coordinated schema bump.** Bundle F1, F2, F5, F6, F7, and F9: remove `Columns` and `Spacer`, rename `Page` to `Section`, scope `span` to grid contexts, add visual surface props, add `GridTrack`, demote `Item.presentation.layout.page`, and update fixtures, generated types, renderers, lint, planner code, adapters, docs, and examples together.
4. **Codify shared policy seams.** Add the machine-readable compatibility/fallback/attention matrices, codify Theme/Component page precedence, and make lint consume the same artifacts that runtime and MCP tools will later consume.
5. **Keep governance in lint where schema would overfit.** Token namespace warnings and federated extension discovery belong in lint/tooling, not rigid schema patterns.
6. **Reject false simplifications.** Do not collapse the non-relevance trio. Do add lifecycle docs, targeted fixtures, and only mechanically obvious schema interdependency checks.

---

## 7. Confidence

| Finding | Confidence | Note |
|---|---|---|
| F1, F2, F5, F6, F7, F8, F11, F13, B1–B10 | HIGH | Deterministic schema reads + spec citations; B7 promoted from adjacent bug to prerequisite schema hygiene. |
| F4 | HIGH | PascalCase canonical direction chosen; TS workaround table proves the debt. |
| F9 | HIGH on need; MEDIUM on prop set bounds | Easy to scope-creep into reinventing CSS. |
| F10, F12 | HIGH on reshape direction; rejected collapse with strong basis | arch-validator's "count consumers" rule load-bearing. |
| F14 | MEDIUM | Depends on MCP consumer wiring; without consumer, theater. |
| F15 | HIGH on lint-not-schema | Token Registry spec governance argument decisive. |
| F16 | HIGH on infrastructure exists; MEDIUM on best MCP surface shape | Federated naming over central registry per OpenAPI precedent. |
| F17 | HIGH on bug + lint direction; MEDIUM on cascade-resolution port cost | B1 fix is unconditional. |
| F18 | HIGH on contradiction; MEDIUM on exact fallback map | Structured fallback policy chosen; runtime details deserve a small ADR. |
| F3 | HIGH on current direction | Keep `theme.pages`, rename Component `Page` to `Section`, and lint precedence/conflicts. |

---

## 8. Owner decisions captured

1. **F3 — ADR 0052 removal path rejected for v1.** Keep `theme.pages`; use Component `Section` for explicit structure; make precedence and lint behavior explicit.
2. **F4 — PascalCase canonical.** Definition `widgetHint`, Theme `widget`, and Component `component` should use the same PascalCase built-in vocabulary; custom widgets stay `x-*`.
3. **F6 — remove `Columns`.** `Grid` is the only Component grid primitive; no deprecation period and no `Row`/`Columns` syntax sugar.
4. **F7 — remove `Spacer` after visual surface props.** Use `Stack`/`Grid` gap, grid placement, Theme spacing tokens, and container padding.
5. **F12 — preserve the non-relevance trio.** Add docs, fixtures, and only mechanically obvious schema interdependency checks.
6. **F18 — structured fallback policy.** Replace prose fallback notes with carry/drop/translate policy and capture runtime semantics in a small ADR.
7. **B4/B5 — extension and closedness posture.** Keep root `x-*` annotations, keep governed `extensions`, add root `x-*` support to Definition and Theme as a schema/spec change, and close unknown non-`x` keys by default.
8. **B7 — common schema extraction.** Treat `common.schema.json` extraction as a prerequisite, not an adjacent cleanup.

---

## 9. Methodology notes (for future review skill iteration)

**What worked.**
- 4-lens dispatch (spec + scout + code-review + arch-validation) per cluster: each lens caught what others missed. spec-expert anchored normative claims; scout found the codebase workarounds and prior ADRs; code-scout grounded everything in file:line; arch-validator pressure-tested every finding hostilely.
- Greenfield posture explicitly stated in agent prompts: agents recommended migrations the cautious default would have rejected.
- Adjacent-bug surfacing: 4 of the 10 bugs (B1, B2, B4, B6) would not have been found without the structured review skill methodology.

**What to refine.**
- 16 agents × 700 words = high synthesis burden. Consider 8 agents (2 per cluster, hybrid lenses) for next iteration unless the cluster genuinely warrants four independent views.
- Several findings (F3, F4, F12) had load-bearing disagreement among lenses; the *disagreement itself* was the most valuable output. Worth surfacing disagreement explicitly in the synthesis rather than collapsing to majority.
- Some agents missed the Skill tool requirement (TaskCreate/Read-tool warnings); skill instructions in prompts could be sharper.

---

**Status:** REVIEW UPDATED. This file preserves evidence and rationale. Implementation should proceed from [`ui-schema-proposed-decisions.md`](./ui-schema-proposed-decisions.md).

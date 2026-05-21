# UI Schema Proposed Decisions

Date: 2026-05-20
Source review: `thoughts/reviews/ui-schema.md`
Lens: greenfield project, cheap refactoring, no ratified legacy surface, maximize user value, extension flexibility, and low architecture debt.
Status: controlling decision artifact for the UI-schema cleanup. `ui-schema.md` remains the evidence record; this file wins if the two diverge.

## Executive Verdict

Use the ADR 0052 accepted-alternative path for v1.

Keep `theme.pages` because it gives non-Studio and compact JSON authors a useful page-layout surface that the current system can reconcile with Component documents. The architecture work is not immediate removal; it is making the authority rules explicit enough that Theme page layout does not become an accidental second source of truth.

Current v1 direction:

- `definition.formPresentation.pageMode` owns navigation mode: single, wizard, tabs, or equivalent presentation modes.
- Component documents own explicit authored structure when present.
- `theme.pages` remains supported for forms that do not carry explicit Component structure.
- Theme continues to own cascade, tokens, style defaults, widget selection, and its existing page-level grid surface until a better compact authoring path clearly supersedes it.

## Implementation Order

1. **Bank independent fixes.** Keep the resolved dataType, `cssClass`, responsive-override, and extension-lane fixes. Close the schema posture gap, rename `position` to `placement`, and add the `when` vs `relevant` decision table and fixtures.
2. **Extract `common.schema.json`.** Move `TargetDefinition`, `Tokens`, `AccessibilityBlock`, `Breakpoints`, shared `Extensions`, and later compatibility/fallback matrices before the coordinated schema bump.
3. **Land one coordinated schema bump.** Rename Component `Page` to `Section`, remove `Columns`, remove `Spacer` after visual surface props land, scope `span` to grid contexts, add `GridTrack`, demote `Item.presentation.layout.page`, and update generated types, fixtures, planner code, renderers, adapters, lint, docs, and examples together.
4. **Codify page precedence.** Component direct-root `Section` page units win when present. Otherwise `theme.pages` may define page layout. Do not implicitly merge competing page structures; lint conflicts.
5. **Build shared policy matrices.** Put compatibility, fallback, attention, extension discovery, token references, and breakpoint alignment in machine-readable artifacts consumed first by Rust lint, then by runtime and MCP authoring tools.
6. **Keep lint/tooling work separate from schema work.** Token namespace governance, extension discovery, and invalid responsive-prop checks belong in lint/tooling unless a local structural rule can be enforced cleanly in schema.

## User Value Narratives

These surfaces are justified only if each has a distinct user value narrative:

- `theme.pages`: "I have a normal form definition and want to organize it into pages or regions without learning a full Component tree." This serves compact JSON authors, importer pipelines, template authors, and non-Studio users.
- Component documents: "I need an explicit authored UI structure because the form is more than a list of fields." This serves Studio, advanced builders, custom renderers, and complex authored forms.
- `definition.formPresentation.pageMode`: "I want the same structure to render as single-page, wizard, tabs, or another navigation mode without rewriting the layout." This serves form owners who need navigation flexibility.
- Theme cascade and tokens: "I want to apply a brand, design system, or deployment-specific look without changing form meaning or structure." This serves organizations, renderer teams, and multi-tenant deployments.
- Root `x-*`: "I need local metadata for my org, pipeline, migration, analytics, or workflow without asking Formspec to standardize it." This serves bespoke adopters and internal platform teams.
- `extensions`: "I need portable custom behavior that other processors can understand, validate, lint, or execute." This serves ecosystem extensions, domain plugins, renderer capabilities, and shared enterprise conventions.

The architecture rule is that these narratives should not blur. If a surface starts serving another surface's narrative, either formalize that crossing or move the behavior to the surface that already owns it.

## Layout Model Lens

Use the familiar Flexbox vs CSS Grid split to keep layout decisions legible:

- Flow layout is flex-like. `Stack` owns direction, gap, alignment, wrapping, and ordinary one-dimensional grouping.
- Grid layout is grid-like. `Grid` and `theme.pages` own tracks, regions, spans, starts, and responsive placement.
- Navigation is not layout. `formPresentation.pageMode` decides whether the active structure renders as single-page, wizard, tabs, or another navigation mode.
- Authored structure is not a layout algorithm. Component documents describe the user's intended UI hierarchy and may contain flow or grid primitives.

This lens makes several options clearer: keep Theme pages as a compact page-grid surface, keep `Stack` as the flow primitive, keep `Grid` with a real two-dimensional contract, remove `Columns`, reject `Row`/`Columns` sugar for v1, scope `span` to grid contexts, and remove `Spacer` once gap and padding cover the legitimate use cases.

## Proposed Answers To Remaining Review Questions

### 1. Grid Contract

Make `Grid` the only Component-level grid primitive.

- `columns` should accept an integer, an array of track values, or a CSS grid-template string.
- Prefer arrays for authored JSON: `["2fr", "1fr"]` is clearer and safer than `"2fr 1fr"`.
- Treat numeric array entries as `fr` weights: `[2, 1]` means `["2fr", "1fr"]`.
- Add `$defs/GridTrack`: string values are CSS track fragments or `$token.*` references; numeric values MUST be greater than 0 and normalize to `fr` weights; `columns` arrays MUST have at least one entry.
- Keep string templates as the advanced escape hatch for CSS-compatible renderers.
- Add `gap` and `rowGap`; add `columnGap` only if authors need asymmetric gaps often enough to justify it.
- Put child placement in a typed grid placement object, not as universal loose props. Proposed shape: `layout.grid.{span,start,rowSpan,rowStart}` on children of `Grid`.
- Keep named page regions in `theme.pages`; do not add named grid areas to Component `Grid` in v1 unless a concrete authoring use case appears.

### 2. Stack Contract

Make `Stack` the only Component-level flow primitive.

- Keep `direction`, `gap`, `align`, and `wrap`.
- Add `justify` for main-axis distribution.
- Let responsive overrides change `direction`, `gap`, `align`, `justify`, and `wrap`.
- Do not add `Row`; examples and helpers should emit `Stack` with `direction: "horizontal"`.

### 3. Visual Surface Props

Add a small shared visual surface contract before removing `Spacer`.

- Apply it to `Section`, `Stack`, `Grid`, `Card`, `Panel`, and other true containers.
- Include `padding`, `background`, `border`, `radius`, and `elevation`.
- Keep `margin` out of v1; parent layout should own sibling spacing through `gap` or grid placement.
- Keep `overflow`, `minHeight`, and detailed CSS controls in `style` unless repeated authoring evidence justifies first-class props.

### 4. Component `Page` Vs `Section`

Rename Component `Page` to `Section` and remove the generic Component `Page` primitive.

- `theme.pages` remains the page-layout model.
- `formPresentation.pageMode` remains the navigation-mode switch.
- Component `Section` is the structural grouping primitive.
- Direct root `Section` children are the Component-side page units when `pageMode` calls for wizard or tabs navigation.
- Nested `Section` nodes are ordinary structure and MUST NOT shadow `theme.pages`.
- Core spec §4.1.2 and Component spec §5.4 must replace `Stack > Page*` language with an abstract active page unit: direct root `Section` units when present, otherwise Theme `PageLayout` units when a Component document has no page-bearing structure.

### 5. Theme/Component Precedence Lint

Keep both Theme and Component layout surfaces, but make conflicts visible.

- Runtime rule: explicit Component structure wins over Theme page layout.
- `theme.pages` applies when no explicit direct-root Component `Section` page units exist.
- A partial Component tree without direct-root `Section` page units may still use Theme page regions for fallback/unbound items.
- A Component tree with direct-root `Section` page units owns page sequencing; unbound required fallback items render in a final fallback section unless a future named policy says otherwise.
- Lint should warn when Theme pages are shadowed by Component structure.
- Lint should error when the same bound field is assigned to incompatible page/section locations across active Theme and Component structures.
- Do not implicitly merge Theme page regions with Component sections.

### 6. Widget Vocabulary

Use PascalCase as the canonical built-in widget/component vocabulary across Definition, Theme, and Component.

- `widgetHint`, Theme `widget`, and Component `component` should reference the same built-in names.
- Custom widgets remain `x-*`.
- Add schema enum/pattern validation so typos do not validate.
- Remove the translation-table pattern as a normative requirement. Authoring helpers can still accept aliases outside the spec and emit canonical names.

### 7. Fallback Policy

Replace prose fallback notes with structured fallback policy.

- Keep a default preservation set: `bind`, `when`, `responsive`, `style`, `cssClass`, `accessibility`, and compatible `children`.
- For component-specific props, require explicit `carry`, `drop`, or `translate` lists.
- Unknown component-specific props should drop with a warning unless a fallback policy carries or translates them.
- Custom `x-*` widgets/components that require fallback should declare one explicitly; missing required fallback is a lint error.
- Write this as a small ADR because fallback behavior is runtime policy.

### 8. Responsive Model

Keep responsive overrides as shallow presentational patches, but add stronger validation.

- Keep the current forbidden structural keys: `component`, `bind`, `when`, `children`, and recursive `responsive`.
- Allow `hidden` as a presentational override with data-preserving semantics.
- Normative rewrite: replace current Component-over-Theme same-name breakpoint precedence with a shared breakpoint namespace. Resolve breakpoints from Theme plus Component additions; same-name breakpoint values must match.
- Use lint, not giant per-component JSON Schema, to reject responsive props that are invalid for the target component.
- Responsive overrides may change flow/grid layout props, but must not change logical child order or binding identity.

### 9. Closedness And Extensions

Close schemas by default with two intentional escape hatches.

- Allow root `x-*` on document roots for local annotation metadata.
- Use `extensions` for governed, portable extension behavior.
- Reject unknown non-`x` root keys.
- Normative rewrite: add root `x-*` support to Definition and Theme as well as Component, with annotation-only semantics.
- Keep component nodes and nested schema objects closed unless the object is explicitly an open map, such as `style`, `tokens`, `params`, or `extensions`.
- Do not let root `x-*` become semantic behavior unless it is promoted into `extensions`.

### 10. Cross-Tier Lint Matrix

Build one shared machine-readable matrix for cross-tier authoring checks.

- Include bind-path syntax.
- Split bind-path checks from item-key checks: `Bind.path` and `Shape.target` use path syntax; Theme `Region.key` resolves against item keys and is not a bind path unless the Theme spec changes.
- Include component/widget to `dataType` compatibility.
- Include Theme widget compatibility, not only Component compatibility.
- Include token resolution and token namespace warnings.
- Include breakpoint namespace alignment.
- Include Theme/Component page-structure conflict checks.
- Extract `common.schema.json` first so Theme does not depend upward on Component for shared primitives. Move `TargetDefinition`, `Tokens`, `AccessibilityBlock`, `Breakpoints`, shared `Extensions`, and later shared matrices there.
- Rust lint should consume this matrix first; runtime and MCP authoring tools may consume the same artifact later.

## Proposed Decisions

### D1. Keep Two Extension Lanes

Keep both root `x-*` keys and the structured `extensions` object.

- Root `x-*` keys are local annotation metadata for bespoke users and tooling. Engines and core lint ignore them unless a project-specific lint profile opts in.
- `extensions` is the governed semantic extension lane for portable, registered, linted, or processor-interpreted behavior.
- Non-prefixed unknown root keys remain invalid.
- Definition and Theme root `x-*` support is an explicit schema/spec change; Component already has this lane.
- Add docs and lint guidance that semantic behavior belongs in `extensions`, not root `x-*`.

Rationale: this preserves cheap local extensibility without polluting core engine contracts or forcing every bespoke use into the extension registry.

### D2. Close Schemas By Default

Set schema posture to closed by default:

- Allow known properties.
- Allow root `x-*` annotations on Definition, Theme, and Component document roots.
- Allow governed `extensions`.
- Reject accidental unknown keys everywhere else.

Rationale: a greenfield schema should catch mistakes early while still giving users intentional escape hatches.

### D3. Keep Theme Page Layout As Page-Level Grid

Keep `theme.pages`, `PageLayout`, `Region`, and locale `$page.*` for now.

Do not treat this as a legacy concession. Treat it as the compact page-level grid surface for authors who need page regions without writing a full Component tree.

Rationale: this matches the CSS Grid mental model: named regions, column spans, starts, and responsive placement. The architectural cost is manageable if precedence is explicit.

### D4. Define Layout Authority Precedence

Keep both layout surfaces, but remove ambiguity:

- If a Component document declares page or section structure, renderers and planners should use that structure.
- If no direct-root Component `Section` page units exist, `theme.pages` may define page layout.
- Do not merge competing page structures implicitly.
- If both surfaces define incompatible page structure, lint should report the conflict or require an explicit project policy.
- Partial Component trees without direct-root `Section` page units may still use Theme page regions for fallback/unbound items; Component trees with direct-root `Section` page units own page sequencing.
- Studio may continue to write Component structure as its primary editing model without deleting Theme page support.
- `definition.formPresentation.pageMode` controls navigation presentation across whichever structural source is active.

Rationale: this preserves the useful compact authoring path without making users guess which page model wins.

### D5. Rename Component `Page` To `Section`

Rename the generic Component `Page` concept to `Section` and remove Component `Page` from the v1 canonical vocabulary.

Direct root `Section` children are page-bearing units when `formPresentation.pageMode` renders wizard or tabs navigation. Nested `Section` nodes are ordinary structure. Core spec §4.1.2 and Component spec §5.4 must be updated alongside the schema/runtime rename.

Rationale: `Page` overloads navigation, document structure, and visual grouping. `Section` is a more flexible primitive for greenfield authoring.

### D6. Keep Widget Vocabulary Canonical And PascalCase

Adopt PascalCase as the canonical built-in component/widget vocabulary across Definition, Theme, and Component.

Custom widgets remain `x-*`. Authoring tools may accept aliases, but schema, spec, generated types, and fixtures should use canonical names.

Rationale: ambiguous duplicate spellings increase schema, docs, generated types, and renderer complexity without creating meaningful user value.

### D7. Keep The B1-B4 Fixes

Keep the implemented fixes from the review pass:

- B1: align numeric component `dataType` vocabularies with the current generated spec.
- B2: merge `cssClass` across presentation cascade levels instead of replacing it.
- B3: forbid responsive override keys with `propertyNames`, not only object-valued `properties` checks.
- B4: keep root `x-*` support, extend it to Definition and Theme document roots, and document annotation-only semantics.

Rationale: these are correctness fixes or deliberate extension-surface decisions, not legacy concessions.

### D8. Scope `span` To Grid Contexts

Keep `span` where the active parent is grid-like: Theme regions, Component `Grid`, or a documented page-grid context.

Do not make bare `span` a universal ComponentBase property with unclear behavior. If a generic placement property is needed, use a typed layout object that declares its context.

Rationale: `span` is intuitive inside a grid model and confusing outside one. The schema should expose layout intent in terms users and renderers can validate.

### D9. Keep `Grid`; Remove `Columns`

Keep `Grid` as the Component-level two-dimensional layout primitive if the engine owns a clear, testable grid contract: tracks, spans, starts, gaps, and responsive placement.

Remove `Columns` from the canonical Component vocabulary. Do not carry a deprecation period in v1.

Do not replace it with `Row`/`Columns` syntax sugar. `Row` is just `Stack` with `direction: "horizontal"` unless it gains a distinct flow contract, and `Columns` is just `Grid.columns` when authored as track widths.

Rationale: Formspec should expose the same two mental models users already know: flow layout and grid layout. A third near-grid or row alias primitive adds vocabulary debt without enough user value.

### D10. Remove `Spacer` After Gap And Padding Are Covered

Do not keep `Spacer` as a layout primitive once `Stack`/`Grid` gaps, Theme spacing tokens, and visual surface padding cover the legitimate spacing use cases.

Keep it only if it represents a meaningful authored visual affordance with accessible rendering rules.

Rationale: Flex-like layout has `gap`; grid-like layout has gaps and tracks; surfaces have padding. A standalone spacer mostly encodes brittle visual adjustment as content.

### D11. Split Placement Semantics From Visual Tuning

Keep field/component placement and visual tuning distinct.

- Structural placement belongs in the Component tree when explicit Component structure exists, or in `theme.pages` when Theme is the active layout source.
- Fine visual tuning belongs in Theme or presentation options.

Rationale: mixing these concerns makes renderer portability and linting harder.

### D12. Treat The NRB Trio As A Product Decision, Not Schema Trivia

If `notice`, `required`, and `blocking` semantics are part of the form experience, define them as first-class behavior with validation and rendering expectations.

If they are only current renderer affordances, keep them out of the core schema until the product contract is clear.

Rationale: user-facing obligation and blocking behavior need stronger semantics than ad hoc presentation flags.

### D13. Keep LLM Or Authoring Metadata Out Of Runtime Semantics

Keep `x-lm`, examples, prompts, hints, and authoring-assist metadata as annotations or tooling inputs.

They should not change runtime validation or rendering semantics unless promoted into a governed extension.

Rationale: authoring assistance is valuable, but it should not create hidden engine behavior.

### D14. Keep Fallback Behavior Explicit

Replace prose fallback notes with a structured fallback policy.

- Default preservation set: `bind`, `when`, `responsive`, `style`, `cssClass`, `accessibility`, and compatible `children`.
- Component-specific props must be listed as `carry`, `drop`, or `translate`.
- Unknown component-specific props drop with a warning unless the fallback policy carries or translates them.
- Capture the runtime policy in a small ADR before broad implementation.

Rationale: fallback paths are user-visible reliability behavior, not loose metadata.

### D15. Add Token And Cascade Linting

Add lint checks for token references, cascade conflicts, page-structure conflicts, and presentation values that cannot be resolved.

Rationale: keeping Theme page layout makes conflict detection more important, not less.

## Not Recommended

Do not remove `theme.pages` solely for architecture neatness while it still provides a real compact-authoring benefit.

Do not remove root `x-*` annotations from document roots. They are a useful low-friction escape hatch when clearly separated from governed `extensions`.

Do not keep duplicate structural layout paths without clear precedence, lint behavior, and documentation.

Do not introduce a vague middle layout model between flow and grid. New layout primitives should clearly belong to one of those two models or remain renderer-local.

Do not add `Row`/`Columns` aliases as convenience sugar in v1. Prefer examples, snippets, and authoring helpers that emit `Stack` or `Grid`.

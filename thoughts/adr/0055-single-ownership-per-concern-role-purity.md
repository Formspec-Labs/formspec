# ADR 0055: Single-Ownership-Per-Concern — Companion Document Role Purity

**Status:** Proposed
**Date:** 2026-05-17

## Context

Formspec's three-tier architecture names a strict separation of concerns. Core spec §2.3 states the separation "is not a suggestion — it is an architectural invariant." Component spec §1.2 states the Definition's behavioral rules "always govern data semantics." Locale spec §1.2 states Locale Documents "MUST NOT affect data collection, validation logic, or behavioral semantics." SKILL.md's Critical Behavioral Rules table echoes these as runtime invariants for theme and locale.

These are normative prohibitions on runtime *effect* — they do not define a static authoring constraint. The specs establish *which document wins*; they do not specify what is forbidden to appear *in* a companion document. The gap: a component author can write `min: 1` and `max: 100` on a `NumberInput` — values that are conceptually business constraints — without any validator objecting. A theme author can embed arbitrary data in `widgetConfig` (which has `additionalProperties: true` in `theme.schema.json`). The spec says the Definition's constraint *wins*; it does not say the component *cannot carry* the constraint.

The CUE principle is stronger: **one authoritative source per concern, contradictions caught statically.** Formspec should adopt this. The invariant:

- `definition.json` is the **sole** source of business logic — constraints, defaults, FEL binds, validation shapes, dataTypes, required-ness, option sets, dependencies.
- `component.json` is **purely rendering** — widget choice, layout, visual hierarchy. No business constraints, no FEL-evaluable validation, no dataType narrowing.
- `theme.json` is **purely visual tokens** — spacing, color, typography, widget selection, cascade overrides. No FEL-evaluable binds, no conditional values that affect behavior.
- `locale.json` is **purely translation/formatting** — display strings, FEL interpolation in display strings, date/number format hints. No constraint expressions disguised as translations.
- `mapping.json` owns **adapter transforms only** — field-level shape-shifting between Formspec response and external schemas. Business constraints flow from definition; mapping does not introduce them.

### Current enforcement gap

`formspec-lint` runs 8 passes (E100–E902). Passes 6 (theme, W700-W711/E710) and 7 (component, E800-E807/W800-W804) check structural integrity and cross-reference correctness. Neither checks **role purity**.

Schema-level audit of what companion documents *can* carry today:

**`component.schema.json`** — Several Input components carry rendering-adjacent props that shade into business constraint territory:
- `NumberInput`: `min`, `max`, `step` (numeric bounds)
- `Slider`: `min`, `max`, `step` (numeric bounds)
- `MoneyInput`: `min`, `max`, `step` (amount bounds)
- `DatePicker`: `minDate`, `maxDate` (ISO 8601 date bounds)
- `FileUpload`: `maxSize` (bytes), `accept` (MIME type list), `multiple` (boolean)

The spec describes these as presentation configuration for the widget renderer — not as constraints that affect the `ValidationReport`. But `NumberInput.min = 0` in a component document is functionally identical in user perception to `items[k].binds[].constraint: "$ >= 0"` in the definition. If definition defines `constraint: "$ >= 1"` and component says `min: 0`, the data is valid at 0.5 per the definition but the input control rejects it. This is a contradictable split; the spec is silent on whether this split is permissible.

**`theme.schema.json`** — `PresentationBlock.widgetConfig` has `additionalProperties: true`, making it structurally unconstrained. A theme author could embed FEL strings or constraint-like values there. No lint currently warns on this. The theme does not have a FEL parser, so FEL strings in widgetConfig are opaque. This is lower risk than component but is a schema gap.

**`locale.schema.json`** — The `strings` map is cleanly constrained: `additionalProperties: { type: "string" }` and key patterns are limited to known prefixes. The locale schema cannot structurally carry validation constraints. The primary risk vector is the `locale()` FEL function being called from Definition binds (locale spec §5.1 — available in `calculate`, `relevant`, `constraint`, `readonly`), making locale influence on behavior indirectly possible. This is by design and normatively sanctioned; it is not a role-purity violation in the definition document itself.

**Current lint result**: Zero passes enforce role purity. The spec states the invariant; the tooling does not police it.

## Decision

### The invariant, stated normatively per document type

**Definition** (Tier 1 + behavioral):
- SOLE owner of: item keys, dataTypes, bind expressions (`calculate`, `relevant`, `required`, `readonly`, `constraint`, `default`), validation shapes, option sets, `initialValue`/`prePopulate`, `minRepeat`/`maxRepeat`, `semanticType`, `formPresentation.pageMode`, `formPresentation.defaultCurrency`.
- Advisory only (non-authoritative): `presentation` hints, `widgetHint`, layout annotations.

**Component** (Tier 3):
- Owns: component type selection, tree structure, slot binding (`bind` as identifier — not a constraint), `when` (FEL for *visual* conditional only, not data relevance), responsive layout, design token overrides (`tokens`), accessibility overrides.
- MUST NOT carry: numeric bounds intended as validation constraints (`min`/`max`/`step` on numeric/date inputs) that contradict or substitute for definition bind constraints; MIME-type restrictions (`accept`) or size limits (`maxSize`) that constitute business rules rather than widget affordances; FEL expressions outside `when` and display text interpolation.
- **Clarification for ambiguous rendering props**: `NumberInput.min`/`max`, `Slider.min`/`max`, `MoneyInput.min`/`max`, `DatePicker.minDate`/`maxDate` are permitted as *widget affordances* (they control the input control's range UI) but MUST NOT introduce constraints absent from the definition's binds/shapes. If definition has no bind constraint on a field and the component sets `max: 100`, that is a business rule expressed in the wrong document. Lint must detect when these props appear on fields that have no corresponding definition bind constraint.
- `FileUpload.accept` and `FileUpload.maxSize` are widget affordances (what the file picker shows/enforces in UI) but shadow business constraints. Their presence without a matching definition constraint is a role-purity violation.

**Theme** (Tier 2):
- Owns: design tokens, selector cascade, widget selection, `widgetConfig` (presentation-only widget configuration), `labelPosition`, CSS classes, styling.
- MUST NOT carry: FEL expressions as `widgetConfig` values (theme has no FEL evaluator; FEL strings there are dead code at best, misleading at worst); conditional logic expressed via selector `match` that narrows dataType scope in a behaviorally meaningful way beyond visual differentiation.
- **Open schema risk**: `widgetConfig.additionalProperties: true` must remain open for legitimate widget configuration but should not be exploited to carry FEL-evaluable expressions.

**Locale** (companion):
- Owns: display strings, FEL interpolation within display strings, fallback cascade.
- MUST NOT carry: constraint expressions, FEL expressions in string values that reference bind-critical paths (interpolation in display strings is permitted; embedding a validation rule as a string value is not structurally possible given the locale schema — the schema already enforces strings-only).
- **Current assessment**: locale schema is already structurally correct; no schema tightening required. The `locale()` FEL function in definition binds (locale spec §5.1) is by design, not a violation.

**Mapping** (companion):
- Owns: forward/reverse field transforms, type coercions, value maps, conditional rules (FEL guard expressions for routing, not validation).
- MUST NOT carry: validation constraints that substitute for definition bind shapes. Mapping `condition` expressions are routing guards, not business validators.
- **Current assessment**: mapping schema does not allow shape/constraint declarations; no schema tightening required.

### New lint pass: Pass 9 — Role Purity (E1000–E1004)

NOTE: Pass 9 codes E1000–E1003 are also proposed by ADR 0054 (Companion Constraint Intersection) for a different concern (cross-document constraint intersection). If both ADRs land, this ADR's codes should renumber to E1010–E1014 or share a coordinated allocation. Numbering coordination is an open question.

Codes:

| Code | Severity | Target doc | Rule |
|------|----------|-----------|------|
| `E1000` | error | component | Numeric or date bound (`min`/`max`/`minDate`/`maxDate`) on a component input with no corresponding definition bind constraint on that field |
| `E1001` | error | component | `FileUpload.maxSize` or `FileUpload.accept` on a field with no matching definition constraint |
| `E1002` | warning | component | `NumberInput`/`Slider`/`MoneyInput` `step` value on a field with no definition constraint; may impose hidden precision restriction |
| `E1003` | warning | theme | FEL-looking string value in `widgetConfig` (heuristic: value contains `$` or `{{`); theme has no FEL evaluator |
| `E1004` | error | component | FEL expression in a component property other than `when` or a spec-sanctioned display text interpolation |

**Diagnostic shape** (example for E1000):

```
E1000: business constraint in component document — no matching definition bind
  component.json:$.tree.children[3].max = 100          [component.json:88]
  field 'monthlyBudget' (decimal) has no 'constraint' or 'required' bind in definition
  → max is a business constraint; move to definition.items[monthlyBudget].binds
  → component documents carry rendering affordances only
```

**Diagnostic shape** (example for E1001):

```
E1001: business constraint in component document — no matching definition bind
  component.json:$.tree.children[7].maxSize = 5242880  [component.json:112]
  field 'supportingDoc' (attachment) has no size constraint in definition binds or shapes
  → maxSize enforces a business rule; move constraint to definition shapes
  → component documents carry rendering affordances only
```

**Diagnostic shape** (example for E1003):

```
W1003: possible FEL expression in theme widgetConfig — theme has no FEL evaluator
  theme.json:$.defaults.widgetConfig.placeholder = "{{$userName}}"  [theme.json:44]
  → FEL interpolation is not evaluated in theme documents
  → move dynamic content to locale strings or component display text
```

### Pass implementation approach

Pass 9 requires cross-artifact lint context: the component (or theme) document AND the definition. It is structurally analogous to the existing cross-artifact checks in pass 7 (`lint_component` with `definition: Option<&Value>`) and pass 6 (`lint_cross_artifact`). The same optional-definition pattern applies.

For E1000/E1001/E1002: walk the component tree, collect all Input nodes with `bind` set; for each node carrying `min`, `max`, `minDate`, `maxDate`, `maxSize`, `accept`, or `step`, look up the bound field in the definition; check whether a bind with `constraint`, `required`, or a shape targeting that field path exists. If not, emit the appropriate code.

For E1003: walk `theme.widgetConfig` values at all cascade levels; apply a heuristic regex (`/\$[a-zA-Z]|{{/`) to string values.

For E1004: walk the component tree for any node property containing a FEL expression string outside of `when` or explicitly listed display text properties (`text`, `title`, `description`, `label`, string interpolation props per component spec §7.2).

## Consequences

### Spec edits

1. **Core spec §2.3**: Extend the three-layer separation invariant to explicitly state the companion-document prohibitions. Currently §2.3 describes what each layer *is*; add normative language that companion documents MUST NOT carry properties that belong to a lower tier's exclusive ownership.

2. **Component spec §1.2**: Add a normative clause: "Component Documents MUST NOT introduce business constraints on bound fields. Widget affordance properties (`min`, `max`, `minDate`, `maxDate`, `maxSize`, `accept`) that express business rules without a corresponding Definition bind constraint are a role-purity violation."

3. **Theme spec §1.2**: Add: "Theme Documents MUST NOT embed FEL-evaluable expressions. `widgetConfig` values MUST be literal scalars or `$token.` references."

4. **Locale spec §1.2**: Already normatively correct. No spec edit required.

### Schema tightenings

| Schema | Change |
|--------|--------|
| `theme.schema.json` — `PresentationBlock.widgetConfig` | Consider tightening `additionalProperties` to `{ type: ["string", "number", "boolean"] }` to prevent object-valued nested config; or add `x-lm` annotation flagging FEL risk. Full additionalProperties closure is a breaking change for legitimate widget config; scoped warning via lint is preferable. |
| `component.schema.json` — `NumberInput`, `Slider`, `MoneyInput`, `DatePicker`, `FileUpload` | Add `x-lm: { intent: "widget affordance — must not substitute for definition bind constraint", critical: true }` on `min`, `max`, `minDate`, `maxDate`, `maxSize`, `accept`. No structural change yet; the lint rule enforces presence of definition counterpart. |

Structural removal of `min`/`max` from component schema is **not proposed** in this ADR. These props are legitimate rendering affordances (they control input control behavior, stepper ranges, calendar bounds) and are normatively present in the spec. The constraint is not their absence but their use without a definition-side counterpart.

### Lint codes to register in `specs/lint-codes.json`

Pass 9. Codes: E1000 (error), E1001 (error), E1002 (warning), E1003 (warning), E1004 (error). Coordinate numbering with ADR 0054.

### Migration / rollout

- **Existing component documents with `min`/`max`**: Those paired with definitions that have corresponding bind constraints are compliant; E1000 fires only when the definition has *no* constraint. Authors targeting zero-floor numeric fields (e.g., a currency amount that must be non-negative) need to add `constraint: "$ >= 0"` to the definition bind and can retain the component `min: 0` as a rendering affordance.
- **Theme documents with FEL-looking widgetConfig**: W1003 is a warning, not an error. Authors receive a signal to move dynamic content to locale strings. No documents are broken.
- **Spec is unreleased (Draft)**: No external consumers; no deprecation period required for schema changes.
- **`pass_component` and `pass_theme` in Rust**: Pass 9 adds a new module; existing passes are unchanged.

## Open Questions

1. **Lint code coordination with ADR 0054**: ADR 0054 also proposes E1000–E1003 for cross-document intersection. Renumber one of the two; recommendation: ADR 0054 keeps E1000-class, this ADR moves to E1010–E1014.

2. **`FileUpload.accept` specifically**: Is MIME-type restriction a business rule or a rendering affordance? An attachment field that by business rule must be a PDF should constrain that in the definition (via a constraint shape checking MIME type on the response). A component `accept: "application/pdf"` is a file-picker hint that cannot be enforced by a web renderer (users can rename files). Recommendation: treat `accept` as rendering-only (no lint rule required); treat `maxSize` as business-critical (E1001 fires without definition counterpart).

3. **`DatePicker.minDate` / `maxDate` with literal ISO dates**: Static date bounds (e.g., `minDate: "2020-01-01"`) are business constraints masquerading as rendering hints. However, definition bind constraints for date ranges require FEL expressions referencing `today()` or fixed dates. If a definition already has `constraint: "$ >= @2020-01-01"`, the component `minDate` is redundant but harmless. If the definition has no constraint, `minDate` is the only enforcement — which is insufficient (server-side validation will not enforce it). E1000 SHOULD fire in this case.

4. **`step` and precision**: Decimal precision constraints belong in definition. `step: 0.01` on a MoneyInput is a UI hint for the stepper control and does not prevent users from typing `1.001`. Whether to escalate W1002 to E1002 for fields with explicit precision requirements in definition is deferred.

5. **Theme `widgetConfig` FEL heuristic accuracy**: The `$/{{` heuristic will produce false positives for legitimate placeholder text containing those characters. A more sophisticated FEL parse pass (using `formspec-eval`) would be accurate but adds cost. Accept false positive rate initially; authors can suppress with `x-lint-disable`.

6. **Mapping role purity**: The mapping schema does not allow constraint declarations; no E-codes are needed now. If the Mapping DSL is extended with a `validate` transform type in the future, this ADR's decision would need a companion entry.

## Citations

- Core spec §2.3 ("The three-layer separation is not a suggestion — it is an architectural invariant"), §4.3 (Bind schema — authoritative location for constraint, required, default, calculate, relevant, readonly)
- Component spec §1.2 ("behavioral rules always govern data semantics — Tier 3 cannot override them"), §11.3
- Theme spec §1.2 (Tier 2 relationship to Core)
- Locale spec §1.2 ("MUST NOT affect data collection, validation logic, or behavioral semantics")
- SKILL.md Critical Behavioral Rules: "Locale is presentation-only", "References are pure metadata", "Ontology bindings are pure metadata"
- `component.schema.json` — `$defs.NumberInput`, `$defs.Slider`, `$defs.MoneyInput`, `$defs.DatePicker`, `$defs.FileUpload`
- `theme.schema.json` — `$defs.PresentationBlock.properties.widgetConfig` (`additionalProperties: true`)
- `locale.schema.json` — `strings.additionalProperties: { type: "string" }` (already clean)
- `formspec/specs/lint-codes.json` — existing pass map (passes 1–8); next free pass = 9
- `formspec/crates/formspec-lint/src/pass_component/mod.rs` — pass 7 implementation pattern
- `formspec/crates/formspec-lint/src/pass_theme/mod.rs` — pass 6 implementation pattern

## Related ADRs

- ADR 0054: Companion Constraint Intersection Semantics — proposes the same pass-9 insertion point and overlapping code block. Must coordinate before either lands.

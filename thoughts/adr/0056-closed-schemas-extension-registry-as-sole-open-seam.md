# ADR 0056: Closed-by-Default JSON Schemas with the Extension Registry as the Sole Named Open Seam

**Status:** Proposed
**Date:** 2026-05-17

## Context

### The Invariant We Are Codifying

The owner's design philosophy is **opinionated, closed taxonomies, named seams**. CUE's `#Definition` is closed by default — unknown fields are rejected unless the definition explicitly opens itself. This ADR establishes the same posture for the Formspec JSON Schema suite: every schema is closed; the only legitimate mechanism for carrying non-standard properties is the registered extension namespace (`extensions` object with `x-`-prefixed keys, governed by the Extension Registry).

### Current State of the Extension Seam

Core spec §8 is normative and complete on the extension mechanism:

- §8.1: All custom identifiers MUST be prefixed with `x-`. A processor encountering a non-prefixed identifier it does not recognize MUST treat it as a specification error.
- §8.4: Any object in a Definition, Instance, Response, or ValidationReport MAY carry an `extensions` property containing implementor-specific data. All keys within an `extensions` object MUST be prefixed with `x-`.
- §8.5: Organizations publishing multiple related extensions SHOULD use namespace convention `x-{organization}-{domain}`.

The schema-side enforcement is `"propertyNames": { "pattern": "^x-" }` on `extensions` objects. The Extension Registry (companion spec, `extension-registry.md`) provides structured publication and discovery of extension namespaces.

`formspec-lint` pass 3b (codes E600–E602, module `extensions.rs`) already validates extension keys against a registry document.

### Audit: Schema-by-Schema Closedness Verdict

The following table classifies every schema in `formspec/schemas/` at two levels: **root** (top-level `additionalProperties`) and **$defs** (per-definition entries).

| Schema | Root AP | $defs Status | Open Locations | Verdict |
|--------|---------|--------------|----------------|---------|
| `definition.schema.json` | `false` (line 415) | Mostly `false` | `Presentation` ($defs line 1474): `additionalProperties: true` — forward-compat escape; `instances[*].schema` ($defs line 1163): `additionalProperties: { "type": "string" }` — typed map (intentional); `optionSets` (line 279): typed map; `instances` (line 228): typed map; `labels` (line 462): `{ "type": "string" }` typed map; `migrations.from` (line 1353): typed map; `shapes[*].context` (line 1005): typed map; `variables[*].context`-adjacent: typed map | **Mixed — one structural escape** |
| `response.schema.json` | `false` (line 15) | Mostly `false` | `data` object (line 340): `additionalProperties: true` — by design (mirrors item tree shape; cannot be closed without knowing the Definition) | **Intentionally open (by design)** |
| `theme.schema.json` | `false` (line 12) | Mostly `false` | `items` cascade level (line 175): `additionalProperties: { $ref: PresentationBlock }` — typed map (intentional); `tokenMeta.categories` (line 279): typed map; `style` (line 363): `additionalProperties: { oneOf: [string, number] }` — typed map; `region.responsive` (line 636): typed map; `widgetConfig` ($defs line 336): `additionalProperties: true` — widget config bag, renderer-specific | **Mixed — widgetConfig escape** |
| `component.schema.json` | `false` (line 16) + `patternProperties: { "^x-": true }` at root | All $defs use `unevaluatedProperties: false` (36 occurrences) | None — properly uses `unevaluatedProperties: false` for composed types; root `^x-` pattern is the declared extension seam | **Closed — correctly structured** |
| `mapping.schema.json` | `false` (line 11) + `patternProperties: { "^x-": {} }` at root | All `false` | `headers` typed map ($defs line 204): `{ "type": "string" }` — intentional; `patternProperties: { "^x-": {} }` on several $defs: declared extension seam | **Closed — extension seam explicit** |
| `screener.schema.json` | `false` (line 15) | Mostly `false` | Phase strategy `additionalProperties: true` ($defs line 209): extension strategy config bag — intentional escape; Route `metadata` ($defs line 270): `additionalProperties: true` — arbitrary metadata bag | **Mixed — two intentional bags** |
| `determination.schema.json` | `false` (line 17) | Mostly `false` | `RouteResult.metadata` ($defs line 213): `additionalProperties: true` — pass-through of screener route metadata | **Mixed — one pass-through bag** |
| `registry.schema.json` | `false` (line 160) | All `false` (7 occurrences) | None | **Closed** |
| `changelog.schema.json` | `false` (line 8) | `false` (line 113) | None | **Closed** |
| `validation-result.schema.json` | `false` (line 8) | No $defs | None | **Closed** |
| `validation-report.schema.json` | `false` (line 8) | `false` (line 116) | None | **Closed** |
| `intake-handoff.schema.json` | `false` (line 19) | `Extensions` $def (line 240): `additionalProperties: true` with `propertyNames: { "pattern": "^x-" }` | None — `Extensions` is the named extension seam container, not an unguarded bag | **Closed — extension seam explicit** |
| `respondent-ledger.schema.json` | `false` (line 18) | `Extensions` $def (line 340): same pattern | None — same as above | **Closed — extension seam explicit** |
| `respondent-ledger-event.schema.json` | `false` (line 19) | `Extensions` $def (line 605): same pattern | None — same as above | **Closed — extension seam explicit** |
| `locale.schema.json` | `false` (line 14) | `strings` (line 122): `additionalProperties: { "type": "string" }` with `propertyNames` pattern | None — typed map with key pattern enforcement | **Closed — typed map** |
| `ontology.schema.json` | `false` (line 12) | Various typed maps (lines 97, 117): `additionalProperties: { $ref }` | None — typed map patterns | **Closed — typed maps** |
| `token-registry.schema.json` | `false` (line 8) | Typed maps (lines 22, 50): `additionalProperties: { $ref }` | None — typed map patterns | **Closed — typed maps** |
| `references.schema.json` | `false` (line 13) | `unevaluatedProperties: false` (line 1 in references); typed map (line 320) | None | **Closed** |
| `posture-declaration.schema.json` | `false` (line 8) | All `false` | None | **Closed** |
| `verification-receipt.schema.json` | `false` (line 8) | All `false` (6 occurrences) | None | **Closed** |
| `signature-method-registry.schema.json` | `false` (line 8) | `false` (line 29) | None | **Closed** |
| `fel-functions.schema.json` | No root `additionalProperties` | `false` on $defs (lines 82, 171) | Root object missing `additionalProperties: false` | **Root gap** |
| `core-commands.schema.json` | No root `additionalProperties` | `false` on $defs (lines 41, 114); `{ "type": "string" }` typed map (line 100) | Root object missing `additionalProperties: false` | **Root gap** |
| `conformance-suite.schema.json` | `false` (line 29) | All `false` (lines 90, 113) | None | **Closed** |

### Summary: Four Gap Categories

**Category 1 — Intentional design (not fixable without spec change):**

- `response.schema.json` `data`: Must be open. The `data` object mirrors the Definition's item tree, which varies per Definition. JSON Schema cannot express "keys must match this specific Definition's items." This is a fundamental structural constraint, not schema drift.

**Category 2 — Typed maps (not open, just maps):**

- `additionalProperties: { $ref: ... }` / `additionalProperties: { "type": "string" }` patterns throughout `definition`, `theme`, `locale`, `ontology`, `token-registry`, `mapping`, `core-commands` schemas. These are typed dictionaries where all values conform to a known schema. They are semantically closed — the value types are constrained — even though the key set is open. This is correct JSON Schema idiom for `Record<string, T>` structures.

**Category 3 — Extension seam containers (correct pattern, needs documentation):**

- `additionalProperties: true` paired with `propertyNames: { "pattern": "^x-" }` in `intake-handoff`, `respondent-ledger`, `respondent-ledger-event` `Extensions` $defs. The `propertyNames` constraint enforces the `x-` requirement; `additionalProperties: true` is the correct stance for an escape hatch (the value can be anything). This IS the correct extension seam pattern.

**Category 4 — Actual drift (needs fixing):**

| Location | Issue | Severity |
|----------|-------|----------|
| `definition.schema.json` → `Presentation` ($defs, line 1474) | `additionalProperties: true` — spec description says "Unknown top-level keys MUST be ignored (forward-compatibility)" but this contradicts the closed-by-default invariant. The extension seam (`extensions` property) already handles this case. | Breaking if closed |
| `theme.schema.json` → `widgetConfig` ($defs, line 336) | `additionalProperties: true` — widget config bag is renderer-specific and deliberately open. No `propertyNames` guard enforcing `x-` prefix. Non-prefixed custom widget config keys can exist without going through the extension namespace. | Low risk (renderer config, not behavioral) |
| `screener.schema.json` → Phase strategy extra params ($defs, line 209) | `additionalProperties: true` — extra strategy config keys are intentionally open for extensible strategy configs. No `x-` guard. | Low risk (strategy-internal) |
| `screener.schema.json` → Route `metadata` ($defs, line 270) | `additionalProperties: true` — arbitrary key-value bag passed through to Determination Record without `x-` enforcement. | Low risk (pass-through) |
| `determination.schema.json` → `RouteResult.metadata` ($defs, line 213) | `additionalProperties: true` — same pass-through bag from screener routes. | Low risk (pass-through) |
| `fel-functions.schema.json` (root) | No `additionalProperties: false` at root object level. | Low risk (tooling schema) |
| `core-commands.schema.json` (root) | No `additionalProperties: false` at root object level. | Low risk (tooling schema) |

### Observation: The Pattern Is Mostly There

21 of 24 schemas set `additionalProperties: false` at the root. The `$defs` closedness is high. The drift is concentrated in a small number of specific objects, not systemic. The extension seam pattern (`extensions` + `propertyNames: ^x-`) is correctly implemented wherever it appears. The missing piece is: the spec explicitly says "unknown top-level keys MUST be ignored" on `Presentation` — this is an intentional forward-compatibility override that contradicts the closed invariant, and needs to be decided either way.

## Decision

### D-1. Closed by default is the invariant

Every Formspec JSON Schema MUST set `additionalProperties: false` (or `unevaluatedProperties: false` for schemas using `allOf`/`oneOf`/`anyOf` composition) at the root object and on every named `$defs` entry, with the following explicitly permitted exceptions.

### D-2. Permitted open patterns

| Pattern | Where used | Why permitted |
|---------|-----------|---------------|
| `additionalProperties: { $ref: T }` or `additionalProperties: { "type": T }` | Typed map properties throughout | These are `Record<string, T>` structures. The value schema is constrained; the key set is intentionally open. Example: `optionSets`, `instances`, `strings`. |
| `additionalProperties: true` + `propertyNames: { "pattern": "^x-" }` | Extension seam containers (`Extensions` $defs) | This IS the named open seam. The value is arbitrary by design; the `x-` key guard ensures all content flows through the extension namespace. |
| `response.schema.json` → `data` | One location only | The form data object shape is Definition-specific; it cannot be closed without knowing the target Definition. This is a structural exception, not drift. |

### D-3. The extension namespace is the sole open seam for non-map, non-data properties

All non-standard, implementation-specific, or domain-specific properties MUST be placed inside an `extensions` object with `x-`-prefixed keys. Sibling properties on a closed object with non-`x-` names that are not in the schema MUST be rejected by a conformant processor.

This aligns with core spec §8.1: "A processor encountering a non-prefixed identifier it does not recognize MUST treat it as a specification error."

### D-4. Changes required to existing schemas

| Schema | Change | Breaking? |
|--------|--------|-----------|
| `definition.schema.json` → `Presentation` | Remove `additionalProperties: true`. Add `additionalProperties: false`. Remove the spec prose "Unknown top-level keys MUST be ignored (forward-compatibility)" from the `Presentation` description (line 1473). Authors using custom Presentation keys MUST migrate to `extensions: { "x-mykey": ... }`. | **Yes** — any document with custom Presentation keys at the top level breaks. |
| `theme.schema.json` → `widgetConfig` | Add `patternProperties: { "^x-": {} }` alongside `additionalProperties: false`. Widget configs with non-`x-`-prefixed custom keys break. Well-known widget configs (the long list in the description) are already documented; they are schema-open by renderer contract, not by schema openness. A strict read is: `widgetConfig` shape is renderer-defined, not Formspec-defined, so the schema SHOULD be open here. Alternatively: close `widgetConfig` with `patternProperties: { "^x-": {} }` and enumerate well-known keys. This ADR proposes the latter but flags it as a judgment call. | **Yes** — non-`x-`-prefixed custom widget config keys break. |
| `screener.schema.json` → Phase strategy params | Add `patternProperties: { "^x-": {} }` + `additionalProperties: false`. Strategy extensions use `x-` namespace. | **Yes** — non-`x-`-prefixed strategy config keys break. |
| `screener.schema.json` → Route `metadata` | Add `propertyNames: { "pattern": "^x-" }` alongside `additionalProperties: true` (matching the established extension seam container pattern). | **Yes** — Route metadata keys not prefixed with `x-` break. |
| `determination.schema.json` → `RouteResult.metadata` | Same as Route metadata above — `propertyNames: { "pattern": "^x-" }` + `additionalProperties: true`. | **Yes** — same. |
| `fel-functions.schema.json` (root) | Add `additionalProperties: false`. | Minimal — tooling catalog schema. |
| `core-commands.schema.json` (root) | Add `additionalProperties: false`. | Minimal — tooling catalog schema. |

### D-5. The extension lint pass (E600–E602) is extended

Current coverage: extension keys vs. registry documents for Definition documents.

New coverage required:

- **E615**: Unregistered property in closed schema — a property key appears in a closed object that is not in the schema and not in the `extensions` namespace.
- **E616**: Extension key missing `x-` prefix — a key in an `extensions` object or in a `patternProperties`-guarded extension slot lacks the `x-` prefix.
- **E617**: Extension namespace key used outside `extensions` object — an `x-`-prefixed key appears as a sibling property on a closed object rather than inside an `extensions` container. (This is valid on `component.schema.json` root per its `patternProperties` declaration, but flagged elsewhere.)

Diagnostic shape for E615:

```
E615: unregistered property in closed schema
  definition.items[5].presentation.customField     [intake.json:142]
  → schema "Presentation" is closed; "customField" is not in the schema
    and not in the extensions namespace
  → move to definition.items[5].presentation.extensions["x-customField"]
    or declare via extension registry
```

## Consequences

### Positive

- **Tooling confidence.** Closed schemas mean IDE autocomplete, static analyzers, and lint all have a definite set of valid properties. Unknown keys are schema errors, not silently ignored.
- **Forward-compatibility through the right channel.** The spec's §8 extension mechanism handles all legitimate extensibility needs. The `x-` prefix requirement gives processors a deterministic rule: unrecognized properties outside `extensions` are spec errors; unrecognized properties inside `extensions` are ignored and preserved.
- **Lint completeness.** E615–E617 close the gap between "schema is closed" and "lint enforces it." Currently, `additionalProperties: true` on `Presentation` means E101 (JSON Schema validation pass) silently accepts any property there — with this ADR implemented, E101 would catch it at parse time.
- **Aligned with the platform posture.** The user profile is explicit: "opinionated, closed taxonomies, named seams." This ADR instantiates that posture in the schema layer.

### Negative — Breaking Changes

Three schemas have `additionalProperties: true` on named structural objects that any author could have relied on:

1. **`Presentation` in `definition.schema.json`**: The spec description explicitly invites forward-compat key usage ("Unknown top-level keys MUST be ignored"). Any Definition document with custom keys directly on the Presentation block would break. The migration path is `presentation.extensions["x-mykey"]`.

2. **`widgetConfig` in `theme.schema.json`**: Theme documents using non-`x-`-prefixed widget config keys would break. The well-known configs (from the description) are already spec-documented; only truly custom ones are affected.

3. **Route `metadata` and strategy params in screener/determination**: These are likely low-volume; screener is not yet widely used externally.

Since the spec suite is at Draft status with zero external consumers declared, closing these is low-risk operationally, but the breaking changes MUST be documented.

### Migration / Rollout

**Phase 1 (spec draft only, no external consumers):** All schema closures in D-4 land in a single batch. Spec prose for `Presentation` drops the "unknown keys MUST be ignored" language. Regenerate `*.llm.md`, reference maps. Spec version remains draft.

**Phase 2 (if external consumers exist before 1.0 release):** Introduce a `strict` flag on schema validation pass (E101). Default mode preserves old behavior; `strict: true` enforces closedness. Migration window announced. E615–E617 are `Warning` severity in non-strict mode, `Error` in strict. Flip the default to strict at 1.0 release.

**Phase 3 (1.0 release):** `strict` is the only mode. E615–E617 are always `Error`. The forward-compat escape in `Presentation` is gone. The extension seam is the sole path.

### Open Questions

1. **`widgetConfig` ownership.** Is `widgetConfig` shape a Formspec concern (close it with `x-` guard) or a renderer concern (leave open, renderer validates its own config)? The spec description lists well-known keys but explicitly says "Renderers MUST ignore unrecognized keys." If renderer-defined, `additionalProperties: true` is correct and the `x-` enforcement does not apply. Decision needed before landing the theme schema change.

2. **`Presentation` forward-compat escape.** The spec was deliberately open here for forward-compatibility. Closing it is a philosophical shift: future spec versions cannot add presentation properties without a schema bump. This is the correct trade (schema version controls the surface); confirm this is accepted.

3. **E615 scope.** Should E615 trigger on all Formspec document types (Definition, Theme, Component, Screener, Response) or only on Definition documents? All document types should be covered; confirm.

4. **`data` exception documentation.** The `response.schema.json` `data` exception is structural and permanent. Should it be explicitly annotated in the schema (e.g., `"x-formspec-closedness": "open-by-design"`) to prevent future confusion?

5. **`core-commands` and `fel-functions` tooling schemas.** These are not Formspec documents submitted by form authors — they are tooling catalogs read by agents and editors. The closedness invariant still applies (unknown catalog entries are errors), but the stakes are lower. Confirm they fall under the same rule.

## Citations

- Core spec §8.1–§8.5: Extension mechanisms, `x-` prefix requirement, processor error obligation for non-prefixed unknown identifiers.
- Core spec §8.4: `extensions` property normative requirements; MUST preserve on round-trip.
- `definition.schema.json` line 1473–1474: `Presentation` `additionalProperties: true` with forward-compat escape.
- `response.schema.json` line 337–340: `data` intentional open exception.
- `theme.schema.json` line 334–336: `widgetConfig` `additionalProperties: true`.
- `screener.schema.json` lines 209, 270: Phase strategy and Route metadata open bags.
- `determination.schema.json` line 213: `RouteResult.metadata` open bag.
- `component.schema.json` line 13–14: `patternProperties: { "^x-": true }` at root — existing correct pattern for root-level extension seam.
- `mapping.schema.json` lines 8, 154, 222, 410, 636, 699: `patternProperties: { "^x-": {} }` — existing correct pattern.
- `intake-handoff`, `respondent-ledger`, `respondent-ledger-event` schemas: `Extensions` $def with `propertyNames: { "pattern": "^x-" }` + `additionalProperties: true` — existing correct extension seam container pattern.
- `formspec-lint` README, Pass 3b, codes E600–E602: Existing extension key vs. registry lint gate.
- Extension Registry spec §1: "five extension categories and requires all extension identifiers to carry an `x-` prefix."

## Related ADRs

- ADR 0029–0031: Schema Parity — establishes schemas as co-authoritative with specs.
- ADR 0054: Companion Constraint Intersection — adds Pass 9 lint codes; coordinate numbering.
- ADR 0055: Single-Ownership-Per-Concern (Role Purity) — adds Pass 9 lint codes; coordinate numbering.

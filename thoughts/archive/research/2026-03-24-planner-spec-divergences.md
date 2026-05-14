# Planner Spec/Implementation Divergence Register

**Date:** 2026-03-24
**Context:** Reimplementing the TypeScript layout planner (`packages/formspec-layout/`) in Rust as `formspec-theme` + `formspec-plan` crates. The Rust planner must be a drop-in replacement (byte-for-byte identical LayoutNode JSON output). This document catalogs every known divergence between the normative spec and the current TypeScript implementation, plus missing spec behaviors.

**Strategy (UPDATED 2026-03-24):** The Rust planner implements **spec-normative behavior from the start**. It is NOT a drop-in replacement for the TS planner — it is the new reference implementation. The TS planner will be replaced by the Rust planner via WASM. Behavioral differences between the Rust planner and TS planner are expected and intentional; the TS planner's divergences are bugs to be fixed (or rendered moot by deletion).

The divergence register below documents what the TS planner does differently so that:
1. Cross-planner conformance tests can flag expected behavioral differences
2. When the web renderer switches to the WASM planner, we know which test expectations to update
3. The TS planner code serves as a reference for what NOT to do in the Rust implementation

---

## 1. Known Spec/Implementation Divergences

### D-01: Cascade Level Count

| | Detail |
|---|---|
| **Spec** | Theme SS5.1 defines **6 levels**: Level -2 (renderer defaults), Level -1 (Tier 1 formPresentation), Level 0 (Tier 1 item presentation), Level 1 (theme defaults), Level 2 (selectors), Level 3 (items) |
| **TS Implementation** | `theme-resolver.ts` implements **5 levels** (skips Level -2). Renderer defaults are the caller's responsibility. |
| **Drop-in decision** | Match TS: implement 5 levels. Document Level -2 as out-of-scope for the planner. |
| **Future fix** | Optional: accept a `rendererDefaults: PresentationBlock` parameter in the resolve function, applied at Level -2. Both TS and Rust planners would get this. |

### D-02: Nested Object Merge Semantics

| | Detail |
|---|---|
| **Spec** | Theme SS5.5 (lines 592-596): "Nested objects (`widgetConfig`, `style`, `accessibility`) are **replaced as a whole**, not deep-merged." |
| **TS Implementation** | `theme-resolver.ts` lines 265-287 does **shallow-merge** for all three: `{ ...lower, ...higher }`. Additionally, `widgetConfig["x-classes"]` gets special additive merge. |
| **Drop-in decision** | **Match TS: shallow-merge.** This is a deliberate implementation choice — replacement semantics would lose lower-cascade properties that the higher level didn't override, which is almost never desired. |
| **Future fix** | Consider updating the spec to match implementation. The shallow-merge behavior is more useful and what authors expect. |

### D-03: `cssClassReplace` Property

| | Detail |
|---|---|
| **Spec** | Not defined anywhere in the theme spec or schema. Only `cssClass` with union semantics is normative. |
| **TS Implementation** | `theme-resolver.ts` lines 231-254 implements `cssClassReplace` — higher cascade levels can explicitly replace matching lower-level classes (including utility-prefix matching for Tailwind). |
| **Drop-in decision** | Match TS: implement `cssClassReplace` with the same utility-prefix extraction logic. |
| **Future fix** | Consider adding to spec if the behavior proves valuable. Otherwise, document as an implementation extension. |

### D-04: Responsive Breakpoint Application

| | Detail |
|---|---|
| **Spec** | Component SS9.3 (lines 2717-2741): Mobile-first cascade applies **all breakpoints** whose `minWidth <= viewportWidth` in ascending order, cumulatively shallow-merged. |
| **TS Implementation** | `responsive.ts` takes a **single `activeBreakpoint` string** and merges only that one override. The caller pre-selects which breakpoint is active. |
| **Drop-in decision** | **Match TS: single active breakpoint.** The PlanContext provides `activeBreakpoint: string | null`, and the planner merges only that override. |
| **Future fix** | Add a `viewport_width: Option<u32>` to PlanContext that enables spec-normative cumulative resolution. When present, ignore `activeBreakpoint` and compute the cumulative merge. Both TS and Rust planners would support both modes. |

### D-05: Custom Component Instance Prop Merge

| | Detail |
|---|---|
| **Spec** | Component SS7.3 (lines 2532-2534): "The instantiation MAY also include `when`, `style`, and `responsive` props. These are applied to the **root** of the resolved subtree (merged on top of whatever the template already defines)." |
| **TS Implementation** | `planner.ts` line 174-176 plans the template tree but does NOT merge instance-level `when`, `style`, or `responsive` onto the resolved root. |
| **Drop-in decision** | Match TS: skip instance prop merge. |
| **Future fix** | Implement the merge per spec. After deep-cloning and interpolating the template, merge `comp.when`, `comp.style`, and `comp.responsive` onto the root of the resolved subtree. Apply to both TS and Rust planners. |

### D-06: `classStrategy` / Tailwind Merge

| | Detail |
|---|---|
| **Spec** | Not defined. |
| **TS Implementation** | `theme-resolver.ts` lines 107-111 supports `theme.classStrategy: "tailwind-merge"` which uses an injected `twMerge` function for conflict-aware class merging. |
| **Drop-in decision** | Match TS: support `classStrategy` field on ThemeDocument. For Rust, the tailwind-merge behavior can be implemented natively (prefix-based conflict resolution) without requiring a JS callback. |
| **Future fix** | None needed — this is a useful extension that doesn't conflict with spec. |

---

## 2. Missing Spec Behaviors (Not in TS Implementation)

These are normative spec requirements that the TS planner does not currently implement. The Rust planner should match TS first (omit them), then add them as enhancements.

### M-01: `"none"` Sentinel for Property Suppression

| | Detail |
|---|---|
| **Spec** | Theme SS5.6 (lines 637-653): The sentinel string `"none"` for `widget` and `labelPosition` suppresses an inherited value. JSON `null` MUST NOT be used. |
| **TS Implementation** | No special handling for `"none"`. If `widget: "none"` is set, it passes through as a literal string and would be treated as an unknown widget name (triggering fallback chain). |
| **Enhancement priority** | Medium — affects edge cases where theme authors explicitly want to remove a widget. |

### M-02: Unbound Required Items Fallback

| | Detail |
|---|---|
| **Spec** | Component SS4.5 (lines 659-680): Required items NOT bound in the component tree MUST get fallback rendering, appended after tree output in Definition order. Non-required unbound items MAY be omitted. |
| **TS Implementation** | Partially handled for theme-page mode (`planThemePagesFromComponentTree` lines 497-510) and definition-fallback mode. Not implemented for the general component-tree case. |
| **Enhancement priority** | High — affects correctness when a component document doesn't bind all required fields. |

### M-03: Progressive Component Fallback Substitution

| | Detail |
|---|---|
| **Spec** | Component SS6.17: Core-conformant processors MUST substitute Core fallback for Progressive components. Five preservation rules: `children`, `when`, `responsive`, `style`, `bind` are preserved; discarded props SHOULD warn. |
| **TS Implementation** | Handled at the web component renderer level (component registry), not in the planner. |
| **Enhancement priority** | Low for planner — this is correctly handled downstream. The Rust planner may need it when driving the PDF renderer directly (which may not have a component registry). |

### M-04: Extra Custom Component Params Warning

| | Detail |
|---|---|
| **Spec** | Component SS7.3 (lines 2528-2530): "Extra params... MUST be ignored. Processors SHOULD emit a warning." |
| **TS Implementation** | Extra params are silently ignored, no warning emitted. |
| **Enhancement priority** | Low — diagnostic improvement only. |

### M-05: Custom Component Depth Limits

| | Detail |
|---|---|
| **Spec** | Component SS7.5: Custom nesting SHOULD NOT exceed 3 levels. Total tree depth SHOULD NOT exceed 20. Processors MUST NOT enforce limits below 3 custom / 10 total. |
| **TS Implementation** | No depth limits enforced (only recursion detection via `customComponentStack` set). |
| **Enhancement priority** | Medium — prevents pathological inputs from causing stack overflow. |

### M-06: DataType/Component Compatibility Validation

| | Detail |
|---|---|
| **Spec** | Component SS4.6: Input components declare compatible `dataType` values. Incompatible binding is a validation error. |
| **TS Implementation** | The `COMPATIBILITY_MATRIX` exists in `widget-vocabulary.ts` and is used by the web component's behavior layer, not by the planner. |
| **Enhancement priority** | Low for planner — more of a lint/validation concern. |

### M-07: Recursive Token Detection

| | Detail |
|---|---|
| **Spec** | Theme SS3.4 (lines 289-291): "Token references MUST NOT be recursive... Processors MUST treat recursive references as unresolved." |
| **TS Implementation** | Single-pass lookup — a token whose value contains `$token.` passes through as literal (happens to be correct behavior, but no explicit detection or warning). |
| **Enhancement priority** | Low — edge case, current behavior is accidentally correct. |

### M-08: Selector Match Requires At Least One Criterion

| | Detail |
|---|---|
| **Spec** | Theme SS5.3 (line 522): "A match MUST contain at least one of type or dataType." |
| **TS Implementation** | `theme-resolver.ts` line 296 has a guard: `if (match.type === undefined && match.dataType === undefined) return false`. Silently skips, no warning. |
| **Rust implementation** | Implement the guard + emit a warning for empty match objects. |

### M-09: Unknown Item Keys in Theme `items` Should Warn

| | Detail |
|---|---|
| **Spec** | Theme SS5.4 (line 548): "Item keys in the theme that do not correspond to any item in the target Definition SHOULD produce a warning." |
| **TS Implementation** | No warning emitted for unknown item keys. |
| **Rust implementation** | Emit warning when `theme.items` contains a key not found in `items_by_path`. |

### M-10: Region Unknown Keys Should Warn

| | Detail |
|---|---|
| **Spec** | Theme SS6.3 (line 753): "A region referencing a key that does not exist in the target Definition SHOULD produce a warning." |
| **TS Implementation** | Unknown region keys are silently skipped (`findItemPathByKey` returns null). |
| **Rust implementation** | Emit warning for unresolvable region keys. |

### M-11: Token Value Validation

| | Detail |
|---|---|
| **Spec** | Theme SS3.1 (lines 232-234): "Token values MUST be strings or numbers. Tokens MUST NOT contain nested objects, arrays, booleans, or null." |
| **TS Implementation** | No validation of token value types. |
| **Rust implementation** | Validate token values during theme loading; emit warning for invalid types. |

### M-12: Responsive `style` Override is Replacement, Not Merge

| | Detail |
|---|---|
| **Spec** | Component SS9.3 (line 2723): "A `style` override replaces the entire `style` object for that breakpoint." |
| **TS Implementation** | `responsive.ts` likely does shallow merge consistent with overall approach. |
| **Rust implementation** | Implement spec-correct replacement semantics. |

---

## 3. Implementation Extensions (In TS, Not in Spec)

These are features in the TS planner that have no normative spec basis. The Rust planner must implement them for drop-in fidelity.

| Extension | Location | Purpose |
|-----------|----------|---------|
| `cssClassReplace` | `theme-resolver.ts` L231-254 | Higher-cascade class replacement with utility-prefix matching |
| `classStrategy: "tailwind-merge"` | `theme-resolver.ts` L107-111, 197-211 | Optional conflict-aware CSS class merging |
| `widgetConfig["x-classes"]` additive merge | `theme-resolver.ts` L270-278 | Slot-based class injection for design system adapters |
| Studio-generated component doc detection | `planner.ts` L726-729 | `x-studio-generated` flag affects page-mode wrapping behavior |
| `TextInput` default `maxLines: 3` for text dataType | `planner.ts` L194-196 | Convenience default for multi-line text fields |
| Single active breakpoint (vs cumulative) | `responsive.ts` | Simplified responsive resolution |

---

## 4. Enhancement Roadmap

After the Rust planner achieves drop-in fidelity, apply these enhancements **to both TS and Rust planners** simultaneously:

### Phase 1: Correctness
1. M-02: Unbound required items fallback (high priority)
2. M-01: `"none"` sentinel handling (medium)
3. M-05: Custom component depth limits (medium)

### Phase 2: Spec Alignment
4. D-04: Cumulative responsive breakpoint resolution (opt-in via `viewport_width`)
5. D-05: Custom component instance prop merge
6. M-07: Recursive token detection + warning

### Phase 3: Diagnostics
7. M-04: Extra custom component params warning
8. M-06: DataType/component compatibility warning in planner
9. D-02: Consider spec update to codify shallow-merge behavior

---

## 5. Testing Implications

The drop-in fidelity requirement means:

1. **Golden-file tests**: Generate `LayoutNode` JSON from the TS planner for a comprehensive set of inputs (definitions, themes, component documents, responses). The Rust planner must produce byte-for-byte identical JSON.

2. **Divergence tests**: Each known divergence (D-01 through D-06) should have a dedicated test that documents the expected behavior and flags when the divergence is resolved.

3. **Enhancement tests**: Each missing behavior (M-01 through M-07) should have a test that initially asserts the TS-matching (incorrect) behavior, then is updated when the enhancement lands.

4. **Cross-planner test harness**: A test runner that feeds the same inputs to both TS and Rust planners and diffs the JSON output. This is the ongoing conformance guarantee.

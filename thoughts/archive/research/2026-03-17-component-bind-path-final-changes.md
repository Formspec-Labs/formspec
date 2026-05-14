# Component Bind Path Model — Final Change Report

**Date:** 2026-03-17
**Predecessor:** `thoughts/research/2026-03-17-component-bind-path-model.md`
**Status:** Ready for implementation

---

## Summary

Spec prose, schema annotations, and one linter message are out of sync with the
implementation. All running code is correct. This report lists every change needed
to align the spec with reality, including a resolution to the core spec's key
uniqueness contradiction.

---

## Decision Record

### Key uniqueness scope

The core spec contradicts itself:

- **Line 294** (normative body, §2.1.3): "unique among its siblings"
- **Line 1921** (appendix property table): "MUST be unique across the entire Definition (not merely among siblings)"
- **`definition.schema.json` line 396**: copies line 1921

**Decision: sibling-unique is normative; global uniqueness is permitted but not required.**

Keys MUST be unique among siblings at the same nesting level. Authors MAY choose
globally unique keys (and existing examples do), but the spec does not require it.
When two groups contain children with the same key, qualified dot-separated paths
disambiguate: `applicantInfo.name` vs `projectLead.name`.

This aligns with:
- The normative body text (line 294), which already says "unique among siblings"
- FEL's existing scoping model: `$ident` resolves from nearest scope (core §3.2.1),
  `$a.b.c` is already documented as "nested field path through groups" (FEL §6.1)
- The response Instance, which already mirrors the definition tree as nested JSON
- Every implementation (engine `itemAtPath`, webcomponent `findItemByKey`, Python
  `canonical_item_path`) which already splits on `.` and walks the tree

Line 1921 and the schema description were wrong — they described an aspirational
constraint that was never enforced and contradicted the normative body. Fix them
to match line 294.

### Key regex pattern

A second inconsistency exists across the same locations:

- **Line 297** (normative body): `^[a-zA-Z_][a-zA-Z0-9_]*$` — allows leading underscore
- **Line 1921** (appendix property table): `[a-zA-Z][a-zA-Z0-9_]*` — forbids leading underscore, missing anchors
- **`definition.schema.json` line 395**: `^[a-zA-Z][a-zA-Z0-9_]*$` — forbids leading underscore

**Decision: the schema pattern is normative; leading underscores are NOT allowed.**

The schema `pattern` is the enforcement point — it is what actually validates keys at
ingest time. Both the appendix and schema agree: no leading underscore. Line 297 has an
extra `_` in the first character class that was likely a typo. Fix line 297 to match.

### Accordion linter classification

The Python linter (`component.py:43`) puts Accordion in `_CONTAINER_COMPONENTS`, but
the schema `x-lm.category` is `"layout"` and the spec classifies it as Layout (§6.3,
Appendix B row 21).

**Decision: move Accordion from `_CONTAINER_COMPONENTS` to `_LAYOUT_COMPONENTS`.**

This aligns the linter with the spec and schema. After the move, the Layout W801 path
(line 326) is what fires when Accordion binds to a non-repeatable item — which is the
correct error case.

### Tabs repeat binding

The Python linter (`component.py:320`) allows Tabs to bind repeatable groups alongside
Accordion. But the Tabs schema has no `bind` property and `unevaluatedProperties: false`
would reject it.

**Decision: remove Tabs from the linter exception.** No schema support, no example usage,
no webcomponent implementation. The linter was preemptively permissive. If Tabs repeat
binding is wanted later, it should go through the full spec process (schema + spec + impl).

---

## Changes

### A. Component Spec Prose (`specs/component/component-spec.md`)

#### A1. §4.1 — The bind Property (lines 480–483)

**Current:**
> The `bind` property is a **string** containing the globally unique `key`
> of an item in the target Definition. It is NOT a dotted path, JSON
> Pointer, or FEL expression — it is a flat key that matches an item's
> `key` property exactly.

**Replace with:**
> The `bind` property is a **string** that identifies an item in the target
> Definition by its path in the item tree. For top-level items, `bind` is
> the item's `key` directly (e.g., `"projectName"`). For items nested
> within groups, `bind` is a dot-separated qualified path where each
> segment is an item `key` at successive depths (e.g.,
> `"applicantInfo.orgName"`, `"budget.lineItems.amount"`).
>
> A processor MUST resolve a bind value by splitting on `.` and traversing
> the item tree from the root — each segment matches the `key` of a child
> item at that depth.
>
> The value MUST NOT be a FEL expression or JSON Pointer — it is a
> structural path through the item hierarchy, not a computed reference.

Also update the example immediately below (lines 485–491) to show a nested case:

```json
// Top-level item:
{ "key": "projectName", "type": "field", "dataType": "string" }
// → bind: "projectName"

// Nested item (orgName inside applicantInfo group):
{ "key": "applicantInfo", "type": "group", "children": [
  { "key": "orgName", "type": "field", "dataType": "string" }
]}
// → bind: "applicantInfo.orgName"
```

#### A2. §4.2 — Bind Resolution Table (lines 502–507)

**Current Layout row:**
> | **Layout** | FORBIDDEN | Layout components MUST NOT have a `bind` property. If present, processors MUST ignore it and emit a warning. |

**Replace with:**
> | **Layout** | FORBIDDEN | Layout components MUST NOT have a `bind` property, with the exception of **Accordion** (§6.3), which MAY bind to a repeatable group. If present on other layout components, processors MUST ignore it and emit a warning. |

**Current Container row** — no change needed. DataTable is a Container, Accordion is
Layout. Each exception is on the correct row.

#### A3. §4.3 — Editable Binding Uniqueness (lines 524–526)

**Current (line 524):**
> At most **one** editable Input component MAY bind to a given item key.

**Replace with:**
> At most **one** editable Input component MAY bind to a given item path.

**Current (line 526):**
> Multiple **read-only Display** components MAY bind to the same key.

**Replace with:**
> Multiple **read-only Display** components MAY bind to the same path.

#### A5. §4.4 — Repeatable Group Binding (lines 552–572)

**Current (lines 562–564):**
> 2. Within each repeat instance, resolve child `bind` values relative
>    to the repeat context. Child keys are still flat item keys, but they
>    resolve within the current repeat instance.

**Replace with:**
> 2. Within each repeat instance, resolve child `bind` values relative
>    to the repeat context. Child bind values are item paths that resolve
>    within the current repeat instance.

**Current (lines 568–572):**
> Repeatable group binding is available on **DataTable** (§6.13), where each
> repeat instance becomes a table row.
>
> Other layout and container components MUST NOT bind to repeatable groups.
> Processors MUST reject such bindings.

**Replace with:**
> Repeatable group binding is available on:
>
> - **DataTable** (§6.13), where each repeat instance becomes a table row.
> - **Accordion** (§6.3), where each repeat instance becomes a collapsible
>   section.
>
> Other layout and container components MUST NOT bind to repeatable groups.
> Processors MUST reject such bindings.

#### A6. §6.3 — Accordion header block (lines 1563–1569)

**Current:**
```
**Bind:** Forbidden
```

**Replace with:**
```
**Bind:** Optional (repeatable group path)
```

#### A7. §6.3 — Accordion description prose (after line 1576)

**Add after existing description paragraph:**

> When `bind` is set to a repeatable group path, Accordion acts as a
> repeat template: one collapsible section is rendered per group instance.
> Child bind values resolve relative to each instance. The renderer MUST
> provide affordances for adding and removing instances, subject to
> `minRepeat`/`maxRepeat` constraints. When `bind` is absent, sections
> are static children with no repeat semantics.

#### A8. Appendix B table (line 3283)

**Current:**
> | 21 | Accordion | Layout | Progressive | Yes | Forbidden | Collapsible section list. |

**Replace with:**
> | 21 | Accordion | Layout | Progressive | Yes | Optional³ | Collapsible section list. |

**Add footnote after existing ² footnote (line 3298):**
> ³ Accordion binds to a repeatable group path, not a field path. When absent, sections are static.

---

### B. Component Schema (`schemas/component.schema.json`)

#### B1. Accordion x-lm annotation (line 962)

**Current:**
```json
"bind": "forbidden",
```

**Replace with:**
```json
"bind": "optional",
```

No other schema changes needed — the Accordion `bind` property (lines 968–971) is already
correctly defined.

#### B2. Input component bind descriptions (lines 501, 546, 572, 597, 621, 644, 667, 1015, 1044, 1074, 1102, 1132)

All input components have `"description": "Item key from the target Definition."` on their
`bind` property.

**Replace all with:**
```json
"description": "Item path from the target Definition."
```

Applies to: TextInput, NumberInput, DatePicker, Select, CheckboxGroup, Toggle, FileUpload,
RadioGroup, MoneyInput, Slider, Rating, Signature.

#### B3. Display component bind descriptions

- Text (line 719): `"Item key."` → `"Item path."`
- ProgressBar (line 1215): `"Item key."` → `"Item path."`
- Summary items (line 1249): `"Item key whose current value to display."` → `"Item path whose current value to display."`

#### B4. DataTable bind descriptions

- DataTable bind (line 1331): `"Repeatable group item key."` → `"Repeatable group item path."`
- DataTable column bind (line 1341): `"Item key within the repeat group."` → `"Item path within the repeat group."`

---

### C. Core Spec (`specs/core/spec.md`)

#### C1. §2.1.3 appendix property table (line 1921)

**Current:**
> | `key` | string | **1..1** (REQUIRED) | Stable identifier for this Item. MUST be unique across the entire Definition (not merely among siblings). MUST match the regular expression `[a-zA-Z][a-zA-Z0-9_]*`. The `key` is used to join Definition Items to Response data nodes and MUST NOT change across versions of the same Definition if the semantic meaning is preserved. |

**Replace with:**
> | `key` | string | **1..1** (REQUIRED) | Stable identifier for this Item. MUST be unique among siblings at the same nesting level. MUST match the regular expression `[a-zA-Z][a-zA-Z0-9_]*`. Items nested within different groups MAY share a key; qualified dot-separated paths (e.g., `group.child`) disambiguate. The `key` is used to join Definition Items to Response data nodes and MUST NOT change across versions of the same Definition if the semantic meaning is preserved. |

#### C2. §2.1.3 key regex (line 297)

**Current:**
> A `key` MUST match the regular expression `^[a-zA-Z_][a-zA-Z0-9_]*$`.

**Replace with:**
> A `key` MUST match the regular expression `^[a-zA-Z][a-zA-Z0-9_]*$`.

This aligns the normative body with the schema `pattern` (line 395) and the appendix
(line 1921). The leading underscore in the first character class was a typo — the schema
has never accepted it.

Line 294 (normative body) already says "unique among its siblings" — no change needed there.

---

### D. Definition Schema (`schemas/definition.schema.json`)

#### D1. Key description (line 396)

**Current:**
> "Stable identifier for this Item. MUST be unique across the entire Definition (not merely among siblings). Used in Bind paths, Shape targets, FEL field references ($key), and to bridge Definition items to Response data nodes. MUST NOT change across versions if the semantic meaning is preserved."

**Replace with:**
> "Stable identifier for this Item. MUST be unique among siblings at the same nesting level. Items in different groups MAY share a key; qualified dot-separated paths disambiguate. Used in Bind paths, Shape targets, FEL field references ($key), and to bridge Definition items to Response data nodes. MUST NOT change across versions if the semantic meaning is preserved."

---

### E. Generated Artifacts Config

#### E1. `specs/component/component-spec.semantic.md` (line 7)

**Current:**
> Slot binding semantics: `bind` resolves only by item `key` (not FEL/dotted paths) and must propagate Definition semantics...

**Replace with:**
> Slot binding semantics: `bind` resolves by dot-separated item path (not FEL expressions) and must propagate Definition semantics...

#### E2. `specs/component/component-spec.semantic.md` (line 9)

**Current:**
> Repeat semantics: repeat-bound components (notably DataTable) operate as templates...

**Replace with:**
> Repeat semantics: repeat-bound components (notably DataTable and Accordion) operate as templates...

#### E3. `specs/core/definition-spec.semantic.md` (line 2)

**Current:**
> Item tree semantics: `items` declare structure with stable `key` identifiers; keys are the primary binding surface across rendering, validation, and mapping layers.

**Replace with:**
> Item tree semantics: `items` declare structure with stable `key` identifiers unique among siblings; dot-separated paths address nested items across rendering, validation, and mapping layers.

#### E4. `scripts/spec-artifacts.config.json` (line 134)

**Current:**
> "Slot binding links input components to definition item keys while preserving core behavioral semantics from the definition."

**Replace with:**
> "Slot binding links input components to definition item paths while preserving core behavioral semantics from the definition."

---

### F. Python Linter (`src/formspec/validator/component.py`)

#### F1. Remove Tabs from repeat-bind exception (line 320)

**Current:**
```python
if component_name in ("Accordion", "Tabs"):
```

**Replace with:**
```python
if component_name == "Accordion":
```

#### F2. Move Accordion from `_CONTAINER_COMPONENTS` to `_LAYOUT_COMPONENTS` (lines 36, 43)

Accordion's spec category is Layout (§6.3 header, Appendix B row 21, schema
`x-lm.category: "layout"`), but the linter classifies it as Container. This
causes incorrect W801 messages ("Container component 'Accordion'...") when
Accordion binds to a non-repeatable item.

**Current `_LAYOUT_COMPONENTS` (line 36):**
```python
_LAYOUT_COMPONENTS = {"Page", "Stack", "Grid", "Wizard", "Spacer"}
```

**Replace with:**
```python
_LAYOUT_COMPONENTS = {"Page", "Stack", "Grid", "Wizard", "Spacer", "Accordion"}
```

**Remove `"Accordion"` from `_CONTAINER_COMPONENTS` (line 43).** The repeat-bind
early-return at line 320 still handles the valid case (Accordion + repeatable group).
When Accordion binds to something that is NOT a repeatable group, it now correctly
falls through to the Layout W801 path.

#### F3. Update Container W801 message (lines 344–345)

**Current:**
```python
f"Container component '{component_name}' should not declare a bind "
"(DataTable is the only exception)"
```

**Replace with:**
```python
f"Container component '{component_name}' should not declare a bind "
"(DataTable is the only container exception)"
```

The word "only" was misleading since Accordion (a Layout component) also has a bind
exception. Saying "only container exception" scopes the claim correctly.

---

## Execution Order

1. Edit `schemas/definition.schema.json` — key uniqueness description (D1)
2. Edit `schemas/component.schema.json` — x-lm annotation + bind descriptions (B1–B4)
3. Edit `specs/core/spec.md` — appendix key description + regex fix (C1–C2)
4. Edit `specs/component/component-spec.md` — all prose changes (A1–A8)
5. Edit `specs/component/component-spec.semantic.md` — capsule updates (E1–E2)
6. Edit `specs/core/definition-spec.semantic.md` — capsule update (E3)
7. Edit `scripts/spec-artifacts.config.json` — behavior essentials (E4)
8. Edit `src/formspec/validator/component.py` — linter fixes (F1–F3)
9. Run `npm run docs:generate` — regenerates `*.llm.md` files from updated sources
10. Run `npm run docs:check` — verify all gates pass
11. Run `python3 -m pytest tests/ -v` — verify linter tests still pass (may need test updates for F1–F3)

---

## Verification Checklist

- [ ] `npm run docs:generate` succeeds
- [ ] `npm run docs:check` passes all gates
- [ ] `python3 -m pytest tests/ -v` passes
- [ ] `python3 -m formspec.validate examples/grant-application/` passes
- [ ] Grep for "flat key" in component spec returns zero hits
- [ ] Grep for "unique across the entire Definition" in core spec/schema returns zero hits
- [ ] Grep for `"bind": "forbidden"` in schema returns no Accordion match
- [ ] Grep for "DataTable is the only exception" in Python code returns zero hits
- [ ] Grep for "Item key from" in component schema returns zero hits
- [ ] Grep for `[a-zA-Z_]` in core spec line 297 returns zero hits (regex aligned with schema)
- [ ] Grep for `"Accordion"` in `_CONTAINER_COMPONENTS` returns zero hits
- [ ] Grep for `"Accordion"` in `_LAYOUT_COMPONENTS` returns one hit

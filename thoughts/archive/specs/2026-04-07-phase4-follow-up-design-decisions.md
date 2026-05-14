# Phase 4 Follow-up Design Decisions

**Date:** 2026-04-07

This note closes the two remaining design questions from
[`thoughts/chaos-test/2026-04-07/phase4-follow-up-todos.md`](../chaos-test/2026-04-07/phase4-follow-up-todos.md):

1. `FIX 8` — repeat-target shape authoring when Studio inserts `[*]`
2. `ARCH-4` — whether `TreeNode.bind` should become a full path in memory

---

## Decision 1: Canonicalize Repeat-Target Shapes At Write Time

### Decision

When `Project.addValidation()` changes a target from a template path such as
`line_items.description` to a repeat-target path such as
`line_items[*].description`, Studio must also canonicalize the authored FEL
source into the row-scoped form that the spec already defines.

This is a **write-time authoring normalization**, not a runtime evaluator
feature.

### Why

- A stored definition should already express the spec's semantics. It should
  not depend on Studio-specific runtime patch-up to mean the right thing.
- Runtime magic would create two meanings for the same source text: one in raw
  documents and another in Studio-authored documents.
- The tooling already has the right seam: `rewriteFELReferences()` and
  `rewriteMessageTemplate()` exist, are span-aware, and are already used for
  other authoring rewrites.

### Canonical stored form

For a shape whose stored target is `categories[*].personnel_costs`:

- The current target field is referenced as `$`
- Same-row siblings are referenced as `$row_total`, `$travel_costs`, etc.
- Same-row nested children are referenced relative to the current row, such as
  `$totals.approved`
- Explicit collection/global references stay explicit, such as
  `sum($categories[*].row_total)` or `$grand_total`
- Parent-row references must be written explicitly with `parent()`

### Rewriting rules

The normalization applies only when `_normalizeShapeTarget()` actually inserts
`[*]`. If the target is unchanged, Studio stores the source verbatim.

When the target changes:

1. Normalize the shape target first.
2. Derive the current row scope from the normalized target.
   - For `categories[*].personnel_costs`, the row scope is `categories[*]`.
   - For `sections[*].items[*].amount`, the row scope is `sections[*].items[*]`.
3. Rewrite `constraint`.
4. Rewrite `activeWhen` if present.
5. Rewrite FEL interpolations inside `message`.

Field-reference rewrites follow these rules:

- If the reference points to the normalized target itself, rewrite it to `$`.
- If the reference points to a field within the current row scope, rewrite it
  to a row-relative field reference by dropping the row prefix.
- If the reference is already explicit collection/global syntax, leave it
  unchanged.
- If the reference crosses a repeat boundary and cannot be expressed as a
  simple row-relative field path, reject the helper call and require the author
  to write the canonical expression explicitly.

### Guardrails

Studio must fail fast instead of silently storing ambiguous source.

Reject `addValidation()` with a dedicated helper error when all of the
following are true:

- the target was normalized to include `[*]`, and
- the authored expression contains an absolute field reference that traverses a
  repeat ancestor, and
- that reference cannot be rewritten as either:
  - the current target (`$`)
  - a same-row relative field reference
  - an already explicit collection/global reference

Use this rule to reject shorthand such as:

- target `sections.items.amount`
- constraint `$sections.section_total >= $sections.items.amount`

That source is ambiguous after normalization. The canonical version must be
written explicitly by the author, for example:

```fel
parent().section_total >= $
```

### Scope

This decision intentionally keeps the first implementation narrow:

- Supported automatically:
  - field targets inside repeat groups
  - same-row target and sibling references
  - message interpolation rewrites that follow the same rules
- Not auto-generated:
  - parent-row shorthand
  - repeat-group-object self references that would need `@current`
  - any rewrite that would require converting a field path into an arbitrary
    FEL expression

Those cases must already be authored in canonical FEL form.

### Consequences

- Rust, Python, and TypeScript runtime evaluators keep one semantics:
  wildcard-target shapes evaluate canonical row-scoped FEL.
- Studio becomes responsible for storing the canonical source when it creates
  the wildcard target on the author's behalf.
- Future authoring helpers should follow the same rule: normalize source at the
  authoring boundary, not during evaluation.

### Examples

| Authored target | Authored constraint | Stored target | Stored constraint |
|-----------------|---------------------|---------------|-------------------|
| `expenses.receipt` | `$expenses.receipt = true` | `expenses[*].receipt` | `$ = true` |
| `categories.personnel_costs` | `$categories.row_total = 0 or ($categories.personnel_costs / $categories.row_total) <= 0.50` | `categories[*].personnel_costs` | `$row_total = 0 or ($ / $row_total) <= 0.50` |
| `categories.personnel_costs` | `sum($categories[*].row_total) > 0 and $categories.personnel_costs <= $grand_total` | `categories[*].personnel_costs` | `sum($categories[*].row_total) > 0 and $ <= $grand_total` |

---

## Decision 2: Keep `TreeNode.bind` As A Leaf Key In Memory

### Decision

`TreeNode.bind` stays as the leaf `item.key` in authoring state. We are not
moving to full resolved paths at write time.

Full dotted paths remain an **export/boundary concern**, handled by
`cleanTreeForExport()` and by explicit boundary code that needs serialized
component paths.

### Why

- The authoring tree is optimized for structural edits. Reparenting, moving,
  and renaming are simpler when descendants do not carry eagerly materialized
  full paths.
- The bugs that motivated `ARCH-4` were consumer bugs, not proof that the
  in-memory model is wrong.
- Converting `bind` to a full path would touch a large surface area across
  handlers, reconciler logic, diagnostics, queries, and renderers for little
  user-facing value.

### Consequences

- New code must treat in-memory `bind` as a local authoring identifier, not a
  serialized path.
- Code that needs a serialized path must derive it from tree context or use the
  exported document, not assume the in-memory node already contains it.
- We should not add a generic "fix up bind everywhere" helper. The boundary
  must stay explicit so the invariant remains obvious.

### Reopen criteria

Revisit this only if we replace the current open `TreeNode` bag with a typed
component-node model. That larger redesign could justify revisiting where fully
qualified binding paths belong. Until then, the leaf-key convention is the
correct tradeoff.

# Component Bind Path Model — Spec Inconsistencies and Resolution

**Date:** 2026-03-17
**Sections in question:** Component spec §4.1, §4.2 (bind resolution table), §6.3 (Accordion)
**Status:** Two spec authoring errors identified. Implementation is correct. Spec prose needs updating.

---

## Background

This document captures the aggregate understanding of a three-way contradiction discovered during
investigation of a failing E2E test (`exported project bundle validates with Python formspec.validate`).
The test failed because the exported component tree included `nodeId` and `bind` on Stack nodes —
both of which the schema rejects via `unevaluatedProperties: false`.

The fix (`cleanTreeForExport` in `raw-project.ts`) was straightforward, but the investigation
surfaced two spec authoring errors that need to be corrected separately.

---

## The Two Spec Errors

### Error 1 — §4.1 says bind is a "flat key", but everything else uses dotted paths

**What §4.1 currently says (lines 480–483):**

> The `bind` property is a **string** containing the globally unique `key` of an item in the target
> Definition. It is NOT a dotted path, JSON Pointer, or FEL expression — it is a flat key that
> matches an item's `key` property exactly.

**What the example and implementation do:**

`examples/grant-application/component.json` — the authoritative hand-authored example — uses
dotted paths throughout:

```json
{ "component": "TextInput", "bind": "applicantInfo.orgName" }
{ "component": "TextInput", "bind": "applicantInfo.ein" }
{ "component": "DatePicker", "bind": "projectNarrative.startDate" }
```

The definition has `key: "orgName"` nested inside `key: "applicantInfo"`. These are not globally
unique flat keys — they are dotted qualified paths.

The planner (`formspec-layout/src/planner.ts`) uses `findItemAtPath` which splits on `.` and
traverses the item tree. `itemAtPath` in `formspec-engine` does the same. Both already support
the dotted-path model.

`cleanTreeForExport` in `raw-project.ts` explicitly converts relative-key trees to absolute
dotted-path trees before producing the wire-format document.

**Why §4.1 is wrong:**

The flat-key model requires all item keys to be globally unique across the entire definition.
The core spec mandates `[a-zA-Z][a-zA-Z0-9_]*` for keys — no dots — so uniqueness is *possible*
in principle (authors could write `step1_name` instead of `name` inside `step1`). But:

- No schema or engine enforcement of global uniqueness exists
- Real forms routinely have `name`, `email`, `date` fields in multiple groups
- The authoritative example contradicts §4.1 directly
- Once bind is forbidden on layout nodes (§4.2), dotted paths become *required* — there is no
  other mechanism for a child input to identify itself as `step1.name` when the parent Stack
  cannot carry scope context

**The deeper dependency:**

§4.1 and §4.2 are mutually incoherent unless one of two conditions holds:

1. All item keys are globally unique (§4.1 is correct, flat keys work)
2. Bind values use qualified dotted paths for nested items (§4.1 needs updating)

Because §4.2 says layout nodes MUST NOT have bind (so no parent-scope prefix mechanism), and
because global key uniqueness is unenforceable and impractical, condition 2 must be the intended
model. §4.1 needs to say that bind values addressing nested items use dotted qualified paths
(`group.child`, `outer.inner.field`).

---

### Error 2 — §6.3 says Accordion `Bind: Forbidden`, but schema defines bind and example uses it

**What §6.3 currently says (line 1568):**
```
Bind: Forbidden
```

And the §4.2 table (line 507) says:
> Container components MUST NOT have a `bind` property, with the exception of **DataTable** (§6.13).

And the `x-lm.bind` annotation in `schemas/component.schema.json` says `"bind": "forbidden"` for
Accordion.

**What the schema and example do:**

`schemas/component.schema.json` lines 968–971 — the Accordion `$defs` entry includes:

```json
"bind": {
  "type": "string",
  "description": "Optional bind path to a repeating group. When provided, each instance becomes one accordion section."
}
```

`examples/grant-application/component.json` uses:
```json
{ "component": "Accordion", "bind": "projectPhases" }
```

where `projectPhases` is a repeatable group in the definition.

The reconciler in `tree-reconciler.ts` maps repeatable groups to Accordion:
```typescript
case 'group': return (item as any).repeatable ? 'Accordion' : 'Stack';
```

And `SELF_MANAGED_GROUP_BINDS` in `raw-project.ts` correctly exempts Accordion (alongside
DataTable) from having its bind stripped at export.

**Why §6.3 is wrong:**

The schema was updated to support Accordion repeat-group binding — a natural and useful pattern
(one repeating group instance per accordion section). The spec prose and `x-lm` annotation were
not updated to reflect this. All three artefacts that actually run code (schema, example,
reconciler) agree that Accordion with bind is valid and intentional.

---

## The Internal vs. Wire-Format Distinction

An important nuance: the Studio's internal authoring tree and the exported wire-format document
use different bind models, and this is intentional.

**Internal tree (authoring state):**
```
Stack { bind: "step1" }
  TextInput { bind: "name" }
```
Group containers carry `bind` pointing to their group key. Children use *relative* keys. This is
the working model for the reconciler, component tree handlers, and the planner. `bind` on Stack
is used as a scope prefix: the planner builds `fullBindPath = parentPrefix + "." + bindKey`.

All the component handlers (`setGroupRepeatable`, `setGroupDisplayMode`, `setFieldWidget`, etc.)
address nodes by `{ bind: groupKey }` or `{ bind: fieldKey }` with relative keys. This relative
model is load-bearing and correct for its purpose.

**Wire-format document (after export):**
```
Stack { }                              ← no bind (spec-compliant)
  TextInput { bind: "step1.name" }    ← absolute path
```
`cleanTreeForExport` normalizes the internal tree to the wire format:
- Strips `nodeId` and `_layout` (internal-only, fail `unevaluatedProperties: false`)
- Strips `bind` from non-self-managed group containers (Stack, Grid, etc.)
- Propagates the stripped group path as a prefix to all descendant bind values
- Exempts Accordion and DataTable (self-managed, keep their bind)

This separation is correct. The internal representation is an implementation detail of the
authoring tool; the wire format is what the spec defines. Changing the internal representation to
match the wire format would break the handler system without fixing any observable problem.

---

## What the Spec Should Say

### §4.1 — The bind Property

Replace:
> The `bind` property is a **string** containing the globally unique `key` of an item in the target
> Definition. It is NOT a dotted path, JSON Pointer, or FEL expression — it is a flat key that
> matches an item's `key` property exactly.

With something like:
> The `bind` property is a **string** that identifies an item in the target Definition. For
> top-level items, `bind` is the item's `key` directly. For nested items within groups, `bind`
> is a dot-separated qualified path of the form `groupKey.childKey` (or deeper:
> `outer.inner.field`). The value MUST NOT be a FEL expression or JSON Pointer — it is a
> structural path through the item hierarchy, not a computed reference.

### §4.2 — Bind resolution table

Add Accordion to the Container exception:
> Container components MUST NOT have a `bind` property, with the exception of **DataTable** (§6.13)
> and **Accordion** (§6.3), which MAY bind to a repeatable group.

### §6.3 — Accordion header block

Change:
```
Bind: Forbidden
```
To:
```
Bind: Optional (repeatable group key)
```

And add a prose note (matching DataTable §6.13 pattern):
> When `bind` is set to a repeatable group key, Accordion acts as a repeat template: one
> collapsible section is rendered per group instance. Child bind values resolve relative to each
> instance. When `bind` is absent, sections are static children with no repeat semantics.

### `schemas/component.schema.json` — Accordion x-lm annotation

Change `"bind": "forbidden"` to `"bind": "optional"` on the Accordion `x-lm` block.

---

## Summary

| Issue | Location | Status |
|---|---|---|
| `bind` must be a flat key | §4.1 prose | **Spec bug** — update to allow dotted qualified paths |
| Layout bind forbidden, only DataTable exception | §4.2 table | **Spec bug** — add Accordion exception |
| Accordion `Bind: Forbidden` | §6.3 header, x-lm annotation | **Spec bug** — change to Optional |
| `nodeId`/`_layout` in exported tree | E2E test, schema validation | **Fixed** — `cleanTreeForExport` in `raw-project.ts` |
| `bind` on Stack in exported tree | E2E test, schema validation | **Fixed** — `cleanTreeForExport` strips it |
| Internal relative-bind model in reconciler | `tree-reconciler.ts` | **Correct as-is** — intentional internal representation |

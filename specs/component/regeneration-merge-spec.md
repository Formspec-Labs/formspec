---
title: Formspec Regeneration Merge
version: 1.0.0-draft.1
date: 2026-05-22
status: draft
depends_on:
  - specs/component/component-spec.md
  - specs/component/component-reference-fields-spec.md
  - specs/experience/experience-spec.md
  - specs/response-actions/response-actions-spec.md
  - thoughts/specs/2026-05-20-formspec-semantic-layers.md
---

# Formspec Regeneration Merge v1.0

## Status of This Document

This document is a **Draft** companion specification to the
[Formspec Component Specification](component-spec.md) and
[Formspec Component Reference Fields](component-reference-fields-spec.md). It
will define deterministic regeneration merge semantics for Component documents
that carry `x-generation` source anchors.

The §1-§6 normative prose has landed. Later normative sections, schema,
fixtures, algorithm tests, invariant tests, registration, and generated
artifacts land in the follow-on tasks of
`thoughts/plans/2026-05-22-regeneration-merge.md`.

## Bottom Line Up Front

<!-- bluf:start file=regeneration-merge-spec.bluf.md -->
- Regeneration merge is a deterministic three-way merge from `old-generated`, `designer-edited`, and `new-generated` Component documents into a merged draft plus `MergeReport`.
- Merge identity is based on `x-generation.anchors` from the Component Reference Fields spec, with no runtime rendering effect.
- Designer-authored presentation changes are preserved when their source anchors still resolve; conflicts and orphaned nodes are reported instead of silently discarded.
- Rename handling is explicit: only `$formspecAnchorMappings.anchorMappings[]` substitution can preserve presentation across changed anchors.
- Conformance is fixture-driven: schema shape, merge algorithm behavior, and invariants will be proven by the regeneration merge pytest suite before this draft is promoted.
<!-- bluf:end -->

## Table of Contents

- [§1 Introduction](#1-introduction)
- [§2 Inputs and Outputs](#2-inputs-and-outputs)
- [§3 Source Anchor Identity](#3-source-anchor-identity)
- [§4 Generated-Node Markers](#4-generated-node-markers)
- [§5 Designer-Edit Detection](#5-designer-edit-detection)
- [§6 Merge Algorithm](#6-merge-algorithm)
- [§7 Conflict Severities and Finding Codes](#7-conflict-severities-and-finding-codes)
- [§8 Orphan Handling](#8-orphan-handling)
- [§9 Rename and Anchor-Mapping Handling](#9-rename-and-anchor-mapping-handling)
- [§10 Studio Review UX Expectations](#10-studio-review-ux-expectations)
- [§11 Conformance](#11-conformance)

## 1. Introduction

### 1.1 Purpose and Source Posture

Regeneration merge defines the authoring-time contract for updating a generated
Component document after its source Definition, Experience, or Response Actions
context changes. The merge consumes:

- an `old-generated` Component document retained from the prior generation;
- a `designer-edited` Component document that may contain human presentation
  edits; and
- a `new-generated` Component document produced from the current source context.

It produces a merged Component draft plus a structured `MergeReport`.

This specification formalizes the regeneration intent described by
`thoughts/specs/2026-05-20-formspec-semantic-layers.md` §7.2 and §10.5. That
concept note remains design intent and promotion context. It is not a
conformance source for regeneration merge wire shapes, algorithms, schemas, or
fixtures. Regeneration merge conformance is defined by this specification, its
schema, and its fixture-driven conformance tests.

### 1.2 Scope

This specification applies only to processors that claim regeneration-merge
conformance. It defines a three-way merge over Component documents and the
associated `MergeReport` review surface.

The merge is a Component authoring operation. It does not change Definition,
Experience, Response Actions, Registry, Ontology, Trace, Response,
ValidationReport, Mapping, Intake Handoff, Respondent Ledger, Locale, Theme, or
runtime rendering ownership. It also does not require every Formspec runtime,
renderer, engine, or host to implement regeneration merge.

The Component output of a successful merge remains a Component document. A host
may feed that document into normal Component validation and rendering pipelines,
but this specification does not make rendering behavior depend on regeneration
metadata.

### 1.3 Required Common Ancestor

`old-generated` is mandatory for conforming three-way regeneration merge. It is
the common ancestor that lets the processor distinguish designer-only edits,
regenerator-only edits, and true conflicts.

A host that cannot provide `old-generated` cannot perform conforming three-way
merge and cannot claim to preserve designer intent under this specification.
Such a host may perform fresh generation from `new-generated`, but it MUST treat
the result as fresh generation rather than as a conforming regeneration merge
and MUST surface that degradation to the authoring host or review workflow.

### 1.4 Relationship to Component Reference Fields

The Component Reference Fields specification defines `x-generation` as optional
Component node metadata and defines the `x-generation.anchors[]` prefix
taxonomy. Regeneration merge consumes those anchors as source identity when a
processor is explicitly performing this companion specification's merge.

This specification does not retroactively add merge semantics to Component
Reference Fields. Outside a regeneration-merge operation, `x-generation` remains
provenance metadata. Renderers and default runtime processors MUST continue to
ignore `x-generation` for rendering, binding, localization, validation,
calculation, Response status, Response Actions invocation, Trace content, and
ledger behavior.

Reference-integrity findings remain owned by Component and Component Reference
Fields. Merge-context findings are reported under the `COMP-REGENERATION-*`
family defined later in this specification.

### 1.5 Out of Scope

This specification does not define Trace query predicates, Trace cache
invalidation, stale-cache rejection, required-item coverage checking, or Trace as
authored truth. The `MergeReport` is a review artifact that may become Trace
input in a later Trace specification.

This specification does not define runtime merger implementations in Rust,
TypeScript, Python, or any other engine. Runtime implementations may later claim
conformance by passing this specification's fixtures and invariants.

This specification does not define the full Studio review product experience.
It may define report and DOM-level obligations for review surfaces, but visual
design, interaction design, undo/redo, routing, and product workflow remain host
or Studio concerns.

This specification does not define broad migration or changelog semantics. For
rename preservation it consumes only the minimum
`$formspecAnchorMappings.anchorMappings[]` input shape defined in §9. Response
data migrations, semantic changelogs, versioning policy, and richer migration
formats remain outside this specification.

### 1.6 Conventions and Terminology

The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT", "SHOULD",
"SHOULD NOT", "RECOMMENDED", "NOT RECOMMENDED", "MAY", and "OPTIONAL" in this
document are to be interpreted as described in BCP 14 [RFC 2119] [RFC 8174]
when, and only when, they appear in ALL CAPITALS, as shown here.

`Component` means a Formspec Component document as defined by
[Formspec Component Specification](component-spec.md). `Component Reference
Fields` means
[Formspec Component Reference Fields](component-reference-fields-spec.md).
`Definition`, `Response`, and `ValidationReport` retain their core
specification meanings.

`old-generated` is the previously generated Component document retained by the
host as the common ancestor. `designer-edited` is the author-visible Component
document after human or tool edits. `new-generated` is the current generated
Component document produced from the updated source context. `merged` is the
Component draft output of regeneration merge. `MergeReport` is the structured
report output that records regenerated, surviving, orphaned, pending-review, and
conflict entries.

## 2. Inputs and Outputs

### 2.1 Operation Shape

The regeneration merge operation has three Component inputs, one optional peer
context input, and two outputs:

The conforming three-way merge path has this operation shape:

```text
merge(
  old_generated: Component v1.1,
  designer_edited: Component v1.1,
  new_generated: Component v1.1,
  context: RegenerationMergeContext
) -> { merged: Component v1.1, report: MergeReport v1.0 }
```

The absent-common-ancestor degradation path has this operation shape:

```text
freshGenerationWithoutCommonAncestor(
  old_generated: null,
  designer_edited: Component v1.1,
  new_generated: Component v1.1,
  context: RegenerationMergeContext
) -> { merged: Component v1.1, report: MergeReport v1.0 }
```

When `old_generated` is present, the `old_generated`, `designer_edited`,
`new_generated`, and `merged` documents MUST declare `$formspecComponent:
"1.1"` and MUST validate against the Component schema whose `$id` is
`https://formspec.org/schemas/component/1.1`.

Validating against the Component v1.1 schema is not sufficient by itself because
that schema accepts earlier Component version markers for backward
compatibility. A regeneration-merge processor MUST reject any present Component
document that does not declare `$formspecComponent: "1.1"` for `old_generated`,
`designer_edited`, `new_generated`, or `merged`.

`MergeReport` MUST validate against
`schemas/regeneration-merge-report.schema.json` once that schema lands. Until
that Task 13 schema lands, §2 references `MergeReport` only as the named report
output and does not claim a complete report wire shape.

### 2.2 Inputs

`old_generated` is the Component document produced by the previous generation
cycle before designer edits were applied. It is the common ancestor for the
three-way merge.

`designer_edited` is the author-visible Component document after a designer,
authoring tool, or host workflow has changed the generated document. It may
contain presentation edits, reordered children, new designer-authored nodes, or
deleted generated nodes.

`new_generated` is the Component document produced from the current source
context after Definition, Experience, Response Actions, Registry, Ontology, or
generator inputs changed.

`RegenerationMergeContext` reuses the peer-document resolution context from
Component Reference Fields §6 for source lookups: `definition`, `experience`,
`responseActions`, `registry`, `ontology`, and `hostPolicy`. It extends that
context with OPTIONAL `anchorMappings` for §9 rename handling. The three
Component documents above are the merge inputs; they are not the single
`component` input used by the Component Reference Fields resolver.

### 2.3 Outputs

`merged` is a new Component document that represents the processor's proposed
authoring draft. It is not one of the input documents. It MUST declare
`$formspecComponent: "1.1"` and MUST validate against the Component v1.1 schema.

`report` is a new `MergeReport` document. It records which nodes survived,
regenerated, orphaned, entered pending review, or produced conflicts. The report
MUST NOT duplicate Component Reference Fields, Component bind/reference, or
Experience coverage findings. Those findings compose into review surfaces
through their own resolver outputs.

### 2.4 Required Common Ancestor

Hosts that perform regeneration MUST persist the `old_generated` Component
document produced by each generation cycle. The storage mechanism is
host-defined; examples include a project file, cache entry, database column, or
revisioned artifact store.

A host that cannot supply `old_generated` MUST NOT attempt conforming three-way
merge. No two-way fallback exists.

When `old_generated` is absent, the operation degrades to fresh generation:

- `merged` MUST be structurally equal to `new_generated`;
- designer edits from `designer_edited` are not preserved; and
- `report.conflicts[]` MUST contain a `COMP-REGENERATION-NO-COMMON-ANCESTOR`
  entry with severity `error`.

The `COMP-REGENERATION-NO-COMMON-ANCESTOR` entry is the required diagnostic for
this degradation. Hosts MAY surface additional product-specific warnings, but
those warnings are not a substitute for the MergeReport conflict entry.

### 2.5 Input Immutability

The regeneration merge operation is no-mutation. A conforming processor MUST
treat `old_generated`, `designer_edited`, `new_generated`, and
`RegenerationMergeContext` as immutable inputs.

The processor MUST return new `merged` and `report` documents. It MUST NOT write
repairs, annotations, resolved references, coverage information, anchor
mappings, or review metadata into any input Component document or peer artifact.
It also MUST NOT synthesize missing Definition, Experience, Response Actions,
Registry, Ontology, Trace, Response, ValidationReport, Mapping, Intake Handoff,
Respondent Ledger, Locale, Theme, or Studio state while producing the merge
outputs.

## 3. Source Anchor Identity

### 3.1 Regeneration-Only Anchor Set Equality

Component Reference Fields defines `x-generation.anchors[]` as an array of
strings and defines the standard anchor prefixes. It does not define ordering,
uniqueness, global identity, or merge matching semantics for that array.

For regeneration merge only, anchor arrays are compared as order-normalized,
duplicate-stripped sets. A processor computes an anchor set by:

1. selecting only string entries from `x-generation.anchors[]`;
2. removing duplicate strings; and
3. sorting the remaining strings bytewise.

Two anchor arrays compare equal when their computed anchor sets are
byte-identical. This rule is scoped to this regeneration merge specification and
MUST NOT be treated as a Component Reference Fields rule.

### 3.2 Primary Match Rule

A generated node in `old_generated` matches a generated node in `new_generated`
when their computed anchor sets compare equal under §3.1. A generated node in
`designer_edited` matches a generated node in `new_generated` by the same rule.

Raw equality is the normal path. §9 anchor-mapping substitution may transform an
old anchor set before the same §3.1 equality comparator is applied. No other
rename, edit-distance, prefix-family, or tree-position heuristic may create an
old-to-new generated-node match.

### 3.3 Duplicate Anchor Sets

Anchor uniqueness is not guaranteed by Component Reference Fields. A `Section`
and a nested `Label`, for example, may both carry `["unit:identity"]`.

When multiple candidate nodes in the same input tree have the same computed
anchor set, the match key first extends to:

```text
(anchor_set, parent_match_key)
```

`parent_match_key` is computed recursively by the same rule. If the duplicate
group is still ambiguous under the same parent, the processor MAY use a stable
local discriminator that is present in both compared nodes and is independent of
sibling order, such as a non-empty `id`, `bind`, or `ActionButton.actionRef`.
The processor MUST NOT use component type as the discriminator because widget
swaps are designer-edit deltas, not identity changes.

If the parent chain required for duplicate disambiguation reaches a parent that
has no matchable anchor set, or if no stable local discriminator resolves the
same-parent duplicate group exactly, the duplicate candidate is ambiguous. An
ambiguous duplicate MUST NOT be matched against `new_generated` by path,
component type, sibling position, or ordinal. Later algorithm steps surface the
node through orphan, pending-review, or conflict reporting instead of choosing
arbitrarily.

### 3.4 Nodes Without Matchable Anchors

A node has no matchable anchors when it has no `x-generation` object, when
`x-generation.anchors` is absent, or when `x-generation.anchors` is empty after
non-string entries are ignored and duplicates are stripped.

Nodes without matchable anchors are treated as designer-authored for merge
identity. They are never matched against `new_generated`, even if other
`x-generation` provenance members such as `source`, `strategy`, `generatedBy`,
or `generatedAt` are present.

For old-to-designer preservation only, a node without matchable anchors may
match between `old_generated` and `designer_edited` by `id` when both nodes have
the same non-empty `id`. If no usable `id` exists, the fallback is the node's RFC
6901 JSON Pointer path within the Component document, such as
`/tree/children/2/children/0` or `/components/address/tree/children/0`.

The fallback in this subsection is only for preserving designer-authored nodes
between the old and designer-edited documents. It MUST NOT be used to match an
old or designer node against `new_generated`.

### 3.5 Anchor Taxonomy

Regeneration merge reuses the standard Component Reference Fields anchor
prefixes:

- `item:`
- `unit:`
- `task:`
- `action:`
- `concept:`

This specification does not introduce new prefixes. Anchor suffix syntax remains
owned by the referenced source layer. A regeneration-merge processor MUST NOT
rewrite suffixes, normalize suffixes into another source format, invent missing
anchors, or treat unresolved anchors as proof that a generated node should match
by a non-anchor heuristic.

## 4. Generated-Node Markers

### 4.1 Marker Classification

Regeneration merge uses `x-generation` only for authoring-time merge
classification and reporting. Invalid `x-generation` shapes are Component schema
validation concerns; this specification assumes schema-valid Component v1.1
inputs.

A node has a generation marker when:

- it has an `x-generation` object; and
- that object has at least one of `source`, `strategy`, `generatedBy`, or a
  non-empty `anchors` array after §3.1 anchor-set computation.

`generatedAt` alone does not make a node generated for merge purposes. A
timestamp-only `x-generation` object is provenance metadata, not a merge
classification signal.

### 4.2 Matchable Generation Anchors

A node has matchable generation anchors only when §3 computes a non-empty anchor
set from `x-generation.anchors[]`.

`hasGenerationMarker` and `hasMatchableGenerationAnchors` are separate states. A
node may carry generator provenance through `source`, `strategy`, or
`generatedBy` and still be non-matchable against `new_generated` if it has no
matchable anchors. Such a node may be preserved or reported by later merge
steps, but §3 identity MUST NOT match it against `new_generated`.

### 4.3 Designer-Edited Generated Nodes

Designer edits do not remove generation marker status. A designer may edit a
node that still carries `x-generation`; the node remains generated for
classification and reporting, while the designer edit itself is detected by the
three-way comparison against `old_generated`.

A host or authoring tool MUST NOT infer from `x-generation` alone that the
current node value is untouched generator output. The current node may be
generated, generated-then-edited, imported from another authoring workflow, or
manually annotated with provenance metadata.

### 4.4 Nodes Without Generation Markers

A node without a generation marker is treated as designer-authored for
regeneration-merge classification. That classification does not assert the
node's historical origin; it only says the merge processor lacks source linkage
that would let it regenerate the node.

Nodes without generation markers cannot be regenerated from `new_generated` by
this specification. They are preserved through old-to-designer matching when
possible, or surfaced through orphan/pending-review/conflict handling when their
surrounding generated structure changes.

## 5. Designer-Edit Detection

### 5.1 Classifier Role

Designer-edit detection classifies structural deltas between matched
`old_generated` and `designer_edited` nodes. It uses `old_generated` as the
common ancestor and returns normalized delta classes for §6 to consume.

This section does not decide final merge output, report array placement, or
finding severity. §6 consumes the deltas to preserve, regenerate, orphan, or
conflict nodes. §7 defines the finding family and severities.

### 5.2 Structural Comparison Rules

Designer-edit detection compares parsed JSON values, not rendered output,
visual semantics, platform widget behavior, or authoring-tool presentation.

Object member order is insignificant. Two objects compare by member names and
member values. An absent member and a member with JSON `null` are different
values.

Array order is significant unless another section explicitly defines
order-insensitive behavior for a specific comparison. For example, §3 anchor-set
equality is order-normalized for merge identity only; that identity rule does
not make every JSON array order-insensitive.

Child arrays are compared by matched child identities, not by raw subtree text.
The parent node receives child-order, child-add, or child-remove deltas.
Descendant property changes are classified on the matched descendant node rather
than being duplicated as parent subtree changes.

### 5.3 Delta Classes

For each matched `old_generated` / `designer_edited` node pair, the detector
MUST emit the following structural delta classes when applicable:

| Delta class | Condition | Notes |
|---|---|---|
| `propertyOverride` | A non-`children`, non-`component` property differs between old and designer. | §6 decides whether the value survives, regenerates, or conflicts with `new_generated`. |
| `childReorder` | Matched children remain present but their order differs. | The delta records the designer order by child identity. |
| `childAdd` | Designer contains a child with no matching old child. | §6/§8 map the child through existing orphaned handling; `pendingReview` is reserved for newly generated nodes. No separate `designer-inserted` report bucket exists. |
| `childRemove` | Old contains a child with no matching designer child. | §6/§7 decide whether this becomes `COMP-REGENERATION-DESIGNER-REMOVED`. |
| `widgetSwap` | The `component` value differs between old and designer. | §6 decides whether the designer widget survives; §7 owns `COMP-REGENERATION-WIDGET-SWAP` when review is required. |

The detector MAY emit more than one delta class for the same node. For example,
a designer may change `props.label`, reorder children, and swap the widget type
on the same Component node.

### 5.4 Preservation-Only Matches

Nodes without matchable generation anchors, including nodes with provenance-only
generation markers, may match between `old_generated` and `designer_edited` only
for preservation under §3.4.

Such matches can produce designer-edit deltas, but those deltas are
preservation-only. They MUST NOT create an old-to-new regeneration match, MUST
NOT assert source authority, and MUST NOT be used to manufacture conflicts
against `new_generated` solely by path, `id`, component type, or sibling
position.

### 5.5 Output Discipline

Designer-edit detection MUST NOT mutate `old_generated`, `designer_edited`,
`new_generated`, or `RegenerationMergeContext`. It returns delta data to the
merge operation; any "marked" or "flagged" status is report output only.

Authoring or review surfaces MAY visualize structural deltas. Runtime renderers
remain out of scope and MUST NOT change rendering behavior because a node has
designer-edit deltas or `x-generation` metadata.

## 6. Merge Algorithm

### 6.1 Baseline Rules

The concept baseline for regeneration merge is:

```text
Preserve designer edits when their source anchors still resolve.
Regenerate nodes whose itemRef, actionRef, or unitRef changed.
Mark orphaned nodes when their bind, actionRef, or unitRef no longer resolves.
Add newly generated fields and actions as pending review.
Never silently delete designer-authored layout.
```

The quoted `itemRef` term is concept shorthand. Normative Component merge uses
the actual Component item surface: `bind` and `item:` generation anchors.

The merge algorithm applies those rules by treating `new_generated` as the
structural authority for what the current source context produces, using
`old_generated` as the common ancestor, and preserving designer changes from
`designer_edited` when §3 identity and §5 deltas show that preservation is
deterministic.

### 6.2 Absent Common Ancestor

If `old_generated` is `null` or otherwise absent, the processor MUST NOT perform
two-way merge. It MUST return a deep copy of `new_generated` as `merged` and MUST
add a `report.conflicts[]` entry with:

- `code: "COMP-REGENERATION-NO-COMMON-ANCESTOR"`;
- `severity: "error"`;
- `nodePath: "/tree"` or the equivalent root Component tree path; and
- an empty `anchors` array unless a host supplies a more precise root anchor.

Designer edits from `designer_edited` are not preserved on this path.

### 6.3 Match Indexes

For the conforming three-way path, a processor MUST build explicit match indexes
before assembling output:

- `new_index` from `new_generated`;
- `old_index` from `old_generated`, applying `context.anchorMappings` when
  present; and
- `designer_index` from `designer_edited`, applying `context.anchorMappings` when
  present.

Each index is built by walking the corresponding Component tree in pre-order
document order. For each node, the processor computes a match key under §3:

1. If the node has no matchable anchors, the key is `UNMATCHABLE`.
2. Otherwise, the key starts with the §3.1 computed anchor set, after
   `context.anchorMappings` substitution when the index is old or designer.
3. Duplicate anchor sets are disambiguated under §3.3 by recursive
   `parent_match_key` and, if necessary, a stable local discriminator.
4. If §3.3 cannot resolve a duplicate, the key is `AMBIGUOUS`.

`UNMATCHABLE` nodes are omitted from anchor indexes. `AMBIGUOUS` nodes and keys
that collide after mapping MUST be recorded as ambiguous and MUST NOT be used for
deterministic lookup. A lookup against `old_index` or `designer_index` returns no
node when the key is missing or ambiguous.

The processor MUST keep a `represented_designer_nodes` set while assembling the
generated tree. Whenever a deterministic `designer_index` lookup contributes to
a generated-node merge decision, the corresponding designer node is added to
that set. §6.7 uses the set to prevent the orphan pass from reattaching a
designer ancestor whose descendant has already been represented in the generated
tree.

### 6.4 Generated-Node Assembly

The processor assembles output recursively from `new_generated`, beginning at
`new_generated.tree`. For each `N_new`, it computes `key = match_key(N_new)` and
selects one of the following outcomes:

| Condition | Merged node | Report placement |
|---|---|---|
| `key` is `UNMATCHABLE` | Shallow copy of `N_new` without children; children still recurse. | No entry for the unmatchable shell solely because it is unmatchable. |
| `key` is `AMBIGUOUS` or ambiguous in `new_index` | Shallow copy of `N_new` without children; children still recurse. | `pendingReview[]` with `COMP-REGENERATION-PENDING-REVIEW`. |
| No deterministic `N_old` and no deterministic `N_designer` | Shallow copy of `N_new` without children. | `pendingReview[]` with `COMP-REGENERATION-PENDING-REVIEW`. |
| No deterministic `N_old`, deterministic `N_designer` | Designer shell copied without children; children are merged from `N_new`. | `conflicts[]` with `COMP-REGENERATION-DESIGNER-PRECEDES`. |
| Deterministic `N_old`, no deterministic `N_designer` | No merged node. | `conflicts[]` with `COMP-REGENERATION-DESIGNER-REMOVED`. |
| `N_old` and `N_designer` are structurally equal under §5 | Shallow copy of `N_new` without children. | `regenerated[]`. |
| `N_old` and `N_designer` differ | Apply §6.5 three-way node merge. | `conflicts[]`, `surviving[]`, or `regenerated[]` as defined by §6.5. |

When the selected outcome returns a merged node, the processor MUST set that
node's `children` from §6.6 before returning the node to its parent.

Unmatchable `new_generated` nodes are never overlaid with old or designer nodes
by path or `id`. Nodes without matchable anchors may be preserved only through
old-to-designer preservation under §3.4 and through uncovered orphan subtree
reattachment under §6.7.

### 6.5 Three-Way Node Merge

When `N_old`, `N_designer`, and `N_new` all exist and `N_designer` differs from
`N_old`, the processor MUST start the merged node from a shallow copy of `N_new`
without children. It then classifies designer deltas under §5 and overlays only
the designer deltas that survive the rules below:

- If a non-`children`, non-`component` property changed only in
  `designer_edited`, the designer value survives and the report entry belongs in
  `surviving[]` with that JSON Pointer in `propertyDeltas[]`.
- If a property changed only in `new_generated`, the generated value from
  `N_new` remains in the merged node and the report entry belongs in
  `regenerated[]`.
- If designer and generator changed the same property to the same value, the
  `N_new` value remains in the merged node and the processor MUST NOT report a
  conflict for that property.
- If designer and generator changed the same property to different values, the
  processor MUST preserve the designer value in `merged` and MUST report
  `COMP-REGENERATION-PROPERTY-CONFLICT` in `conflicts[]` with that JSON Pointer
  in `propertyDeltas[]`.
- If `component` changed only in `designer_edited`, the designer component value
  survives and the processor MUST report
  `COMP-REGENERATION-WIDGET-SWAP` in `conflicts[]` unless `new_generated`
  independently made the same component choice.
- If `component` changed in both designer and generator to different values, the
  processor MUST preserve the designer component value in `merged` and MUST
  report `COMP-REGENERATION-WIDGET-SWAP` in `conflicts[]`.

If any delta for the node produces a conflict, the node's merge entry belongs in
`conflicts[]`. If no conflict occurs and at least one designer delta survives,
the entry belongs in `surviving[]`, even when unrelated generated-only changes
also remain from `N_new`. If no designer delta survives, the entry belongs in
`regenerated[]`.

`propertyDeltas[]` entries are JSON Pointer strings for the node-local
properties that changed, such as `/props/label`, `/component`, or `/children`.
Report array placement defines the outcome role; §7 defines the finding codes
and severities.

### 6.6 Child Assembly and Reorder Preservation

Child arrays are assembled recursively from `N_new.children` first. A processor
MUST call the generated-node assembly rule for each child in `N_new.children`
order and MUST omit child results that returned no merged node.

After that recursive pass, if `N_old` and `N_designer` have a §5 `childReorder`
delta, the processor compares matched child-key order:

- If the matched-child order in `N_new` equals the matched-child order in
  `N_old`, the reorder is designer-only. The processor MUST reorder the matched
  entries in the merged child list to the designer order, keep newly generated
  children in their `N_new` relative positions, and add `/children` to the
  parent entry's `propertyDeltas[]` in `surviving[]`.
- If `N_new` also reordered the same matched child set and the `N_new` order does
  not equal the designer order, the processor MUST keep the `N_new` order for
  matched generated children and MUST report `COMP-REGENERATION-PROPERTY-CONFLICT`
  for `/children`.
- If `N_new` and `N_designer` have the same matched-child order, the processor
  MUST NOT report a child-order conflict.

Designer-added children that are not present in `new_generated` are not inserted
by the recursive `N_new.children` walk. They are handled by the uncovered-orphan
pass in §6.7 and reported through `orphaned[]`, not through `pendingReview[]`.

### 6.7 Uncovered Orphan Reattachment

After generated-node assembly completes, the processor MUST perform exactly one
orphan reattachment pass over `designer_edited` in pre-order document order.

A designer node is an uncovered orphan candidate only when all of the following
are true:

1. the designer node is not in `represented_designer_nodes`;
2. no descendant of the designer node is in `represented_designer_nodes`; and
3. its mapped match key is `UNMATCHABLE`, `AMBIGUOUS`, ambiguous in
   `designer_index`, ambiguous in `new_index`, or does not resolve in
   `new_index`.

The processor selects maximal uncovered orphan roots: when an uncovered orphan
candidate has an uncovered orphan ancestor already selected as a root, only the
ancestor is appended. This prevents duplicate orphan descendants.

For each orphan root, the processor locates a reattachment target as follows:

1. First inspect the orphan root's immediate parent in `designer_edited`. If that
   parent has a mapped match key that resolves to a non-ambiguous node in
   `merged`, append the orphan root subtree once as the last child of that merged
   parent and add an `orphaned[]` entry whose `reattachedTo` is the parent's
   merged `nodePath`.
2. Otherwise, walk higher ancestors in `designer_edited` until the nearest
   ancestor with a mapped match key that resolves to a non-ambiguous node in
   `merged` is found. Append the orphan root subtree once as the last child of
   that ancestor, add the base `COMP-REGENERATION-ORPHAN-NODE` entry, and also
   add `COMP-REGENERATION-ORPHAN-REATTACHED-CASCADE`.
3. Otherwise, append the orphan root subtree once under `/tree` after the last
   root child, add the base orphan entry, and also add
   `COMP-REGENERATION-ORPHAN-DETACHED`.

The orphan subtree is copied from `designer_edited`. The processor MUST NOT
append an orphan root whose subtree contains a represented designer descendant,
because that would duplicate a node already merged during generated-node
assembly.

Reference-resolution failures for orphan nodes are not emitted by this section.
They are produced by the Component or Component Reference Fields resolver and
composed into the review surface under §8 and §11.

### 6.8 Determinism and Output Discipline

The algorithm's deterministic ordering rules are:

- match indexes are built in pre-order document order;
- generated-node assembly starts from `new_generated` child order;
- designer-only child reorders are applied only after recursive child assembly;
- orphan roots are selected as maximal uncovered roots; and
- orphan roots are appended in `designer_edited` pre-order document order.

The processor MUST return new `merged` and `report` documents and MUST NOT mutate
`old_generated`, `designer_edited`, `new_generated`, or
`RegenerationMergeContext`.

## 7. Conflict Severities and Finding Codes

## 8. Orphan Handling

## 9. Rename and Anchor-Mapping Handling

## 10. Studio Review UX Expectations

## 11. Conformance

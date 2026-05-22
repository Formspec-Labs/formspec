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

The §1-§5 normative prose has landed. Later normative sections, schema,
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

## 7. Conflict Severities and Finding Codes

## 8. Orphan Handling

## 9. Rename and Anchor-Mapping Handling

## 10. Studio Review UX Expectations

## 11. Conformance

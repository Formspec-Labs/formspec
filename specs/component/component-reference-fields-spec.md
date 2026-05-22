---
title: Formspec Component Reference Fields
version: 1.1.0-draft.1
date: 2026-05-22
status: draft
depends_on:
  - specs/component/component-spec.md
  - specs/experience/experience-spec.md
  - specs/response-actions/response-actions-spec.md
  - specs/core/validation-mapping.md
  - thoughts/specs/2026-05-20-formspec-semantic-layers.md
---

# Formspec Component Reference Fields v1.1

## Status of This Document

This document is a **Draft** companion specification to the
[Formspec Component Specification](component-spec.md). It defines additive
reference metadata on Component nodes and the cross-document resolution contract
for those fields.

This scaffold lands before the Component schema delta. Normative section bodies,
schema changes, conformance fixtures, resolver tests, and renderer-ignore tests
land in later plan slices.

## Bottom Line Up Front

<!-- bluf:start file=component-reference-fields-spec.bluf.md -->
- Component reference fields are additive metadata on Component nodes: `unitRef`, `taskRefs`, `conceptRefs`, and `x-generation` do not change rendering, binding, validation, or Response semantics.
- `unitRef` and `taskRefs` resolve against the loaded Experience document; unresolved `unitRef` is authoring-critical when Experience is present, while unresolved `taskRefs` remain advisory warnings.
- `conceptRefs` reuse the Experience `ConceptRef` shape and are host-policy metadata; default processors report unresolved concepts at `info` severity unless strict mode upgrades them.
- `x-generation` records provenance and anchor metadata only; renderers MUST ignore it, and regeneration merge behavior is explicitly out of scope for this spec.
- Cross-document resolution is deterministic, no-mutation, and one-directional: Component may read Experience, Response Actions, and Registry/Ontology context, but it MUST NOT write into those documents.
<!-- bluf:end -->

## Table of Contents

- [§1 Introduction](#1-introduction)
  - [§1.1 Purpose and Scope](#11-purpose-and-scope)
  - [§1.2 Relationship to Existing Specifications](#12-relationship-to-existing-specifications)
  - [§1.3 Design Principles](#13-design-principles)
  - [§1.4 Conformance Posture and Prohibitions](#14-conformance-posture-and-prohibitions)
- [§1.5 Promotion Resolution](#15-promotion-resolution)
- [§2 `unitRef`](#2-unitref)
- [§3 `taskRefs`](#3-taskrefs)
- [§4 `conceptRefs`](#4-conceptrefs)
- [§5 `x-generation`](#5-x-generation)
- [§6 Cross-Document Resolution Algorithm](#6-cross-document-resolution-algorithm)
- [§7 Findings](#7-findings)
- [§8 Conformance](#8-conformance)

## 1. Introduction

### 1.1 Purpose and Scope

This specification defines four additive reference fields for Component nodes:
`unitRef`, `taskRefs`, `conceptRefs`, and `x-generation`. The fields let a
Component tree explain which Experience units, Experience tasks, Registry or
Ontology concepts, and generation anchors a node is related to without moving
ownership of those artifacts into Component.

The reference fields are metadata and resolution surfaces. They do not change
Component rendering, slot binding, FEL `when` behavior, Theme token cascade,
Definition validation, Response status, Mapping execution, Response Actions
invocation, Intake Handoff assembly, or Respondent Ledger semantics.

This specification also defines the cross-document resolver posture for the
reference fields. The resolver reports authoring and generation findings; it
does not mutate Component, Experience, Response Actions, Registry, Ontology, or
Definition documents.

### 1.2 Relationship to Existing Specifications

The [Component Specification](component-spec.md) remains the owner of concrete
UI structure, widget selection, layout, style hooks, accessibility overrides,
slot binding, and `ActionButton.actionRef`. This document adds reference
metadata that every Component node MAY carry once the Component schema delta
lands.

The [Experience Specification](../experience/experience-spec.md) owns
`Unit.id`, `Task.id`, and the `ConceptRef` object shape. `unitRef` and
`taskRefs` read Experience identifiers. `conceptRefs` reuses the Experience
`ConceptRef` shape so Component does not invent a parallel concept-reference
vocabulary.

The [Response Actions Specification](../response-actions/response-actions-spec.md)
continues to own Action identity and invocation semantics. This specification
does not redefine `ActionButton.actionRef`; it only extends the existing
`COMP-REFERENTIAL-INTEGRITY` finding family with additional reference kinds in
later sections.

Registry and Ontology documents remain the owners of concept identity and
meaning. Component concept references are informative under the default host
policy unless a host explicitly opts into stricter concept resolution.

### 1.3 Design Principles

Reference is not ownership. A Component node may point to Experience, Registry,
Ontology, or generation metadata, but it MUST NOT inline or override the
referenced artifact's semantics.

Additivity is mandatory. These fields are OPTIONAL. They MUST NOT tighten an
existing Component field, required set, enum, or pattern, and existing Component
documents must continue to validate unchanged when the schema delta lands.

Runtime behavior is stable. Renderers MUST ignore `x-generation`, and the
presence or absence of any field defined here MUST NOT change the rendered DOM,
native view hierarchy, PDF output, CLI prompt sequence, validation outcome, or
Response payload.

Resolution is one-directional. A resolver may read Component plus optional
Experience, Response Actions, Registry, and Ontology context. It MUST NOT write
back to those documents, synthesize missing Experience units, repair Registry
concepts, or rewrite Component nodes while producing a report.

### 1.4 Conformance Posture and Prohibitions

This specification has three conformance surfaces, formalized in §8:

1. **Schema additivity.** A processor validates the new fields as optional
   Component metadata without changing existing Component semantics.
2. **Resolver behavior.** A processor walks the Component tree, resolves the
   fields against the provided context, and emits deterministic findings.
3. **Renderer ignore behavior.** A renderer proves that `x-generation` and other
   reference metadata do not affect output.

A conforming implementation MUST NOT:

- Treat `unitRef` as a layout group, page, section, or widget directive.
- Treat `taskRefs` as a rendering order, workflow state, or validation trigger.
- Treat `conceptRefs` as executable validation, calculation, or Mapping logic.
- Treat `x-generation` as merge semantics, a Trace record, or runtime behavior.
- Downgrade `actionRef` errors defined by Component §5.19 and Plan E.
- Write reference-resolution results into Definition, Experience, Response
  Actions, Registry, Ontology, Mapping, Intake Handoff, Respondent Ledger, or
  Trace artifacts.

## 1.5 Promotion Resolution

The semantic-layers note marked the reference-field family as future shape. In
§5.5 it names `unitRef`, `taskRefs`, `actionRef`, `conceptRefs`, and
`x-generation` as Component reference fields, while stating that only
`ActionButton.actionRef` was current after Plan E. In §7.3 it shows the future
shape with `unitRef`, `taskRefs`, and `x-generation` still deferred. In §11.3 it
sets the promotion gate: Component reference fields and generation metadata
should land only after Experience identities and regeneration consumers are
stable.

Plan E resolved the action-trigger portion first: `SubmitButton` became
`ActionButton`, `actionRef` became required, and the widget now resolves against
Response Actions `actions[*].id` with no fallback path. That established the
precedent this specification follows: Component may carry references to peer
artifacts, but the referenced artifact owns the executable semantics.

This specification promotes the remaining field family from concept examples to
Component reference-field spec work:

- `unitRef` promotes the Component-to-Experience Unit link.
- `taskRefs` promotes advisory Component-to-Experience Task links.
- `conceptRefs` promotes Component-to-Registry/Ontology concept links using the
  Experience `ConceptRef` shape.
- `x-generation` promotes generation provenance and anchor metadata shape only.

Promotion here does not define regeneration merge behavior, Trace predicates, or
deep concept validation. It also does not alter the already-landed
`ActionButton.actionRef` contract or its `error` severity. Those boundaries are
kept so this follow-up remains additive to current Component schema truth.

## 2. `unitRef`

### 2.1 Shape

`unitRef` is an OPTIONAL string field on a Component node. When present, it
identifies the Experience Unit that most directly explains the node's task
intent.

The value MUST match the identifier profile used by Experience `Unit.id`. The
current Experience schema accepts identifiers that start with an ASCII letter
and continue with ASCII letters, digits, or underscores. Authors SHOULD continue
to use the user-domain camelCase style recommended by the Experience
specification.

`unitRef` is a single reference, not an array. A Component node has at most one
primary Unit relationship. Secondary or cross-cutting task relationships belong
in `taskRefs`, not in multiple `unitRef` values.

### 2.2 Resolution Target

When an Experience document is loaded, `unitRef` resolves against
`experience.units[*].id`. Resolution is exact string equality after JSON parsing.
Resolvers MUST NOT normalize case, trim whitespace, replace separators, infer
near matches, or synthesize missing Units.

Resolution reads the Experience document only. It MUST NOT add a Unit to
Experience, move the Component node, alter `unit.taskRefs[]`, or mark Experience
coverage as satisfied or unsatisfied.

### 2.3 Findings

If a Component node carries `unitRef` and an Experience document is loaded, the
reference MUST resolve to exactly one Unit. If no Unit has that `id`, the
resolver MUST emit a `COMP-REFERENTIAL-INTEGRITY` finding with:

- `kind: "unitRef"`;
- `severity: "error"`;
- the offending Component node id when the node has `id`;
- the stable node path when the node has no `id`; and
- the unresolved Unit id.

If a Component node carries `unitRef` and no Experience document is loaded, the
resolver MUST emit an `info` finding of kind `"unitRef"` for that node. The
absence of Experience prevents confirmation, but it is not itself a Component
schema error.

Processors MAY include the resolved Unit in their annotation map when resolution
succeeds. They MUST keep that annotation report-only and MUST NOT write it back
into Component or Experience.

### 2.4 Runtime Semantics

`unitRef` is reference metadata. It MUST NOT affect rendering, layout grouping,
page or section boundaries, wizard step order, visibility, validation,
calculation, Mapping execution, Response status, Response Actions invocation,
Experience coverage, or Respondent Ledger behavior.

Renderers MAY expose resolved Unit metadata in authoring or debugging tools.
They MUST NOT use `unitRef` as an input to the default runtime view unless a
separate host feature explicitly layers that behavior outside this
specification.

## 3. `taskRefs`

### 3.1 Shape

`taskRefs` is an OPTIONAL array of string fields on a Component node. Each entry
identifies an Experience Task that the node helps support, explain, display, or
complete.

Each entry MUST match the identifier profile used by Experience `Task.id`. The
current Experience schema accepts identifiers that start with an ASCII letter
and continue with ASCII letters, digits, or underscores. Authors SHOULD continue
to use the user-domain camelCase style recommended by the Experience
specification.

`taskRefs` is plural because a single Component node may support more than one
task. The array order is authoring and reporting order only. It is not workflow
order, rendering order, validation order, or task-execution order.

### 3.2 Resolution Target

When an Experience document is loaded, every `taskRefs[]` entry resolves against
`experience.tasks[*].id`. Resolution is exact string equality after JSON
parsing. Resolvers MUST NOT normalize case, trim whitespace, replace separators,
infer near matches, synthesize missing Tasks, or infer task coverage from
Component order.

Resolution reads the Experience document only. It MUST NOT add a Task to
Experience, mutate `unit.taskRefs[]`, assign the Component node to a Unit, change
task participation, or mark Experience coverage as satisfied or unsatisfied.

### 3.3 Findings

If a Component node carries `taskRefs` and an Experience document is loaded,
each entry MUST resolve to a Task. If one or more entries on the same Component
node do not resolve, the resolver MUST emit one `COMP-REFERENTIAL-INTEGRITY`
finding for that node with:

- `kind: "taskRefs"`;
- `severity: "warning"`;
- the offending Component node id when the node has `id`;
- the stable node path when the node has no `id`; and
- the unresolved Task ids from that node.

The finding is per node, not per unresolved entry. A single node with three
missing task ids produces one warning that lists all three ids.

If a Component node carries `taskRefs` and no Experience document is loaded, the
resolver MUST emit an `info` finding of kind `"taskRefs"` for that node. The
absence of Experience prevents confirmation, but it does not make the Component
document invalid.

Processors MAY include resolved Task ids in their annotation map when resolution
succeeds. They MUST keep that annotation report-only and MUST NOT write it back
into Component or Experience.

### 3.4 Runtime Semantics

`taskRefs` is advisory reference metadata. It MUST NOT affect rendering,
layout, page or section grouping, wizard navigation, visibility, validation,
calculation, Mapping execution, Response status, Response Actions invocation,
Experience coverage, task assignment, or Respondent Ledger behavior.

Renderers MAY expose resolved Task metadata in authoring, debugging, review, or
analytics tools. They MUST NOT use `taskRefs` to reorder or suppress runtime
content unless a separate host feature explicitly layers that behavior outside
this specification.

## 4. `conceptRefs`

### 4.1 Shape

`conceptRefs` is an OPTIONAL array of ConceptRef objects on a Component node.
Each entry identifies a Registry, Ontology, or external concept associated with
the node.

Each entry MUST use the Experience `ConceptRef` shape. Component does not define
a parallel concept-reference vocabulary. A ConceptRef has a required non-empty
`id`, an optional `source` of `"registry"`, `"ontology"`, or `"external"`, an
optional `description`, and optional `extensions` following the Experience
extension model.

`conceptRefs` is plural because a Component node may represent, display, or
collect information related to more than one concept. Array order is authoring
and reporting order only; it is not precedence, validation order, or Mapping
order.

### 4.2 Resolution Policy

Concept resolution is host-policy driven. A resolver MAY receive Registry,
Ontology, or other allowlisted concept context. When context is present, each
`conceptRefs[]` entry resolves according to its `source`:

- `"registry"` resolves against the loaded Registry concept id space.
- `"ontology"` resolves against the loaded Ontology concept id or IRI space.
- `"external"` resolves only if host policy declares an allowlisted external
  source for that id.

Resolvers MUST NOT blindly fetch `conceptRefs[].id` values that contain URLs or
IRIs. Hosts that support external resolution MUST apply an allowlist and resource
limits before consulting any networked or file-backed source.

When no Registry, Ontology, or external concept context is loaded, `conceptRefs`
remain informative metadata. The processor may preserve them in annotations or
reports, but it MUST NOT treat missing concept context as a Component validation
error.

### 4.3 Findings

If host policy attempts concept resolution and one or more ConceptRefs on a
Component node do not resolve, the resolver MUST emit one
`COMP-REFERENTIAL-INTEGRITY` finding for that node with:

- `kind: "conceptRefs"`;
- `severity: "info"` under the default host policy;
- the offending Component node id when the node has `id`;
- the stable node path when the node has no `id`; and
- the unresolved ConceptRef ids from that node.

The finding is per node, not per unresolved ConceptRef entry. A single node with
multiple unresolved concepts produces one `info` finding that lists the missing
concept ids.

Hosts MAY upgrade `conceptRefs` findings under an explicit strict concept policy.
For example, a host that requires every Component concept to resolve against a
loaded Registry MAY upgrade unresolved concepts to `warning` or `error`.
Strict-mode upgrades are host policy; this specification's default severity is
`info`.

### 4.4 Runtime Semantics

`conceptRefs` is reference metadata. It MUST NOT affect rendering, layout,
visibility, validation, calculation, Mapping execution, Response status,
Response Actions invocation, Registry or Ontology content, Experience coverage,
or Respondent Ledger behavior.

Component processors MUST NOT use `conceptRefs` as executable validation,
calculation, or transformation logic. Deep concept validation, ontology
reasoning, Registry governance, and concept-to-field inference belong to the
Registry, Ontology, or host policy layers, not to this Component reference-field
specification.

Renderers MAY expose resolved ConceptRef metadata in authoring, debugging,
review, search, or analytics tools. They MUST NOT use `conceptRefs` to alter the
default runtime view unless a separate host feature explicitly layers that
behavior outside this specification.

## 5. `x-generation`

### 5.1 Shape

`x-generation` is an OPTIONAL object field on a Component node. It records
generator provenance and source anchors for authored, generated, or
generated-then-edited Component trees.

The object has the following standard members. All members are OPTIONAL:

| Member | Type | Meaning |
|---|---|---|
| `source` | string | Generator source label, such as an Experience Unit, prompt, template, or generator input bundle. |
| `strategy` | string | Generator strategy identifier, such as `unit-to-section` or a host-defined strategy name. |
| `generatedBy` | string | Generator name and version, service id, or other producer identifier. |
| `generatedAt` | string | Generation timestamp. When present, authors SHOULD use an RFC 3339 date-time string. |
| `anchors` | array of string | Source anchors used to explain or review the generated node. |

Generators MAY include additional members for private provenance. Unknown
members are extension metadata. Processors MUST preserve them when they preserve
the Component node, but MUST NOT treat them as runtime behavior.

### 5.2 Anchor Prefixes

`x-generation.anchors[]` entries are strings with a required prefix. The prefix
identifies the source artifact family; the suffix is the source-layer identifier
in that family.

The standard prefixes are:

- `item:` -- a Definition item key or bind path.
- `unit:` -- an Experience `Unit.id`.
- `task:` -- an Experience `Task.id`.
- `action:` -- a Response Actions `actions[*].id`.
- `concept:` -- a Registry, Ontology, or external concept id.

Anchor suffix syntax is owned by the referenced source layer. A resolver MUST
NOT rewrite anchor suffixes to match a different source format, and MUST NOT
invent anchors for missing source artifacts.

### 5.3 Anchor Resolution and Findings

Anchor resolution is best-effort report metadata. A resolver MAY check anchors
against loaded Definition, Experience, Response Actions, Registry, or Ontology
context. If an anchor cannot be resolved, §7 assigns the default finding:
`COMP-REFERENTIAL-INTEGRITY`, kind `"x-generation.anchors"`, severity `"info"`.

Unresolved anchors MUST NOT invalidate the Component document, block rendering,
or trigger regeneration. They indicate that provenance metadata may be stale or
incomplete.

When source context is absent, processors MAY preserve anchors without resolving
them. Missing source context MUST NOT be treated as a runtime error.

### 5.4 Runtime Semantics

`x-generation` is provenance metadata. Renderers MUST ignore it for default
runtime output. The presence, absence, or content of `x-generation` MUST NOT
change rendering, layout, binding, localization, validation, calculation,
Mapping execution, Response status, Response Actions invocation, Experience
coverage, Registry or Ontology content, Trace content, or Respondent Ledger
behavior.

This specification defines shape and reporting posture only. It does not define
regeneration merge behavior, designer-edit preservation, conflict severity,
orphan handling, rename handling, Trace predicates, Trace cache invalidation, or
review UX. Those behaviors require a separate regeneration or Trace
specification.

Processors MUST NOT execute, fetch, or trust generator-provided metadata by
default. Hosts that use `source`, `strategy`, `generatedBy`, `generatedAt`,
`anchors`, or extension members for authoring tools MUST treat those values as
untrusted metadata.

## 6. Cross-Document Resolution Algorithm

Task 7 drafts this section.

## 7. Findings

Task 8 drafts this section.

## 8. Conformance

Task 9 drafts this section.

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

Task 3 drafts this section.

## 3. `taskRefs`

Task 4 drafts this section.

## 4. `conceptRefs`

Task 5 drafts this section.

## 5. `x-generation`

Task 6 drafts this section.

## 6. Cross-Document Resolution Algorithm

Task 7 drafts this section.

## 7. Findings

Task 8 drafts this section.

## 8. Conformance

Task 9 drafts this section.

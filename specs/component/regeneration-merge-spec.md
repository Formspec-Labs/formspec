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

The §1 introduction and scope language has landed. Later normative sections,
schema, fixtures, algorithm tests, invariant tests, registration, and generated
artifacts land in the follow-on tasks of
`thoughts/plans/2026-05-22-regeneration-merge.md`.

## Bottom Line Up Front

<!-- bluf:start file=regeneration-merge-spec.bluf.md -->
- Regeneration merge is a deterministic three-way merge from `old-generated`, `designer-edited`, and `new-generated` Component documents into a merged draft plus `MergeReport`.
- Merge identity is based on `x-generation.anchors` from the Component Reference Fields spec, with no runtime rendering effect.
- Designer-authored presentation changes are preserved when their source anchors still resolve; conflicts and orphaned nodes are reported instead of silently discarded.
- Rename handling is explicit: only `$formspecAnchorMappings.anchorMappings[]` substitution can preserve presentation across changed anchors.
- Conformance is fixture-driven: schema shape, merge algorithm behavior, and invariants are proven by the regeneration merge pytest suite.
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

## 3. Source Anchor Identity

## 4. Generated-Node Markers

## 5. Designer-Edit Detection

## 6. Merge Algorithm

## 7. Conflict Severities and Finding Codes

## 8. Orphan Handling

## 9. Rename and Anchor-Mapping Handling

## 10. Studio Review UX Expectations

## 11. Conformance

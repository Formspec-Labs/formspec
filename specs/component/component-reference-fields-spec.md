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
- [§1.5 Promotion Resolution](#15-promotion-resolution)
- [§2 `unitRef`](#2-unitref)
- [§3 `taskRefs`](#3-taskrefs)
- [§4 `conceptRefs`](#4-conceptrefs)
- [§5 `x-generation`](#5-x-generation)
- [§6 Cross-Document Resolution Algorithm](#6-cross-document-resolution-algorithm)
- [§7 Findings](#7-findings)
- [§8 Conformance](#8-conformance)

## 1. Introduction

Task 2 drafts this section.

## 1.5 Promotion Resolution

Task 2 drafts this section.

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

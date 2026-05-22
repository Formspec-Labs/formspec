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

This scaffold intentionally contains section headers only. Normative prose,
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

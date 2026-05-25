# ADR 0154 Component Spec vNext Prose Partial

**Date:** 2026-05-25
**Status:** Partial
**Gate:** ADR 0154 gate 1; ADR 0153 gate 8
**Owner:** Formspec app-graph rollout

## Scope

This slice adds prose-only Component spec coverage for ADR 0154 Surface/route
identity. It does not promote Component schema vNext, App Manifest
`components[]`, Surface schema linkage, AppGraphValidator enforcement,
Studio/kernel graph identity, provenance rewrites, generated types, or
conformance fixtures.

## Review Checkpoint

Leibniz approved Component spec-vNext prose as the next strict slice after the
ModuleResolver interface partial. The review boundary was:

- keep the slice prose-only;
- preserve `targetDefinition` for form-bound Components;
- define `targetSurfaceRoutes[]`, the one-of identity rule, route/slot/role
  target shape, graph-wide node identity, and fake `targetDefinition` shim
  rejection;
- cross-reference Surface as source truth for routes without making Surface own
  Component trees;
- leave schema, App Manifest, validator, runtime, provenance, fixtures, and
  authorization untouched.

## Completed

- `specs/component/component-spec.md` now records the vNext identity target:
  `targetDefinition` remains the form binding, `targetSurfaceRoutes[]` carries
  Surface route/slot/app-shell applicability, and vNext documents must declare
  at least one identity binding.
- The spec defines the conceptual `targetSurfaceRoutes[]` entry shape and
  states that Surface remains source truth for routes and slots.
- The spec reserves graph-wide node identity with Component, Surface, route,
  node path, and optional `id` / `nodeId` scope.
- The spec rejects fake non-form `targetDefinition` source identity while
  allowing output-only legacy shims to remain non-authoritative.
- The semantic capsule now records the ADR 0154 vNext identity boundary.

## Still Open For Closure

- Component schema vNext must validate `targetDefinition` or
  `targetSurfaceRoutes[]` without breaking form-only documents.
- App Manifest vNext must add `components[]` with unique `handle` and singular
  `component` import/migration behavior.
- Surface spec linkage must cross-reference Component route targeting without
  making Surface own Component trees.
- AppGraphValidator must enforce target resolution, duplicate route claims,
  fake Definition rejection, and node identity disambiguation.
- Studio/kernel operations must use graph-wide identity when multiple Surfaces
  or Component documents are loaded.
- `x-generation.copiedFrom` / `movedFrom` provenance must adopt graph-wide node
  identity for cross-route and cross-Component operations.
- Conformance fixtures must cover form-only, non-form route, mixed form route,
  duplicate route claim, unresolved route, unresolved slot, fake
  `targetDefinition` shim, and graph-wide copy provenance.

## Verification

- `npm run docs:generate`
- `make -s html-docs`
- `npm run docs:filemap:check`
- `npm run docs:check`
- `git -C formspec diff --check`
- `git diff --check`

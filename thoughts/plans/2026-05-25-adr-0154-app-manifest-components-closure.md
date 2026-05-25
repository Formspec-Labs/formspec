# ADR 0154 App Manifest Component List Closure

**Date:** 2026-05-25
**Status:** Closed
**Gate:** ADR 0154 gate 3; ADR 0153 gate 8 partial
**Owner:** Formspec app-graph rollout

## Scope

This slice promotes App Manifest Component membership into
`specs/bundle/app-manifest-spec.md` and `schemas/bundle-manifest.schema.json`.
It closes only the App Manifest component-list gate.

It does not promote Surface linkage, AppGraphValidator route resolution,
duplicate route-claim enforcement, Studio/kernel graph identity, graph-wide
provenance, runtime/projection wiring, or ADR 0152 authorization semantics.

## Review Checkpoint

Leibniz approved App Manifest `components[]` as the next strict ADR 0153 §7
slice after Component 1.2 schema closure. The review boundary was:

- treat `components[]` as a real App Manifest minor bump, not a vague future
  revision;
- preserve v2.0/v2.1 manifests;
- keep `dataSources[]` valid in v2.1 and v2.2;
- allow `components[]` only in v2.2;
- add per-entry Component handles without using filenames, URLs, or route names
  as Component selection conventions;
- leave Surface linkage, AppGraphValidator enforcement, resolver extraction,
  Studio/kernel identity, provenance, production wiring, and authorization out
  of this slice.

## Completed

- App Manifest schema `$id` is now
  `https://formspec.org/schemas/bundleManifest/2.2`.
- `$formspecBundle` now admits `"2.0"`, `"2.1"`, and `"2.2"`.
- `dataSources[]` is valid for v2.1 and v2.2.
- `components[]` is valid only for v2.2.
- `components[]` entries use `ComponentRef`: URL/version sibling identity plus
  a required `handle`.
- The singular `component` compatibility member remains valid and normalizes to
  handle `default` in revised import paths.
- The spec rejects using filenames, URLs, route names, or Surface structure as
  implicit Component membership.
- Positive and negative App Manifest fixtures cover v2.2 components,
  v2.2-with-dataSources compatibility, v2.1 rejection, duplicate handles, and
  singular/default handle conflicts.

## Still Open

- Surface spec linkage without making Surface own Component trees.
- AppGraphValidator target resolution, duplicate route-claim diagnostics, fake
  Definition rejection, and node identity disambiguation.
- Studio/kernel graph identity for multi-Surface and multi-Component editing.
- Graph-wide provenance for cross-route and cross-Component copy/move.
- Conformance corpus closure for ADR 0154 gate 8.

## Deviations

- ADR 0154's original example used `$formspecBundle: "2.1"` before Data
  Sources consumed v2.1. This slice makes the Component membership revision App
  Manifest v2.2 and updates the ADR gate text accordingly.
- Specs define the contract directly. ADR references remain in this plan and
  the parent rollup as rollout/deviation evidence, not as normative spec
  dependencies.

## Closure Evidence

- Spec: `specs/bundle/app-manifest-spec.md` defines App Manifest v2.2,
  `components[]`, `ComponentRef`, singular `component` normalization, version
  gates, and absence semantics.
- Schema: `schemas/bundle-manifest.schema.json` validates v2.0/v2.1/v2.2,
  admits `dataSources[]` in v2.1/v2.2, admits `components[]` only in v2.2, and
  requires `components[].handle`.
- Fixtures: `tests/conformance/fixtures/bundle/app-with-components-v2-2.json`,
  `invalid-components-in-2-1.json`,
  `invalid-duplicate-component-handle.json`, and
  `invalid-component-default-handle-conflict.json`.
- Tests: App Manifest schema and semantic conformance tests cover version
  gating, ComponentRef shape, Component handle uniqueness, sibling URL
  identity, and singular/default handle conflict authoring intent.

## Verification

- `python -m pytest tests/conformance/schemas/test_bundle_manifest_schema.py tests/conformance/spec/test_bundle_manifest_semantics.py`
- `npm run docs:generate`
- `npm run docs:check`
- `git diff --check`

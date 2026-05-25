# ADR 0153 UI Graph Policy Interface Partial

**Date:** 2026-05-25
**Status:** Partial
**Gate:** ADR 0153 gates 9a-9d
**Owner:** Formspec app-graph rollout

## Scope

This slice adds a prose-only UI Graph Policy interface contract. It defines the
app-graph policy boundary for module Locale key ownership, route accessibility,
responsive collapse order, hidden Definition refs, and Theme token assignments
to module widget token slots.

It does not promote a JSON Schema, App Manifest slot, generated types,
conformance fixtures, `AppGraphValidator` implementation, runtime responsive
behavior, renderer behavior, Studio wiring, or ADR 0152 authorization semantics.

## Review Checkpoint

Leibniz approved UI graph policy as the next strict slice after the ADR 0154
Component 1.2 prose partial. The review boundary was:

- place the prose contract at `specs/app-graph/ui-graph-policy-spec.md`;
- define this as app-graph UI policy, not the existing shared UI authoring
  policy;
- keep `specs/ui-policy.json` authoritative for component/widget compatibility,
  fallback policy, responsive prop allowlists, breakpoint namespace, and token
  warning hooks;
- define target Surface, route-scoped accessibility policy, responsive collapse
  order, module Locale key ownership, optional hidden Definition refs, and Theme
  token assignments to module widget token slots;
- define diagnostics as future AppGraphValidator cross-artifact/policy
  diagnostics;
- mark gates 9a-9d Partial, not Closed;
- forbid schema, App Manifest slot, code, generated types, fixtures,
  conformance rows, spike sidecar promotion, runtime responsive behavior,
  per-widget implementation policy, authorization semantics, and Surface
  ownership inversion.

## Completed

- `specs/app-graph/ui-graph-policy-spec.md` defines the UI Graph Policy request
  boundary over already resolved Surface, Locale, Theme, Registry,
  ModuleResolver, and Definition evidence.
- The spec distinguishes UI Graph Policy from `specs/ui-policy.json` and ADR
  0064.
- The spec defines conceptual policy fields for `targetSurface`,
  `localeKeyOwners[]`, `routePolicies[]`, and `theme.assignments[]`.
- The spec names initial imported diagnostic codes with
  `origin: "ui-graph-policy"` and `phase: "cross-artifact"`.
- ADR 0153 and the stack rollup record gates 9a-9d as Partial.

## Still Open For Closure

- A schema or accepted structural contract for the policy source.
- App Manifest or host loading rules for the policy source.
- Generated types and package exports.
- Positive and negative conformance fixtures.
- AppGraphValidator integration.
- ModuleResolver/Registry token-slot evidence integration.
- Studio and authoring feedback.
- Runtime hidden Definition state enforcement where applicable.

## Verification

- `npm run docs:filemap`
- `npm run docs:filemap:check`
- `npm run docs:check`
- `git -C formspec diff --check`
- `git diff --check`

# Contract Surface Coverage

This directory prevents spec behavior from landing in only one layer.

Formspec has several valid proof surfaces:

- conformance fixtures describe portable behavior
- crates implement schema, lint, and Rust/Python binding behavior
- packages expose engine and renderer behavior to TypeScript consumers

A contract is not production-ready until the relevant surfaces are named and
tested. The ledger in `surface-coverage.json` is the small index that ties those
surfaces together. Rows are keyed by contract name, but inventory completeness
is checked against each `spec` + `schema` pairing in
`scripts/spec-artifacts.config.json` so reused spec files still get separate
contract rows.

## When To Add A Contract

Add or update a row when work promotes behavior that should be portable across
implementations or visible through package APIs. Typical triggers:

- a spec adds a normative behavior requirement
- a conformance fixture starts expecting a warning, error, or runtime outcome
- a package exposes behavior already present in another package
- a lint rule moves to `tested` or `stable`
- a crate implements behavior that a renderer or engine package must mirror

Do not add speculative rows for ideas that are still research or planning.

## Status Values

Use `enforced` when the contract has concrete proof points in the listed
surfaces. Every listed path must exist, and package parity tests should use
discoverable names such as `issuer-parity.test.tsx`.

Use `deferred` when a configured spec/schema pair is real but the repo lacks a
complete proof bundle across the relevant surfaces. Deferred rows must include
both:

- `reason`: why the surface is not expected yet
- `tracking`: the TODO, issue, or plan that owns the gap

Do not omit a package silently. Either list its proof path or defer the contract
with a reason. For deferred rows, empty `crates` arrays or empty `packages`
objects are allowed only when the reason names the missing surface.

## Relationship To Existing Patterns

This ledger does not replace existing systems:

- `specs/lint-codes.json` remains the source of truth for lint rule metadata.
- `tests/unit/test_lint_rule_registry.py` still enforces lint fixtures and
  metadata parity.
- `tests/conformance/suite/` remains the shared runtime conformance suite.
- `scripts/spec-artifacts.config.json` remains the spec inventory and should
  reference contract surfaces when a spec graduates to enforced behavior.

The ledger only answers one question those systems did not answer by
themselves: which concrete crate/package/conformance files prove this contract
is implemented across the relevant surfaces?

## Process

1. Add or update the spec and schema first when the behavior is normative.
2. Add conformance fixtures for the portable behavior.
3. Implement the crate/package behavior.
4. Add package parity tests for every package surface that exposes the behavior.
5. Add or update `surface-coverage.json`.
6. Run `npm run test:contract-surfaces`.

If a conformance fixture encodes expected behavior, make sure it also checks the
implementation surface. For lint behavior, that usually means asserting the Rust
`lint()` path emits the registered code.

## Focused Check

Run:

```sh
npm run test:contract-surfaces
```

The script uses the repo `.venv` Python when available and runs the contract
surface meta-test, lint registry checks, and issuer conformance checks.

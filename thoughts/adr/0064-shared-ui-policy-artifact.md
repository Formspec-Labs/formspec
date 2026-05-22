# ADR 0064: Shared UI Policy Artifact

**Status:** Proposed
**Date:** 2026-05-21

## Context

The UI schema cleanup exposed repeated policy drift across JSON Schema,
TypeScript runtime helpers, Rust lint, generated types, stories, fixtures, and
authoring documentation.

Some UI rules are structural and belong in JSON Schema. Many are not. Examples
include component-to-`dataType` compatibility, fallback carry/drop/translate
rules, responsive prop allowlists, breakpoint namespace alignment, page
precedence, token warnings, extension discovery hints, and retired component
names.

Keeping those rules in prose or duplicated tables creates drift. The cleanup
introduced `specs/ui-policy.json` as a shared machine-readable policy artifact.

## Decision

### D-1. UI policy has one machine-readable source

`specs/ui-policy.json` is the source of truth for cross-tier UI policy that
cannot be expressed cleanly as local JSON Schema shape.

The artifact owns:

- canonical built-in component and widget names;
- retired component names;
- input component compatibility;
- compatibility by Definition `dataType`;
- progressive fallback policy;
- responsive forbidden and allowed props;
- breakpoint namespace policy;
- page precedence mirror data;
- attention-source ordering;
- extension-discovery hooks;
- token namespace warning hooks.

### D-2. JSON Schema enforces shape, not every policy table

JSON Schema should keep enforcing local structure: required fields, closed
objects, enums that are genuinely local, extension slots, and universally
forbidden structural keys.

Schema should not grow large per-component branches when lint or generated
policy can express the rule more clearly. Component-specific responsive props
are the model case: schema rejects the structural keys, and lint reports W806
for component-specific unsupported props from the policy artifact.

### D-3. Generated bindings are required consumers

TypeScript consumers MUST use generated bindings from `specs/ui-policy.json`.
The generated module lives at `packages/formspec-types/src/ui-policy.ts` and is
checked by `npm run --workspace @formspec-org/types policy:check`.

Rust lint MAY load the JSON artifact directly with `include_str!` when that is
simpler than code generation. It must still treat `specs/ui-policy.json` as the
source, not copy the table into Rust code.

### D-4. Runtime consumers may lag, but drift must be visible

Not every policy section has a runtime consumer on day one. For example,
fallback carry/drop/translate policy is structured before the runtime fallback
projection exists.

Lag is allowed only when documented in this ADR, a related ADR, or consumer
documentation. The policy JSON does not need per-section status metadata unless
tooling starts depending on it.

Current section status:

- `components`, `retiredComponentNames`, `inputComponents`, and
  `compatibilityByDataType`: active TypeScript and lint policy.
- `responsive` and `breakpoints`: active TypeScript and lint policy.
- `fallbackPolicy`: future runtime policy governed by [ADR 0062](0062-fallback-transformation-is-a-render-time-projection.md).
- `pagePrecedence`: mirror data governed by [ADR 0063](0063-page-authority-split.md); runtime implements the order directly.
- `attention`, `extensionDiscovery`, and `tokens`: lint/tooling policy hooks.

### D-5. Policy updates require regeneration and tests

Any change to `specs/ui-policy.json` MUST run the policy generator or policy
check. Changes that alter behavior need targeted tests in the relevant consumer:

- TypeScript vocabulary and breakpoint tests for generated helpers;
- Rust pass tests for lint behavior;
- schema conformance tests for schema references and retired names;
- story or fixture tests when authoring examples change.

### D-6. Canonical vocabulary is policy

Built-in widget and component names are PascalCase. Authoring helpers may accept
aliases outside the spec and emit canonical names, but the canonical document
surface does not require alias translation tables.

Retired names such as `Page`, `Columns`, and `Spacer` stay reserved so authors
cannot reintroduce them as custom components.

## Consequences

### Positive

- Rust lint, TypeScript runtime helpers, generated types, and authoring tools can
  share the same UI policy.
- Schema stays smaller and easier to reason about.
- Prose policy drift becomes easier to catch with generated checks.
- Future tools can inspect one policy artifact instead of scraping docs.

### Negative

- The policy artifact becomes part of the normative maintenance burden.
- Generated bindings must stay in sync.
- Some policy entries may be mirror data until the runtime adopts them.

## Rollout

1. Keep `specs/ui-policy.json` under review with the specs.
2. Generate TypeScript bindings through `packages/formspec-types`.
3. Keep Rust lint loading the policy artifact for compatibility and responsive
   prop checks.
4. Extend consumers section by section: fallback projection, authoring tools,
   renderer capability checks, and documentation.
5. Keep tests that prove policy and consumers agree.

## Related ADRs

- [ADR 0056](0056-closed-schemas-extension-registry-as-sole-open-seam.md): Closed-by-Default JSON Schemas with the Extension Registry as the Sole Named Open Seam.
- [ADR 0061](0061-responsive-overrides-are-presentation-patches.md): Responsive Overrides Are Presentation Patches.
- [ADR 0062](0062-fallback-transformation-is-a-render-time-projection.md): Fallback Transformation Is a Render-Time Projection.
- [ADR 0063](0063-page-authority-split.md): Page Authority Split.

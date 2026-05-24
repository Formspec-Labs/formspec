# Wireframe / Dynamic-UI Generator Spike v4

**Status:** in progress - production-findings prototype, not production infrastructure
**Lives at:** `formspec/spikes/wireframe-generator-v4/`
**Based on:** [`2026-05-23-wireframe-generator-spike-v3-production-findings.md`](./2026-05-23-wireframe-generator-spike-v3-production-findings.md), [`2026-05-23-wireframe-generator-spike-v3.md`](./2026-05-23-wireframe-generator-spike-v3.md), [`2026-05-23-wireframe-generator-spike-v2-gaps.md`](./2026-05-23-wireframe-generator-spike-v2-gaps.md), [`../../../thoughts/adr/0150-formspec-as-layered-ui-substrate.md`](../../../thoughts/adr/0150-formspec-as-layered-ui-substrate.md)

## Verdict

Pending. v4 must classify each F1-F10 production finding as `Promote-to-Spec`, `Defer-to-Production`, or `Reject-with-Reason`.

## Scope Boundary

v4 prototypes the v3 production findings through the first four steps of the suggested implementation order:

1. prose contracts
2. spike-local schemas
3. fixtures
4. shared resolver/validator libraries

v4 stops before production lint wiring, conformance promotion, or production projection/runtime code. It must not promote:

- `x-spike-v3-*` App Manifest extensions
- local fixture refs as production identity
- Response Actions lookup by product URL convention
- first-party module names embedded in product fixtures as registry truth
- non-form Component `targetDefinition` compatibility shims
- per-file schema validation as a substitute for app validation
- widget payloads as an implicit data-source model
- Surface or Component code that infers action behavior outside Response Actions

## F1-F10 Tracker

| ID | Finding | v4 status | Verdict |
|---|---|---|---|
| F1 | App Manifest needs first-class sidecar indexes | Planned | Pending |
| F2 | App Graph Validator should be a production primitive | Planned | Pending |
| F3 | Surface should become a normal contract surface | Planned | Pending |
| F4 | Module admission needs one shared resolver | Planned | Pending |
| F5 | Non-form Component identity must stop pretending to be a Definition | Planned | Pending |
| F6 | Runtime state needs explicit ownership | Planned | Pending |
| F7 | Data Sources need a spec, not widget payload folklore | Planned | Pending |
| F8 | Response Actions should remain the only action executor | Planned | Pending |
| F9 | Locale, Theme, a11y, and responsive policy are part of the graph | Planned | Pending |
| F10 | Authorization remains ADR 0152 work | Planned | Pending |

## P0/P1/P2 Tracker

| Tier | Recommendation | v4 status |
|---|---|---|
| P0 | Promote App Manifest to a real app envelope with first-class sidecar indexes | Planned |
| P0 | Promote Surface to official schema/spec/conformance | Planned as spike-local proof only |
| P0 | Build `AppGraphValidator` as a production validation layer | Planned as shared spike library |
| P0 | Build a shared module admission and contribution resolver | Planned as shared spike library |
| P0 | Remove the non-form Component `targetDefinition` shim | Planned as prototype identity only |
| P1 | Define route/session/Response/action state ownership | Planned |
| P1 | Specify multi-form-route behavior | Planned |
| P1 | Define Data Sources as a contract surface | Planned as spike-local contract |
| P1 | Keep Response Actions as the only action executor | Planned |
| P1 | Add fixtures for EC2, EC5, EC12, EC13, EC14 | Planned |
| P2 | Define module-aware Locale ownership and collision behavior | Planned as negative fixture |
| P2 | Define responsive and a11y route policy | Planned as spike-local contract |
| P2 | Define Theme token-slot contracts for module widgets | Planned as negative fixture |
| P2 | Carry ADR 0152 authorization into the graph only after ratification | Planned as boundary check |

## Acceptance Test Tracker

| # | Preserved v3 acceptance test | v4 status |
|---|---|---|
| A1 | stale sidecar ref | Planned |
| A2 | unadmitted contribution owner | Planned |
| A3 | unresolved navigation target | Planned |
| A4 | unresolved Surface route ref | Planned |
| A5 | missing route params | Planned |
| A6 | required-field runtime blocking | Planned |
| A7 | duplicate durable-effect idempotency key | Planned |
| A8 | unknown runtime command | Planned |
| A9 | route/Definition ownership mismatch | Planned |
| A10 | undeclared Screener terminal hop | Planned |
| A11 | duplicate Response Actions action id | Planned |
| A12 | generated Component id collision | Planned |
| A13 | module-widget payload mismatch | Planned |
| A14 | module version conflict across sibling artifacts | Planned |

## Previously Unproven v3 Edge Cases

| EC | Edge case | v4 status |
|---|---|---|
| EC2 | One Experience unit reused across routes but points at different Definitions | Planned |
| EC5 | Non-form app has zero Definitions | Planned |
| EC12 | Definition slot hidden by route policy while Response is mid-draft | Planned |
| EC13 | Locale strings collide across modules or route instances | Planned |
| EC14 | Theme styles widget without declared token slots | Planned |

## Deviations

None yet.

## Findings

None yet.

## What This Means For ADR 0150 / 0151 / 0152

Pending.

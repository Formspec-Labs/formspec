---
name: Surface v13 prod-MVP dogfood
date: 2026-07-31
status: in_progress
input:
  - formspec-server/PROD-MVP.md
  - formspec-server/JOURNEYS.md
decision: can the public Wireframes MCP express one honest ManagedSingleCell product demo from adopted Needs and structured data alone
---

# Surface v13 prod-MVP dogfood

## Decision to make

Build one structured `ManagedSingleCell` demo that lets a form owner manage,
publish, and version forms; review and export responses; inspect proof; and run
an optional signature flow. Public routes must support response, review,
signature, receipt, and verification work. An operations route must report the
active cell's readiness without turning test adapters into a production claim.

The replay passes only if the public Wireframes MCP creates every structured
product artifact. No route, field, action, copy, layout decision, or product
behavior may be rescued with product-specific code. The fixed host may contain
only reusable bundle loading, generic rendering, generic HTTP execution, and
the generic `StructuredPanel`, `QueueTable`, `ReceiptPanel`, and
`CeremonyFrame` starter widgets.

## Authority and scope

The product requirements come from
[`PROD-MVP.md`](../../../formspec-server/PROD-MVP.md) and
[`JOURNEYS.md`](../../../formspec-server/JOURNEYS.md). The call plan adopts the
following journey outcomes as Needs:

| Need | Source |
| --- | --- |
| Create and manage a form | `FRM-001` |
| Publish and share one immutable version | `FRM-002` |
| Protect in-progress work across versions | `FRM-003` |
| Review and export responses | `FRM-008` |
| Deliver a receipt-linked confirmation | `FRM-014` |
| Give the respondent a useful post-submit path | `FRM-017` |
| Produce stable form and response PDFs | `FRM-018` |
| Complete the public form accessibly | `RSP-001` |
| Correct and review a response before submit | `RSP-002` |
| Keep proof of submission without overstating proof state | `RSP-005` |
| Embed the same published form runtime outside the owner application | `INT-001` |
| Configure, route, track, and prove optional signatures | `SIG-001` through `SIG-004` |
| Verify that a response has not changed | `AUD-001` |
| See whether the active cell can accept work | `OPS-001` |

Billing, integration setup, support, trust-center content, onboarding, custom
domains, and single sign-on are outside this demo. The public hosted runtime is
in scope; an integrations or embed-management screen is not.

## Product map

The first route is `/app/forms`. Every other route has a declared transition
from a reachable route and a rendered action that can trigger that transition.

| Route | Purpose | Primary structured output |
| --- | --- | --- |
| `/app/forms` | Create and find managed forms | `QueueTable`, owner Definition, `StructuredPanel` |
| `/app/forms/{formId}` | Edit, publish, share, and inspect one form | owner Definition, `StructuredPanel` |
| `/app/forms/{formId}/versions` | Inspect immutable versions and retire one intentionally | `StructuredPanel` |
| `/app/responses` | Find and export responses | `QueueTable`, `StructuredPanel` |
| `/app/responses/{responseId}` | Inspect answers, proof state, receipt work, and PDF work | `StructuredPanel` |
| `/app/signatures` | Create an optional envelope, track it, and send a reminder | `StructuredPanel` |
| `/ops/readiness` | Read component status and adapter detail | `StructuredPanel` |
| `/forms/{formId}` | Complete the public form | respondent Definition, `StructuredPanel` |
| `/forms/{formId}/review` | Review entered answers and choose submit or signature | `StructuredPanel` |
| `/forms/{formId}/sign` | Read the exact attestation before a host signing act | `CeremonyFrame`, `StructuredPanel` |
| `/receipts/{responseId}` | Keep the accepted submission and current proof state | `ReceiptPanel`, `StructuredPanel` |
| `/verify/{responseId}` | Inspect verifier-backed proof and certificate availability | `StructuredPanel` |

## Authoring sequence

Attempts 1 through 6 remain preserved as evidence of rejected designs. The
current replay target is complete attempt 7; if it fails, preserve it and write
a complete attempt 8 rather than editing generated output:

1. Start the app and pair one human-asserted, human-adopted Needs document.
2. Materialize separate owner-create, owner-settings, and public-response
   Definitions through public Definition tools.
3. Declare scoped Response Action documents. Service work uses typed
   `serviceRequest` effects; navigation-only work uses `hostEvent`.
4. Declare one generic starter-widget module and its four generic widget
   entries. Product names, routes, and copy remain outside the Registry.
5. Materialize typed Data Sources. No source contains fixture values.
6. Add actors, tasks, Experience units, and Need citations.
7. Add routes, traced navigation, slots, bindings, and transitions.
8. End with `read_summary`, `read_reasoning_review`, `preview`, `validate`, and
   `export`, in that order.

Never patch an exported bundle or a replay results transcript. The final demo
bundle must be byte-for-byte the bundle returned by the successful MCP export.

## Runtime data and action boundary

The MCP-authored Data Source catalog declares each read request, response
schema, availability, ownership, failure mode, provenance, and direct Need
trace. MCP-authored Response Action documents declare each write request,
runtime value selector, idempotency rule, private session output, and safe
transition output. The generic host resolves both descriptions against the
configured server. It must never place server results, access tokens, signer
tokens, or fixture values in widget configuration or the exported bundle.

The current local product cell serves the sources and mutations needed for form
creation, publication, draft save, direct submission, signature submission,
signature completion, receipt materialization, proof verification and
remediation, receipt email, and readiness. Smoke evidence includes a published
`v13-community-intake` form, an accepted response, a completed signer, a ready
signature certificate, and a verified receipt with HTML and PDF material. The
Trellis adapter now maps oversized internal replay keys to deterministic
55-character wire keys while preserving the complete causal identity upstream.

Use the live `ManagedSingleCell` scope
`tenant_managed_single_cell / workspace_managed_single_cell /
environment_production / cell_primary`. Keep those values and the server origin
in host configuration, never in the bundle.

## Acceptance plan

### Structured-authoring gate

- Every call name starts with `formspec_wireframes_`.
- The paired Needs document contains only `origin: human-asserted` and
  `status: adopted` Needs, each with a human `adoptedBy` actor and direct
  grounding in the two source documents.
- App and Surface chrome, every route, route title, navigation entry, slot,
  Definition declaration and field, choice, Action, transition, Data Source,
  data binding, action binding, and widget-rendered config node carries a
  current `need:<id>@1` anchor.
- Every Experience unit cites each Need used by its mounted rendered nodes.
- The Registry remains generic. Its entries contain no Formspec Server route,
  field, product action, fixture id, or product copy.
- No open capability gap, unresolved reference, unmounted Action, unmounted
  Experience unit, unserved adopted Need, orphan rendered node, or rendered
  node without an Experience path remains.

### Product-outcome gate

- The owner can reach form, version, response, signature, and readiness work
  from `/app/forms` through declared and rendered actions.
- Publishing exposes an immutable version and share URL; version copy never
  implies that an in-progress response changed versions.
- Response pages expose CSV, JSON, PDF, receipt-email, and proof-remediation
  actions without putting response data in widget config.
- Signature work is optional. The public review route offers direct submit and
  signature review as separate actions.
- Receipt and verification pages distinguish `accepted`, `proof_pending`,
  `proof_ready`, and `proof_failed`. Only verifier/receipt data may support a
  “verified” display.
- The readiness page renders `/ready` component `status` and `detail`. It must
  show test/no-op adapter detail as returned and must not claim deployment,
  backup, restore, or production qualification.

### Replay and evidence gate

- `read_summary` reports all 12 routes, all three Definitions, all declared Actions,
  all 12 mounted Experience units, the Registry, and the Data Sources catalog.
- `read_reasoning_review` reports `complete: true`, all adopted Needs served,
  and empty gap lists.
- `preview` reports a publishable structured draft without a hand-authored
  scenario.
- `validate` passes every required phase with zero errors. Warnings and
  informational findings must be reviewed; none may contradict the demo claim.
- `export` succeeds immediately after the successful validation snapshot.
- Replay evidence records the plan digest, real MCP tool-list digest, acting
  actor, session, every result, exported bundle bytes, and output digests.
- Browser acceptance uses only MCP-authored Data Sources and Response Action
  documents plus the generic host resolver. It exercises the complete live
  create, publish, direct-submit, signature, receipt, proof, email, and
  readiness paths; checks every route at desktop and mobile widths; and checks
  keyboard reach, horizontal overflow, honest empty/error states, and browser
  errors.

## Claim boundary

A passing replay proves that the public Wireframes MCP can author and export a
structured prod-MVP product representation. A passing live browser check adds
evidence that the fixed generic host can read from and write to the local
production-shaped `ManagedSingleCell`. Neither result proves a deployed
production service, identity or authorization policy, signature legality,
backup/restore qualification, external email delivery, or offline verification
outside the exercised local cell.

---
title: Formspec Outcome Verification
version: 0.1.0-draft.1
date: 2026-07-31
depends_on:
  - specs/app-graph/app-graph-validator-spec.md
  - specs/core/spec.md
  - specs/data-sources/data-sources-spec.md
  - specs/experience/experience-spec.md
  - specs/needs/needs-spec.md
  - specs/response-actions/response-actions-spec.md
  - specs/surface/surface-spec.md
---

# Formspec Outcome Verification Specification v0.1

**Version:** 0.1.0-draft.1
**Date:** 2026-07-31
**Editors:** Formspec Working Group
**Schemas:**
`schemas/outcome-verification-case.schema.json`
(`https://formspec.org/schemas/outcomeVerificationCase/0.1`) and
`schemas/outcome-verification-report.schema.json`
(`https://formspec.org/schemas/outcomeVerificationReport/0.1`)

## Status

This document defines the OBSERVABILITY boundary for authored outcome tests and
generated comparison reports. It is additive. It does not change App Manifest,
TraceIndex, Core processing, rendering, Response Actions execution, or end-user
authoring interfaces.

The key words MUST, MUST NOT, SHOULD, SHOULD NOT, MAY, and OPTIONAL are normative
as described by BCP 14.

## 1. Decision and scope

Outcome Verification adds two documents:

- An `OutcomeVerificationCase` pins one adopted Need revision and one app
  version. It declares a data-only procedure and expected observations.
- An `OutcomeVerificationReport` records the exact case, sources, run,
  observations, and deterministic comparison result.

A `passed` report means only:

> Every observation declared by this case passed against the pinned sources and
> evidence at the recorded boundary.

A report MUST carry:

```json
{
  "claim": "declared-observations",
  "needSatisfaction": "not-asserted"
}
```

A processor MUST NOT produce `satisfied`, a satisfaction score, or any other
Need-satisfaction conclusion from Outcome Verification.

## 2. Authority boundaries

Each source keeps its existing authority:

| Fact                                                  | Owner                   | Outcome Verification use |
| ----------------------------------------------------- | ----------------------- | ------------------------ |
| Human population, outcome, reason, and done condition | Needs                   | Pin and cite             |
| Actor, task, Unit, and abstract completion shape      | Experience              | Pin and cite             |
| Data shape, requiredness, constraints, and values     | Definition and Response | Observe                  |
| Action validation gate, effects, and terminal state   | Response Actions        | Observe                  |
| Routes, mounted output, and renderer semantics        | Surface and rendering   | Exercise and observe     |
| Source declaration and qualified load result          | Data Sources            | Observe                  |
| Static graph resolution and direct Need trace         | AppGraphValidator       | Observe                  |
| Procedure, expectations, and comparison conclusion    | Outcome Verification    | Own                      |

An Outcome Verification document MUST NOT redefine an owner vocabulary or
grant runtime authority. Its schemas reference `ResponseStatus`,
`ActionTerminalStatus`, `EffectOutcomeStatus`, `ActionEffectType`,
`DataSourceLoadState`, and `DataSourceFreshness` from their owner schemas.

Experience owns `NeedRef.completion.shape` and its abstract meaning. Needs owns
Need identity, revision, grounding, `statement.done`, caller pairing,
resolution, and the prohibition against computed satisfaction.
AppGraphValidator owns static mounted-output matching. Outcome Verification owns
declared procedures and point-in-time comparison.

## 3. Outcome Verification Case

### 3.1 Identity and pairing

An Outcome Verification Case uses
`"$formspecOutcomeVerificationCase": "0.1"` and MUST contain:

- a stable `id` and case `version`;
- a Needs document reference and digest, Need id, and revision;
- an Experience document reference and digest plus starting Unit;
- an App Manifest id, version, and digest;
- one or more procedure steps; and
- one or more expected observations.

The Experience document and starting Unit MUST resolve exactly, and the Unit
MUST cite the case's pinned Need. Every expectation MUST cite at least one exact
`artifact-declaration` whose subject is an `experience-unit` in the same pinned
Experience. A procedure MAY cross several Units, but every cited Unit MUST cite
the pinned Need. The exact Surface route that produces an expectation MUST
mount its cited Unit through owner-produced `experience-unit` slot resolution.
A rule reference does not create that mounted relationship.

Every document-local identity MUST include its owning artifact reference and
digest. A processor MUST NOT resolve a route, action, source, item, Unit, or node
globally or by file name, directory position, or load order.

Callers pair cases with exact source documents. Missing, ambiguous, or
digest-conflicting pairing is invalid. App Manifest and TraceIndex gain no
Outcome Verification member in version 0.1.

### 3.2 Procedure

Version 0.1 defines four step kinds:

| Kind               | Required behavior                                                                                                                       |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| `open-route`       | Open the exact digest-pinned Surface route.                                                                                             |
| `set-item`         | Resolve the declared rendered control, prove its Definition item binding, and set it through the renderer's semantic-control interface. |
| `activate-control` | Activate the declared rendered control and bind the Response Action invocation it emits.                                                |
| `checkpoint`       | Record a bounded observation interval and the prior bindings it includes.                                                               |

Step objects are closed. Cases MUST NOT contain scripts, expressions, DOM
selectors, arbitrary sleeps, direct Response mutation, direct Action-executor
calls, or product-specific callbacks.

`set-item.renderStepRef` MUST name a prior `open-route` binding. Its
`control.subjectKind` MUST equal `definition-item`.
`activate-control.renderStepRef` MUST name a prior route binding, and
`responseStepRef` MUST name a prior binding with exactly one Response id and
revision. Its `control.subjectKind` MUST equal `response-action`. The emitted
invocation MUST identify the declared Action and the same Response.

An executing adapter MUST mount the actual generic renderer. It MAY use only
semantic controls registered by components in that committed render. It MUST
NOT register controls on the renderer's behalf, mutate a Response directly, or
invoke the Form Engine or Action executor as a shortcut around those controls.

The runner derives an Action invocation identity from:

```text
(targetIdentityDigest, caseDigest, runId, step.id, actionsDigest, actionId)
```

The identity is stable within one new run. A crash makes that run
`indeterminate`; version 0.1 does not resume it. A rerun MUST use a fresh
`runId` and new invocation identities.

### 3.3 Execution admission

A case describes a test; it does not authorize execution.

Every executing runner MUST receive a separate caller-owned
`RunnerAdmissionContext`. Version 0.1 admits only isolated `preview` or `test`
targets. The context binds the case digest, a target request containing only
`class` and `ref`, an environment-unique `runId`, caller or capability
reference, and admitted step kinds. A caller MUST NOT attest build or
implementation identity.

Before preflight, the runner calls an environment-owned target resolver. The
resolver returns one `ResolvedTargetIdentity` containing the same class and
reference, an environment-resolved `buildRef`, immutable `buildDigest`, and
the exact host, renderer, runner, runtime, adapter, and verifier identities,
versions, and digests. A source revision MAY add provenance but does not
replace the environment's build identity. The canonical
`targetIdentityDigest` covers that complete record, including its canonical
`implementationSetDigest`. This resolved record is the single source for
report and comparator target facts. An opaque environment name and
caller-supplied substitutes are invalid.

The caller supplies only the admission request and case evidence. Schema
validation, target resolution, owner facts, owner Action planning, run custody,
renderer, runtime, adapter, and verifier ports are separately
environment-configured runner dependencies. The runner MUST NOT accept caller
objects in those trusted dependency positions.

`RunnerAdmissionContext` is policy input, not Action-plan evidence. Before
admission, the runner MUST obtain the complete Action plan from a separate
read-only owner planning interface. Neither the caller nor the runner may
remove an effect, change its index or type, or reclassify its durability.
If that complete plan contains any durable effect, version 0.1 rejects the run
before executing its first step.

Cases MUST NOT contain credentials, tokens, capabilities, or authorization
claims. Missing, ambiguous, conflicting, or insufficient admission stops the
run before the first step. Every omitted permission is denied.

Before emitting any report or invoking any executing port, the runner MUST
atomically bind `(targetIdentityDigest, runId)` to the canonical case digest in
an environment-owned store. Any existing binding rejects the new run,
including one with the same case digest. An unsupported preflight
classification consumes this binding because it emits a report. Only a
rejected input for which no report exists leaves the run id unused.

Schema validation and cross-document lint MUST pass before execution. A lint
clearance binds the canonical case digest to the canonical, sorted set of exact
source references and digests inspected by lint. The runner and comparator
MUST reject missing, stale, mismatched, or caller-fabricated clearance.

The verifier supplies a trusted `OutcomeOwnerFactsPort`, implemented through
AppGraphValidator and the existing owner interfaces. It returns the exact
subject inventories, direct Need anchors, Action plans, semantic-control
bindings, and subject-or-slot-to-Experience-Unit service relationships used by
lint. These facts are separate from caller input; caller-parsed documents and
low-level lint facts are not claim-bearing authority. An AppGraph-rejected
mount cannot receive clearance. Route co-location alone does not establish
Experience service: if several Units share a route and the owner facts do not
map the exact subject or slot to one Unit, clearance is rejected as ambiguous.

The runner MUST resolve the complete effect chain before activating an Action
control. It executes no step when that chain is incomplete, ambiguous, or
contains a durable effect.

### 3.4 Rule references

Every expected observation MUST contain a nonempty `ruleRefs` array.

An `artifact-declaration` rule identifies a digest-pinned artifact and a typed
subject. A `specification-rule` identifies a canonical specification, its
version, and a stable normative rule id. Need and Experience references provide
outcome context; a technical runtime expectation must also cite the
implementation declaration and normative processing rule that produce the
fact.

Every technical artifact subject cited by an expectation MUST carry an
owner-declared direct anchor to the case's exact Need id and revision. A shared
Need citation elsewhere in the graph, an Experience citation, or a matching
label does not establish this trace.

Specification rules resolve through a verifier-owned, build-generated version
0.1 rule index. The index is bound to the verifier implementation digest, and
its canonical digest is included in lint clearance. A caller MUST NOT supply a
rule list or attest that a rule exists or is current. The claim gate reissues
clearance using the independently resolved verifier identity and the same
build-owned index.

Version 0.1 recognizes this closed rule index:

| `specRef`                                        | `specVersion`   | `ruleId`                          | Meaning                                           |
| ------------------------------------------------ | --------------- | --------------------------------- | ------------------------------------------------- |
| `https://formspec.org/specs/app-graph-validator` | `1.0.0-draft.1` | `rendered-node.direct-need-trace` | Static direct Need trace plus resolved mounting   |
| `https://formspec.org/specs/surface`             | `0.2.0-draft.1` | `rendering.semantic-output`       | Qualified renderer-produced semantic output       |
| `https://formspec.org/specs/surface`             | `0.2.0-draft.1` | `routing.current-route-state`     | Authoritative host/router current Surface route    |
| `https://formspec.org/specs/data-sources`        | `1.0.0-draft.1` | `loader.qualified-result`         | Qualified load state and owner-reported freshness |
| `https://formspec.org/specs/core`                | `1.0.0-draft.1` | `response.snapshot-status`        | Complete Response snapshot and stored status      |
| `https://formspec.org/specs/core`                | `1.0.0-draft.1` | `validation.constraint-result`    | False Bind constraint emits `CONSTRAINT_FAILED`   |
| `https://formspec.org/specs/response-actions`    | `1.0.0-draft.1` | `invocation.blocking-gate`        | Invalid blocking validation invokes zero effects  |

A conforming linter MUST reject a catalog reference with a different version,
unknown rule id, unresolved artifact subject, or stale digest. This table is
closed for version 0.1.

### 3.5 Expected observations

Version 0.1 defines exactly seven observation kinds:

| Kind                 | Owner-produced fact                                                |
| -------------------- | ------------------------------------------------------------------ |
| `app-graph`          | Static resolution, mounting, or direct Need trace                  |
| `validation-report`  | Validity and exact ValidationResult path/code issues for one Response revision |
| `response`           | Exact item value or absence from a digest-pinned Response, with optional status |
| `action-invocation`  | Action terminal state and complete ordered effect trace            |
| `data-source-result` | Qualified source state, freshness, and optional record identity    |
| `route-state`        | Authoritative host/router current Surface route and route instance |
| `rendered-output`    | Current committed node output and optional owner-known operability or semantic value |

The observation vocabulary is closed. Version 0.1 has no `x-` observation kind,
`resource-result`, or `integrity-result`.

Each expectation MUST name a later `checkpointRef`. Every non-structural
expectation MUST also name the producing `stepRef`.
`validation-report` and `response` expectations MUST name the exact qualified
Definition subject they test; an artifact rule must cite that same subject.
A version 0.1 Validation subject MUST be a `definition-bind`. Every
`containsIssues` and `excludesIssues` path MUST equal that Bind's
`subjectRef`; an issue from a sibling Bind cannot credit the named subject.
Shape-specific evidence is deferred because a path/code pair does not uniquely
identify one Shape.

A version 0.1 Response subject MUST be a `definition-item`, and every Response
expectation MUST include `item` with a path equal to that subject's
`subjectRef`. `status` MAY narrow the same item-bound Response observation, but
a status-only, whole-Definition, or Shape-bound Response expectation is not
admitted.

### 3.6 Evidence classes

The required evidence class is exact, not ordered:

| Kind                 | Admitted classes                           |
| -------------------- | ------------------------------------------ |
| `app-graph`          | `structural`                               |
| `validation-report`  | `simulated`, `runtime`                     |
| `response`           | `simulated`, `runtime`                     |
| `action-invocation`  | `simulated`, `runtime`                     |
| `data-source-result` | `simulated`, `runtime`                     |
| `route-state`        | `simulated`, `runtime`                     |
| `rendered-output`    | `simulated`, `runtime`                     |

An observation passes the evidence check only when its class equals
`requiredEvidence`. Runtime evidence does not satisfy a simulated expectation.

## 4. Normalized observations and bindings

The Outcome Verification Report schema defines the closed
`NormalizedObservation` union and `ComparatorRequest`. A
`ComparatorRequest` is an in-memory comparator input, not a third persisted
Formspec document.

Every normalized observation contains:

- a stable observation id and target expectation id;
- one of the seven kinds;
- an exact evidence class;
- one digest-pinned source;
- a bounded interval;
- the checkpoint binding;
- the producing step binding for non-structural facts;
- adapter identity, version, and digest;
- an optional immutable evidence reference; and
- one closed owner-produced payload.

Provider-specific details MAY remain behind an opaque evidence reference. They
MUST NOT alter portable comparison. An adapter that cannot express a result in
the closed payload emits no observation for that expectation.

The runner records immutable bindings:

| Step               | Binding                                                                           |
| ------------------ | --------------------------------------------------------------------------------- |
| `open-route`       | Surface, route, render instance, and any owner-produced Data Source request ids   |
| `set-item`         | Render instance, control, Definition item, Response id, and revision              |
| `activate-control` | Render instance, control, Action, invocation, Response, and complete effect trace |
| `checkpoint`       | Bounded interval and included binding references                                  |

Repeated author text is not a correlation identity. Evidence that spans
multiple possible Response ids, invocations, requests, render instances, or
checkpoint intervals is ambiguous.

### 4.1 Renderer-owned semantic output

A renderer MAY publish `rendered-output` through an opt-in semantic-output
registry. The caller pairs the registry with one exact Surface reference,
Surface digest, and render-instance id. The Surface shell assigns each
publisher an exact `routeId/slotId` subject prefix. A publisher may commit only
that exact subject or its descendants and only when it produced them in the
current render. Every published record has `rendered: true`; a renderer MAY add
`operable` or `semanticValue` only when it produced that fact.

Lookup uses the exact Surface reference, digest, render-instance id, and
subject. Two live publishers for one exact target are ambiguous. Data changes
replace the publisher's prior commit, and unmounting removes it. Missing,
ambiguous, out-of-scope, unimplemented, custom, and unmounted output yields no
normalized observation and therefore produces an `indeterminate` expectation
result.

The registry MUST NOT convert absence into `rendered: false`, infer output from
configuration, inspect visible copy, query DOM selectors, or depend on document
position. It observes output; it cannot render a node, operate a control,
authorize an Action, or create a Need trace.

## 5. Portable comparison

### 5.1 Determinism and source checks

The comparator is pure. It MUST NOT read a clock, browser, network, renderer,
credential, or mutable product state. After the observation boundary closes,
the environment records `generatedAt` and supplies it to the verifier.
The verifier MUST reject a value that is not RFC 3339 or is earlier than
`boundary.endedAt`.

Before comparing expectations, the comparator MUST:

1. canonicalize the complete case under RFC 8785;
2. verify `caseDigest`;
3. verify the exact paired source references and digests;
4. verify case, app, Need revision, and evidence freshness;
5. verify step and checkpoint bindings; and
6. group observations by exact `expectationId`.

JSON object member order does not affect comparison. Array order does. JSON
values compare after RFC 8785 canonicalization. Validation issue lists compare as sets of exact
`{path, code}` pairs. A matching code at another path does not satisfy an issue
expectation.

### 5.2 Kind-specific comparison

| Kind                 | Passing comparison                                                                              |
| -------------------- | ----------------------------------------------------------------------------------------------- |
| `app-graph`          | Subject, relation, and state match exactly.                                                     |
| `validation-report`  | Definition pin and validity match for the exact Response id and revision; all included exact path/code issues exist and all excluded issues are absent. |
| `response`           | Definition pin and complete Response snapshot identity match; each requested status, presence, and canonical value matches.        |
| `action-invocation`  | Action pin, id, terminal state, and complete ordered effect trace match exactly.                |
| `data-source-result` | Catalog pin, source, state, and each supplied optional expected field match.                    |
| `route-state`        | Surface pin, route id, and authoritative render instance match the correlated host/router binding. |
| `rendered-output`    | Qualified node and each supplied rendering field match; semantic values use canonical equality. |

Validation observations identify the exact `responseId` and
`responseRevision` validated. Response observations identify the exact
`responseId`, `responseRevision`, and `responseDigest`; the digest covers the
canonical complete Response snapshot.

Each normalized Validation issue contains the owner-produced resolved instance
`path` and machine-readable `code`. Expectations use `containsIssues` and
`excludesIssues` for exact matching. Version 0.1 has no path-independent
Validation code assertion.

`response.item.value` is required when `presence` is `present` and forbidden
when it is `absent`. An absent value may pass only against that complete,
digest-pinned Response snapshot.

An Action expectation declares the complete ordered effect trace. Missing
effect records are not zero effects. Only explicit, correlated `not-invoked`
records can prove non-invocation.

A loaded Data Source result requires owner-reported freshness. An unavailable
result forbids freshness, record id, and value digest.
When `recordStepRef` is present, it MUST name a prior `set-item` or
`activate-control` step with one owner-produced Response id. The observed
Data Source `recordId` MUST equal that Response id. A previous run's record is
complete contradictory evidence, not a current write/read match.

A `route-state` expectation names the exact Surface reference, digest, and
route id. Its payload comes from the authoritative host/router current-route
seam and includes the owner-produced route-instance id, which is distinct from
a renderer instance. A configured transition,
Response status, click, or rendered node cannot substitute for this fact.

Expected and observed `rendered-output.rendered` MUST equal `true`. Version 0.1
has no owner-produced negative rendering record. Missing current output remains
missing evidence.

### 5.3 Fail-closed result classification

The comparator produces:

- `passed` when one unambiguous observation matches every comparison rule;
- `failed` only when complete, current, correlated evidence contradicts the
  expectation;
- `indeterminate` when evidence is missing, duplicated, unsupported,
  unresolvable, incomplete, ambiguous, or uncorrelated; and
- `stale` when the case, Need revision, app, source, or evidence digest no
  longer matches the paired input.

Missing evidence is not proof of a negative. A missing observation or effect
record produces `indeterminate`, never `failed` or `passed`.

The overall conclusion uses this precedence:

1. Any stale result makes the report `stale`.
2. Otherwise, any failed result makes the report `failed`.
3. Otherwise, any indeterminate result makes the report `indeterminate`.
4. Otherwise, all results passed, and the report is `passed`.

## 6. Outcome Verification Report

An Outcome Verification Report uses
`"$formspecOutcomeVerificationReport": "0.1"`. The processor derives its id as
`urn:formspec:outcome-report:<sha256>` from the canonical JSON object containing
the exact `targetIdentityDigest`, `runId`, and `caseDigest`; a caller MUST NOT supply the id.
The same run id and case on two resolved targets therefore
produce different report identities. The report records:

- report id and the environment-recorded generation time;
- case id and canonical digest;
- lint-clearance digest for the exact case and inspected source set;
- complete owner Action-plan-set digest;
- execution-receipt reference and evidence digest;
- run id and sanitized admission-context digest;
- the complete `ResolvedTargetIdentity`: class, reference, build reference,
  build digest, all six implementation identities, and the canonical
  implementation-set and target-identity digests;
- exact inspected sources and digests;
- overall observation boundary;
- immutable step bindings;
- one result for every expected observation;
- summary counts;
- one overall conclusion;
- fixed claim scope; and
- diagnostics.

The report MUST NOT contain credentials or capabilities. A report does not
authorize a retry, replay, cleanup, or effect.

The six implementation identities are closed and complete. Omitting one,
substituting an unpinned implementation, or changing any identity, version, or
digest changes `implementationSetDigest` and `targetIdentityDigest`.

Direct comparator output is not claim-bearing. Before comparison, the
environment-owned custody store reserves the receipt reference and binds the
resolved target, case, admission, complete owner plan set, lint clearance, step
bindings, observation boundary, and normalized observations. The execution
evidence digest covers that payload while excluding receipt and report
digests, so derivation is acyclic. After comparison, custody finalizes the
receipt and records the canonical report digest out of band. The report carries
only the receipt reference and execution evidence digest. A claim gate MUST
read the trusted receipt and match both those fields and the stored report
digest; caller-supplied receipt data is not sufficient.

An emitted report is immutable. A rerun uses a new `runId` and appends a new
report; it MUST NOT overwrite prior run evidence. The report custodian records
the canonical report digest with the immutable report.

The summary counts MUST equal the result list, and their sum MUST equal
`summary.total`. Each expected observation id appears exactly once in
`results`.

### 6.1 Caller-owned claim gate

Outcome Verification does not define a persisted run-set or release-gate
document in version 0.1. A caller MAY apply a separate demo claim gate. Release
claims are outside version 0.1. The demo gate MUST name a nonempty set of exact
case digests, require exactly one clean `passed` report for each digest, and
record explicit human approval that the case set adequately supports the demo
claim. The approval MUST record the reviewer, review time, and canonical digest
of the exact required case set.
The claim context and approval MUST use the closed evidence profile
`runtime-demo`. Under this profile, every `app-graph` expectation requires
structural evidence and every other expectation requires runtime evidence.
Simulated evidence cannot support a demo claim.
It MUST also bind the full App pin and exact resolved target-identity digest.
The gate recomputes these values. Adding, removing, or changing any required
case, App pin, target build, or implementation makes the approval stale.

The gate MUST receive the complete evidence bundle used to produce each
candidate report, including the case, exact source documents, owner-derived
inventories and planning results, admission and build facts, implementation
identities, bindings, normalized observations, and candidate report. It MUST
independently call the target resolver, then rerun schema validation, owner
derivation, cross-document lint, preflight classification, portable
comparison, and report construction from that bundle. It MUST recompute the
lint clearance, resolved identity digests, deterministic report id, and
canonical report digest and require canonical equality with the supplied
immutable report. A supplied clearance or report digest is evidence to check,
not authority to skip those stages.

Caller claim input contains only the claim context, evidence bundle, and human
approval. Schema validation, target resolution, owner facts, rule index, and
run-custody lookup are separately environment-configured gate dependencies.
They are not fields the caller can replace.

Report generation MUST NOT approve case-set adequacy or Need satisfaction.
Missing required case digests, missing reports, duplicate reports, non-passing
reports, error diagnostics, absent or mismatched lint clearance, or absent or
stale human approval fail the caller's gate.

## 7. Lint requirements

Schema validation enforces closed document shape. Cross-document lint MUST also
report:

- duplicate step or expectation ids;
- unresolved or ambiguous Need documents, Need ids, or revisions;
- unresolved Experience documents or Units;
- an Experience-pinned case whose selected Unit does not cite the pinned Need;
- an expectation in an Experience-pinned case that lacks an exact
  `experience-unit` rule reference from that Experience, or cites a Unit that
  does not cite the pinned Need;
- an artifact rule that differs from the exact technical subject tested by its
  expectation, or whose owner-produced trace inventory lacks the exact pinned
  Need id and revision;
- empty, unversioned, unknown, unresolved, contradictory, or stale rule refs;
- unqualified document-local identities;
- unresolved routes, controls, Definition items, Actions, sources, or nodes;
- a `set-item` control not bound to its declared Definition item;
- an `activate-control` not bound to its declared Action and Response;
- forward, missing, or wrong-kind step references;
- a checkpoint before its producing step;
- invalid evidence-class combinations admitted by the case vocabulary;
- a Validation issue required and excluded with the same exact path and code;
- a `rendered-output` expectation whose `rendered` value is not `true`;
- missing or ambiguous correlation;
- a negative expectation whose evidence does not close the asserted boundary;
- stale case, App, or source document pins;
- no expected observations; and
- any `satisfied` report conclusion or Need-satisfaction claim.

Execution admission remains a runtime gate. A schema-valid, lint-clean case
still cannot run without adequate caller admission.

Authoring lint does not decide runner capability. A schema-valid case with a
step or observation kind unsupported by the selected runner advances to
preflight classification, which emits a non-passing report without executing
product behavior. Case, App, and source document pin mismatches are rejected
before execution because version 0.1 has no separate trusted current-target
resolver from which to classify them. Only post-clearance runtime evidence or
target-build mismatch may produce a `stale` report. Malformed shape, unresolved
authoring identities, contradictory declarations, or failed owner derivation
also remain rejected before a report exists.

## 8. Conformance

A conforming implementation MUST prove:

1. The same unchanged runner processes one product fixture and one unrelated
   control fixture.
2. Product-specific behavior exists only in structured artifacts.
3. Every retained step and observation kind has an end-to-end fixture.
4. Structural or simulated evidence cannot satisfy a runtime expectation.
5. Mixed invocation or checkpoint evidence cannot pass.
6. Missing and unsupported evidence is indeterminate.
7. Stale authoring pins are rejected; post-clearance stale evidence or target
   identity produces stale reports.
8. Provider-specific details and JSON member order cannot change comparison.
9. Missing admission, any reused run id, or any durable Action effect executes
   nothing.
10. Direct Response mutation and direct Action-executor invocation cannot
    satisfy rendered-control steps.
11. Reports never assert Need satisfaction.
12. An Experience-pinned case receives no credit from an uncited Unit or a Unit
    that does not cite the pinned Need.
13. Configured-but-unrendered, duplicate-published, unimplemented, and
    unmounted nodes produce no positive semantic-output observation; changed
    data replaces the prior value.
14. A caller claim gate rejects an empty required case set, omitted case
    digest, duplicate or non-passing report, error diagnostic, and missing
    human adequacy approval.
15. A Validation issue with the expected code at the wrong path fails exact
    issue comparison.
16. A Data Source record from an older Response cannot satisfy a current
    `recordStepRef`, and a configured route cannot substitute for authoritative
    `route-state`.

The kill criterion is direct: the design fails if a case passes while the
tested outcome fails, or if the generic runner contains product-specific
logic.

## 9. Deferred work

Version 0.1 does not add:

- a satisfaction state or score;
- automatic parsing of `Need.statement.done`;
- `criteria[]` on Needs;
- a general expression, scripting, selector, or plugin language;
- App Manifest or TraceIndex members;
- production monitoring;
- release claims;
- durable-external evidence, durable effects, run recovery, and cross-attempt
  replay;
- resource-result or integrity-result observations; or
- Validation Shape subjects and Shape-specific issue identity; or
- status-only or whole-Definition Response evidence; or
- open extension kinds.

A future observation kind requires a separate version and at least two
conforming consumers, including one unrelated control.

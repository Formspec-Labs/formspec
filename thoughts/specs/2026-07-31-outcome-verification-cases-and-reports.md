---
name: Outcome verification cases and reports
date: 2026-07-31
status: proposed
category: proof-infrastructure
decision: add caller-paired, data-only outcome verification cases and generated reports without claiming universal Need satisfaction
trigger: the Surface v12 take-two audit proved that structural Need traceability can pass while core user outcomes fail
---

# Outcome Verification Cases and Reports

## Decision

Add two OBSERVABILITY documents:

1. An authored `OutcomeVerificationCase` pins one product version and one
   `need:<id>@<revision>`. It declares a data-only test procedure and the
   observations expected from that procedure.
2. A generated `OutcomeVerificationReport` pins the case, the inspected source
   documents, and the observed evidence. It reports whether each declared
   observation passed, failed, remained indeterminate, or became stale.

A passing report means only:

> Every observation declared by this case passed against the pinned sources and
> evidence at the recorded observation boundary.

It does not mean that the Need is universally or permanently satisfied.

Keep the human outcome in Needs, abstract completion intent in Experience, and
implementation facts in their current owner documents. The new documents
test those facts; they do not redefine product semantics or grant execution
authority.

## Why this is needed

The v12 data-only verifier proved that rendered nodes traced to adopted Needs and
that matching affordances were mounted. The outcome-verification regression set
then captured two core flows that had reported success without producing valid
outcomes:

- organization setup accepted empty input and discarded entered values;
- public submission accepted invalid consent and issued a `Verified` receipt.

The existing result was structurally true and operationally insufficient. The
Needs specification already says that a clean usable-outcome advisory result
does not prove authorization, precondition success, effect success, or Need
satisfaction (`specs/needs/needs-spec.md:421-424`). The retained v12 review
records the corrected outcome checks and evidence
(`spikes/surface-v12-saas-v1-dogfood/evidence/outcome-verification-review.md:13-24`).

The framework needs data that answers a stronger but narrower question:

> When a generic runner performs this declared procedure, do the resulting
> observations support this pinned Need outcome?

## User value

This proposal gives authors and reviewers evidence that can stop a structurally
complete but functionally broken product from being called demoable. It creates
one reviewable chain:

```text
Need outcome
  -> Experience task and Unit
  -> declared test procedure
  -> owner-produced runtime evidence
  -> generated verification result
```

The end user never sees this authoring or proof model. The rendered application
continues to come from Definition, Surface, Component, Theme, Locale,
References, Registry/Ontology, Data Sources, and Response Actions.

A passing case does not prove that the case set adequately covers the Need.
Version 0.1 supports a demo claim only; it does not support a release claim.
For a demo claim, a caller supplies a structured run input that pins the exact
application identity, version, digest, target, target-build digest, renderer
and host implementation digests, runner, runtime, adapter, and verifier
implementation digests, evidence profile, required case digests, and canonical
digest of each supplied report. These exact identities may be summarized by one
canonical `implementationSetDigest`. The target-build identity comes from the
environment or build system, not from the case. The claim gate recomputes each
report and digest through the safe verification path described below.

A human reviewer approves that exact claim context as an adequate test of the
pinned Need outcomes. The approval records the reviewer, review time, claim
kind, application identity and digest, target-build and implementation-set
digests, target and evidence profile, and canonical digest of the exact
required case set. Any change makes the approval stale. The run input remains
caller-owned in version 0.1; it is not a new Formspec admission document or a
machine claim of Need satisfaction.

## Architectural placement

The current Needs and Experience specifications separate why the product should
exist from what a person does inside it
(`../../specs/needs/needs-spec.md:122-135` and
`../../specs/experience/experience-spec.md:343-357`). This proposal preserves
that ownership split.

| Information                                                    | Owner                                 | This proposal's use                           |
| -------------------------------------------------------------- | ------------------------------------- | --------------------------------------------- |
| Human-observable Who / What / Why / Done                       | Needs / PURPOSE                       | Pin and cite; never rewrite                   |
| Tasks, Units, actors, and abstract completion classification   | Experience / INTENT                   | Pin and cite the serving Unit                 |
| Data structure, requiredness, constraints, and captured values | Definition and Response / DATA        | Observe owner-produced results                |
| Invocation, validation gate, effects, and terminal outcome     | Response Actions / INTENT and runtime | Observe invocation and effect records         |
| Routes, mounted output, and navigation                         | Surface and the Rendering ring        | Exercise declared routes and observe output   |
| Source declarations and loaded values                          | Data Sources and its host boundary    | Observe qualified source outcomes             |
| Signatures, receipts, and durable proof                        | INTEGRITY artifacts                   | Outside the version 0.1 comparison vocabulary |
| Expected and actual observations                               | OBSERVABILITY                         | Own the case and generated report             |

### Completion-semantics ownership correction

The completed ownership correction is:

- Experience owns `NeedRef.completion.shape` and its abstract meaning.
- Needs owns Need identity, revision, grounding, human-observable `done`,
  cross-document resolution, and the prohibition against computed satisfaction.
- AppGraphValidator owns static mounted-output matching and its diagnostics.
- Outcome Verification owns declared procedures, expected observations, and
  point-in-time reports.

This correction changes no existing JSON shape.

## Core invariants

### 1. Cases describe tests; callers authorize execution

A case can request owner-defined behavior such as setting a rendered control or
activating the exact rendered control bound to an Action. It cannot define that
behavior or grant permission to run it.

Every runner invocation requires a caller-supplied `RunnerAdmissionContext`
outside the case. Version 0.1 admits only isolated `preview` or `test` targets.
The context requests the target by class and reference and identifies a
`runId` unique within the resolved target, admitted step kinds, and the caller
or capability. It cannot attest which build or implementations serve that
target.

Before admission, a separate environment-owned `OutcomeTargetIdentityPort`
resolves the requested target to `buildRef`, immutable `buildDigest`, and the
exact host, renderer, runner, runtime, adapter, and verifier implementation
identities and digests. A canonical digest binds that complete implementation
set. A source revision may be recorded as provenance, but is not a build
identity. Missing, ambiguous, or mismatched resolution stops the run. A
headless adapter cannot support a demo claim by copying the claimed host's
identity strings.

No target or permission is inferred from the case, the Action, or its effect
plan. Cases contain no credentials, tokens, capabilities, or authorization
claims. A missing, ambiguous, conflicting, or insufficient context stops
execution before the first step.

The admission context contains policy only. The runner obtains each complete
Action effect plan through a separate read-only owner planning interface before
executing any step. A caller cannot supply, shorten, or reclassify that plan
through admission data. Version 0.1 stops before execution when an owner plan
contains any durable effect. The trusted owner port issues a source- and
implementation-bound plan digest used by lint, runner preflight, execution
custody, and report generation. The claim gate resolves and compares the same
plan again; clearance and execution cannot use different plans.

The runner computes a canonical sanitized admission digest over the requested
target, principal reference, and admitted step kinds. It excludes secret
capability bytes. The separately resolved target-build and implementation-set
digests bind which product actually ran.

Before any executing port runs, an environment-owned atomic binding store
requires an absent `(resolvedTargetIdentityDigest, runId)` entry and binds it to
the case digest, sanitized admission digest, and principal reference. Every
existing entry is a conflict, even when its fields match. Agreement among fields
in the caller's admission object is not proof of run uniqueness.

The store first reserves an opaque receipt reference. After execution, the
runner hashes an `ExecutionEvidencePayload` containing the resolved target,
case and admission digests, owner-plan and lint-clearance digests, exact step
bindings, normalized observations, verifier-recorded time, and derived report
ID. That payload excludes its receipt fields and every report or record digest.
The comparator request and report then carry the reserved reference and
execution-evidence digest. After report generation, the store atomically
finalizes the record with the execution-evidence and canonical report digests;
neither digest includes itself. A demo gate queries the trusted custody store
and matches both values before recomputing verification. Caller-supplied
bindings or direct comparator output have no receipt and cannot support a
claim.

For Action-control steps, the runner derives a stable invocation identity from
`(resolvedTargetIdentityDigest, caseDigest, runId, step.id, actionsDigest,
actionId)` and uses it only inside that run.

A new execution receives a new `runId` within that resolved target. A runner
crash cannot produce a passing report. The caller reruns under a fresh ID;
version 0.1 has no recovery path. Report identity and append-only storage
include the target and run ID, so a legitimate rerun never overwrites earlier
evidence.

Changing a case or report therefore cannot change product semantics,
authorization rules, or the authority available to a runner. Execution may
still change target state when the separate admission context expressly permits
the owner-defined operation.

### 2. Every expectation cites its rule

Each expected observation carries a non-empty `ruleRefs` list containing every
owner-authored declaration and specification rule needed to support the
comparison. The list distinguishes:

- `artifact-declaration` — a digest-pinned document and typed subject identity;
- `specification-rule` — a versioned specification and stable normative rule
  ID.

A case may cite:

- a pinned Need and its `statement.done`;
- an Experience Unit and `completion.shape`;
- a Definition item, Bind, or Shape;
- a Response Action, effect declaration, or terminal rule;
- a Surface route, slot, transition, or rendered-node identity;
- a Data Source declaration;
- an INTEGRITY document or Rulespec assertion IRI.

The Need and Experience references establish outcome context. They cannot, by
themselves, support a technical runtime predicate; that expectation must also
cite the implementation declaration and normative processing rule that produce
the observed fact.

Rule existence and currentness come from a verifier-owned, build-generated
version 0.1 specification-rule index bound by the verifier implementation
digest. A case may cite a rule, but neither the case nor caller context may add
a rule or mark it current.

Every cited technical artifact subject must itself carry the exact direct
`need:<id>@<revision>` anchor pinned by the case. Direct Need trace is a
precondition for every expectation, not an optional `app-graph` observation.
The safe verifier derives that relation and route-to-Experience-Unit service
from the digest-paired owner documents and AppGraph results. A caller-supplied
array, case field, rule reference, or lint-context helper cannot create or
attest either relation. A separately cached inventory is acceptable only when
its owner, exact source digests, and canonical digest are verified before use.
Route co-location is insufficient: AppGraph must relate the exact tested
subject or containing slot to the cited Unit. If two Units share a route and
that service relation is not unique, the expectation is ineligible.

At least one artifact declaration must identify the exact technical subject
being tested: the same Action ID, rendered or graph node, Data Source ID, or
Definition item/Bind that supplies the expected fact. A correctly anchored
sibling in the same document cannot lend its trace to another subject.

If any required rule is absent, unresolved, unversioned, or contradictory,
cross-document lint rejects the request before execution and returns findings,
not an `OutcomeVerificationReport`. The case cannot create missing product
semantics. Specifications that lack stable rule IDs must add them before a case
can rely on those clauses.

### 3. Product-specific test behavior is data

The case declares route visits, rendered-control value changes and activations,
checkpoints, and expected observations as structured data. A fixed generic
runner interprets those declarations.

No product-specific Playwright code, React branch, host callback, JavaScript,
FEL expression, JSONPath predicate, DOM selector, or evaluator plugin may be
required to run a conforming case.

### 4. Evidence keeps its owner and strength

The verifier consumes normalized facts produced by the owning runtime or
adapter. It does not infer a durable effect from navigation, a valid Response
from visible success copy, or a verified receipt from a displayed badge.

Each observation records its evidence class:

- `structural` — source and graph relationships;
- `simulated` — declared preview or fixture behavior;
- `runtime` — behavior observed from the identified running build.

These categories are not an ordered ladder. A case states one exact required
class for each observation, and the observation must carry that same class.
There is no automatic promotion from one class to another.

### Surface-owned route state

`route-state` evidence comes from the Surface runtime router or its admitted
host boundary. It names the exact Surface artifact, current route ID, and
owner-produced route instance at the checkpoint. A rendered node, URL string,
transition declaration, or retained off-route component cannot substitute for
current route state.

### Renderer-owned semantic output

`rendered-output` evidence comes from an opt-in renderer registry, not from the
authored Surface tree or a DOM query. The caller pairs the exact Surface
reference and digest with one render-instance identity. After a renderer commit,
the mounted renderer publishes the stable review identities it actually
produced, with `rendered: true` and any owner-known `operable` or
`semanticValue` facts. Data changes replace the publisher's prior commit, and
unmounting removes its output.

Lookup uses the exact Surface reference, Surface digest, render-instance
identity, and node identity. Two live publishers for the same target are
ambiguous. Missing, ambiguous, unimplemented, custom, or unmounted output
produces no positive observation and therefore makes the expectation
`indeterminate`. The registry never converts absence into `rendered: false`,
never infers output from configuration, and never searches by visible copy,
DOM selector, or product-specific name.

Each publisher mount also carries an owner-assigned exact route-and-slot
subject prefix. A slot renderer may publish that slot or descendants beneath
it, but cannot publish a sibling slot, another route, or an arbitrary Surface
node. The registry rejects out-of-scope declarations before replacing the
publisher's prior commit.

The registry is an observation boundary only. It cannot render a node, operate
a control, authorize an Action, or create a Need trace. The separate semantic
control interface owns exact rendered-control lookup, value setting, and Action
activation.

### 5. Results are pinned and point-in-time

Cases and reports carry Need revision, app version, source digests, verifier
version, observation times, and runner-produced correlation bindings. A
mismatched authored pin is rejected before execution. Mixed invocations,
overlapping observation intervals without a unique binding, evidence that
becomes stale after preflight, or uncorrelated results never produce a pass.

### 6. Missing work never appears green

- Missing required evidence produces `indeterminate`.
- A mismatched case, owner, App, or source pin is rejected before execution and
  produces no report.
- Evidence or target-build identity that becomes stale after a clean preflight
  produces `stale`.
- An unsupported observation kind produces `indeterminate`.
- An absent case produces no result and cannot support a demo claim.
- Only explicit contradictory evidence produces `failed`.
- Only complete passing evidence for every declared observation produces
  `passed`.

A missing record is not proof that something did not happen. A negative
expectation passes only from a positive owner-produced fact over a closed
boundary, such as an Action trace that marks a declared effect `not-invoked`, or
an authoritative query result that names the source, subject, bounded interval,
and completeness token. Otherwise the result is `indeterminate`.

## `OutcomeVerificationCase`

### Identity

The authored document uses the marker
`"$formspecOutcomeVerificationCase": "0.1"` and requires:

- `id` — stable case identifier;
- `version` — case version;
- `need` — Needs document identity or digest, Need ID, and Need revision;
- `app` — App Manifest ID, version, and digest;
- `experience` — exact Experience document identity, digest, and starting Unit;
- `procedure` — structured steps for a generic runner;
- `expectedObservations` — a closed list of typed expectations.

The Experience references must resolve exactly, and the starting Unit must cite
the case's pinned Need. Each expectation must also cite at least one exact
`experience-unit` artifact declaration from that Experience document. The cited
Unit may differ from the case's starting Unit when the procedure crosses a
declared multi-Unit journey, but every cited Unit must cite the same pinned
Need. The exact producing Surface route must also mount that Unit through an
owner-declared `experience-unit` slot; a rule reference does not create that
relationship. Output from a Unit that merely happens to cite the same Need
cannot support the expectation.

Every document-local identity is qualified by its owning document reference and
digest. An `actionId`, `routeId`, `sourceId`, item path, or node ID is never
resolved globally or by whichever document loaded first.

### Procedure

Version 0.1 admits these closed step kinds:

| Step               | Meaning                                                                    |
| ------------------ | -------------------------------------------------------------------------- |
| `open-route`       | Resolve and open a declared Surface route                                  |
| `set-item`         | Set a Definition item through its exact rendered control                   |
| `activate-control` | Activate an exact rendered control and bind the Action invocation it emits |
| `checkpoint`       | Capture normalized observations without changing product state             |

Steps may reference only stable, qualified Formspec identities: Surface document
plus route ID, rendered-control owner plus stable review identity, Definition
document plus item path, and Response Actions document plus Action ID. A
`browserResource` operation occurs only as an owner-defined Action effect; the
case cannot activate it through a second path. Timing, retries, and readiness
follow generic runner rules; cases cannot supply arbitrary sleeps or scripts.

The version 0.1 step payloads are also closed:

| Step               | Required data                                                                                                                                              |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `open-route`       | `id`, `kind`, `surfaceRef`, `surfaceDigest`, `routeId`                                                                                                     |
| `set-item`         | `id`, `kind`, prior `renderStepRef`, `control` with `subjectKind: definition-item`, `definitionRef`, `definitionDigest`, `path`, and `value: FiniteJson`   |
| `activate-control` | `id`, `kind`, prior `renderStepRef`, `control` with `subjectKind: response-action`, `actionsRef`, `actionsDigest`, `actionId`, and prior `responseStepRef` |
| `checkpoint`       | `id`, `kind`                                                                                                                                               |

Version 0.1 Action steps are Response-scoped. `responseStepRef` must resolve to a
prior step binding that names exactly one Response ID and revision. The runner
activates `control` through the renderer's generic semantic-control interface;
it does not call the Action executor directly. The emitted invocation must name
the declared Action and same Response or the step fails. The runner never infers
that Response from the route, Definition URL, visible copy, or DOM position.

Likewise, `set-item` must resolve the declared rendered control, prove its
Definition item binding, and set it through the same semantic-control interface.
Direct Response mutation cannot satisfy the step. App-scoped Action input is
deferred until a concrete case and unrelated control prove a closed input shape.
Step records reject additional properties.

### Expected observations

Version 0.1 admits these closed observation kinds:

| Observation          | Owner-produced fact                                                   |
| -------------------- | --------------------------------------------------------------------- |
| `app-graph`          | Static resolution, mounting, and direct Need trace                    |
| `validation-report`  | Validity and named ValidationResult codes                             |
| `response`           | Response status and values at Definition item paths                   |
| `action-invocation`  | Action ID, terminal state, and correlated effect outcomes             |
| `data-source-result` | Source ID, qualified state, freshness, and correlated record identity |
| `route-state`        | Surface router's exact current route                                  |
| `rendered-output`    | Stable review identity, availability, and operability                 |

Each expectation requires:

- a unique `id`;
- `kind`;
- non-empty `ruleRefs`, identifying every supporting artifact declaration and
  versioned normative rule;
- `checkpointRef`, identifying the procedure checkpoint whose evidence is
  evaluated;
- `requiredEvidence`, one of the evidence classes above;
- kind-specific expected fields;
- `stepRef` for every non-structural observation, identifying the earlier
  procedure step whose runner-produced identity must bind the observation.

The initial vocabulary is closed. A future extension requires a Registry
contribution and a second conforming consumer. Version 0.1 does not admit `x-`
observation or step kinds.

### Common closed types

Version 0.1 uses these common values:

```text
QualifiedSubjectRef =
  { artifactRef, artifactDigest, subjectKind, subjectRef }

ArtifactRuleRef =
  { kind: "artifact-declaration", subject: QualifiedSubjectRef }

SpecificationRuleRef =
  { kind: "specification-rule", specRef, specVersion, ruleId }
```

`FiniteJson` contains only null, booleans, strings, finite numbers, arrays, and
objects. It excludes non-finite numbers and host objects.

Object member order never affects equality. Array order does. `FiniteJson`
values compare after RFC 8785 JSON canonicalization. Code lists compare as
deduplicated string sets. Every other scalar and closed record field compares
exactly.

### Closed expectation and observation payloads

The schema must encode the following complete version 0.1 union. “Observed”
fields are the only portable facts an adapter may give the comparator.

| Kind                 | Expected fields                                                                                                                                                                  | Observed fields                                                                                                                                        | Passing comparison                                                                                                             |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| `app-graph`          | `subject: QualifiedSubjectRef`; `relation: resolves \| mounted \| direct-need-trace`; `state: present \| absent`                                                                 | The same three fields                                                                                                                                  | Exact equality                                                                                                                 |
| `validation-report`  | `subject: QualifiedSubjectRef`; `definitionRef`; `definitionDigest`; `valid`; optional `containsIssues[]` and `excludesIssues[]` entries with exact `{ path, code }`             | The same source fields plus `responseId`, `responseRevision`, `valid`, and owner-produced `issues[]`                                                   | Definition, exact bound Response revision, and validity match; all included item/Bind issues exist; all excluded issues do not |
| `response`           | `subject: QualifiedSubjectRef` for one `definition-item`; `definitionRef`; `definitionDigest`; required `{ path, presence: present \| absent, value? }`; optional exact `status` | The same source fields plus `responseId`, `responseRevision`, canonical complete-snapshot `responseDigest`, `status`, and `{ path, presence, value? }` | Exact bound Response revision, requested status, presence, and canonical value match                                           |
| `action-invocation`  | `actionsRef`; `actionsDigest`; `actionId`; `terminal`; exact ordered `effects[]` entries `{ index, type, status, outcomeRef? }`                                                  | The same fields plus `invocationId` and optional `responseId`                                                                                          | Action, terminal, and complete effect trace match exactly                                                                      |
| `data-source-result` | `catalogRef`; `catalogDigest`; `sourceId`; `state`; optional `freshness`, `recordId`, `recordStepRef`, and `valueDigest`                                                         | The same fields plus `requestId`                                                                                                                       | Every expected field matches; `recordStepRef` requires `recordId` to equal that prior binding's Response ID                    |
| `route-state`        | `subject: QualifiedSubjectRef` for one `surface-route`; `surfaceRef`; `surfaceDigest`; `routeId`                                                                                 | The same fields plus owner-produced `routeInstanceId`                                                                                                  | Exact current route identity matches                                                                                           |
| `rendered-output`    | `node: QualifiedSubjectRef`; `rendered: true`; optional `operable` and `semanticValue`                                                                                           | The same fields plus `renderInstanceId`                                                                                                                | Every expected field matches; values use canonical equality                                                                    |

`status`, Action terminal values, effect types and statuses, data-source states,
and freshness values come from their owning closed Formspec vocabularies. The
outcome-verification schema references those vocabularies; it does not copy or
extend them. Conditional schema rules reject fields that do not belong to the
selected kind.

An Action expectation contains the complete ordered effect trace, including
owner-produced `not-invoked` entries. It cannot infer a zero count from absent
effect records. A Validation Report must name the exact Response ID and revision
bound to the activating step. Version 0.1 validation subjects are exact
`definition-bind` identities. Each included or excluded issue path must equal
that Bind's `subjectRef`; an issue on a sibling field cannot satisfy the cited
subject. Richer Shape result identity is deferred. A Response expectation names
one exact `definition-item`, and its required item path must equal that
subject's `subjectRef`; version 0.1 has no whole-Response or Shape-subject
expectation. A Response observation must name that same revision and the
canonical digest of its complete snapshot. A Response
`presence: absent` comparison uses that complete, digest-pinned snapshot. An
`app-graph` absence uses the complete paired source set. A rendered-output fact
can prove only committed `rendered: true` output; missing output remains missing
evidence. Version 0.1 has no
general external-record-absence predicate;
`data-source-result.state: unavailable` is a positive loader outcome, not proof
that a record does not exist.

For Response values, `value` is required when `presence` is `present` and
forbidden when it is `absent`. A loaded data-source result requires
owner-declared freshness; an unavailable result forbids freshness and value
identity. A
`browserResource` effect can still appear in an Action's complete effect trace,
but version 0.1 makes no separate claim about browser execution.

### Evidence compatibility

The admitted combinations are closed and exact:

| Observation kind     | Admitted `requiredEvidence` |
| -------------------- | --------------------------- |
| `app-graph`          | `structural`                |
| `validation-report`  | `simulated`, `runtime`      |
| `response`           | `simulated`, `runtime`      |
| `action-invocation`  | `simulated`, `runtime`      |
| `data-source-result` | `simulated`, `runtime`      |
| `route-state`        | `simulated`, `runtime`      |
| `rendered-output`    | `simulated`, `runtime`      |

The observed class must equal `requiredEvidence`. A runtime observation does not
silently satisfy a simulated case. Authors choose the claim they intend to
test.

### Causal binding

The author supplies `stepRef`, not a correlation string. While running a case,
the runner records an immutable binding for each step:

- `open-route` binds the resolved route and render instance;
- `set-item` binds the render instance, rendered control, Definition item,
  Response ID, and Response revision;
- `activate-control` binds the render instance, rendered control, invocation ID,
  Response ID and revision, and complete effect trace;
- `checkpoint` binds a closed time interval and the preceding step bindings it
  includes.

A `data-source-result` that claims to read the Response produced by an earlier
step names that step as `recordStepRef`. Its owner-produced `recordId` must equal
the Response ID in the prior binding. A later request ID proves the read
occurred; it does not prove that the read selected this run's write.

Each runtime expectation must name both the producing `stepRef` and a later
`checkpointRef`. The normalized observation must carry the owner-produced
identity from that step binding. Repeated author text is never a correlation
identity. If an observation spans two possible invocations or its interval
cannot be attributed to one binding, the result is `indeterminate`.

### Illustrative case

This example is explanatory, not the final schema:

```json
{
  "$formspecOutcomeVerificationCase": "0.1",
  "id": "public-response-requires-valid-consent",
  "version": "0.1.0",
  "need": {
    "documentRef": "https://formspec.cloud/needs/saas-v1",
    "documentDigest": "sha256:<needs-digest>",
    "id": "complete-and-prove-response",
    "revision": 1
  },
  "app": {
    "id": "https://formspec.cloud/apps/saas-v1",
    "version": "0.12.0",
    "digest": "sha256:<app-digest>"
  },
  "experience": {
    "documentRef": "https://formspec.cloud/experience/saas-v1",
    "documentDigest": "sha256:<experience-digest>",
    "unitId": "publicRespondUnit"
  },
  "procedure": [
    {
      "id": "open",
      "kind": "open-route",
      "surfaceRef": "https://formspec.cloud/app",
      "surfaceDigest": "sha256:<surface-digest>",
      "routeId": "publicRespond"
    },
    {
      "id": "decline-consent",
      "kind": "set-item",
      "renderStepRef": "open",
      "control": {
        "artifactRef": "https://formspec.cloud/definitions/public-response",
        "artifactDigest": "sha256:<definition-digest>",
        "subjectKind": "definition-item",
        "subjectRef": "acceptNotices"
      },
      "definitionRef": "https://formspec.cloud/definitions/public-response",
      "definitionDigest": "sha256:<definition-digest>",
      "path": "acceptNotices",
      "value": false
    },
    {
      "id": "submit",
      "kind": "activate-control",
      "renderStepRef": "open",
      "control": {
        "artifactRef": "https://formspec.cloud/actions/public-response",
        "artifactDigest": "sha256:<actions-digest>",
        "subjectKind": "response-action",
        "subjectRef": "submitPublicResponse"
      },
      "actionsRef": "https://formspec.cloud/actions/public-response",
      "actionsDigest": "sha256:<actions-digest>",
      "actionId": "submitPublicResponse",
      "responseStepRef": "decline-consent"
    },
    {
      "id": "after-submit",
      "kind": "checkpoint"
    }
  ],
  "expectedObservations": [
    {
      "id": "validation-blocks",
      "kind": "validation-report",
      "ruleRefs": [
        {
          "kind": "artifact-declaration",
          "subject": {
            "artifactRef": "https://formspec.cloud/definitions/public-response",
            "artifactDigest": "sha256:<definition-digest>",
            "subjectKind": "definition-bind",
            "subjectRef": "acceptNotices"
          }
        },
        {
          "kind": "artifact-declaration",
          "subject": {
            "artifactRef": "https://formspec.cloud/experience/saas-v1",
            "artifactDigest": "sha256:<experience-digest>",
            "subjectKind": "experience-unit",
            "subjectRef": "publicRespondUnit"
          }
        },
        {
          "kind": "specification-rule",
          "specRef": "https://formspec.org/specs/core",
          "specVersion": "1.0.0-draft.1",
          "ruleId": "validation.constraint-result"
        }
      ],
      "stepRef": "submit",
      "checkpointRef": "after-submit",
      "requiredEvidence": "runtime",
      "subject": {
        "artifactRef": "https://formspec.cloud/definitions/public-response",
        "artifactDigest": "sha256:<definition-digest>",
        "subjectKind": "definition-bind",
        "subjectRef": "acceptNotices"
      },
      "definitionRef": "https://formspec.cloud/definitions/public-response",
      "definitionDigest": "sha256:<definition-digest>",
      "valid": false,
      "containsIssues": [
        {
          "path": "acceptNotices",
          "code": "CONSTRAINT_FAILED"
        }
      ]
    },
    {
      "id": "action-does-not-complete",
      "kind": "action-invocation",
      "ruleRefs": [
        {
          "kind": "artifact-declaration",
          "subject": {
            "artifactRef": "https://formspec.cloud/app",
            "artifactDigest": "sha256:<surface-digest>",
            "subjectKind": "surface-node",
            "subjectRef": "publicRespond/publicRespondForm/submitPublicResponse"
          }
        },
        {
          "kind": "artifact-declaration",
          "subject": {
            "artifactRef": "https://formspec.cloud/actions/public-response",
            "artifactDigest": "sha256:<actions-digest>",
            "subjectKind": "response-action",
            "subjectRef": "submitPublicResponse"
          }
        },
        {
          "kind": "artifact-declaration",
          "subject": {
            "artifactRef": "https://formspec.cloud/experience/saas-v1",
            "artifactDigest": "sha256:<experience-digest>",
            "subjectKind": "experience-unit",
            "subjectRef": "publicRespondUnit"
          }
        },
        {
          "kind": "specification-rule",
          "specRef": "https://formspec.org/specs/response-actions",
          "specVersion": "1.0.0-draft.1",
          "ruleId": "invocation.blocking-gate"
        }
      ],
      "stepRef": "submit",
      "checkpointRef": "after-submit",
      "requiredEvidence": "runtime",
      "actionsRef": "https://formspec.cloud/actions/public-response",
      "actionsDigest": "sha256:<actions-digest>",
      "actionId": "submitPublicResponse",
      "terminal": "blocked",
      "effects": [
        {
          "index": 0,
          "type": "hostEvent",
          "status": "not-invoked"
        }
      ]
    },
    {
      "id": "public-response-route-remains-current",
      "kind": "route-state",
      "ruleRefs": [
        {
          "kind": "artifact-declaration",
          "subject": {
            "artifactRef": "https://formspec.cloud/app",
            "artifactDigest": "sha256:<surface-digest>",
            "subjectKind": "surface-route",
            "subjectRef": "publicRespond"
          }
        },
        {
          "kind": "artifact-declaration",
          "subject": {
            "artifactRef": "https://formspec.cloud/experience/saas-v1",
            "artifactDigest": "sha256:<experience-digest>",
            "subjectKind": "experience-unit",
            "subjectRef": "publicRespondUnit"
          }
        },
        {
          "kind": "specification-rule",
          "specRef": "https://formspec.org/specs/surface",
          "specVersion": "0.2.0-draft.1",
          "ruleId": "routing.current-route-state"
        }
      ],
      "stepRef": "submit",
      "checkpointRef": "after-submit",
      "requiredEvidence": "runtime",
      "subject": {
        "artifactRef": "https://formspec.cloud/app",
        "artifactDigest": "sha256:<surface-digest>",
        "subjectKind": "surface-route",
        "subjectRef": "publicRespond"
      },
      "surfaceRef": "https://formspec.cloud/app",
      "surfaceDigest": "sha256:<surface-digest>",
      "routeId": "publicRespond"
    },
    {
      "id": "response-form-remains-current",
      "kind": "rendered-output",
      "ruleRefs": [
        {
          "kind": "artifact-declaration",
          "subject": {
            "artifactRef": "https://formspec.cloud/app",
            "artifactDigest": "sha256:<surface-digest>",
            "subjectKind": "surface-node",
            "subjectRef": "publicRespond/publicRespondForm"
          }
        },
        {
          "kind": "artifact-declaration",
          "subject": {
            "artifactRef": "https://formspec.cloud/experience/saas-v1",
            "artifactDigest": "sha256:<experience-digest>",
            "subjectKind": "experience-unit",
            "subjectRef": "publicRespondUnit"
          }
        },
        {
          "kind": "specification-rule",
          "specRef": "https://formspec.org/specs/surface",
          "specVersion": "0.2.0-draft.1",
          "ruleId": "rendering.semantic-output"
        }
      ],
      "stepRef": "submit",
      "checkpointRef": "after-submit",
      "requiredEvidence": "runtime",
      "node": {
        "artifactRef": "https://formspec.cloud/app",
        "artifactDigest": "sha256:<surface-digest>",
        "subjectKind": "surface-node",
        "subjectRef": "publicRespond/publicRespondForm"
      },
      "rendered": true
    }
  ]
}
```

## Normalized observation input

A runner executes `procedure` through public Formspec interfaces and emits
immutable normalized observations. The verifier compares those observations
with `expectedObservations`.

`outcome-verification-report.schema.json` defines
`$defs/NormalizedObservation` as the closed union above and
`$defs/ComparatorRequest` as the pure comparator input. The request is not a
third persisted document. It contains:

- the complete case and its canonical digest;
- the exact paired source identities and digests;
- `runId`, target-environment identity, environment-resolved build and
  host/renderer implementation identities and digests, and the sanitized
  admission-context digest, never credentials or capabilities;
- environment-owned execution receipt reference and digest;
- runner, runtime, verifier, and adapter identities, versions, and immutable
  implementation digests;
- runner-produced step bindings and checkpoint boundaries;
- normalized observations.

Every normalized observation carries:

- observation kind and stable ID;
- evidence class;
- exactly one kind-specific payload from the closed table above;
- source artifact identity and digest;
- observation time or bounded interval;
- `stepBindingRef` and the owner-produced invocation, Response, render, request,
  resource, or other identity required by that binding;
- an immutable evidence reference when the owner produces one;
- adapter identity, version, and immutable implementation digest.

The verifier rejects arbitrary payloads outside the closed observation union.
An adapter may retain provider-specific detail behind an opaque evidence
reference, but opaque detail can never influence the portable conclusion. An
adapter that cannot express an owner result in the closed fields emits no
observation for that expectation, which makes it `indeterminate`; it does not
invent a product-specific field or comparator.

## `OutcomeVerificationReport`

The generated document uses the marker
`"$formspecOutcomeVerificationReport": "0.1"` and requires:

- `id` and `generatedAt`;
- `caseRef` and canonical case digest;
- lint-clearance and owner-plan-set digests;
- `runId`, `RunnerAdmissionContext` digest, and one environment-resolved target
  identity containing target class/reference, `buildRef`, `buildDigest`, all
  six implementation identities/versions/digests, the implementation-set
  digest, and the target-identity digest;
- execution receipt reference and evidence digest;
- the exact inspected source set and digests;
- the observation boundary;
- runner-produced step bindings;
- per-expectation results;
- summary counts and one overall conclusion.

The verifier records `generatedAt` from its environment clock after the
observation boundary closes. It must be valid RFC 3339 and no earlier than the
boundary's `endedAt`; callers do not supply it to the comparator.

The verifier derives the report ID from the canonical
`(resolvedTargetIdentityDigest, runId, caseDigest)` tuple; callers cannot choose
it. A claim input pairs the report with its canonical digest, and the claim gate
recomputes both the report ID and digest before using the report. A mutable file
path or in-memory object identity is not evidence custody. Digest recomputation
proves internal consistency, not who produced the report. A demo gate must also
resolve the target-build identity independently and use an
environment-controlled append-only run index. Version 0.1 makes no claim
against a hostile report store.

Each expectation result contains:

- expectation ID;
- `passed`, `failed`, `indeterminate`, or `stale`;
- stable reason code;
- evidence class;
- observed value summary;
- source and evidence references;
- observation time;
- step-binding and owner-produced correlation identities, when required.

The overall conclusion is deterministic:

1. Any stale required result makes the report `stale`.
2. Otherwise, any failed required result makes the report `failed`.
3. Otherwise, any indeterminate required result makes the report
   `indeterminate`.
4. Otherwise, every required result passed, and the report is `passed`.

The report must include this machine-readable claim scope:

```json
{
  "claim": "declared-observations",
  "needSatisfaction": "not-asserted"
}
```

## Pairing and discovery

Callers pair a case with:

- the exact Needs document;
- the exact App Manifest and sibling sources;
- optional Surface Scenario data when the case explicitly permits simulated
  evidence;
- runtime adapters and normalized observations;
- a `RunnerAdmissionContext` when any procedure will execute.

Version 0.1 makes no change to App Manifest. It also makes no change to
TraceIndex. The Needs specification deliberately uses caller pairing
(`specs/needs/needs-spec.md:201-205`), and Trace excludes runtime state and
findings (`specs/trace/trace-spec.md:104-116`).

Missing or ambiguous pairing fails the verification request. The verifier never
infers pairing from directory location, file name, or co-location.

### Deterministic Definition Response sources

The organization-flow regression exposed a product gap outside OBSERVABILITY:
the completing Action produced a Response, but the administration route had no
declared way to read that Response. The fix belongs to Data Sources, not to an
outcome case, Experience, renderer, or product-specific host branch.

A non-draft `definition-response` source therefore declares:

- the exact `definitionRef` and `definitionVersion` partition;
- completed Response status;
- latest cardinality;
- descending order by the parsed RFC 3339 `authored` instant;
- ascending unsigned UTF-8 Response-ID tie-break; and
- exact Definition partitioning.

The policy is closed structured data. The loader returns the selected Response
data through the ordinary qualified `(catalogRef, sourceRef)` request or reports
the source unavailable. It fails closed for invalid timestamps, missing IDs,
ambiguous candidates, unavailable authorization, stale baselines, and
unresolved source identities. Draft Response sources do not use this policy.

Preview and test hosts may use an isolated in-memory implementation to prove
the flow. That helper does not imply durable persistence, restart recovery,
production authorization, or cross-process delivery. A production host must
provide those capabilities behind the same qualified Data Source boundary.
The helper binds each Action delivery invocation ID to the canonical accepted
Response snapshot. An exact replay is a duplicate; reuse of that invocation ID
with different Response bytes is a conflict and is refused.

## Generic execution boundary

Implement the pure comparator in a narrow
`@formspec-org/outcome-verification` package at dependency layer 1. It depends
only on generated Formspec types and contains no browser, network, renderer, or
product code.

The package may also expose a generic runner over caller-supplied ports. Those
ports keep browser, renderer, network, and product behavior in their existing
owners; the package does not import those implementations.

Cross-owner fact derivation does not belong in that layer-1 package. A
higher-level verifier authority supplies a trusted `OutcomeOwnerFactsPort`,
separate from caller input, that calls AppGraph and the relevant owner
interfaces for exact subject traces, route-to-Unit mounts, semantic controls,
and Action plans. It also proves that each tested Surface, Definition, Response
Actions, and Data Sources document belongs to the pinned App's
manifest-resolved graph; a Need-anchored document from another App is
ineligible. The safe gate calls that port again during recomputation. A layer-1
helper that hand-parses all owner documents is non-claim-bearing and cannot
substitute for AppGraph or owner results.

Higher-level runners and adapters:

- require a caller-supplied admission context before running any step;
- bind the isolated preview/test environment, independently resolved target
  build and host/renderer implementations, `runId`, principal or capability,
  and admitted step kinds;
- atomically bind a previously unused target/run ID and reject every reuse;
- default every omitted permission to denied and never read authority from the
  case;
- resolve and execute the case procedure through existing public interfaces;
- activate controls through the renderer's semantic-control interface, never a
  direct Action-executor shortcut;
- mount the actual generic renderer and consume only semantic-control
  registrations published by its committed components; never register field or
  Action controls inside the runner;
- exercise the actual generic demo host boundary identified by the target-build
  digest; a parallel headless reconstruction can prove package conformance but
  cannot support a product demo claim;
- resolve the complete declared effect chain and stop before execution when it
  contains any durable effect;
- derive each Action invocation identity from
  `(resolvedTargetIdentityDigest, caseDigest, runId, step.id, actionsDigest,
actionId)`;
- obtain owner-produced evidence;
- record step-to-owner identity bindings and bounded checkpoints;
- normalize it into the closed observation union;
- call the pure comparator;
- never add product-specific branches.

The outcome runner cannot add a retry, replay an invocation, or clean up an
effect. A runner crash produces no passing report. The caller may start a new
run with a fresh ID; the verifier never guesses whether an earlier effect
happened.

AppGraphValidator remains static. Surface renderers remain rendering code.
Response Actions remains the action executor. The outcome-verification package
does not absorb any of those responsibilities.

### Safe verification and claim path

Schema validation, owner-document pairing, trace derivation, lint, execution,
comparison, report generation, and claim evaluation form one non-bypassable
path for any demo claim:

1. The verifier validates the case and every digest-paired owner document.
2. It derives exact subject-to-Need and route-to-Experience-Unit relations from
   those owner documents and AppGraph results, and resolves specification rules
   through its build-generated rule index.
3. It performs authoring lint against those derived relations. Invalid shape,
   unresolved rules, wrong subjects, or broken trace produce a rejected result
   with lint findings and no `OutcomeVerificationReport`.
4. It resolves the target identity and atomically binds the new run. A retained
   schema-valid kind that the selected runner cannot observe then produces an
   `indeterminate` report without execution. Every path that emits a report
   consumes the run ID; only `rejected` with no report leaves it unused.
5. Only an eligible request executes. The verifier compares its complete
   normalized evidence and generates the report.
6. The demo-claim input includes the complete verification evidence bundle:
   exact case, digest-paired owner documents, original comparator request and
   observations, target-build facts, and report. The claim gate repeats the
   validation, derivation, lint, preflight, comparison, report ID, report
   digest, target-build, required-case-set, and approval checks.

The safe verifier therefore returns a closed result: `rejected` with findings,
`classified` with a non-passing preflight report, or `executed` with a report.
Only an exact passing `executed` result can support a demo claim.

The caller claim request contains only claim context, evidence, and human
approval. Schema validation, target identity, owner facts and plans, clock,
rule index, and run custody are environment-configured gate dependencies in a
separate argument or constructed gate. Putting an authority port inside
caller-owned input cannot make it trusted.

The pure comparator may remain available for diagnostics, but its direct result
is not claim-bearing. Neither caller-supplied lint context nor a self-declared
clearance field can make a report eligible for a demo claim.

Version 0.1 has one closed demo evidence profile, `runtime-demo`. It requires
`structural` evidence for `app-graph` observations and `runtime` evidence from
the resolved running build for every behavioral or rendered observation.
`simulated` evidence remains useful for package conformance and diagnostics but
cannot support a demo claim. The profile is part of the claim context and the
human approval digest.

## Lint and conformance

Schema validation catches document shape. Cross-document lint must also catch:

- unresolved or ambiguous Needs documents, Need IDs, and revisions;
- unresolved Experience documents or Units;
- an Experience Unit that does not cite the case's pinned Need;
- an expectation without an exact serving `experience-unit` rule reference, or
  whose cited Unit does not cite the pinned Need;
- a cited Experience Unit that is not mounted by the exact Surface route that
  produced the observation;
- empty, unresolved, or unversioned rule references;
- a case, App, Need, artifact, or source pin that does not match its exact
  paired owner document;
- a cited technical artifact subject without a direct anchor to the exact
  pinned Need revision;
- a normative clause used without a stable specification rule ID;
- unresolved route, Definition, item, action, source, browser-resource effect,
  or rendered-node references;
- a `set-item` control not bound to its declared Definition item;
- an `activate-control` control not bound to its declared Action;
- any document-local identity lacking its owner reference and digest;
- unresolved `stepRef` or `checkpointRef`, or a checkpoint ordered before its
  producing step;
- duplicate step or expectation IDs;
- fields outside the closed kind payload or fields invalid for that kind;
- evidence-class combinations outside the closed compatibility table;
- missing correlation where several facts must describe the same act;
- a negative expectation whose selected fact cannot prove a closed boundary;
- a case that contains no expected observations;
- any attempt to use `satisfied` as a report conclusion.

Freshness and selected-runner support are typed preflight classifications, not
authoring lint. Execution admission is a runtime gate, not document lint. A
valid case still cannot run without an adequate caller-supplied context.

Lint findings remain separate from Response validity and product runtime
behavior. A caller-owned publication or dog-food gate may require clean
verification reports without changing Core processing or creating a new
normative admission document.

## Required acceptance cases

The proposal is ready only when one unchanged generic runner handles the v12
bundle and an unrelated control bundle with no product-specific code.

The regression set must prove:

1. Empty required organization setup cannot produce a passing case.
2. Entered organization values that disappear after completion fail the case.
3. Invalid email or false required consent leaves the response form rendered,
   produces owner evidence that the submission Action was blocked, and cannot
   advance the tested flow.
4. Structural evidence cannot satisfy a runtime requirement.
5. Simulated evidence cannot satisfy a runtime requirement.
6. Results from different invocations cannot satisfy one correlated case.
7. A mismatched Need revision, App digest, source digest, or case digest is
   rejected before execution; evidence or target-build identity that changes
   after preflight produces `stale`, never `passed`.
8. Missing or unsupported evidence produces `indeterminate`, never `passed`.
9. Two Experience Units citing the same Need cannot receive credit from an
   unrelated Unit's output.
10. The unrelated control bundle passes through the same schemas, runner,
    adapters, and verifier.
11. A case with no admission context, any reused `runId`, an unqualified Action
    ID, or an Action plan containing a durable effect executes nothing.
12. A crash cannot produce a passing report or trigger runner-authored cleanup;
    a later attempt uses a fresh run and invocation identity.
13. Missing effect records, racing queries, and mixed checkpoint intervals
    produce `indeterminate`; an explicit correlated `not-invoked` fact can pass.
14. Provider-specific adapter detail and payload member order cannot change a
    portable comparison result.
15. Every retained version 0.1 step and observation kind is exercised through
    its named owner interface by v12 or the unrelated control; an unexercised
    kind is removed before schema freeze.
16. A run that omits a caller-required case digest cannot support the demo
    claim, and report generation never replaces human review of case adequacy.
17. Direct Response mutation or direct Action-executor invocation cannot satisfy
    a rendered-control step; the declared control must emit the expected change
    or Action invocation against the same Response.
18. Configuring a node without rendering it, rendering it through two ambiguous
    publishers, replacing its data, and unmounting it each produce the exact
    fail-closed semantic-output result.
19. Adding, removing, or changing a required case invalidates an earlier human
    adequacy approval until a reviewer approves the new canonical case-set
    digest.
20. The runner obtains the complete plan from the Action owner; any durable
    effect in that plan stops version 0.1 before execution.
21. A custom widget mounted in one slot cannot publish semantic output for a
    sibling slot or another route.
22. Replacing a technical owner subject's direct Need anchor with another Need
    makes every dependent expectation ineligible to pass, even when the
    procedure's runtime values still match.
23. Sequential and concurrent attempts to reuse one resolved-target/run ID
    execute nothing after the first binding, even when case and admission
    digests match.
24. Two new executions of one unchanged case receive different run and report
    identities and preserve both reports.
25. Editing a supplied report without updating its canonical digest, or
    supplying the wrong digest, prevents the report from supporting a claim.
26. Replaying one Definition Response delivery identity with different Response
    bytes is rejected as a conflict; only a byte-identical replay is a
    duplicate.
27. Substituting a correctly Need-anchored sibling Action, node, source, item, or
    Bind from the same owner document cannot satisfy the tested subject's rule
    or trace requirement.
28. Caller-supplied subject-to-Need or route-to-Experience-Unit arrays cannot
    create trace eligibility; changing a digest-paired owner document changes
    the verifier-derived relation.
29. Within one resolved target, a run ID cannot be reused by changing its
    principal, admitted step kinds, case, or any other sanitized admission fact.
30. A crash followed by reuse of the old run ID executes nothing; rerunning
    requires a fresh ID.
31. No version 0.1 input can request recovery, durable-effect admission, or
    `durable-external` evidence.
32. A headless reconstruction with matching Formspec documents but a different
    host or renderer build can prove package conformance only; it cannot support
    the demo claim.
33. The same case and run ID on two resolved targets produces distinct Action
    invocation and report identities.
34. An unsupported-kind preflight that emits an `indeterminate` report consumes
    its run binding; a later attempt cannot reuse that ID.
35. A passing simulated report cannot support the `runtime-demo` profile.
36. Caller-supplied build, implementation, or specification-rule claims cannot
    replace the environment-resolved target identity or verifier-owned rule
    index.
37. A Need-anchored Surface, Definition, Action, or Data Source from another
    App cannot satisfy a case pinned to App A.
38. When AppGraph rejects a route mount or cannot uniquely relate a tested
    subject to one of two Units on the route, outcome clearance rejects it too.
39. Direct comparator output and caller-created bindings cannot support a demo
    without the matching environment-owned execution receipt and report record.
40. A runner report cannot support a claim when its Action plan differs from
    the owner plan re-resolved by the gate, including when either plan contains
    a durable effect.
41. A Definition Response Data Source that selects an older record, even with
    identical values, cannot satisfy a read tied by `recordStepRef` to this
    run's completed Response.
42. Keeping the old form mounted while the Surface router advances does not
    satisfy the invalid-submit case; the owner-produced current route must
    remain `publicRespond`.

The kill criterion is direct:

> If a case passes while organization setup discards values, invalid input
> advances the tested submission flow, or the generic runner contains
> SaaS-specific logic, this design has failed.

## Alternatives rejected

### Put executable assertions in Experience

Rejected. Experience owns task and completion intent, not runtime validation,
effect execution, routes, data payloads, or host state. Executable assertions
would duplicate those owners and couple task intent to implementation.

### Write satisfaction state into Needs

Rejected. Needs owns the human outcome, not computed satisfaction. A Need must
remain valid before a product exists and after an implementation changes.

### Reuse TraceIndex

Rejected. Trace is a digest-pinned relationship cache. It excludes runtime
execution and findings.

### Extend AppGraphValidationReport

Rejected. AppGraph validation is static. Runtime outcome evidence would blur its
scope and make graph validity depend on a running product.

### Extend Surface Scenario

Rejected. Surface Scenario is preview-only simulated state. It can supply test
input but cannot become runtime evidence.

### Extend the current Conformance Suite

Rejected for version 0.1. Its closed cases test cross-runtime FEL, engine, and
Response-validation parity and require legacy-test mappings
(`schemas/conformance-suite.schema.json:28-156`). Outcome verification has a
different subject and source set.

### Use hand-authored Playwright assertions

Rejected as product truth. Playwright may implement a generic runner adapter,
but product-specific steps and expectations must remain structured case data.

## Deliberately deferred

This proposal does not add:

- a `satisfied` state or satisfaction score;
- automatic parsing of `Need.statement.done`;
- structured `criteria[]` on Needs;
- a general expression or scripting language;
- arbitrary host callbacks or plugins;
- recovery or reuse of a run ID after a crash;
- runner-authored retry or cleanup;
- durable-effect admission and durable-external evidence;
- whole-Response status or Definition Shape observations without an exact item;
- INTEGRITY observations, until a retained case exercises a named guarantee
  through its owner interface;
- browser-resource-specific observations, until a retained Response-scoped case
  exercises one through its owner interface;
- App Manifest or Trace members;
- continuous production monitoring;
- legal-sufficiency or warrant-chain semantics;
- open extension kinds before a second conforming consumer exists.

If repeated cases cannot cite a Need outcome without interpreting prose
differently, that evidence triggers a separate decision about the previously
deferred solution-neutral `criteria[]` form. This proposal does not smuggle that
decision into OBSERVABILITY.

## Required specification and implementation changes

If accepted, this proposal authorizes:

1. `schemas/outcome-verification-case.schema.json`;
2. `schemas/outcome-verification-report.schema.json`, including the closed
   `NormalizedObservation` and `ComparatorRequest` definitions;
3. `specs/observability/outcome-verification-spec.md`;
4. generated TypeScript types and schema-sync tests;
5. the pure `@formspec-org/outcome-verification` comparator;
6. generic runner, `RunnerAdmissionContext`, step-binding, and evidence-adapter
   interfaces;
7. a generic renderer semantic-control interface for exact rendered-control
   lookup, value setting, activation, and owner-produced correlation facts;
8. stable normative rule IDs for every existing specification clause cited by
   the initial cases;
9. the Experience, Needs, and AppGraph prose ownership correction;
10. v12 and unrelated-control cases plus fail-closed regressions;
11. replacement of any v12 “Need satisfied” or full-demo claim with the precise
    evidence level and report conclusion it earned;
12. a closed deterministic selection policy for non-draft Definition Response
    Data Sources and a preview/test-only generic store that exercises it.
13. a caller-paired semantic-output registry through which mounted renderers
    publish only their current committed output.

No App Manifest, TraceIndex, Core processing, product-specific renderer
behavior, or end-user authoring UI change is authorized by this proposal.

## Decision bar

Accept this proposal only if all of the following remain true:

- every product-specific step and expectation is structured data;
- the same generic runner evaluates an unrelated control;
- each expected observation cites all authoritative declarations and versioned
  rules needed for its conclusion;
- every executable step requires separate caller admission;
- each observed fact retains its owner, exact evidence class, bounded time, and
  runner-derived causal binding;
- the portable evidence and comparison unions remain closed;
- missing, ambiguous, unsupported, and stale evidence fail closed;
- reports never claim Need satisfaction;
- a demo claim names the exact app, target build, evidence profile, complete
  caller-required case set, and human review bound to that whole context;
- release claims remain outside version 0.1;
- the new package does not absorb AppGraph, runtime, renderer, or action
  authority.

Under those conditions, outcome verification closes the v12 proof gap without
turning Needs into test scripts or Experience into a workflow engine.

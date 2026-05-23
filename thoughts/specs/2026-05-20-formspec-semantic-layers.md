# Formspec Semantic Layers

**Date:** 2026-05-20
**Status:** Concept architecture note and formalization handoff. Not normative.
**Supersedes:** [`2026-05-19-ui-schema.md`](./2026-05-19-ui-schema.md)
**Short names:** Experience, Response Actions, Trace
**Target output:** W3C-style companion specs under [`../../specs`](../../specs), then JSON Schemas under [`../../schemas`](../../schemas), with examples, conformance fixtures, generated-type impacts, and migration notes.

---

## 1. How To Use This Note

This note is a handoff prompt for turning the semantic-layer direction into formal Formspec specifications and schemas.

It does not define final wire shapes. It defines the goal, the current boundaries, the names of the missing artifacts, and the promotion gates that must be satisfied before any schema lands.

The intended follow-on work is:

```text
concept architecture note
  -> W3C-style prose specs in formspec/specs
  -> JSON Schemas in formspec/schemas
  -> examples, conformance fixtures, generated types, and migration notes
```

Do not treat the layer names as approval to invent behavior in schemas first. Each schema must follow a prose spec that explains ownership, processing behavior, validation behavior, and compatibility with current Formspec artifacts.

---

## 2. Thesis

Formspec already separates model, presentation, translation, mapping, references, and semantic metadata. That split works when a human authors each UI. It is not enough when Formspec must generate, regenerate, review, and run UI from semantic source across web, mobile, PDF, CLI, agent-assisted, and prototype outputs.

This note adds three additive layers:

```text
Experience        makes UI derivable
Response Actions  makes form actions portable
Trace             makes generated UI explainable
```

The direction is sound, but it is not yet a shippable architecture. The hard work lives in the companion specs: validation mapping, action execution, Component regeneration, ActionButton binding, Intake Handoff boundaries, and Trace predicates.

The layers must not replace Definition, Component, Theme, Locale, Mapping, References, Ontology, Intake Handoff, or Respondent Ledger. They name missing seams around those artifacts so generators and reviewers can reason about UI without weakening the executable model.

---

## 3. Current Anchors To Preserve

Formal work must preserve these current facts unless a later normative spec explicitly changes them.

| Area | Current anchor | Why it matters |
|---|---|---|
| Definition | Owns item structure, binds, relevance, requiredness, readonly state, calculations, validation shapes, repeat semantics, non-relevant behavior, and response compatibility | New layers must not move executable behavior out of Definition |
| ValidationReport | Point-in-time output of validation against a Response; `valid` is true only when there are zero error-level findings | Response Actions can request validation, but Definition and Core own the meaning |
| Validation severity | `error`, `warning`, and `info`; only `error` blocks transition to completed Response | Warning-only submissions remain valid |
| Core validation mode | Global modes are `continuous`, `deferred`, and `disabled` | Response Actions must not reuse those words with different meanings |
| Shape timing | Per-shape timing is `continuous`, `submit`, or `demand` | Action intent is not the same thing as shape timing |
| Response status | `in-progress` may contain validation errors; `completed` must not contain error-level validation results | Draft save and final completion have different blocking rules |
| Component `ActionButton` | Trigger with no `bind`; invokes a required `actionRef` whose resolved Action owns validation and host-event policy | Response Actions must provide the action document that makes triggers executable |
| Component `ValidationSummary` | Reads live validation state or latest `formspec-submit` detail | New validation vocabulary must not break existing validation UI |
| Locale | Owns strings and fallback only, including `$component.<nodeId>.<property>` keys | Experience and Component may provide stable IDs, but Locale owns string values |
| Mapping | Owns response-to-external-payload transformation | Response Actions may reference mappings but must not inline their rules |
| Intake Handoff | Boundary artifact that carries validated intake evidence to a workflow or case host | Formspec does not create or advance governed cases |
| Respondent Ledger | Optional response-scoped material history, not a workflow case ledger | Response Actions may request ledger events but do not own ledger semantics |
| Trace | Canonical v1 draft exists at `specs/trace/trace-spec.md` with schema and conformance fixtures | This concept note is design intent only; Trace conformance comes from the Trace spec, schema, and fixtures |

These anchors are the strongest signals from the current stack. If a companion spec appears to contradict one of them, stop and resolve the ownership issue before adding schema.

---

## 4. Layer Stack

| Concern | Artifact | Status | Role |
|---|---|---|---|
| Domain model | Definition + Registry + Ontology | Existing | Data shape, behavior, vocabulary, and concept metadata |
| Localization | Locale | Existing | Display strings and fallback only |
| Task intent | Experience | New | Actors, tasks, abstract units, and context of use |
| Form action orchestration | Response Actions | New | Form-scoped action intent, preconditions, validation triggers, ordered effect requests, and failure posture |
| Concrete UI | Component + Theme | Existing | Component tree, widget selection, layout, visual tokens |
| Boundary translation | Mapping + Intake Handoff | Existing | External payload mapping and evidence-bound handoff records |
| Response history | Respondent Ledger | Existing add-on | Response-scoped durable history and material checkpoints |
| Relationship index | Trace | New | Generated index over source artifacts and projections |
| Final UI | Renderer output | Runtime | HTML, React, PDF, mobile, CLI, agent, or other projections |

The primary generation path is:

```text
Definition + Experience + Response Actions
  -> Component draft
  -> renderer output
```

Locale resolves strings at render time. Mapping, Intake Handoff, and Respondent Ledger participate only when an action requests payload mapping, handoff assembly, or durable evidence. Trace is not in the rendering path.

---

## 5. Design Rules

### 5.1 Keep Additions Additive

New layers project from existing source artifacts. They do not write into Definition, change Definition behavior, override Component or Theme, redefine Locale strings, inline Mapping rules, replace Intake Handoff, or replace Respondent Ledger semantics.

### 5.2 Separate Ownership From Reference

A layer may reference another artifact without owning it. Response Actions may reference a Mapping, request a ValidationReport, request a Respondent Ledger event, or assemble an Intake Handoff. It does not own the body schema or durable semantics of those artifacts.

### 5.3 Treat Formal Specs As Runtime Contracts

Experience may be mostly structural. Response Actions is not. A Response Actions schema without an invocation model, validation mapping, effect taxonomy, idempotency posture, and failure/deferred behavior would create a second informal runtime.

The companion specs must define enough processing behavior for independent implementations to agree on outcomes. That means conformance fixtures, not just JSON Schema.

### 5.4 Be Honest About Authored And Generated Artifacts

Experience and Response Actions are authored source artifacts. Component documents may be hand-authored, generated, or generated and then edited. Trace is generated from source artifacts and projections. A materialized Trace is a cache, not a source of truth.

### 5.5 Mark Promotion State Clearly

This note names Component reference fields such as `unitRef`, `taskRefs`, `actionRef`, `conceptRefs`, and `x-generation`. `actionRef` on `ActionButton` is current Component schema after the Component Action References plan. `unitRef`, `taskRefs`, `conceptRefs`, and `x-generation` are current additive Component metadata after the Component Reference Fields follow-up. Regeneration merge behavior remains separate.

### 5.6 Promote By Bundles

The architecture has many artifacts. The authoring experience must not expose that complexity as a tax on simple forms. Formal work should define minimum viable bundles that let an author or generator create a useful form without hand-authoring every layer.

---

## 6. Layer Ownership

### 6.1 Definition

Definition remains the executable form model. It owns item structure, binds, relevance, requiredness, calculations, validation shapes, repeat semantics, response version compatibility, and non-relevant behavior.

New layers must not move validation logic, calculation logic, data pruning, or response shape rules out of Definition.

### 6.2 Experience

Experience owns abstract task intent.

Conceptual contents:

```text
target Definition
applicability       (actor, platform, locale, posture, channel, or other context)
actors
tasks
units
typed references to items, concepts, and actions
```

An Experience unit groups item references, concept references, action references, and accessibility intent under a task. A unit describes what the user is trying to do, not how a renderer should draw it.

Experience must not specify:

- concrete layout,
- widget choice,
- validation rules,
- calculation rules,
- submission payloads,
- durable ledger events,
- host workflow implementation.

Definition groups and Experience units are different. Definition groups describe data structure, such as `household.members[]`. Experience units describe task intent, such as `identify applicant` or `review household eligibility`. Sometimes they align. Often they do not.

The Experience companion spec should explain how tools seed units from existing Definition structure without pretending the two concepts are the same. It should also define coverage expectations: a generated experience should make it possible to detect required visible items that no unit covers.

Candidate `unit.kind` values should stay task-oriented. Names such as `data-entry`, `review`, `confirmation`, `evidence-collection`, `attestation`, `assistance`, and `error-resolution` are acceptable only if the formal spec keeps them abstract. Concrete defaults such as cards, panels, upload widgets, chat panes, and signature widgets belong to generator profiles and Component.

### 6.3 Response Actions

Response Actions owns form-scoped action orchestration before the WOS Intake Handoff acceptance seam.

It may own:

```text
action identity
actor and intent labels
FEL preconditions
action intent              (save draft, autosave, review, submit, request evidence, etc.)
validation trigger profile
blocking policy
persistence policy
ordered effect requests
submission references
evidence requests
transient host event names
idempotency and retry requirements for external or durable effects
```

It must not own:

- Definition behavior,
- Mapping body shapes,
- ValidationReport body shape,
- Respondent Ledger event semantics,
- Intake Handoff body shape,
- WOS acceptance policy,
- governed case identity,
- case lifecycle events,
- host application event systems.

Response Actions can say, "this action requests an Intake Handoff after validation and evidence production succeed." It cannot say, "this action creates a governed case." WOS or another workflow host owns intake acceptance, rejection, deferral, governed case identity, and case lifecycle events.

Response Actions is the highest-risk layer because it is a runtime contract. The companion spec must define action invocation state, effect ordering, failure and deferred outcomes, idempotency keys or replay posture, and the difference between host-local events and durable effects.

### 6.4 Response Action Execution

Response Actions needs an ordered execution contract, not a fictional global rollback transaction.

A conforming action should follow this conceptual shape:

```text
begin action invocation
  evaluate preconditions
  run the requested validation profile
  stop before blocking effects if blocking validation fails
  invoke effects in declared order
  use idempotency or replay keys for durable and external effects
  request or assemble artifacts under their owning specs
  return completed, failed, or deferred
end invocation
```

The UI must not report success when a required effect failed silently. Durable effects must use idempotency, replay, explicit failure, or compensation. They must not rely on an implementation pretending it can roll back a ledger append, external call, or workflow-host acceptance decision.

Draft persistence must not be blocked merely because the Response has validation errors. Submission or completion may block on error-level validation.

### 6.5 Validation Terminology

Response Actions must not invent a second validation model by calling `save`, `submit`, `demand`, and `autosave` validation modes.

The formal spec must separate these axes:

| Axis | Examples | Existing anchor |
|---|---|---|
| Action intent | save draft, autosave, review, submit, request evidence | New Response Actions vocabulary |
| Validation timing/profile | continuous, deferred, disabled, submit, demand, or named profiles that map to those terms | Core global mode and per-shape timing |
| Blocking policy | non-blocking, block on error-level findings | Core severity and Response status semantics |
| Persistence policy | no persistence, draft checkpoint, completed Response | Response lifecycle semantics |

The Response Actions companion spec includes a mapping table before its schema lands through the Validation Mapping companion. Its fixtures cover invalid draft save, submit blocked by error-level findings, warning-only submit allowed, demand-shape invocation, and disabled/no-validation behavior.

### 6.6 ActionButton Binding

Current Component now has `ActionButton`. It invokes a required `actionRef`; the resolved Response Action carries validation profile, blocking policy, persistence policy, and host-event effects.

There is no default-submit fallback. A trigger without a resolvable Action is an authoring or host-configuration error:

```text
An ActionButton actionRef must resolve to actions[*].id in the loaded Response Actions document.
```

The Component schema permits `actionRef` only on `ActionButton`. Component Reference Fields add `unitRef`, `taskRefs`, `conceptRefs`, and `x-generation` as additive metadata on Component nodes.

Validation summaries continue to read latest `formspec-submit` details when a resolved Action declares a `hostEvent` effect for that event.

### 6.7 Component And Theme

Component owns the concrete UI tree, widget selection, layout, and item binding. Theme owns visual tokens, density, spacing, typography, color, and presentation defaults.

Component reference metadata now includes:

```text
unitRef       -> Experience unit realized by a node
taskRefs      -> Experience tasks supported by a node
actionRef     -> Response Action invoked by an ActionButton
conceptRefs   -> Registry or Ontology concepts represented by a node
x-generation  -> generation metadata, source anchors, and generated markers
```

Those fields are references or generation metadata. They do not let Component override Definition, Experience, or Response Actions.

### 6.8 Locale

Locale remains a first-class sidecar. It controls display strings only. It must not alter data collection, validation, item structure, binds, option values, page membership, Component behavior, or Response Action behavior.

Experience may carry locale applicability. Component nodes may have stable IDs that Locale uses for `$component.<nodeId>.<prop>` string keys. Locale still owns the string values.

### 6.9 Mapping And Intake Handoff

Mapping owns response-to-external-payload transformation. Response Actions references Mapping by handle and never inlines Mapping rules.

Intake Handoff owns the boundary record that transfers validated intake evidence to a workflow or case host. It binds the pinned Definition, canonical Response, response hash, ValidationReport reference, intake session, and respondent-ledger evidence. Response Actions may request or assemble this artifact. It does not own WOS acceptance or governed case creation.

The Response Actions companion spec should include at least one cross-spec fixture that proves the seam:

```text
Response Actions invocation
  -> Response snapshot
  -> ValidationReport snapshot
  -> Respondent Ledger boundary event or head reference
  -> Intake Handoff document
  -> workflow-host accepted, rejected, or deferred outcome
```

That fixture must not include a Formspec-authored `case.created` event.

### 6.10 References

References attaches external resources to Formspec targets: policy, documentation, regulation, examples, tools, vector stores, or human and agent help.

References is metadata. It must not affect data capture, validation, or the processing model.

### 6.11 Respondent Ledger

Respondent Ledger records material respondent-side history for a Response. It is response-scoped history, not a workflow case ledger.

Response Actions may request ledger records at material boundaries such as draft save, submit attempt, response completion, attachment changes, or validation snapshots. Respondent Ledger owns the event taxonomy, materiality rules, integrity profile, and durable append semantics.

### 6.12 Trace

Trace is a generated relationship index over Formspec source artifacts and projections. It is not part of the rendering pipeline. It helps tools explain, review, compare, and audit generated UI.

Trace may answer questions such as:

```text
Which Component node renders which item?
Which Experience unit collects which item?
Which Response Action runs which submission?
Which Mapping exports which response path?
Which Reference explains which target?
Which Respondent Ledger event corresponds to which action boundary?
```

Trace is generated from source artifacts and projections. A materialized Trace must carry input digests and must be rejected as stale when any input digest changes.

Trace does not yet verify cross-projection consistency by itself. Verification requires a formal predicate set, query model, source set, and named consumer.

The first Trace consumer should be concrete. The best seed consumer is Studio regeneration review: after Definition, Experience, or Response Actions changes, Studio needs to show which Component nodes changed, which designer edits survived, which nodes became orphaned, and which required items lack coverage.

---

## 7. Component Derivation And Regeneration

Component drafts may derive from `Definition + Experience + Response Actions`.

The derivation contract is:

```text
source semantic artifacts
  -> generated Component draft
  -> designer or developer edits
  -> renderer output
```

Hand-authored Component documents remain valid. A generator is a tool, not the only authoring path.

### 7.1 Unit Kind Drives Defaults, Not Layout Law

An Experience unit's `kind` can guide a generator. It should not bind a unit to one Component pattern.

For example:

```text
data-entry          -> likely field collection
review              -> likely read-only summary
confirmation        -> likely affirmation and final action
evidence-collection -> likely attachment or evidence flow
attestation         -> likely certification or signature flow
error-resolution    -> likely validation repair flow
assistance          -> likely help or agent-assist flow
```

The words after `->` describe generator defaults, not normative bindings. Theme, platform, context of use, and generator profile decide whether the final Component uses a card, page, step, panel, modal, CLI prompt, or other pattern.

### 7.2 Regeneration Is A Product Contract

Regeneration is not a cleanup feature. It is the product contract that makes derivable UI credible.

When Definition, Experience, or Response Actions changes, regeneration should merge:

```text
old generated Component
+ designer-edited Component
+ new generated Component
+ optional Trace impact map
= merged Component draft
```

The formal Component reference-additions or generation companion spec must define enough machinery for that merge:

```text
source anchors
generated-node markers
designer-edit detection or preservation rules
conflict severities
orphan handling
rename and migration handling
review UX expectations for unresolved conflicts
```

Baseline merge rules:

```text
Preserve designer edits when their source anchors still resolve.
Regenerate nodes whose itemRef, actionRef, or unitRef changed.
Mark orphaned nodes when their bind, actionRef, or unitRef no longer resolves.
Add newly generated fields and actions as pending review.
Never silently delete designer-authored layout.
```

If Definition renames `dateOfBirth` to `birthDate` through a proper migration or changelog, a generator may update the binding and preserve presentation choices. If no migration explains the rename, the generator should warn instead of guessing.

### 7.3 Reference-Field Example

The following shape illustrates the current reference model after the Component Reference Fields follow-up. `ActionButton.actionRef` remains owned by Component §5.19. `unitRef`, `taskRefs`, `conceptRefs`, and `x-generation` are additive Component metadata; they do not change rendering, validation, or Response semantics.

```json
{
  "$formspecComponent": "1.1",
  "version": "1.0.0",
  "targetDefinition": {
    "url": "https://example.gov/forms/intake",
    "compatibleVersions": ">=1.0.0 <2.0.0"
  },
  "tree": {
    "id": "identitySection",
    "component": "Section",
    "unitRef": "identity",
    "taskRefs": ["identifyApplicant"],
    "x-generation": {
      "source": "experience:identity",
      "strategy": "unit-to-section",
      "generatedBy": "formspec-wireframe-generator@0.1.0",
      "anchors": ["item:applicantName", "item:dateOfBirth", "unit:identity"]
    },
    "children": [
      {
        "id": "applicantNameInput",
        "component": "TextInput",
        "bind": "applicantName",
        "unitRef": "identity"
      },
      {
        "id": "dateOfBirthInput",
        "component": "DatePicker",
        "bind": "dateOfBirth",
        "unitRef": "identity"
      },
      {
        "id": "submitApplication",
        "component": "ActionButton",
        "actionRef": "submitApplication"
      }
    ]
  }
}
```

Current Component examples may include reference fields when they target the Component Reference Fields contract. New examples that demonstrate those fields should use `$formspecComponent: "1.1"`. Action triggers should use `ActionButton.actionRef`.

---

## 8. Minimum Viable Bundle

The first implementation should prove the smallest bundle that exercises the seams without requiring the whole architecture.

Minimum useful bundle:

```text
Definition
Experience with at least one task and unit
Response Actions with one named submit action
generated Component draft
ActionButton path with required actionRef
ValidationReport fixture
optional Respondent Ledger event or head reference
optional Intake Handoff fixture for submit
Trace or trace-like impact map for Studio regeneration review
```

The bundle should prove these claims:

1. A generator can derive a Component draft from semantic source.
2. A designer can edit the Component draft without losing all edits on regeneration.
3. A submit trigger can use `ActionButton.actionRef` to invoke a submit Response Action.
4. Invalid draft save is allowed.
5. Error-level validation blocks completion.
6. Warning-only validation does not block completion.
7. Intake Handoff remains a boundary artifact, not a case creation event.
8. Trace or a trace-like impact map can explain which source artifacts affected which Component nodes.

This bundle is the practical test for the architecture. If the bundle cannot be implemented cleanly, do not expand the layer set.

### 8.1 Verified Coverage (2026-05-22)

The eight MVB claims above are proven distributively by the existing fixture corpus. No omnibus MVB fixture is required; per-spec fixtures cover the claims.

| Claim | Fixture |
|---|---|
| 1. A generator can derive a Component draft from semantic source | `tests/conformance/fixtures/component-reference-fields/x-generation-anchors-coverage.json` |
| 2. A designer can edit the Component draft without losing all edits on regeneration | `tests/conformance/fixtures/regeneration-merge/designer-only-property/`, `designer-precedes/` |
| 3. A submit trigger can use `ActionButton.actionRef` to invoke a submit Response Action | `tests/conformance/fixtures/component-reference-fields/component-all-refs-resolved.json` |
| 4. Invalid draft save is allowed | `tests/conformance/fixtures/validation-mapping/intent-save-draft.json` |
| 5. Error-level validation blocks completion | `tests/conformance/fixtures/validation-mapping/intent-submit-blocked.json` |
| 6. Warning-only validation does not block completion | `tests/conformance/fixtures/validation-mapping/intent-submit-warning-only.json` |
| 7. Intake Handoff remains a boundary artifact, not a case creation event | `tests/conformance/fixtures/response-actions/cross-spec-intake-handoff-seam.json` (expects `caseCreatedEventEmitted: false`) |
| 8. Trace or a trace-like impact map can explain which source artifacts affected which Component nodes | `tests/conformance/fixtures/trace/{experience-hierarchy,fel-dependency-chain,ontology-concepts}/` |

Coverage status: **complete**.

---

## 9. Promotion Gates

Treat these as gates for formalization. They are not implementation details to defer until after schema.

| Gate | Formal work must establish | Stop if |
|---|---|---|
| Experience shape | Actors, tasks, units, applicability, typed references, abstract `unit.kind`, coverage expectations, and seed-from-Definition guidance | Units become layout containers or required fields can disappear from generated experiences without detection |
| Response Actions runtime | Invocation state, preconditions, validation profile mapping, blocking policy, persistence policy, effect ordering, failure/deferred outcomes, and idempotency posture | The spec only defines JSON properties and leaves processors to invent behavior |
| Validation mapping | One table that reconciles action intent, Core global modes, per-shape timing, `ValidationSummary.source`, severity, and Response status transitions | A new `save/submit/demand/autosave` validation vocabulary ships without mapping to Core and Component |
| ActionButton binding | Required `actionRef`, no widget-local validation or event policy, inert unresolved triggers, examples, adapters, and validation-summary behavior | Action triggers can execute without a resolved Response Action or silently fall back to a default |
| Regeneration merge | Source anchors, generated markers, designer-edit preservation, conflict severities, orphan statuses, rename handling, and review UX expectations | The spec says "merge" but cannot explain how edits survive or how conflicts surface |
| Intake Handoff seam | Cross-spec fixture with Response, ValidationReport, Respondent Ledger evidence, Intake Handoff, and workflow-host outcome | Formspec emits governed case lifecycle events or conflates handoff payload with host acceptance envelope |
| Trace consumer | Named first consumer, minimal predicates, input digest model, stale rejection, orphan status, and required-item coverage checks | Trace remains an abstract cache with no consumer or is treated as authored truth |
| Authoring bundle | Greenfield defaults and migration path that hide layer count from basic authors | A useful generated UI requires hand-authoring every artifact |

---

## 10. Follow-On Spec Order

Formalize in this order:

1. **Experience companion spec.** Define actor, task, unit, applicability, typed references, the `unit.kind` registry, coverage expectations, seed-from-Definition guidance, and the minimum authoring bundle. **Landed:** [`specs/experience/experience-spec.md`](../../specs/experience/experience-spec.md) (draft, 2026-05-21).
2. **Response Actions companion spec.** Define action identity, FEL precondition context, action intent, validation trigger mapping, blocking policy, persistence policy, effect requests, host event boundaries, idempotency, retry, failure, and deferred behavior. **Landed:** [`specs/response-actions/response-actions-spec.md`](../../specs/response-actions/response-actions-spec.md) (draft, 2026-05-22).
3. **Validation mapping appendix or shared section.** Reconcile Core global modes, per-shape timing, `ValidationSummary.source`, ValidationReport severity, and Response status transitions before Response Actions schema lands. **Landed:** [`specs/core/validation-mapping.md`](../../specs/core/validation-mapping.md) (draft, 2026-05-22).
4. **ActionButton binding and Component reference additions.** Require `ActionButton.actionRef`, remove widget-local validation/event policy, and add `unitRef`, `taskRefs`, `conceptRefs`, and generation metadata as additive Component node metadata. **Fully landed:** [`specs/component/component-spec.md §5.19`](../../specs/component/component-spec.md) (2026-05-22, via [Component Action References plan](../plans/2026-05-22-component-action-references.md)) and [`specs/component/component-reference-fields-spec.md`](../../specs/component/component-reference-fields-spec.md) (2026-05-22, via [Component Reference Fields plan](../plans/2026-05-22-component-reference-fields.md)).
5. **Regeneration merge and Studio review fixtures.** Define source anchors, generated markers, conflict severities, orphan handling, and review expectations. This may live with Component reference additions or as a small generation companion.
6. **Trace query/cache spec.** Use Studio authoring and regeneration review as the first consumers unless a stronger consumer appears. Define predicates, source sets, input digests, stale-cache rejection, orphan status, coverage checks, and future verification semantics. **Draft landed:** [`specs/trace/trace-spec.md`](../../specs/trace/trace-spec.md) defines the v1 source set, identity tuples, digest model, eleven edge kinds, sixteen simple predicates plus `whatDependsOn(itemPath)`, stale-cache rejection, and Studio-review composition preconditions.

Each formal spec should include normative prose, JSON Schema, examples, semantic validation rules, conformance fixtures, generated-type impacts, downstream consumer impacts, and migration notes.

Specs should land before schemas. Schemas should encode the prose contract; they should not become the place where unresolved architecture decisions hide.

---

## 11. Open Questions

### 11.1 Response Actions As Peer Or Overlay

Response Actions remains a peer artifact while it orchestrates actions. If it repeatedly needs to suppress, override, or alter Definition semantics, it must become an explicit behavioral overlay with merge rules or move into a future Definition model. **Resolved:** Response Actions is a peer artifact; see [`specs/response-actions/response-actions-spec.md §1.5`](../../specs/response-actions/response-actions-spec.md#15-peer-artifact-stance-resolves-concept-111) for overlay-promotion criteria.

### 11.2 Validation Profile Names

The formal specs need a stable way to name validation profiles without colliding with Core global modes or per-shape timing. **Resolved:** [`specs/core/validation-mapping.md`](../../specs/core/validation-mapping.md) §3 defines the closed enum `live` / `on-submit` / `on-demand` / `off`.

### 11.3 Component Reference Fields

`unitRef`, `taskRefs`, `conceptRefs`, and generation metadata should land only after Experience identities and regeneration consumers are stable. **Resolved:** `actionRef` is required on `ActionButton`; no fallback path exists. `unitRef`, `taskRefs`, `conceptRefs`, `x-generation`, the resolver invariants, the severity ladder, no-rewrite fixture coverage, and renderer-ignore evidence landed in the Component Reference Fields follow-up. Regeneration merge semantics remain separate.

### 11.4 Trace Predicate Set

Trace posture is committed. Predicate names, source-set rules, and freshness semantics are now defined by the draft Trace spec for Studio authoring and regeneration review. Query language and cross-projection verification remain deferred.

Drafting note: Trace v1 uses Definition, Experience, Response Actions, Component, and optional Ontology sources; eleven relationship edges; sixteen simple predicates plus `whatDependsOn(itemPath)`; stale-cache rejection; and a composition precondition that the chosen regeneration-review route expose a stable Component-subject handle. Do not mark this section fully resolved until the spec, schema, fixtures, and composition proof have passed the final review gates.

### 11.5 Bundle Manifest

The architecture needs an author-facing bundle concept or equivalent workflow. Without it, layer count will become an adoption blocker even if the layers are individually clean.

---

## 12. Final Direction

The three-layer direction is worth pursuing:

- **Experience** names task intent.
- **Response Actions** names form-scoped runtime action intent.
- **Trace** indexes relationships for explanation, review, and future verification.

The guardrail is ownership. Experience must not become layout. Response Actions must not become a second Definition, validator, workflow engine, or case engine. Trace must not become authored truth.

The goal of the follow-on work is not to make the stack look more abstract. The goal is to let Formspec produce UI that is derivable, executable, regenerable, and explainable while preserving the model boundaries that already work.

If the companion specs keep those boundaries and pass the promotion gates above, this concept can become formal Formspec specs and schemas. If they cannot, the architecture should stay a concept note rather than hardening into incompatible artifacts.

# Formspec Semantic Layers

**Date:** 2026-05-20
**Status:** Conceptual architecture note (provisional v0)
**Supersedes:** [`2026-05-19-ui-schema.md`](./2026-05-19-ui-schema.md)
**Short names:** Experience, Response Actions, Trace
**Scope:** Names the semantic layers that sit beside Definition. Establishes ownership, seams, and naming for Experience, Response Actions, and Trace. Not a normative companion spec; the follow-on specs ratify the details (§12).

---

# 1. Thesis

Formspec already carries part of an XForms-derived spine: Definition holds the declarative model — items, binds, computed values, relevance, requiredness, readonly state, constraints, shapes, repeats, non-relevant behavior, validation reports. Component and Theme realize the view; Mapping handles the boundary. That spine is sufficient when someone hand-builds UI for each Definition. It is not sufficient when the goal is for UI to be *generated* from semantic source — wireframes, prototypes, production renderings, accessible alternatives, multi-output projections (web, mobile, PDF, agent-assisted, CLI), and AI authoring all projecting from one structured intent.

Three engineering traditions inform the missing layers, each contributing a distinct capability:

- **XForms gives runtime-operation semantics.** Actions, submissions, validation modes, lifecycle policy, transaction semantics — declarative runtime operations over a reactive data model. Formspec already absorbed the XForms *model* side (Definition); the *runtime-operations* side is what Response Actions adds. Without it, buttons are UI objects and host-app code secretly owns the real behavior — the drift Formspec exists to eliminate.
- **UsiXML / CAMELEON gives the derivation ladder.** It separates domain / concept from task from abstract UI from concrete UI from final renderer — so the same intent can project to multiple final UIs without losing meaning.
- **XIML gives the relationship index.** A generated graph over the artifacts that makes the result explainable, reviewable, regenerable on source changes, auditable, AI-safe, and impact-aware.

Formspec absorbs those lessons as three additions beside Definition / Component / Theme / Mapping / References. Each new layer maps cleanly to one tradition:

```text
Experience       makes UI derivable      ← UsiXML / CAMELEON
Response Actions makes UI executable     ← XForms (runtime operations)
Trace            makes UI explainable    ← XIML
```

- **Experience** — abstract task intent. Actors, tasks, units; item / action / concept references. The "abstract UI" rung of the ladder.
- **Response Actions** — runtime operations layer: actions, submissions, validation modes, lifecycle policy, transaction semantics. Up to and including Intake Handoff.
- **Trace** — generated relationship index across artifacts. Not part of the rendering pipeline; required when generated UI must be trustworthy.

Three properties keep the additions safe:

1. **Additive.** New layers project *from* Definition, never *into* it. They cannot modify Definition semantics, override Component or Theme, or redefine Mapping.
2. **Single-ownership.** Each fact has one owner. No layer duplicates a fact owned elsewhere.
3. **Generated, not authored.** Component drafts derive from sources via the rendering pipeline; Trace is generated from the result and its sources. Source artifacts win on conflict.

This note specifies the layers, their ownership, their seams, and the open questions that gate formal-spec ratification.

---

# 2. Semantic Layer Stack

Formspec's existing artifacts already implement most of the CAMELEON ladder; the new layers fill the missing rungs.

```text
Domain / Concept       → Definition + Registry + Ontology
Task                   → Experience.tasks
Abstract UI            → Experience.units   (unit.kind drives generation default)
Concrete UI            → Component + Theme
Final UI               → renderer output    (HTML, React, PDF, mobile, agent, CLI)

Orchestration          → Response Actions   (cross-cuts the ladder at runtime)
Boundary translation   → Mapping
Resource binding       → References         (external resources attached to artifacts)
Relationship index     → Trace               (generated index over the ladder)
```

The rendering pipeline is `Definition + Experience + Response Actions → Component → final UI`. The same Experience can project to multiple final UIs. Intent is the durable source; final UIs are projections. Each rung has one owner and refers to but does not override adjacent rungs.

---

# 3. Layer Ownership

## 3.1 Definition (existing)

Executable form model. Owns fields, items, binds, relevance, requiredness, calculations, validation shapes, versioning, and structured validation results. Definition is authoritative; new layers do not modify it.

## 3.2 Experience (new)

Abstract task intent. Conceptual contents:

```text
target Definition
applicability       (context of use: actor, platform, locale, posture, etc.)
actors
tasks
units               (abstract interaction units)
```

A unit groups items, concept references, action references, and accessibility intent under a task. The `kind` field on a unit signals abstract intent and drives default Component patterns under derivation (§5). Initial registered values include `data-entry`, `review`, `confirmation`, `evidence-upload`, `signature`, `agent-assist`, `error-resolution` — the closed enum lands in the formal Experience companion spec.

Experience MUST NOT specify concrete layout, widget choice, validation rules, calculation rules, submission payloads, durable events, or host-specific workflow implementation. Those facts belong to Component, Definition, Mapping, Respondent Ledger, or the consuming application.

Experience and Definition groups are not the same thing. Definition groups describe data structure (`household.members[]`, `budget.lineItems[]`). Experience units describe user intent (`identify applicant`, `review household eligibility`). Sometimes they line up. Often they do not. The separation prevents the data tree from becoming the UX tree, the workflow tree, and the layout tree all at once.

Context of use sits inside Experience: a public-web experience, a caseworker-assisted experience, a mobile-offline experience, and a kiosk experience can share one Definition while differing in tasks, units, actors, and applicability. The data model stays stable; the experience changes.

## 3.3 Response Actions (new)

Runtime operations layer on the Formspec side of the Intake Handoff seam ([ADR 0073](../../../thoughts/adr/0073-stack-case-initiation-and-intake-handoff.md) D-3). Adds the XForms-derived runtime layer that Formspec's existing model (Definition) doesn't carry: **actions, submissions, validation modes, lifecycle policy, transaction semantics**. Without Response Actions, buttons are UI objects and host-app code secretly owns the real runtime behavior — drift that Formspec exists to eliminate.

Owns:

```text
action identity, intent, and actor
action preconditions       (FEL expressions per ADR 0075)
validation modes           (closed enum: save / submit / demand / autosave)
effects                    (runSubmission, recordLedgerEvent, …)
submission policy          (payload via mappingRef; outputs via artifact references)
lifecycle policy           (which events emit transiently vs record durably)
transaction semantics      (preconditions → validation → effects → evidence → commit)
production of Intake Handoff payloads
```

Response Actions MUST NOT:

- Redefine the body shapes of artifacts owned by other specs. Mapping owns payload transformation; Respondent Ledger owns event semantics; Intake Handoff owns the boundary contract. Response Actions references them by handle.
- Absorb workflow or case-lifecycle authority. The corresponding post-handoff surface is [WOS Kernel `acceptIntakeHandoff` (§11.3 Instance Operations + §11.4 Intake Acceptance)](../../../work-spec/specs/kernel/spec.md#113-instance-operations), which validates the handoff (algorithm §11.4.1) and emits `intakeAccepted / intakeRejected / intakeDeferred` (outcomes §11.4.3). The two seams never overlap on the same lifecycle moment.
- Author host-app event semantics. The host owns its own event system. Response Actions emits transient lifecycle events for the host to consume, and requests durable events from Respondent Ledger.

The seam:

```text
Response Actions
  owns: edit response, validate response, save draft, submit response,
        request local evidence, produce Intake Handoff

WOS Kernel Instance Operations
  owns: create workflow instance, accept intake handoff, process events,
        advance time, migrate, suspend, resume, terminate
```

FEL drives action preconditions as the cross-stack predicate language by [ADR 0075](../../../thoughts/adr/0075-rejection-register.md) I-2; no second expression language is introduced.

### 3.3.1 Provisional v0 shape

The schema sketches below are **illustrative** — they show the shape of an action / submission / lifecycle declaration without committing to closed property names, the full effect-type contract, `actor` / `intent` semantics, FEL precondition evaluation context, or rollback discipline. The formal Response Actions companion spec (§12) ratifies the closed enums, schemas, conformance fixtures, host-app interaction contract, and rollback semantics. Implementers should not treat the names below as a normative interface.

An action declaration:

```json
{
  "submitApplication": {
    "label": "Submit application",
    "actor": "respondent",
    "intent": "finalize_response",
    "validation": "submit",
    "preconditions": [
      "valid(#)",
      "$certificationAccepted = true"
    ],
    "effects": [
      { "type": "runSubmission", "submission": "finalApplication" },
      { "type": "recordLedgerEvent", "eventType": "response.completed" }
    ]
  }
}
```

A submission (referenced from an action's `effects`):

```json
{
  "finalApplication": {
    "payload": {
      "type": "mapping",
      "mappingRef": "https://example.gov/mappings/intake-to-case|1.0.0"
    },
    "validation": "submit",
    "outputs": [
      { "type": "validationReport" },
      { "type": "intakeHandoff", "initiationMode": "publicIntake" }
    ]
  }
}
```

Lifecycle policy (which runtime events emit transiently vs record durably to Respondent Ledger):

```json
{
  "lifecycle": {
    "emit":   ["action.started", "action.completed", "action.failed", "submission.completed"],
    "record": ["draft.saved", "response.completed"]
  }
}
```

Validation modes (closed enum at v0):

```text
save       → continuous validation; non-blocking
submit     → submit validation; blocks effects if invalid
demand     → on-demand validation; user-initiated review
autosave   → no blocking validation; record changes asynchronously
```

### 3.3.2 Transaction semantics

Every action runs as one transaction:

```text
begin action
  check preconditions
  run validation (per mode)
  apply effects in declared order (abort if validation failed and mode is blocking)
  produce evidence artifacts (ValidationReport, IntakeHandoff, …)
  record durable events (Respondent Ledger)
commit (or rollback on failure)
```

A UI MUST NOT observe state where preconditions passed but effects failed silently. The transaction boundary is part of the spec, not engine-private. This prevents half-applied UI behavior that has historically been the source of drift between hand-built form UIs and their underlying data models.

## 3.4 Component (existing + additions)

Concrete UI tree, widget selection, layout, item binding. Adds reference fields for traceability:

```text
unitRef       → the Experience unit this node realizes
taskRefs      → the Experience tasks this node supports
actionRef     → the Response Action this trigger invokes
conceptRefs   → the Registry / Ontology concepts this node represents
```

## 3.5 Theme (existing)

Visual tokens, density, spacing, typography, color, and presentation defaults.

## 3.6 Mapping (existing)

Response-to-external-payload transformation. Referenced from Response Actions, never inlined.

## 3.7 References (existing)

Supporting external resources — policy, documentation, regulation, examples, tools, vector stores, agent / human help. Resource bindings to targets; metadata that does not affect processing. Distinct from Trace (§3.8 and §6): References attaches external resources *to* artifacts; Trace indexes structural relationships *between* artifacts.

## 3.8 Trace (new)

Generated relationship index over Formspec artifacts. Not part of the rendering pipeline. Indexes structural relationships so that generated UI can be explained, reviewed against the semantic model, regenerated safely on source changes, audited, AI-reviewed, and verified consistent across output projections. See §6.

---

# 5. Component Derivation

Component drafts derive from `Definition + Experience + Response Actions`. The derivation is the spec contract; how it runs is implementation.

## 5.1 Unit kind drives generation default

The `kind` field on an Experience unit signals abstract intent. Registered initial defaults (the closed enum lands in the formal Experience companion spec):

```text
data-entry         → form section / card with field group + actions
review             → summary panel (read-only projection)
confirmation       → affirmation block + final action row
evidence-upload    → upload-focused panel with progress
signature          → certification / signature widget
error-resolution   → validation-repair flow
agent-assist       → chat / help panel
```

These are registered defaults, not normative bindings. The mapping from `unit.kind` to Component patterns is the *generator's* concern; Theme and context of use influence the choice. The same unit can become a Card on web, a wizard step on mobile, an Upload panel on a kiosk, or a chat sequence in an agent flow — different concrete projections of one abstract intent.

## 5.2 Implementations

The derivation is implementation-agnostic:

- A **generator tool** emits Component drafts from sources and optionally records provenance metadata (`generation.source`, `generation.strategy`, `generation.generatedBy`). `generation.strategy` is a registered enumeration governed under §9.1 — initial entries include `unit-to-card`, `unit-to-page`, `unit-to-step`, `unit-to-panel`. New strategies arrive through Registry-style `x-` extensions, not freeform strings.
- **AI authoring** proposes Experience units, Component drafts, action labels, and reference bindings as structured artifacts validated against the same derivation rules. The intermediate validation layers — task, unit, Component — narrow the blast radius of AI generation. The AI is not freehanding UI code; it is proposing artifacts at named levels of abstraction.
- **Hand-authoring** is also valid; the rendering pipeline does not require any particular tool produce the Component.

The same Experience can project to multiple final UIs — web, mobile, PDF, agent-assisted, CLI. Each projection is a different concrete Component tree derived from the same abstract Experience. Trace (§6) verifies projections are consistent.

Because Response Actions declares runtime behavior (§3.3), a generated wireframe is more than a static picture — it can be a **clickable semantic prototype**: buttons disabled until preconditions evaluate true, submit opening a validation summary on failure with errors anchored to offending items, evidence preview appearing on success, lifecycle and ledger events visible in a debug / audit overlay. The wireframe carries behavioral truth, not just visual approximation. That is what the XForms-derived runtime layer buys at the wireframe level: a reviewer can click through the form as it will actually behave, against declared preconditions, effects, validation modes, and transaction semantics.

## 5.3 Regeneration on source changes

When Definition, Experience, or Response Actions changes, regeneration is a merge:

```text
old generated Component
+ designer-edited Component
+ new generated Component from updated sources
+ (optional) Trace impact map (§6)
= merged Component draft
```

With a Trace impact map, the merge identifies which source change affects which Component nodes and surfaces conflicts explicitly. Without one, regeneration falls back to diff heuristics.

Merge rules:

```text
Preserve designer edits when their source anchors still exist.
Regenerate nodes whose source itemRef, actionRef, or unitRef changed.
Mark orphaned components when their bind, actionRef, or unitRef no longer resolves.
Add newly generated fields and actions as pending review.
Never silently delete designer-authored layout without a trace warning.
```

When Definition renames `dateOfBirth → birthDate` via a proper migration or changelog, the generator updates the binding but preserves designer-authored presentation choices. When no migration explains the rename, the generator emits a review warning rather than guessing.

## 5.4 Worked example

Given this Experience unit (Experience-side locale namespace is deferred to the Experience companion spec; inline accessibility prose appears here as v0 fallback):

```json
{
  "id": "identity",
  "kind": "data-entry",
  "taskRefs": ["identifyApplicant"],
  "itemRefs": ["applicantName", "dateOfBirth"],
  "actionRefs": ["saveDraft", "continue"],
  "accessibility": {
    "label": "Applicant identity",
    "description": "Information used to identify the applicant."
  }
}
```

and these Definition items (the `label` field is inline fallback; Locale resolves `applicantName.label` and `dateOfBirth.label` at render time):

```json
[
  {
    "key": "applicantName",
    "type": "field",
    "dataType": "string",
    "label": "Full name"
  },
  {
    "key": "dateOfBirth",
    "type": "field",
    "dataType": "date",
    "label": "Date of birth"
  }
]
```

the `data-entry` kind drives a `unit-to-card` default, producing this Component draft. Component nodes carry IDs and structural refs only; human-readable strings resolve implicitly via the Locale spec's `$component.<nodeId>.<prop>` and `<itemKey>.label` key patterns:

```json
{
  "$formspecComponent": "1.0",
  "version": "1.0.0",
  "targetDefinition": {
    "url": "https://example.gov/forms/intake",
    "compatibleVersions": ">=1.0.0 <2.0.0"
  },
  "generation": {
    "source": "experience:identity",
    "strategy": "unit-to-card",
    "generatedBy": "formspec-wireframe-generator@0.1.0"
  },
  "tree": {
    "id": "identityCard",
    "component": "Card",
    "unitRef": "identity",
    "taskRefs": ["identifyApplicant"],
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
        "id": "identityActions",
        "component": "ButtonRow",
        "children": [
          {
            "id": "saveDraftButton",
            "component": "Button",
            "actionRef": "saveDraft",
            "variant": "secondary"
          },
          {
            "id": "continueButton",
            "component": "Button",
            "actionRef": "continue",
            "variant": "primary"
          }
        ]
      }
    ]
  }
}
```

Every Component node carries an anchor back to source semantics:

```text
Card        → Experience unit
Inputs      → Definition items
Buttons     → Response Actions
Validation  → Definition and Validation Report
```

---

# 6. Trace: Relationship Index for Trustworthy Generated UI

Trace is the generated relationship index over Formspec artifacts. It is **not** part of the rendering pipeline — `Component ⟵ Definition + Experience + Response Actions` runs without it. Trace is what makes the result *trustworthy*: it indexes structural relationships between artifacts so that the same generated UI can be:

- **Explained** per element ("this text field renders `item:applicantName`, belongs to `unit:identity`, supports `task:identifyApplicant`, maps to `concept:per.name`, is explained by `reference:name-policy`, is validated by `shape:identity-required`, is included in `submission:finalApplication`").
- **Reviewed** against the semantic model (the generator's output is verifiable, not just plausible).
- **Regenerated safely** on source changes (impact map identifies which Component nodes a Definition / Experience / Response Action change affects).
- **Audited** for compliance (which fields are collected because which policy requires them; what evidence the runtime produces).
- **AI-checked** (did the AI include required fields; orphan any validation rule; create a button with no Response Action; render a policy-required field without the policy reference; lose accessibility refs).
- **Verified consistent across projections** (the web Component, mobile Component, PDF section, and caseworker view all project the same abstract intent).

Concretely, Trace answers questions like:

```text
Which component renders which item?
Which unit collects which item?
Which action runs which submission?
Which mapping exports which path?
Which reference explains which target?
Which ledger event records which runtime action?
Which receipt verifies which signature against which posture?
```

Three commitments distinguish Trace from adjacent concerns:

- **Trace ≠ References.** References attaches external resources to artifacts (a policy document linked to a field). Trace indexes structural relationships *between* Formspec artifacts (a Component node renders an item; a unit supports a task).
- **Trace ≠ derivation engine.** The rendering pipeline produces a Component without consulting Trace. Trace is generated *from* the result and its sources, not used to *produce* the result.
- **Trace is generated, not authored.** Source artifacts win on conflict. A materialized Trace is an optional cache; it MUST carry input digests, and consumers MUST reject it as stale when any source digest changes.

Trace is not required for v0 wireframe generation. It becomes load-bearing when generated UI must be trustworthy — when designers regenerate on Definition changes, when AI proposes structure, when compliance review asks "why is this here", when the same model renders across multiple outputs.

**v0 commitment: posture only.** The predicate set (`renders`, `collects`, `runs`, `references`, `requests`, …) and the query language are deferred until a named consumer drives the choice.

---

# 9. Design Commitments

## 9.2 Keep behavior out of presentation

Component and Theme may present and organize fields; they MUST NOT override Definition behavior.

## 9.3 Keep Experience abstract

Experience captures task intent and abstract grouping. It MUST NOT encode concrete layout, widget choice, or host-specific workflow implementation.

## 9.4 Keep Response Actions orchestrational

Response Actions coordinates actions, submissions, validation passes, handoffs, receipts, and ledger requests at the Formspec runtime boundary. It MUST NOT redefine the body schemas owned by those artifacts, and it MUST NOT absorb workflow or case-lifecycle authority.

## 9.6 Keep Trace generated

Trace is generated from source and evidence artifacts. It MUST NOT become an authored duplicate of relationships already owned elsewhere.

---

# 10. Lineage

Three engineering traditions sit behind this architecture, each contributing a distinct capability.

| Tradition | Useful discipline | Formspec landing zone |
|---|---|---|
| **XForms** | Declarative form model + runtime operations over a reactive data model | **Model side already absorbed** into Definition (items, binds, computed values, validation reports, constraints, shapes, repeats, non-relevant behavior). **Runtime side is what Response Actions adds** — actions, submissions, validation modes, lifecycle policy, transaction semantics. |
| **UsiXML / CAMELEON** | Task / abstract UI / concrete UI / final UI ladder; context of use | Experience, Component, Theme, Experience.applicability |
| **XIML** | Cross-layer relations and traceability | Trace |

The three new layers map cleanly to what each tradition contributes:

```text
Experience       makes UI derivable      ← UsiXML / CAMELEON
Response Actions makes UI executable     ← XForms (runtime operations)
Trace            makes UI explainable    ← XIML
```

The goal is not standards parity; it is JSON-native separation of concerns that respects what each tradition got right.

---

# 11. Open Questions

These are gates the follow-on specs must pass. Each names a re-open trigger so the question stays falsifiable.

## 11.2 Trace query model — posture committed; predicates and language deferred

§6 commits the posture (relationship index, query primary, materialized cache subordinate with digest staleness). The closed predicate set and the query language are deferred.

**Re-open trigger:** a named consumer specifies which queries it needs. Examples that would drive the choice: a design-review overlay tool, a compliance audit generator, an AI authoring reviewer, a multi-output consistency verifier.

## 11.3 Response Actions as peer or overlay

Response Actions remains a peer artifact while it only orchestrates runtime actions. If it starts changing Definition behavior, it becomes an explicit behavioral overlay with merge semantics or moves into a future Definition v2 model.

**Re-open trigger:** leakage — Response Actions repeatedly needs to suppress, override, or alter Definition semantics.

## 11.4 TypedRef kind breadth at v1

The closed `kind` list for `TypedRef` is deliberately deferred to the formal Experience companion spec. Candidate kinds include `item`, `action`, `concept`, `unit`, `task`, `actor`. Broader kinds (`mapping`, `theme`, `locale`, `reference`) overlap with existing reference fields and would need justification.

**Re-open trigger:** drafting the formal Experience companion spec — the kind list ratifies there.

---

# 12. Follow-On Spec Order

The next formalization pass should produce these artifacts, in this order:

1. **Experience companion spec.** Needs §11.4 (TypedRef kind list) resolved. Specifies actor / task / unit / applicability shapes; ratifies the `unit.kind` registered enum. (UsiXML / CAMELEON–derived.)
2. **Response Actions companion spec.** Anchors the Intake Handoff seam ([ADR 0073](../../../thoughts/adr/0073-stack-case-initiation-and-intake-handoff.md)) and the FEL precondition language ([ADR 0075](../../../thoughts/adr/0075-rejection-register.md)). Specifies action / submission / evidence-request shapes. (XForms-derived runtime operations.)
3. **Component reference additions.** Adds `unitRef`, `taskRefs`, `actionRef`, `conceptRefs` to the existing Component schema.
4. **Trace query / cache spec.** Only after §11.2's re-open trigger fires — a named consumer drives the predicate set and query language. (XIML-derived.)

Each follow-on spec should include: normative document shape, JSON Schema, examples, semantic validation rules, conformance fixtures, generated-type impacts, downstream consumer impacts, and migration notes.

This concept note carries none of those details. Its job is to make the architecture hard to misunderstand before the formal specs begin.

---

# 13. Final Direction

Three semantic layers sit beside Definition / Component / Theme / Mapping / References, each absorbing a distinct lesson:

- **Experience** holds abstract task intent — the rung of the CAMELEON ladder between domain and concrete UI. Makes UI **derivable**.
- **Response Actions** holds the XForms-derived runtime layer — actions, submissions, validation modes, lifecycle policy, transactions, up to and including Intake Handoff. Makes UI **executable**.
- **Trace** is the XIML-derived generated relationship index across artifacts. Makes UI **explainable**.

These layers do not replace any existing artifact. They project *from* Definition, never *into* it. They make Formspec capable of generating UI from semantic source — derivable, executable, and explainable — without compromising the existing model.

This note is not the formal spec. It is the doctrine that the follow-on specs implement.

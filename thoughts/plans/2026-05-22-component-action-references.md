---
title: Component Action References — ActionButton + VM §7 Deletion
date: 2026-05-22
status: completed
owner: spec-author
related:
  - thoughts/plans/2026-05-22-response-actions-spec.md
  - thoughts/plans/2026-05-22-formengine-validation-profile-adapter.md
  - specs/component/component-spec.md
  - specs/core/validation-mapping.md
  - thoughts/specs/2026-05-20-formspec-semantic-layers.md
---

# Component Action References — ActionButton + VM §7 Deletion

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:test-driven-development. Steps use `- [ ]` syntax.

**Goal:** Pull concept §10.4 forward. Rename `SubmitButton` → `ActionButton` in Component, make `actionRef` required, drop legacy `mode` and `emitEvent` props. Delete VM §7 entirely (it existed only as a compatibility carve-out for SubmitButton-without-actionRef, which no longer exists). Greenfield: there is no production code or shipping spec to preserve. The refactor lets the Response Actions plan, the FormEngine plan, and Component cohere around one model — **a button binds to an Action; the Action carries the validation triple, the effects, and the host-event semantics**.

**Architecture:** Replace `SubmitButton` with `ActionButton` in `schemas/component.schema.json` and `specs/component/component-spec.md §5.19`. `ActionButton` has REQUIRED `actionRef: string` resolving against the Response Actions document's `actions[*].id`. Drop `mode` (validation profile lives in the referenced Action's `validation` block); drop `emitEvent` (the renderer dispatches a host event iff the referenced Action declares a `hostEvent` effect — no separate widget flag). Delete VM §7 (no SubmitButton compatibility scaffolding needed). Update Experience §6.3 `ActionRef` to point at this binding path. Update concept §10.4 status to "landed."

This is **not** an additive plan. It is a deletion-and-rename. No `SubmitButton` alias is preserved. Documents authored against pre-refactor schemas do not validate post-refactor; that is the intended cost.

**Tech Stack:** JSON Schema 2020-12, Markdown (W3C-style, BCP-14), pytest under `tests/conformance/`, Playwright E2E under `tests/e2e/`.

**Sequencing:** Schema rename first → Component spec §5.19 rewrite → VM §7 deletion → ValidationSummary `source: "submit"` reconciliation note (not refactor) → conformance tests → E2E test for the new path. This plan is a precondition to the Response Actions plan (which references `ActionButton` and removes legacy SubmitButton language).

**Citations:** "Component §" = `specs/component/component-spec.md`. "VM §" = `specs/core/validation-mapping.md`. "RA-plan" = `formspec/thoughts/plans/2026-05-22-response-actions-spec.md`. "Concept §" = the semantic-layers note.

---

## File Structure

### Modified

| Path | Why |
|---|---|
| `schemas/component.schema.json` | Rename `SubmitButton` → `ActionButton` in the component type enum + $defs. Add required `actionRef: string`. Drop `mode` and `emitEvent` from props. |
| `specs/component/component-spec.md` | §5.19 rewritten as "ActionButton" — required actionRef, no mode prop, no emitEvent prop. Update §5.21 (or wherever the type registry lives) ActionRef table. Update Component §6.13 ValidationSummary `source: "submit"` semantics note (see §Reconciliation below). Update front-matter and any cross-refs. |
| `specs/core/validation-mapping.md` | **Delete §7 entirely** (SubmitButton Compatibility). The §3.2 mention of SubmitButton.mode also goes — that table column was a SubmitButton-specific carve-out. |
| `schemas/validation-mapping.schema.json` | If §7-specific $defs exist, drop them. Verify no `MasterTable` entries depend on SubmitButton-specific behavior (they don't — master table is intent-keyed, not widget-keyed). |
| `specs/experience/experience-spec.md` | EXP §6.3 ActionRef: simplified — resolution always goes through Response Actions document; "fallback to free string when no document is loaded" carve-out becomes "host MUST load a Response Actions document if Experience contains an ActionRef." |
| `thoughts/specs/2026-05-20-formspec-semantic-layers.md` | Mark §10.4 (Component reference additions) landed. Mark §11.3 (Component reference fields) resolved. |
| Existing tests across `tests/conformance/`, `tests/e2e/`, `packages/formspec-webcomponent/tests/` | Update every reference to `SubmitButton` → `ActionButton`. Update tests asserting `mode` or `emitEvent` behavior — remove or repurpose. |
| `tests/contracts/surface-coverage.json` | Update Component and VM contract rows to reflect the new shape. |
| `filemap.json` | Regenerated. |

### Created

| Path | Responsibility |
|---|---|
| `tests/conformance/spec/test_actionbutton_binding.py` | Pytest pinning ActionButton's actionRef requirement, the resolution contract against a Response Actions document, and rejection of documents missing actionRef. |
| `tests/e2e/playwright/actionbutton.spec.ts` | E2E asserting a clicked ActionButton invokes the resolved Action and the host observes the declared hostEvent (if any). |

### Explicitly NOT in scope

- **Other Component reference fields** (`unitRef`, `taskRefs`, `conceptRefs`, `x-generation`). Originally bundled with this work in the now-superseded [Component References plan](2026-05-22-component-references-spec.md). Scope-limited to `actionRef` only because that's what blocks Response Actions. The remaining reference-field family lives in **[Component Reference Fields (follow-up)](2026-05-22-component-reference-fields.md)** — additive schema evolution (`$id /1.2`, `$formspecComponent` enum extension), full cross-document resolver, severity-by-kind table extending this plan's `COMP-REFERENTIAL-INTEGRITY` code, no-rewrite regression test, and `x-generation.anchors` as regeneration-merge seed.
- **ValidationSummary refactor.** `ValidationSummary.source: "submit"` currently reads "the latest formspec-submit event detail." After this plan, `formspec-submit` is dispatched by Action hostEvent effects, not by the widget itself. The semantics still work but the spec prose needs a touch-up — flagged for a follow-up plan (see Reconciliation below). NOT in this plan.
- **A separate generic Button widget.** ActionButton is the only action-triggering button widget. If a non-button-shaped trigger appears later (e.g., a link-styled trigger), it gets a new widget at that point.
- **Action-trigger keyboard semantics.** Existing button keyboard semantics apply unchanged.
- **Migration tooling.** Greenfield: no documents exist to migrate.

---

## Self-Review Note

- This plan is **deletion-and-rename**, not additive. Documents validating against pre-refactor schemas do not validate post-refactor. Greenfield: acceptable.
- VM §7 was 100% legacy scaffolding. Once SubmitButton-without-`actionRef` cannot exist, §7's "default submit action rule" has no input space. Delete the whole section.
- `SubmitButton.mode` was a SubmitButton-local override of VM ValidationProfile. With ActionButton-actionRef-required, the validation profile lives in the resolved Action's `validation` block (which inherits the VM §6 master row for `intent: submit` or overrides per VM §6.3 predicate). The widget no longer carries validation policy; that's a clean separation.
- `emitEvent` was the binary "do we dispatch CustomEvent on click." With Actions as first-class, hostEvent is an effect-type declaration. If the author wants the event, the Action declares `{ type: hostEvent, eventName: "formspec-submit" }`. The widget doesn't choose; the Action declares.
- Rename to `ActionButton`: SubmitButton implied "this button submits." With actionRef pointing at any Action (submit, review, save-draft, request-evidence, x-extension), the widget is generic. Naming follows function.
- DI: the renderer depends on a `ResponseActionsRegistry` port to resolve actionRef → Action. Concrete impl reads the loaded Response Actions document; testable mock impl returns canned Actions. (Implementation detail — not specified by this plan beyond the conformance contract.)

---

## Task 1: Add the Response Actions schema reference loader to Component

**Files:**
- Inspect: `specs/component/component-spec.md` front-matter / cross-spec table.

- [ ] **Step 1: Confirm Component already references Response Actions schema in front-matter**

If absent, add `specs/response-actions/response-actions-spec.md` to the cross-spec table. Component now structurally depends on Response Actions for ActionButton resolution (Component MAY validate without loading the Response Actions document; the resolution happens at runtime).

---

## Task 2: Rename SubmitButton → ActionButton in component.schema.json

**Files:**
- Modify: `schemas/component.schema.json`

- [ ] **Step 1: Locate the SubmitButton $def and the component-type enum**

```bash
cd formspec && grep -n "SubmitButton" schemas/component.schema.json | head -20
```

- [ ] **Step 2: Rename + restructure**

In the `$defs/ActionButton` (formerly `SubmitButton`) — drop `mode` and `emitEvent`; add required `actionRef`:

```json
"ActionButton": {
  "type": "object",
  "required": ["component", "actionRef"],
  "additionalProperties": false,
  "properties": {
    "component": { "const": "ActionButton" },
    "actionRef": {
      "type": "string",
      "minLength": 1,
      "pattern": "^[A-Za-z][A-Za-z0-9-]*$",
      "description": "Id of the Action in the loaded Response Actions document that this button invokes on click. MUST satisfy Action.id pattern."
    },
    "label": {
      "oneOf": [
        { "type": "object", "properties": { "ref": { "type": "string" } }, "required": ["ref"], "additionalProperties": false },
        { "type": "object", "properties": { "literal": { "type": "string" } }, "required": ["literal"], "additionalProperties": false }
      ],
      "description": "Button label. Locale ref or literal."
    },
    "pendingLabel": {
      "oneOf": [
        { "type": "object", "properties": { "ref": { "type": "string" } }, "required": ["ref"], "additionalProperties": false },
        { "type": "object", "properties": { "literal": { "type": "string" } }, "required": ["literal"], "additionalProperties": false }
      ],
      "description": "Label shown while the resolved Action is invoking (between idle and a terminal state)."
    },
    "disableWhenPending": {
      "type": "boolean",
      "default": true,
      "description": "When true (the default), the button is disabled while the invocation is in-flight. When false, the button MAY be re-clicked; idempotency keys (Response Actions §6.5) prevent duplicate side effects."
    }
  }
}
```

- [ ] **Step 3: Update the component-type enum**

Replace `"SubmitButton"` with `"ActionButton"` in the closed enum of component type names (typically `$defs/ComponentType` or similar). NO alias; no backwards compat.

- [ ] **Step 4: Schema parses**

```bash
cd formspec && node -e "JSON.parse(require('fs').readFileSync('schemas/component.schema.json'))"
```

Expected: no output.

- [ ] **Step 5: Commit**

```bash
cd formspec && git add schemas/component.schema.json
git commit -m "refactor(schema): rename SubmitButton -> ActionButton; actionRef required

Drops mode and emitEvent props (validation profile lives in the
referenced Action's validation block; hostEvent dispatch is an
effect declaration, not a widget flag). No backwards-compat alias."
```

---

## Task 3: Rewrite Component §5.19 as ActionButton

**Files:**
- Modify: `specs/component/component-spec.md`

- [ ] **Step 1: Rewrite §5.19**

Replace the entire §5.19 SubmitButton section with:

```markdown
### 5.19 ActionButton

An `ActionButton` is a button widget that invokes a named Action on click. It is the canonical action-trigger widget; there is no widget-specific notion of "submit" — the button's semantics derive entirely from the resolved Action.

#### 5.19.1 Required actionRef

Every `ActionButton` MUST declare `actionRef: string`. The value MUST be the `id` of an Action in the Response Actions document loaded for the form. A renderer encountering an unresolved `actionRef` (no Response Actions document loaded, OR `actionRef` does not match any `actions[*].id`) MUST treat the button as inert and MUST emit a `COMP-REFERENTIAL-INTEGRITY` finding (severity `error`, kind `"actionRef"`, naming the offending node and the missing action id). The button MUST NOT silently invoke a different Action or fall through to any implicit default. Silent fallback would mask author intent.

#### 5.19.1.1 actionRef placement is trigger-bound

`actionRef` MUST appear only on `ActionButton`. Schema enforces this: the property is declared exclusively inside `ActionButton.properties`; every other Component widget has `unevaluatedProperties: false` (or equivalent closure) that rejects `actionRef` at validation time. Future trigger widgets (e.g., a hypothetical menu-item or link-style trigger) MAY adopt `actionRef` only via a **named spec amendment** that explicitly extends this section. The amendment pattern:

1. A separate spec defines the new trigger widget.
2. That spec's "actionRef adoption" subsection cites this §5.19.1.1 and the resolver contract in §5.19.4.
3. The widget's schema declares `actionRef` in its `properties` block, mirroring `ActionButton`.
4. Resolver implementations walk all known trigger types from a registry rather than hard-coding `ActionButton`.

Until such an amendment lands, any Component document that places `actionRef` on a non-`ActionButton` widget MUST be rejected by the schema.

#### 5.19.2 No `bind`, no `mode`, no `emitEvent`

`ActionButton` has no `bind` (it does not read or write Response fields directly). It has no `mode` prop — the validation profile flows from the resolved Action's `validation` block (which inherits the VM §6 master row for the Action's intent or overrides per VM §6.3). It has no `emitEvent` prop — the renderer MUST dispatch a host event iff the resolved Action's effect chain declares a `hostEvent` effect. The widget does not carry policy.

#### 5.19.3 Props

| Prop | Type | Default | Required | Description |
|---|---|---|---|---|
| `actionRef` | string | — | Yes | Id of the Action this button invokes. |
| `label` | Locale ref or literal | — | No | Button text. |
| `pendingLabel` | Locale ref or literal | — | No | Label shown while the invocation is in-flight. |
| `disableWhenPending` | boolean | `true` | No | When true, button disables during in-flight invocation. |

#### 5.19.4 Behavior

1. On click, the renderer locates `actions[i]` such that `actions[i].id == actionRef`, then invokes it via the Response Actions §7 invocation state machine.
2. While the invocation is in `invoking`, `preconditions-evaluated`, `validation-running`, `blocking-gate`, or `effects-running` states, the button SHOULD render `pendingLabel` (if present) and SHOULD be disabled when `disableWhenPending` is true.
3. On terminal:
   - `completed`: re-enable the button. Renderer-defined whether to show success affordance.
   - `failed`, `blocked`, `deferred`: re-enable the button; renderer SHOULD surface the terminal cause via standard form-level affordance (validation report, error message, deferral banner).
4. Idempotency: the §6.5 contract prevents duplicate side effects on repeated clicks. A renderer that allows repeated clicks (e.g., `disableWhenPending: false`) is conformant because the durable effects deduplicate.

#### 5.19.4.1 Resolver Invariants (load-bearing)

The actionRef resolver MUST satisfy:

1. **Determinism.** Identical inputs (same Component widget, same Response Actions document) MUST produce identical resolution outputs (annotations + findings). No randomness, no clock-dependent behavior, no implementation-defined finding ordering.
2. **No-mutation.** The resolver MUST NOT mutate any input document. It reads the Component widget and the Response Actions document; it writes nothing to either.
3. **No silent fallback.** Unresolved `actionRef` produces a `COMP-REFERENTIAL-INTEGRITY` finding (severity `error`); it MUST NOT auto-route to a different Action.
4. **One-directional.** Component reads from Response Actions. Response Actions MUST NOT be modified by widget interaction; the Action document remains authoritative.

#### 5.19.4.2 `COMP-REFERENTIAL-INTEGRITY` Finding Code

A single finding code carries actionRef-resolution outcomes. Closed severity enum `{error, warning, info}`. For ActionButton:

| Condition | Severity | Kind | Notes |
|---|---|---|---|
| `actionRef` unresolved, Response Actions document present | `error` | `actionRef` | Names the missing action id and the widget node id. |
| `actionRef` set, Response Actions document absent | `error` | `actionRef` | `reason: "no-response-actions-document"`. Authoring intent declared but the resolution context is missing — configuration error, not informational. |

Other reference fields (`unitRef`, `taskRefs`, `conceptRefs`, `x-generation`) reuse the `COMP-REFERENTIAL-INTEGRITY` code under their own kind discriminator; their severity ladder is defined by the follow-up plan that introduces those fields.

Hosts MUST NOT downgrade `error` to `warning` or `info` via configuration. Hosts MAY upgrade `info` (when it exists for other kinds) to higher severity in strict mode.

#### 5.19.5 Example

```json
{
  "component": "ActionButton",
  "actionRef": "submit-application",
  "label": { "literal": "Submit Application" },
  "pendingLabel": { "literal": "Submitting…" }
}
```

The referenced Action lives in the Response Actions document:

```json
{
  "id": "submit-application",
  "intent": "submit",
  "effects": [
    { "type": "mappingExecution", "mappingRef": "applicationPayload", "idempotencyKey": "@invocation.id & '/map'" },
    { "type": "ledgerAppend", "eventKind": "response.submit-attempted", "idempotencyKey": "@invocation.id & '/submit-attempted'" },
    { "type": "handoffAssembly", "handoffProfileRef": "intakeStandard", "recipientRef": "wosIntake", "idempotencyKey": "@invocation.id & '/handoff'" },
    { "type": "ledgerAppend", "eventKind": "response.completed", "idempotencyKey": "@invocation.id & '/completed'" },
    { "type": "hostEvent", "eventName": "formspec-submit", "detailRef": "{ reportRef: @validation.lastReport, handoffOutcomeRef: @effects[2].outcomeRef }" }
  ]
}
```

The legacy `formspec-submit` CustomEvent is still dispatched because the Action declares the `hostEvent` effect — the widget does not need to know.
```

- [ ] **Step 2: Update the §5.21 (or similar) widget-summary table**

If a roll-up table exists listing all widget names, replace `SubmitButton` with `ActionButton`. If the table cites prop sets, update.

- [ ] **Step 3: Commit**

```bash
cd formspec && git add specs/component/component-spec.md
git commit -m "refactor(spec): rewrite Component §5.19 as ActionButton

Required actionRef; drops mode and emitEvent; widget no longer
carries validation policy or event-dispatch policy. All of those
flow from the resolved Action."
```

---

## Task 4: Delete VM §7 entirely

**Files:**
- Modify: `specs/core/validation-mapping.md`

- [ ] **Step 1: Delete the entire §7 "SubmitButton Compatibility" section**

This includes §7.1 (Default Submit Action Rule), §7.2 (SubmitButton.mode Reconciliation), §7.3 (Future actionRef Compatibility), §7.4 (Migration). Renumber subsequent sections (§8 ValidationSummary becomes §7, etc.) or leave §8+ numbering as-is with a renumber-deferred note — whichever the spec's convention prefers.

- [ ] **Step 2: Drop the §3.2 mention of SubmitButton.mode**

If §3.2 "What Profile Does NOT Affect" or the Profile Resolution table references `SubmitButton.mode`, delete those references. ValidationProfile is no longer widget-specific.

- [ ] **Step 3: Update §1.2 cross-spec table**

Replace any "SubmitButton" mention with "ActionButton" (or generalize: "the action-trigger widget"). The Component spec now hosts the binding contract; VM hosts only the tuple.

- [ ] **Step 4: Commit**

```bash
cd formspec && git add specs/core/validation-mapping.md
git commit -m "refactor(spec): delete VM §7 SubmitButton Compatibility

Legacy scaffolding for SubmitButton-without-actionRef. ActionButton
always carries actionRef; the resolved Action carries the (profile,
blocking, persistence) triple per VM §6. No widget-specific carve-out
remains in VM."
```

---

## Task 5: Update ValidationSummary cross-reference (no semantic change)

**Files:**
- Modify: `specs/component/component-spec.md` §6.13 (ValidationSummary)
- Modify: `specs/core/validation-mapping.md` §8.1 (ValidationSummary `source` prop)

- [ ] **Step 1: Update the §6.13 prose**

ValidationSummary's `source: "submit"` semantics ("reads the latest `formspec-submit` event detail") remain valid AS LONG AS an Action declares `{ type: hostEvent, eventName: "formspec-submit" }`. Authors who want a ValidationSummary to update on submit MUST declare the `hostEvent` effect on their submit Action. Update §6.13 to add a one-paragraph note:

```markdown
**Source: "submit" requires a hostEvent declaration.** ValidationSummary with `source: "submit"` reads the most recent `formspec-submit` CustomEvent's `detail.reportRef`. The event is dispatched by an ActionButton's resolved Action via the `hostEvent` effect; widgets do not dispatch on their own. To receive submit-event updates, the submit Action MUST declare `{ type: "hostEvent", eventName: "formspec-submit", detailRef: ... }` in its effect chain.
```

This is a prose update, not a behavior change. No schema modification.

- [ ] **Step 1.5: Update VM §8.1 prose**

`specs/core/validation-mapping.md §8.1` (ValidationSummary's `source` prop description) also references the legacy SubmitButton emit-event behavior and is stale post-Plan-E. Add a single paragraph to the existing §8.1 prose — do NOT restructure §8.1:

```markdown
**After Component Action References lands**, `formspec-submit` CustomEvent is dispatched by Action `hostEvent` effects rather than by the widget itself. Authors who want a ValidationSummary with `source: "submit"` to receive updates MUST declare a `hostEvent` effect on the submit Action's effect chain. ValidationSummary does not drive event dispatch; it only reads the most recent event detail from the host.
```

This is a single-paragraph append to §8.1. No structural rewrite of §8.1.

- [ ] **Step 2: Commit**

```bash
cd formspec && git add specs/component/component-spec.md specs/core/validation-mapping.md
git commit -m "docs(spec): clarify ValidationSummary source: submit depends on Action hostEvent

Updates Component §6.13 and VM §8.1 — both referenced the legacy
SubmitButton emit-event behavior. Post-Plan-E, formspec-submit is
dispatched by Action hostEvent effects; the widget does not dispatch."
```

---

## Task 6: Update Experience §6.3 ActionRef

**Files:**
- Modify: `specs/experience/experience-spec.md`

- [ ] **Step 1: Simplify §6.3**

The "fallback to free string when no document is loaded" carve-out (added in the original Response Actions plan Task 19) goes away. With ActionButton requiring actionRef and Response Actions being the canonical resolution path, EXP §6.3 reads:

```markdown
**ActionRef resolution.** Every `ActionRef.id` resolves against the loaded Response Actions document's `actions[*].id` set. Processors MUST load a Response Actions document when the Experience document contains any `ActionRef`. An unresolved `ActionRef.id` MUST be treated as an Experience document error — emit a finding and render the widget as inert. There is no free-string fallback.
```

- [ ] **Step 2: Commit**

```bash
cd formspec && git add specs/experience/experience-spec.md
git commit -m "refactor(spec): EXP §6.3 — actionRef resolution is mandatory; no free-string fallback"
```

---

## Task 7: Update tests across the repo

**Files (find-and-update everywhere `SubmitButton` appears):**

- [ ] **Step 1: Search**

```bash
cd formspec && grep -rln "SubmitButton" packages/ tests/ specs/ schemas/ 2>/dev/null
```

- [ ] **Step 2: Rename in each file**

For TypeScript / Vitest tests, JSON fixtures, JSON Schemas, spec markdown, and Playwright E2E specs:
- `SubmitButton` → `ActionButton`
- Drop `mode` and `emitEvent` props.
- Add `actionRef` to every ActionButton occurrence (point at an Action defined in the same fixture's Response Actions document).
- Any test that asserted `SubmitButton.mode` behavior either reorients (assert the resolved Action's validation override) or deletes.

This is mechanical but voluminous. Use IDE multi-file rename. Do NOT preserve a `SubmitButton` type alias anywhere.

- [ ] **Step 3: Run test sweeps per layer**

```bash
cd formspec && npm test
cd formspec && python3 -m pytest tests/
cd formspec && cargo nextest run --workspace
```

Expected: pass after Tasks 8 and 9 also land (the new ActionButton-specific tests).

- [ ] **Step 4: Commit per layer (TS, Python, Rust)**

Three commits, one per language layer.

---

## Task 8: New ActionButton conformance pytest

**Files:**
- Create: `tests/conformance/spec/test_actionbutton_binding.py`

- [ ] **Step 1: Write the test**

```python
"""ActionButton binding contract (Component §5.19).

Pins:
- actionRef is required; missing actionRef rejects at schema validation.
- An ActionButton whose actionRef resolves to a declared Action invokes
  it on click via the Response Actions §7 state machine.
- Unresolved actionRef produces an inert button + COMP-REFERENTIAL-INTEGRITY
  finding (severity=error, kind=actionRef), NEVER an implicit default
  invocation.
- actionRef placement is trigger-bound: schema rejects actionRef on any
  Component widget other than ActionButton.
- Resolver invariants: deterministic + no-mutation + no silent fallback.
"""

import copy
import json
from pathlib import Path

import pytest
from jsonschema import Draft202012Validator

from tests.unit.support.schema_fixtures import build_schema_registry

COMPONENT_SCHEMA = Path(__file__).resolve().parents[3] / "schemas" / "component.schema.json"


def _load_component_schema():
    return json.loads(COMPONENT_SCHEMA.read_text())


def test_actionbutton_requires_actionref():
    schema = _load_component_schema()
    actionbutton = schema["$defs"]["ActionButton"]
    assert "actionRef" in actionbutton["required"]


def test_actionbutton_rejects_legacy_mode_and_emit_event():
    schema = _load_component_schema()
    actionbutton = schema["$defs"]["ActionButton"]
    assert actionbutton["additionalProperties"] is False
    props = actionbutton["properties"]
    assert "mode" not in props, "ActionButton MUST NOT carry legacy mode prop"
    assert "emitEvent" not in props, "ActionButton MUST NOT carry legacy emitEvent prop"


def test_actionbutton_validates_with_minimal_fixture():
    schema = _load_component_schema()
    validator = Draft202012Validator(schema["$defs"]["ActionButton"])
    minimal = {"component": "ActionButton", "actionRef": "submit-application"}
    errors = list(validator.iter_errors(minimal))
    assert not errors, f"minimal ActionButton fixture rejected: {errors}"


def test_actionbutton_rejects_missing_actionref():
    schema = _load_component_schema()
    validator = Draft202012Validator(schema["$defs"]["ActionButton"])
    invalid = {"component": "ActionButton", "label": {"literal": "Submit"}}
    errors = list(validator.iter_errors(invalid))
    assert errors, "ActionButton without actionRef MUST be rejected"


@pytest.mark.parametrize("non_trigger_widget", [
    {"component": "TextInput", "bind": "name", "actionRef": "submit-application"},
    {"component": "Section", "actionRef": "submit-application", "children": []},
    {"component": "MoneyInput", "bind": "amount", "actionRef": "saveProgress"},
])
def test_actionref_rejected_on_non_actionbutton_widgets(non_trigger_widget):
    """§5.19.1.1: actionRef MUST appear only on ActionButton. The schema
    enforces this via unevaluatedProperties: false on concrete widget types."""
    schema = _load_component_schema()
    validator = Draft202012Validator(schema, registry=build_schema_registry(schema))
    # Wrap in a minimal Component document so the discriminator can route.
    doc = {
        "$formspecComponent": "1.0",
        "version": "1.0.0",
        "targetDefinition": {"url": "https://x", "compatibleVersions": ">=1"},
        "tree": non_trigger_widget,
    }
    errors = list(validator.iter_errors(doc))
    assert errors, (
        f"schema MUST reject actionRef on non-ActionButton widget; got: "
        f"{non_trigger_widget['component']} accepted with actionRef"
    )


# --- Resolver invariants (§5.19.4.1) ---------------------------------------
# These tests exercise a reference resolver. The resolver itself is a thin
# function in the test module; production renderers MUST produce the same
# observable outputs.


def resolve_actionref(button: dict, response_actions: dict | None) -> dict:
    """Reference resolver. Returns {findings: [...], annotation: {...}}.
    Deterministic + no-mutation + no silent fallback per §5.19.4.1."""
    findings = []
    annotation = {}
    if response_actions is None:
        if "actionRef" in button:
            findings.append({
                "code": "COMP-REFERENTIAL-INTEGRITY",
                "severity": "error",
                "kind": "actionRef",
                "nodeId": button.get("id"),
                "target": button["actionRef"],
                "reason": "no-response-actions-document",
            })
            annotation["action-resolved"] = False
        return {"findings": findings, "annotation": annotation}

    action_ids = {a["id"] for a in response_actions.get("actions", [])}
    target = button.get("actionRef")
    if target in action_ids:
        annotation["action-resolved"] = True
    else:
        findings.append({
            "code": "COMP-REFERENTIAL-INTEGRITY",
            "severity": "error",
            "kind": "actionRef",
            "nodeId": button.get("id"),
            "target": target,
        })
        annotation["action-resolved"] = False
    return {"findings": findings, "annotation": annotation}


def test_resolver_emits_comp_referential_integrity_on_unresolved_actionref():
    button = {"id": "submitFinal", "component": "ActionButton", "actionRef": "nonexistent"}
    ra = {"actions": [{"id": "saveProgress"}]}
    result = resolve_actionref(button, ra)
    assert len(result["findings"]) == 1
    f = result["findings"][0]
    assert f["code"] == "COMP-REFERENTIAL-INTEGRITY"
    assert f["severity"] == "error"
    assert f["kind"] == "actionRef"
    assert f["target"] == "nonexistent"
    assert result["annotation"]["action-resolved"] is False


def test_resolver_emits_error_when_no_response_actions_document():
    button = {"id": "submitFinal", "component": "ActionButton", "actionRef": "submit-application"}
    result = resolve_actionref(button, response_actions=None)
    assert len(result["findings"]) == 1
    assert result["findings"][0]["reason"] == "no-response-actions-document"


def test_resolver_no_silent_fallback():
    """§5.19.4.1 invariant 3: unresolved actionRef MUST NOT auto-route."""
    button = {"id": "submitFinal", "component": "ActionButton", "actionRef": "nonexistent"}
    ra = {"actions": [{"id": "saveProgress"}], "defaultSubmitActionRef": "saveProgress"}
    result = resolve_actionref(button, ra)
    # Even though defaultSubmitActionRef is set in a hypothetical extended document,
    # the resolver MUST NOT silently invoke it.
    assert result["annotation"]["action-resolved"] is False
    assert "fallbackAction" not in result["annotation"]


def test_resolver_is_deterministic():
    """§5.19.4.1 invariant 1."""
    button = {"id": "submitFinal", "component": "ActionButton", "actionRef": "submit"}
    ra = {"actions": [{"id": "submit"}]}
    a = resolve_actionref(button, ra)
    b = resolve_actionref(button, ra)
    assert a == b


def test_resolver_does_not_mutate_inputs():
    """§5.19.4.1 invariant 2."""
    button = {"id": "submitFinal", "component": "ActionButton", "actionRef": "submit"}
    ra = {"actions": [{"id": "submit"}], "defaultSubmitActionRef": "submit"}
    button_before = copy.deepcopy(button)
    ra_before = copy.deepcopy(ra)
    resolve_actionref(button, ra)
    assert button == button_before
    assert ra == ra_before
```

- [ ] **Step 2: Run + commit**

```bash
cd formspec && python3 -m pytest tests/conformance/spec/test_actionbutton_binding.py -v
git add tests/conformance/spec/test_actionbutton_binding.py
git commit -m "test(conformance): pin ActionButton actionRef requirement + rejection of legacy props"
```

---

## Task 9: E2E test for ActionButton invocation

**Files:**
- Create: `tests/e2e/playwright/actionbutton.spec.ts`

- [ ] **Step 1: Author the spec**

The test mounts a form with one ActionButton whose `actionRef` resolves to a submit Action with a `hostEvent` effect. Click. Assert:
1. Validation runs per the Action's resolved profile.
2. Effect chain executes in declared order.
3. `formspec-submit` CustomEvent fires on the host element with the expected detail shape.
4. Button shows `pendingLabel` during invocation (when `disableWhenPending: true`).

Reuse existing E2E helpers (`mount`, `engineSetValue`, etc.) per `formspec/tests/e2e/`.

- [ ] **Step 2: Run + commit**

```bash
cd formspec && npx playwright test tests/e2e/playwright/actionbutton.spec.ts
git add tests/e2e/playwright/actionbutton.spec.ts
git commit -m "test(e2e): pin ActionButton click → Action invocation → hostEvent dispatch"
```

---

## Task 9.5: Sync schemas into the formspec-lint crate + propose make-target

> **Scope note:** This task introduces stack-wide build infrastructure (the `sync-lint-schemas` target + script). It lives in this plan because Plan E is the first plan to need it, but the infrastructure itself is generic — future plans (e.g., the Component Reference Fields follow-up) MUST also use this target rather than re-inventing schema-sync logic. The make-target and script SHOULD be considered for promotion to a separate stack-infrastructure plan if more consumers appear.

**Files:**
- Modify: `crates/formspec-lint/schemas/component.schema.json` (mirror of canonical)
- Create (if response-actions schema doesn't already mirror): `crates/formspec-lint/schemas/response-actions.schema.json`
- Modify: `Makefile`
- Create (optional, see Step 2): `scripts/sync-lint-schemas.mjs`

The Rust `formspec-lint` crate maintains its own `schemas/` directory mirroring the canonical `schemas/` (so lint passes don't reach across the workspace at build time). When `component.schema.json` changes (Task 2 here) AND when `response-actions.schema.json` lands (Response Actions plan), the lint crate's mirror MUST be re-synced. Currently the only documented sync is an ad-hoc script for `token-registry.json`; everything else is manual and drifts silently.

- [ ] **Step 1: Identify the existing mirror set**

```bash
cd formspec && ls crates/formspec-lint/schemas/ | sort > /tmp/lint-mirror.txt
ls schemas/ | grep -E '\.schema\.json$' | sort > /tmp/canonical.txt
comm -3 /tmp/lint-mirror.txt /tmp/canonical.txt
```

The diff shows what's missing from each side. Typically the lint crate mirrors a subset (only schemas the lint passes actually consume). For Plan E, the affected schemas are `component.schema.json` (modified by Task 2 + 3) and `response-actions.schema.json` (added by the Response Actions plan + cited by ActionButton resolution).

- [ ] **Step 2: Add a generic sync script**

Create `scripts/sync-lint-schemas.mjs`:

```js
#!/usr/bin/env node
// Sync canonical /schemas into crates/formspec-lint/schemas/.
// Mirrors only the files already present in the lint mirror — does NOT
// expand the lint crate's surface. Drop a file into the lint crate
// schemas/ to opt it into the sync.

import { readdirSync, copyFileSync } from 'fs';
import { resolve, join } from 'path';

const ROOT = resolve(import.meta.dirname, '..');
const SRC = join(ROOT, 'schemas');
const DST = join(ROOT, 'crates/formspec-lint/schemas');

const mirrored = readdirSync(DST).filter(f => f.endsWith('.schema.json') || f === 'token-registry.json');
for (const f of mirrored) {
  copyFileSync(join(SRC, f), join(DST, f));
  console.log(`synced ${f}`);
}
```

Add to `Makefile`:

```makefile
.PHONY: sync-lint-schemas
sync-lint-schemas:
	node scripts/sync-lint-schemas.mjs
```

- [ ] **Step 3: Opt the relevant schemas into the mirror**

```bash
cd formspec && cp schemas/component.schema.json crates/formspec-lint/schemas/
cp schemas/response-actions.schema.json crates/formspec-lint/schemas/  # if not already mirrored
```

(Skipping any not consumed by a lint pass — verify against `crates/formspec-lint/src/pass_*/` before opting in. The component schema is consumed by `pass_component` family lints; the response-actions schema is needed for ActionButton resolution-time lint, which lands as a follow-up.)

- [ ] **Step 4: Run the sync + cargo build**

```bash
cd formspec && make sync-lint-schemas
cd formspec && cargo build -p formspec-lint
```

Expected: pass. If `cargo build` complains about a schema referenced by `include_str!` that's missing, the mirror is incomplete — add the missing file.

- [ ] **Step 5: Hook the sync into the canonical build (suggested, not required)**

Add `sync-lint-schemas` as a prerequisite of `cargo build`'s upstream target (the per-crate Makefile or the workspace `build` target). The exact wiring depends on the repo's current build orchestration; document the suggestion and let the implementer choose.

- [ ] **Step 6: Commit**

```bash
cd formspec && git add scripts/sync-lint-schemas.mjs Makefile crates/formspec-lint/schemas/
git commit -m "build: add sync-lint-schemas target + sync ActionButton-affected schemas

Generic mirror script for /schemas -> crates/formspec-lint/schemas/.
Mirrors only files already present in the lint crate (drop a file to
opt in). Covers the component schema change in this plan and lays
groundwork for the response-actions schema mirror."
```

---

## Task 10: Update concept note status

**Files:**
- Modify: `thoughts/specs/2026-05-20-formspec-semantic-layers.md`

- [ ] **Step 1: Mark §10.4 landed and §11.3 resolved**

`§10.4 (Component reference additions)`: append `**Landed:** [`specs/component/component-spec.md §5.19`](../../specs/component/component-spec.md) (2026-05-22, via [Component Action References plan](../plans/2026-05-22-component-action-references.md)).`

`§11.3 (Component reference fields)`: append `**Resolved:** actionRef is required on ActionButton; no fallback path exists.`

- [ ] **Step 2: Update surface-coverage**

`tests/contracts/surface-coverage.json` — update the `component` row's `checks` to reflect the new ActionButton contract.

- [ ] **Step 3: Commit**

```bash
cd formspec && git add thoughts/specs/2026-05-20-formspec-semantic-layers.md tests/contracts/surface-coverage.json
git commit -m "docs: mark concept §10.4 landed + update Component contract surface"
```

---

## Sequencing Recap

```
Task 1: Component cross-spec note (small)
Task 2: schema rename (load-bearing)
Task 3: Component §5.19 rewrite
Task 4: delete VM §7
Task 5: ValidationSummary cross-ref note
Task 6: Experience §6.3 simplification
Task 7: repo-wide test rename
Task 8: ActionButton conformance pytest
Task 9: E2E test
Task 10: concept-note status + contract surface
```

This plan MUST land before the Response Actions plan executes (the Response Actions plan no longer carries SubmitButton compatibility prose; it cites ActionButton instead).

## Out-of-scope reminders

- **Do not preserve a SubmitButton alias.** Greenfield refactor; no backwards-compat shim.
- **Do not add SubmitButton-specific props to ActionButton** (e.g., a `submitLikeBehavior` flag). The widget is generic; behavior comes from the resolved Action.
- **Do not refactor ValidationSummary in this plan.** Source: "submit" semantics still work via Action hostEvent effects; the prose update in Task 5 is sufficient.
- **Do not introduce a separate generic Button widget.** ActionButton is the only action-trigger button.

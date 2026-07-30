---
name: Wireframes data-only rendering and product-reasoning closure
date: 2026-07-30
status: completed
decision: require a fixed generic host, fail-closed authoring checks, and reviewable Needs-to-interface reasoning before a wireframe iteration can pass
supersedes_result: surface-v12-saas-v1-dogfood attempt 7 pass claim
---

# Wireframes data-only rendering and product-reasoning closure

## Result to establish

A Wireframes test passes only when structured documents contain the whole
product and an unchanged generic host renders them. Product-specific React,
TypeScript, JavaScript, CSS, route switches, sample data, labels, or action
tables are a failed test, even if the browser output looks polished.

The current v12 attempt is therefore diagnostic evidence, not a Level 4 pass.
Its host supplies SaaS-specific widgets, copy, route behavior, form slicing,
sample records, and layout. Its Experience document also cites actors and tasks
that do not exist. The validation report failed to detect those references, and
the public builder tools omitted the existing Needs authoring cycle.

This plan closes those paths and reruns v12 under the corrected rule.

## Non-negotiable rules

1. **Replace data, get a different app.** The same host and renderer must render
   both a small control bundle and the SaaS v12 bundle. Only structured
   documents and structured demo-state inputs may change.
2. **Product meaning lives in documents.** Visible copy, navigation membership,
   action labels and emphasis, route-specific layout, form membership, sample
   state, actors, tasks, Needs, and feature rationale must not live in host
   code.
3. **Presentation does not change form meaning.** A renderer must not filter one
   Definition into different forms by presentation name. Distinct forms use
   distinct Definition documents.
4. **Validation fails closed.** Schema validity, generated types, public tool
   schemas, authoring dispatch, Registry declarations, widget delivery, and
   cross-document references must agree. A dangling actor, task, Need, action,
   data source, Definition, or widget reference must produce a named finding.
5. **Missing capability stays visible.** A builder records an unsupported
   requested outcome as a structured capability gap. It may then be integrated
   into the schema, catalog, authoring tool, and renderer. It may not be hidden
   in static text or app-specific code.
6. **Every rendered product node has a why.** Needs record Who / Want / Why /
   Done, evidence or an explicit lack of evidence, origin, lifecycle, and
   adoption. Every authored node that can produce normal product output
   carries a direct `need:<id>@<revision>` generation anchor or a typed direct
   Need reference. This includes route titles and navigation, slots, static
   content, Component nodes, Definition items, action controls, and each
   structured data-view block or column. Unit-level coverage alone does not
   satisfy this rule.
7. **The whole chain is reviewable.** Experience actors, tasks, and units cite
   the Needs they serve. Review reports walk Need → Experience → rendered node
   in both directions and show proposed, adopted, served, unserved, unresolved,
   stale, and rendered-but-unjustified reasoning.

## Work packages

### 1. Correct the public authoring surface

- Expose the existing Needs lifecycle through the public Wireframes MCP:
  initialize/pair, read, propose, adopt, and cite.
- Add public Experience actor and task authoring before a unit can cite them.
- Support more than one bundle-local Definition and route field edits to the
  Definition named by `definition_url`.
- Add a structured capability-gap verb and include open gaps in summary,
  validation, and export readiness.
- Generate the public catalog from the same definitions used for registration
  and add a dispatch-coverage test so a listed tool cannot lack an
  implementation.

Acceptance:

- An AI-authored Need remains `proposed` until a human actor adopts it.
- A unit cannot be presented as valid while its actor or task references are
  unresolved.
- Two Definition documents can be authored, exported, reopened, and rendered
  without host-side field filtering.
- An open capability gap makes the authoring review incomplete and names the
  missing framework layer.

### 2. Make lint cover the real document graph

- Run Experience referential-integrity analysis during the same validation
  invoked by `formspec_wireframes_validate`.
- Pair the session Needs document into that run and retain Needs coverage
  findings.
- Add a blocking rendered-node trace check. Every authored node that can
  produce normal product output must resolve directly to an adopted Need at its
  current revision. Emit separate findings for missing, unresolved,
  non-adopted, and stale Need links.
- Add schema/catalog/type/renderer parity checks for every standard widget and
  public tool.
- Treat skipped required checks as an incomplete verdict, not zero findings.

Acceptance:

- The v12 attempt-7 Experience produces `EXP-REFERENTIAL-INTEGRITY`.
- An adopted but uncited Need produces the existing unserved-Need finding.
- A rendered field, navigation item, content slot, action, Component node, or
  structured-panel block without a direct Need link fails validation.
- Unknown standard widgets, undeclared data inputs/action outputs, and public
  catalog/dispatcher drift fail focused tests.
- A validation response distinguishes passed, failed, and not-run checks.

### 3. Land a fixed data-driven renderer

- Add a standard structured-panel widget to the framework. Its configuration
  describes generic text, metrics, lists, tables, progress, route-parameter
  facts, and action presentation. Every rendered block and column carries its
  own typed Need link and emits a stable review identity in the DOM.
- Give widgets resolved action metadata so button labels come from bound
  Response Actions rather than a host lookup table.
- Add typed route navigation metadata so the shell does not equate every route
  with a global navigation item.
- Supply generic runtime adapters for fixture-backed Data Sources, Response
  Actions execution, Definition forms, diagnostics, and browser history.
- Put all demo state in a structured scenario document and all visual product
  choices in Theme/Surface/Registry/widget configuration.

Acceptance:

- No v12 product name, route id, field id, action label, source id, sample
  record, or route-specific condition appears in executable host source.
- The generic host contains no product-specific CSS.
- Static checks reject forbidden product-specific host code.
- The same host renders a control fixture and the v12 bundle by changing only
  imported JSON.

### 4. Rebuild and review v12

- Preserve attempt 7 unchanged as failed host-assisted evidence.
- Seed Needs from `SAAS-V1.md` and the product/journey sources it references.
  AI extraction creates proposals; record the human adoption act separately.
- Build actors, tasks, units, two Definitions, routes, navigation, actions,
  Registry, data sources, Theme, and scenario state through public structured
  authoring inputs.
- Validate, export, open in the generic browser host, and inspect every route
  plus empty, loaded, and unavailable data states.
- Produce a review artifact that answers for every visible feature: who needs
  it, why, acceptance signal, adopting actor, serving unit, rendered artifact,
  and any unresolved or stale link.

Acceptance:

- Validation has no schema errors, graph errors, Experience reference errors,
  unresolved adopted Needs, rendered-node trace errors, open capability gaps,
  or skipped required checks.
- Playwright reaches every route through rendered actions, exercises both
  Definitions, and observes honest loading/empty/error states.
- The evidence calls the result data-only only after the source guard and
  two-bundle host test pass.

## Required gates

Run these gates before changing the v12 verdict:

1. focused StudioCore and Wireframes MCP unit tests;
2. public catalog/schema/dispatcher parity tests;
3. Experience and Needs graph-validation regressions;
4. rendered-node Need trace coverage, including missing, unresolved,
   non-adopted, and stale links;
5. Surface schema generation and schema/type coverage checks;
6. Surface core and React renderer tests;
7. data-only host source guard;
8. demo typecheck and production build;
9. Playwright route and state review;
10. repository document/file-map checks affected by schema changes.

## Blind lint review additions

The independent edge-case review is recorded in
`spikes/surface-v12-saas-v1-dogfood/evidence/lint-edge-case-audit.md`. It added
the following required checks to this plan:

- renderer-owned nested-output inventories tied to the exact delivered widget
  implementation;
- explicit navigation reasoning and merged identities for derived transition
  labels;
- direct traces for Definition roots and options, Component tab/table/summary
  children, and Locale strings;
- exact preview source identity and scenario reference checks;
- direct behavior traces for Data Sources, widget data/action bindings,
  scenario defaults, route parameters, source outcomes, and action outcomes;
- executable Registry schemas and unique input/output names;
- mounted Experience units and resolved actor, task, and Definition-item
  citations;
- exact unit, item, action, and transition Experience paths;
- validation freshness, a closed reviewed-input digest, screenshot hashes, and
  required-phase evidence; and
- StructuredPanel duplicate identities, usable action labels, bound outputs,
  and statically impossible data paths.

## Execution record

This section is updated as the work lands. A checked item means the code and its
focused verification are complete, not merely designed.

- [x] Public Needs, Experience actor/task, multi-Definition, and capability-gap
      authoring
- [x] Experience/Needs and catalog/dispatcher fail-closed validation
- [x] Structured-panel widget, action metadata, and navigation model
- [x] Structured preview scenario
- [x] Fixed generic host
- [x] Corrected v12 structured artifacts and reasoning review
- [x] Browser iteration and final evidence
- [x] Mechanical review recomputation and fail-closed evidence freshness

## Closure

The corrected v12 and control bundles pass the durable artifact verifier and
all seven AppGraph phases. The mechanically regenerated SaaS reasoning review
resolves 256 of 256 rendered and behavior nodes to current adopted Needs and
mounted Experience paths; the control resolves 12 of 12.

The generic-host guard, demo typecheck, and production build pass. Playwright
rendered all 14 SaaS routes, followed all 22 actions, exercised loaded, empty,
loading, and unavailable source behavior, completed the public form at mobile
width, and rendered the control bundle without a console warning or error.

The affected Formspec build and unit gates, the full Formspec unit aggregate,
the contract-surface gate, StudioCore, and Wireframes MCP pass. The schema-fuzz
harness now follows external references in sibling keywords beside a local
`$ref`, closing the last red gate found during final validation.

The final independent architecture re-review found no remaining blocker. The
reviewed source, artifacts, current evidence, and screenshots resolve to stable
digest `0f3ff91772515e1635723741803421b666ac3411a52047e189703d7e20dcf398`.

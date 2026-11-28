---
title: Formspec App Graph Validator
version: 1.0.0-draft.1
date: 2026-05-26
depends_on:
  - specs/app-graph/artifact-resolver-spec.md
  - specs/app-graph/module-resolver-spec.md
  - specs/app-graph/ui-graph-policy-spec.md
  - specs/bundle/app-manifest-spec.md
  - specs/data-sources/data-sources-spec.md
---

# Formspec AppGraphValidator Interface Specification v0.1

**Version:** 0.1.0-draft.4
**Date:** 2026-05-25
**Editors:** Formspec Working Group
**Companion to:** App Manifest, Surface, Data Sources, Response Actions, Module Resolver, and Artifact Resolver

---

## Status of This Document

This document is the interface contract for the app-graph validator request
and report boundary. It defines the inputs, outputs, diagnostic shape,
schema-validation boundary, and cross-artifact ownership model for a production
`AppGraphValidator`.

The report output shape is structurally governed by
`schemas/app-graph-validation-report.schema.json`
(`https://formspec.org/schemas/appGraphValidationReport/0.1`) with generated
TypeScript exported by `@formspec-org/types`. This document intentionally does
not define a JSON Schema for validator requests, resolver implementations,
runtime invocation behavior, projection behavior, or production consumer wiring.
The Component route-target and Screener surface-target fixtures described in §9
are source-conformance evidence for those validator families only. Broader
production conformance lands in later implementation gates after the report
boundary is stable.

Architecture Decision Records may record provenance for this boundary, but
this specification states the validator contract directly.

## Bottom Line Up Front

- `AppGraphValidator` validates an already resolved app graph. It does not fetch
  URLs, discover siblings, read local fixture paths, or synthesize missing
  artifacts.
- Inputs are an App Manifest, `ArtifactResolver`-provided artifact handles,
  `ModuleResolver` output, a schema registry/support profile, and validator
  options.
- Outputs are deterministic validation reports with `ok`, summary counts,
  per-artifact schema results, diagnostics, skipped phases, and source pointers.
- Native validator diagnostics cover source schema validation, cross-artifact
  invariants, unsupported graph features, and fail-closed authorization
  boundaries. Resolver, module, and Surface-local diagnostics may be surfaced in
  the report only as imported diagnostics with their origin preserved.
- The validator does not render Components, execute Response Actions, evaluate
  durable effects, author ledger events, or decide fine-grained authorization.

## 1. Purpose and Scope

The App Manifest names an app graph. `ArtifactResolver` loads that graph's
referenced artifacts. `ModuleResolver` decides module admission and contribution
ownership. `AppGraphValidator` then validates the resolved graph as a graph
rather than as unrelated JSON files.

In scope:

- the validator request shape,
- the validator report shape,
- diagnostic identity and source pointers,
- per-artifact schema validation over loaded artifacts,
- cross-artifact invariants that require more than one artifact,
- imported upstream diagnostics from resolver/module/surface-local checks, and
- fail-closed handling for unsupported features and fine-grained authorization
  placeholders.

Out of scope:

- fetching, loading, or discovering artifacts,
- using fixture paths, filenames, URL suffixes, or directory conventions as
  identity,
- module admission/contribution resolution internals,
- Surface draft authoring and export-local lint rules,
- schema definitions for validator request payloads,
- validator request generated types and production consumer wiring,
- Studio, MCP, runtime, projection, or renderer wiring,
- source payload fetching/caching/subscription behavior, and
- Response Actions invocation or durable effect execution.

## 2. Validator Request

A validator request MUST be assembled from already resolved inputs. The minimum
request has these conceptual fields:

| Field | Required | Description |
|---|---|---|
| `manifest` | yes | Artifact handle for the App Manifest that roots the graph. |
| `artifacts` | yes | Resolved artifact handles grouped by manifest slot, for example `definitions[]`, `surfaces[]`, `dataSources[]`, `responseActions[]`, `experiences[]`, `registries[]`, `locales[]`, `theme`, `component`, and future graph siblings. |
| `schemaRegistry` | yes | Closed support profile for schema IDs, artifact kinds, and versions the validator can evaluate without network lookup. |
| `artifactResolution` | yes | `ArtifactResolver` result, including imported diagnostics for missing artifacts, unsupported references, discriminator drift, and ref/version mismatches. |
| `moduleResolution` | no | Full `ModuleResolutionReport` result when modules are present or module-contributed values must be checked. |
| `hostEvidence` | no | Host-supplied evidence collections that are not App Manifest siblings, such as `uiGraphPolicies[]` and `componentGraphContexts[]`. This evidence is never discovered by `ArtifactResolver`. |
| `evidenceSchemaValidators` | no | Schema validators for host-supplied evidence. These validators are separate from artifact schema validators because host evidence is not an artifact handle. |
| `options` | no | Validator controls such as supported bundle versions, diagnostic severity policy, phase selection for tools, and compatibility profile. Options MUST NOT authorize fetching, rendering, or effect execution. |

### 2.1 Host Evidence

`hostEvidence` is explicit request evidence supplied by the host. It is not an
App Manifest slot namespace, and it is not discovered by `ArtifactResolver`.
Each host-evidence collection carries required `schemaId`, `source`, and
`document` fields. `source` is diagnostic evidence only, not identity authority.

The shared validator kernel validates host evidence through explicit
`evidenceSchemaValidators` before using that evidence in cross-artifact checks.
Missing or failing host-evidence schema validation MUST produce
`evidenceResults[]` entries and MUST skip dependent cross-artifact evaluation.
Artifact `schemaValidators` MUST NOT be used for host evidence.

#### 2.1.1 UI Graph Policy Evidence

The v0.1 UI Graph Policy boundary defines `hostEvidence.uiGraphPolicies[]`.
Its structural source contract and semantic checks are defined by the UI Graph
Policy specification. Evidence slots use
`hostEvidence.uiGraphPolicies[N]`. A completed evidence result for that slot is
the only report proof that a policy document was schema-valid before dependent
UI Graph Policy checks ran.

#### 2.1.2 Component Graph Context Evidence

The Component graph projection proof boundary defines
`hostEvidence.componentGraphContexts[]` for host-supplied Component graph
projection contexts. This collection is request evidence only. It is not an App
Manifest sibling slot, not an `ArtifactResolver` artifact kind, and not an
independent Component, Surface, route, or authorization identity source.

The structural schema for this collection is
`schemas/component-graph-projection-context.schema.json`
(`https://formspec.org/schemas/componentGraphProjectionContext/0.1`): Component
membership handle plus optional Component URL/version, Surface URL plus optional
version, and route id. It exists to prove that a runtime or projection
consumer's `componentGraph` sidecar corresponds to a validated graph context; it
does not make the browser, renderer, or layout planner the validation authority.

Proof MUST be tied to an explicit completed `evidenceResults[]` entry whose
`evidenceSlot` is `hostEvidence.componentGraphContexts[N]` and whose `schemaId`
and `source` match the supplied host-evidence entry. A generic
`AppGraphValidationReport.ok === true` is never sufficient proof that a
Component graph sidecar was validated.

Cross-artifact validation for schema-valid Component graph context evidence
MUST check:

1. App Manifest Component membership handle existence.
2. Component artifact URL/version compatibility for the membership handle.
3. Surface artifact URL/version compatibility for the projection scope.
4. Route coverage against the loaded Surface `routes[].id` namespace.
5. Route-bound Component context against the loaded Component
   `targetSurfaceRoutes[]` declarations.

AppGraphValidator MUST NOT use Component graph context evidence to choose an
active route, render Components, hydrate runtime state, suppress DOM metadata,
execute Response Actions, infer hidden-state behavior, query TraceIndex, or
decide fine-grained authorization.

This slice defines the host-evidence schema and shared-kernel proof checks only.
It does not require runtime hidden-state behavior, consumer metadata gating,
production host graph loading, or consumer UI Graph Policy diagnostics. The
shared kernel includes the Surface/route, Locale-owner, hidden Definition
reference, Theme widgetRef, Theme token-slot, Theme token-reference/category,
and custom token-category evidence UI Graph Policy semantic passes over
schema-valid `hostEvidence.uiGraphPolicies[]`, loaded Surface handles, loaded
Locale handles, loaded Definition handles, loaded Theme handles, and completed
ModuleResolver evidence when a check depends on module admission, contribution
ownership, or normalized widget token-slot evidence. It also includes the
Component graph context proof checks above. Production runtime consumer wiring
lands in later ADR 0153 §7 phases.

### 2.2 Artifact Handle

An artifact handle is not just a JSON document. It carries enough source and
identity metadata for deterministic diagnostics:

| Field | Description |
|---|---|
| `slot` | Manifest slot and ordinal, such as `definitions[0]` or `dataSources[1]`. |
| `ref` | The App Manifest sibling reference, when the artifact came from a sibling slot. |
| `artifactKind` | Expected artifact family, such as `definition`, `surface`, `dataSources`, or `responseActions`. |
| `schemaId` | Schema selected for source validation. |
| `document` | Parsed JSON value when loading succeeded. |
| `identity` | Canonical document identity extracted from the document when that artifact family defines one, such as Definition `url`/`version` or Data Sources `id`/`version`. For Surface, this records the local Surface `id` for route namespace diagnostics only; canonical sibling identity remains the App Manifest `surfaces[]` ref URL/version carried in `ref`. |
| `source` | Diagnostic source pointer, such as URI, package resource, or host object ID. It is evidence for error reporting, not production identity. |
| `digest` | Optional content digest for tools that need stale-input checks. |
| `status` | Resolver status, such as `loaded`, `missing`, `unsupported`, or `invalid-discriminator`. Non-`loaded` statuses are reported by `ArtifactResolver`; the validator skips dependent graph phases. |

The validator MUST NOT derive identity from `source`, local paths, filenames, or
fixture metadata. Production graph identity is anchored by App Manifest refs and
checked against loaded artifact identity fields only where the artifact family
defines global identity. Surface route namespaces use Surface `id` locally, but
a Surface sibling is identified by the App Manifest `surfaces[]` URL/version
ref.

## 3. Validation Order

The validator runs in deterministic phases:

1. Import `artifactResolution` diagnostics and mark unresolved handles.
2. Import top-level `moduleResolution.diagnostics` when supplied.
3. Validate loaded artifacts and supplied host evidence against their selected
   source schemas.
4. Record loaded artifacts without an available artifact schema validator as
   `not-run` schema results, and host evidence without an available evidence
   schema validator as `not-run` evidence results.
5. Skip cross-artifact validation when required source schemas fail or do not
   run, and record the skipped phase status.
6. Evaluate cross-artifact invariants for the remaining schema-valid graph.
7. Apply fail-closed checks for unsupported features and fine-grained authorization
   placeholders.
8. Return one report sorted deterministically by severity, phase, artifact slot,
   JSON Pointer, and code.

Schema validation is a precondition for cross-artifact interpretation. A schema
valid graph can still be graph-invalid. A schema-invalid or schema-unvalidated
artifact or host-evidence document can still produce imported diagnostics, but
graph checks depending on that input MUST be skipped rather than guessed.

## 4. Validation Report

An `AppGraphValidationReport` is the validator's only output contract. It is a
data report, not an execution plan.

| Field | Required | Description |
|---|---|---|
| `ok` | yes | `true` only when no error-severity diagnostic exists in the report. |
| `summary` | yes | Counts for artifacts, schema failures, schema-unvalidated artifacts, graph errors, warnings, infos, imported diagnostics, unsupported features, and skipped phases. `unvalidatedArtifacts` counts artifact schema results only; host-evidence not-run state is represented in `evidenceResults[]` and phase status. `importedDiagnostics` excludes native `app-graph-validator`, `schema-validator`, and `ui-graph-policy` diagnostics emitted by the shared kernel. |
| `schemaResults` | yes | Per-loaded-artifact schema validation results, including schema ID, artifact source pointer, status, and schema diagnostics. This array is artifact-only. |
| `evidenceResults` | yes | Per-host-evidence schema validation results, including evidence slot, schema ID, opaque source, status, and schema diagnostics. Entries MUST NOT carry `artifactKind`, `ref`, `identity`, or App Manifest slot identity. Current evidence slots are `hostEvidence.uiGraphPolicies[N]` and `hostEvidence.componentGraphContexts[N]`. |
| `diagnostics` | yes | Unified diagnostics from native validator phases and imported resolver/module/surface-local phases. |
| `phases` | yes | Ordered phase statuses with `completed`, `skipped`, or `not-run` status and skip reason when applicable. |
| `support` | no | Optional echo of supported bundle versions, artifact kinds, schema versions, and feature flags used for the run. |
| `renderedNeedTrace` | no | Optional `RenderedNeedTraceRecord` emitted when strict rendered-Need tracing was requested and the cross-artifact phase completed (§7). Full authoring reports retain per-node traces (`inventory: "full"` or omitted); per-Definition scoped publication proofs MAY omit `nodes` (`inventory: "omitted"`, `nodes: []`, required `nodeCount`) while preserving status and canonical document digests. |

Reports MUST be deterministic for the same request and support profile. They
MUST NOT contain fetched source payloads, rendered Component output, effect
results, private credentials, or host-only cache contents.

## 5. Diagnostic Shape

Every diagnostic in the unified report MUST carry:

| Field | Description |
|---|---|
| `code` | Stable machine-readable code. Native AppGraphValidator codes SHOULD use an `APP-GRAPH-` prefix unless a sibling spec already owns a code. |
| `severity` | `error`, `warning`, or `info`. `ok` is false when any diagnostic has `severity: "error"`. |
| `phase` | One of `artifact-resolution`, `schema`, `module-resolution`, `surface-local`, `cross-artifact`, `authorization-boundary`, or `unsupported`. |
| `origin` | Producing component, such as `app-graph-validator`, `artifact-resolver`, `module-resolver`, `surface-local-lint`, `schema-validator`, or `ui-graph-policy`. |
| `message` | Human-readable explanation. |
| `primarySource` | Artifact slot/source and JSON Pointer, when available. |
| `relatedSources` | Optional list of other artifacts or pointers that explain a cross-artifact conflict. |
| `details` | Optional stable JSON object for machine consumers. It MUST NOT contain executable code or local fixture-path identity. |

Imported diagnostics MUST preserve their origin. The validator MAY normalize
their envelope into this shape, but it MUST NOT recode an `ArtifactResolver`
diagnostic as native validator authority or duplicate `ModuleResolver` findings
as independent module checks. When importing diagnostics from a
`ModuleResolutionReport`, the validator imports only the report's top-level
`diagnostics[]` and adapts resolver source pointers to the
`AppGraphValidationReport` `SourcePointer` shape. Resolver-only module evidence
stays available on the typed `moduleResolution` context input; it is not copied
into the AppGraph report source pointer and does not widen the report schema.
When a ModuleResolver diagnostic points at host evidence, the imported
AppGraph source pointer preserves only `artifactSlot`, opaque `source`, and
`jsonPointer`; it MUST NOT add `artifactKind`, `ref`, or document identity to
host evidence.

## 6. Source Schema Validation Boundary

The validator owns source schema validation for loaded artifacts in the request.
It selects schemas from the supplied schema registry and support profile. It
MUST reject or diagnose artifacts whose version/discriminator is unsupported by
that profile.

The validator does not own:

- artifact fetching,
- local path containment checks,
- remote retrieval policy,
- sibling discovery,
- module contribution resolution internals,
- renderability of generated Components,
- Response Actions invocation state, or
- Data Sources payload availability at runtime.

It also does not own runtime state. Route state belongs to the Surface runtime
router, session actor/authentication state belongs to the host session boundary,
Response data/status belongs to Core Response instances, and action
invocation/effect state belongs to Response Actions runtime. The validator may
check declared references between these artifacts, but it MUST NOT synthesize a
Runtime Plan, choose the active route, create sessions, create Response
instances, execute actions, or infer hidden-state rejection behavior.

Source schema validation answers whether each loaded artifact has the correct
shape for its declared family. Cross-artifact validation answers whether the
schema-valid artifacts are coherent together.

## 7. Cross-Artifact Invariant Ownership

The following table assigns ownership for invariants that may appear in a final
app-graph report.

| Invariant family | Owner | Report phase | Notes |
|---|---|---|---|
| Manifest sibling fetch/load, missing artifacts, local path containment, unsupported URI scheme | `ArtifactResolver` | `artifact-resolution` | Imported. The validator consumes the result and skips dependent phases. |
| Manifest sibling ref vs loaded artifact discriminator/version/identity | `ArtifactResolver`, surfaced through validator report | `artifact-resolution` | The resolver proves the handle matches the ref. The validator MUST NOT recover by guessing from filenames or URL suffixes. |
| App Manifest schema shape and supported `$formspecBundle` versions | `AppGraphValidator` schema phase | `schema` / `unsupported` | v2.0 and v2.1 support is profile-driven. Unsupported future versions fail loud. |
| Per-artifact source schemas | `AppGraphValidator` schema phase | `schema` | Runs only on loaded documents with selected schemas. |
| Module admission, module dependency, contribution ownership, widget prop schema | `ModuleResolver` | `module-resolution` | Imported from the typed `ModuleResolutionReport`. The validator passes the full report to cross-artifact validators as context evidence, imports only top-level resolver diagnostics, and does not duplicate module resolution logic. |
| Surface draft publishability, local route reachability, unresolved embed-route targets, duplicate route/slot ids | Surface export/local lint | `surface-local` | Imported or pre-run by Surface tools. Cross-artifact checks remain separate. |
| App Manifest 2.4 entry Surface and selected Surface entry route | `AppGraphValidator` | `cross-artifact` | Selects by exact manifested and loaded Surface URL. It never falls back by array order, local Surface id, filename, or route id after an explicit error. |
| Surface slots to loaded Definitions, Experience units, Response Actions, and Data Sources | `AppGraphValidator` | `cross-artifact` | Validates relationships across already loaded artifacts. The shared kernel enforces Surface `experience-unit` `unitRef` resolution, URL-exact route-local Definition context, and qualified Data Sources availability. |
| `definition-form.binding.subjectKeys` | `AppGraphValidator` | `cross-artifact` | Check the exact subject key set against each loaded version of the bound Definition and resolve every mapped parameter on the containing route ([Surface §4](../surface/surface-spec.md#definition-form-subject-keys)). |
| Experience target Definitions and unit references | `AppGraphValidator` | `cross-artifact` | Checks that references name loaded Definitions and units. |
| Response Actions targetDefinition and Surface transition trigger references | `AppGraphValidator` | `cross-artifact` | Response Actions remains the executor; validator only checks declared references. The shared kernel rejects Surface transition triggers that are neither loaded Response Actions `actions[*].id` values nor closed-core Response Actions intents declared by exactly one loaded action; it does not promote Runtime Plan commands or direct `x-` extension-intent triggers. |
| Data Sources catalog identity and availability selectors to loaded Surfaces, routes, slots, Definitions, and admitted modules | `AppGraphValidator` | `cross-artifact` | Catalog URL identity and Surface URL plus route/slot identity are exact. Route ids are not graph-global. Payload fetching, cache behavior, and runtime authorization remain out of scope. |
| Definition response-instance projections and catalog Response selection | Core `check_instance_projection` through the injected engine port | `cross-artifact` | Validate field paths, payload shapes and subject predicates against compatible upstream Definitions. See [Data Sources §4.2](../data-sources/data-sources-spec.md#42-non-draft-definition-response-selection) for catalog delivery. |
| Surface 0.2 widget data bindings to Registry 1.1 inputs and Data Sources | `AppGraphValidator` | `cross-artifact` | Resolves the widget through its module contribution, then checks the declared input and exact `(catalogRef, sourceRef)` pair. App, exact Surface, qualified route, qualified slot, or matching module availability may cover the widget; Definition-only availability does not. The optional source payload schema remains Data Sources authority and no payload is fetched here. |
| Surface 0.2 widget action bindings and completed-action transition candidates | `AppGraphValidator` | `cross-artifact` | `E612` rejects undeclared outputs, unresolved exact action ids, signing ceremony Sign bindings that lack a matching signing request, and signing ceremony `draft` bindings whose `producer` is missing, unresolved, cross-Definition without a declared Mapping relation, or lacks a response-scoped `prepare` request. `E611` credits a widget only through Registry output plus Surface mapping plus the same resolved action (and a valid ceremony draft `producer` when required). Zero transition candidates reports a stay result; more than one reports ambiguity and selects none. |
| Duplicate visible titles in one proven display scope | `AppGraphValidator` | `cross-artifact` | Emits an advisory warning for repeated effective navigation labels in one Surface scope, route-to-visible-slot titles, tasks within one Experience, sibling or immediate parent-child Section/Panel titles outside the resolved section check, and titles within one resolved StructuredPanel. Comparison applies Unicode NFC normalization, trimming, and whitespace collapse, and remains case-sensitive. |
| Workspace and Wizard section titles | `AppGraphValidator` | `cross-artifact` | Reports an error when two sections in one resolved presentation have the same statically known title in the original wording or one admitted Definition Locale, including its fallback. The layout planner determines which Component Sections, Theme pages, generated groups, loose headings, or explicit Wizard steps are present. A title whose winning text depends on an answer is not statically known. |
| App Manifest 2.4 Locale reference and target association | `AppGraphValidator` | `cross-artifact` | Locale reference URLs are unique, reference and document language tags compare after BCP 47 case normalization, the target is the current app or one exact loaded Definition, and normalized `(target kind, target URL, locale)` tuples are unique. |
| Screener `surface:<route-id>` terminal-hop targets | `AppGraphValidator` | `cross-artifact` | Applies only to Screener handles associated by App Manifest v2.3 `screeners[]` URL/version evidence. The shared kernel enforces exactly-one loaded Surface `routes[].id` resolution and does not infer association from TraceIndex, Runtime Plan, hostEvidence, filenames, loaded Definitions, or Surface route names. |
| UI graph policy to routes, locale keys, responsive rules, hidden Definition refs, and Theme widget refs/token slots/categories | UI Graph Policy spec plus `AppGraphValidator` | `cross-artifact` | `specs/app-graph/ui-graph-policy-spec.md` defines the prose boundary and `ui-graph-policy` is an admitted report origin. The shared kernel currently enforces host-evidence-backed Surface/route, policy-local Locale-owner, Locale-owner module-id resolution against completed ModuleResolver evidence, hidden Definition reference diagnostics, Theme widgetRef resolution against completed ModuleResolver widget contribution evidence, Theme token-slot checks against completed ModuleResolver `widgetTokenSlots[]` evidence, Theme token reference/category checks over exactly-one loaded Theme evidence, and custom `x-*` category compatibility against completed ModuleResolver `tokenCategories[]` evidence; runtime hidden-state and consumer checks remain later gates. |
| Fine-grained actor, route, operation, widget, field, or source authorization | Future authorization contract | `authorization-boundary` | Until a dedicated authorization contract lands, such fields fail closed rather than receiving semantics. |
| Response Actions invocation, idempotency replay, effect execution, and ledger append | Response Actions runtime and LedgerPort gates | not validator-owned | The validator may check references but must not execute behavior. |
| Component Surface/route target resolution, duplicate route claims, route-bound control Definition context, fake `targetDefinition` rejection, and node identity disambiguation | Component Surface/route identity contract plus `AppGraphValidator` gates | `cross-artifact` | The shared kernel currently enforces loaded Component membership, Surface/route/slot target resolution, duplicate route claims, exact-only Surface version mismatch, ref-less Component handle rejection, evidence-limited fake `targetDefinition` rejection, URL-based `definition-form` route context for route-bound Components with bound controls, stable route-scoped nodePath segment availability (`nodeId`, then `bind`, then `id`), sibling segment ambiguity, and duplicate constructed graph-wide Component node identity keys. Studio/kernel graph-wide operations and provenance validation remain later gates. |
| Component projection output and renderer fallback | Projection/runtime/renderer gates | not validator-owned | The validator may check future Component graph identity, but it must not render Components or choose fallback behavior. |

#### Response projection context

The validator pairs each response instance and each catalog `definition-response`
selection with all loaded Definitions whose reference and document URLs both
match the selection. It supplies those Definitions in one call to the engine
port, including an empty set when none are loaded. Core selects eligible versions
and checks paths, types, directly carried choice values and subject predicates.
The caller supplies the consuming Definition and instance name for an instance
read. A catalog form prefill supplies the receiving Definition and whether the
slot applies a reverse Mapping. For an unmapped single-record selection that
targets the receiving Definition URL and admits its version, Core compares
stored option values at matching delivered data paths. Widget inputs have no receiving
Definition and pass `null`. Session drafts use the exact Definition resolved by
the catalog's `definitionRef`.

Authoring and publication callers MUST inject an engine port that performs these
checks. AppGraph refuses a projection when the caller omits that port. Each
finding points into the consuming artifact and preserves Core's
`details.upstreamVersion`, including `null` when the finding has no single version.

#### Stable rendered-Need evidence rule

**Normative rule `rendered-node.direct-need-trace`.** When the caller activates
the strict rendered-Need trace profile, AppGraphValidator MUST credit a
candidate output only when the loaded graph proves both relationships: the
candidate carries a direct `need:<id>@<revision>` anchor to the current adopted
Need, and the candidate is mounted through resolved graph relationships. The
validator MUST keep this static result separate from runtime authorization,
applicability, precondition, effect, and Need-satisfaction conclusions.

#### Effective publication trace

**Normative rule `rendered-node.effective-need-trace`.** Under the strict
rendered-Need publication profile ([Needs §10.3](../needs/needs-spec.md#103-publication-trace)),
AppGraphValidator MUST export the effective trace for every inventoried node
using the ownership rules below.
A **direct trace** is a pinned `need:<id>@<revision>` anchor, or a typed
`needRefs[]` citation where the profile already credits it. For a node `n`:

```text
effective(n) = direct(n)                          if n carries a direct trace
             = union(effective(o) for o in owners(n)) if owners(n) is non-empty
             = empty                              otherwise
```

A node's direct trace takes precedence over every owner. Otherwise the nearest
direct traces supply its effective trace; several owners contribute their
union. An explicit unresolved, non-adopted, stale, or malformed trace MUST NOT
be replaced by an owner's trace to avoid a finding. The validator MUST resolve
ownership only through this closed table, within one Definition or Screener:

| Node | Owner |
|---|---|
| inline option | its field |
| optionSet option | every field that names the set; if none, the Definition root |
| bind | the item(s) its `path` resolves to |
| Shape | the item(s) its `target` resolves to; `#` means the Definition root |
| References entry | its target item; `#` means the Definition root |
| child item | its parent item |
| top-level item | Definition root |
| Component node with `bind` | the bound item |
| Locale string localizing a node above, or the Definition's own text (Locale §3.1.5 Form-Level Strings) | that node |
| Screener nodes | the same rows, ending at the Screener root |

Trace roots are every inventoried node with no owner under this table,
including a node whose owner does not resolve; each MUST carry its own direct trace. They include:

- Definition and Screener roots;
- every Surface node;
- every Experience unit title;
- every action and every source;
- the App Manifest title and the Theme document;
- every Component node without `bind`; and
- every Locale string that localizes no node in this table.

The Definition root MUST NOT inherit from a Surface slot that mounts it.
Experience unit `itemRefs` MUST NOT supply item traces. A node serving a
different Need from its owner is an override; Needs §8 rule 1 requires its anchor. Ownership
resolution failure MUST NOT grant a trace from an unrelated node or document.

The validator MUST report defects at their cause, rather than repeating them
on nodes that inherit the same trace:

| Code | Severity | Fires |
|---|---|---|
| `APP-GRAPH-RENDERED-NEED-MISSING` | error | once per trace root with an empty effective trace, listing its dependent descendants in `relatedSources`. |
| `APP-GRAPH-RENDERED-NEED-UNRESOLVED` | error | once per offending anchor or typed citation that does not resolve to exactly one paired Need. |
| `APP-GRAPH-RENDERED-NEED-NON-ADOPTED` | error | once per offending anchor or typed citation whose Need is not adopted. |
| `APP-GRAPH-RENDERED-NEED-STALE` | error | once per offending anchor whose pinned revision is not the Need's current revision. |
| `APP-GRAPH-RENDERED-NEED-REDUNDANT` | warning | A node's direct trace equals the trace it would inherit, comparing complete traces including pinned revisions. |

An override is checked independently. `REDUNDANT` does not block publication;
generators SHOULD NOT write redundant anchors (Needs §8). The existing
`APP-GRAPH-RENDERED-NAVIGATION-IMPLICIT` rule and Surface strict profile remain
unchanged. The usable-outcome rule `rendered-node.direct-need-trace` above
continues to credit direct traces only.

The completed report MUST include `renderedNeedTrace.nodes[]` (empty only when
`status` is `not-applicable` or when `inventory` is `"omitted"` for a compact
publication proof). In a full authoring report (`inventory: "full"`, the default
when `inventory` is omitted), each `nodes[]` record
contains the node's `source` (including its `artifactSlot` and document-local
`jsonPointer`), `kind`, `label`, and `effective: {needIds, via}`. The node's
`source` and each `via` entry use the same source-pointer shape; the empty
`jsonPointer` identifies the document root:

- `needIds` is the deduplicated set of effective Need identifiers. It records
  trace identity even when a Need is unresolved, non-adopted, or stale; it is
  not an admission or satisfaction result.
- `via` is a deduplicated array of source pointers to the nearest direct trace-bearing nodes
  that contribute the effective trace. Each pointer includes that node's
  `artifactSlot` and document-local `jsonPointer`, plus any resolved document
  identity evidence. A direct trace points to the node
  itself; an inherited trace points to its contributing owners' trace-bearing
  nodes; a missing trace has empty `needIds` and `via` arrays.

The inventory, `needIds`, and `via` MUST use ascending Unicode code point order:
sort nodes by `source.artifactSlot`, then `source.jsonPointer` (the pair is unique per inventoried node);
sort `needIds` lexicographically; and sort `via` by `artifactSlot`, then `jsonPointer`.
Source-pointer identity for deduplication is the pair (`artifactSlot`, `jsonPointer`);
optional document evidence does not create a second node identity. A
`not-applicable` record contains `nodes: []`.

Per-Definition scoped publication reports MAY omit the per-node inventory to
emit a **compact publication proof** bounded for server publication payloads:
`renderedNeedTrace.inventory` MUST be `"omitted"`, `renderedNeedTrace.nodes`
MUST be `[]`, and `renderedNeedTrace.nodeCount` MUST be a non-negative integer
recording the exact count of verified scoped trace nodes omitted from `nodes`
(a server verifying a Need-traced Definition requires `nodeCount > 0`;
[Needs §10.3](../needs/needs-spec.md#103-publication-trace)). A compact
publication proof MUST retain `ok`, `summary`, `phases`, `schemaResults`,
`evidenceResults`, scoped `diagnostics` (including any scoped
`APP-GRAPH-RENDERED-NEED-REDUNDANT` warnings), `renderedNeedTrace.status:
"completed"`, and the canonical `definitions`, `locales`, and `components`
digests. Full authoring reports and opt-in full scoped reports (`inventory:
"full"`) retain populated `nodes[]` and MAY include `nodeCount` equal to
`nodes.length`. Authoring and review consumers that inspect per-node traces MUST
consume full reports (`inventory: "full"`) rather than compute a second
inheritance implementation. The existing `definitions`, `locales`, and
`components` canonical digest bindings and the server proof in Needs §10.3 rule
4 remain authoritative.

For a Surface 0.4 form-status slot, graph validation MUST resolve each entry
to one same-Surface route and one Definition-form slot. It MUST reject missing
or unknown parameter sources, repeated groups with the same ID, statically
duplicate targets, and conflicting subject-key sources within a group.
Runtime additionally rejects duplicate targets whose parameter values coincide
after resolution. The strict rendered-Need profile checks the slot, binding,
each group and each entry as distinct direct trace nodes.

### 7.1 vNext Surface graph diagnostics

The built-in vNext checks use these stable diagnostic families:

| Code | Severity | Meaning |
|---|---|---|
| `APP-ENTRY-AMBIGUOUS` | error | App Manifest 2.4 declares multiple Surfaces without `entrySurface`. |
| `APP-ENTRY-SURFACE-UNRESOLVED` | error | An explicit `entrySurface` does not match exactly one manifested and loaded Surface URL. |
| `SURFACE-ENTRY-UNRESOLVED` | error | The selected Surface's `entry` does not match exactly one route in that Surface. |
| `DATA-SOURCE-CATALOG-REF` | error | A loaded Data Sources catalog is not manifested exactly once or its document `id` differs from that reference URL. |
| `DATA-SOURCE-ID-COLLISION` | error | A catalog declares the same source id more than once. |
| `DATA-SOURCE-AVAILABILITY-REF` | error | A Definition, Surface, qualified route, qualified slot, or module availability selector does not resolve. |
| `APP-GRAPH-PROJECTION-CHECK-MISSING` | error | A response projection requires an injected engine check and the caller has not provided one. |
| `INSTANCE-PROJECTION-DEFINITION-MISMATCH` | error | The selection has no upstream Definition URL, or a supplied Definition has a different URL. |
| `INSTANCE-PROJECTION-VERSION-INVALID` | error | An upstream Definition lacks a version identifier, or a declared range or version fails SemVer parsing. |
| `INSTANCE-PROJECTION-VERSION-AMBIGUOUS` | error | Multiple supplied Definitions identify the same eligible version. |
| `INSTANCE-PROJECTION-NO-ELIGIBLE-VERSION` | error | No supplied upstream Definition version matches the selection. |
| `INSTANCE-PROJECTION-SCHEMA-UNSUPPORTED` | error | The catalog schema or mapped output cannot be compared statically with the upstream Definition. |
| `INSTANCE-PROJECTION-PATH-MISSING` | error | A projected field path or catalog root data key is missing from an eligible upstream Definition. |
| `INSTANCE-PROJECTION-FIELD-TYPE-MISMATCH` | error | The declared projection admits a different field type from the upstream Definition. |
| `INSTANCE-PROJECTION-OPTION-VALUES-MISMATCH` | error | A directly carried choice or multiChoice field declares different stored option values from an eligible upstream field. |
| `INSTANCE-PROJECTION-SUBJECT-MISSING` | error | An eligible upstream Definition lacks a subject declaration. |
| `INSTANCE-PROJECTION-SUBJECT-TYPE-MISMATCH` | error | Eligible upstream versions declare different subject types. |
| `INSTANCE-PROJECTION-SUBJECT-KEY-TYPE-DRIFT` | error | Eligible upstream versions declare different subject key sets or key types. |
| `INSTANCE-PROJECTION-SUBJECT-KEY-MISSING` | error | A predicate names an undeclared upstream subject key, or a catalog predicate names an undeclared consuming key. |
| `INSTANCE-PROJECTION-SUBJECT-KEY-TYPE-MISMATCH` | error | A predicate compares incompatible declared key types or names an upstream key with an unsupported type. |
| `INSTANCE-PROJECTION-SUBJECT-INTEGER-REQUIRED` | error | A predicate uses an integer-only operation on a non-integer upstream key. |
| `APP-GRAPH-WIDGET-DATA-BINDING` | error | An optional widget data binding names an undeclared input, catalog, source, or unavailable source. |
| `WIDGET-DATA-REQUIRED-UNAVAILABLE` | error | A required Registry input is unbound or its exact source descriptor is unavailable. |
| `E612` | error | A Surface widget action binding names an output the resolved Registry widget does not declare or an `actionRef` that does not resolve to exactly one loaded Response Actions action. The `sign` output of delivery contract `@formspec-org/surface-react/SigningCeremony@0.1` MUST resolve to a response-scoped Action with exactly one referenced signing operation, `sign` ([Response Actions §6.6](../response-actions/response-actions-spec.md#66-service-requests)), and its `draft` data binding MUST declare a valid `producer` (`routeRef`, `definitionRef`, `actionRef`, and `relation` when cross-Definition) resolving in that upstream route context to a response-scoped Action with exactly one referenced signing operation, `prepare`. |
| `WIDGET-ACTION-TRANSITION-AMBIGUOUS` | error | A completed widget action has more than one transition candidate on the same qualified route; no candidate is selected. |
| `APP-GRAPH-WIDGET-ACTION-TRANSITION` | info | A completed widget action has no transition candidate on the same qualified route; the route stays unchanged. |
| `APP-GRAPH-SECTION-TITLE-DUPLICATE` | error | Two resolved workspace or Wizard sections have the same normalized title in one Locale or in the original wording. |
| `APP-GRAPH-UX-TITLE-DUPLICATE` | warning | A normalized visible title repeats within one display scope the loaded graph can prove. |
| `APP-GRAPH-LOCALE-REF` | error | App Manifest Locale reference URL uniqueness or reference-to-document locale coherence fails. |
| `APP-GRAPH-LOCALE-TARGET` | error | A Locale target or its optional compatible-version range does not resolve against the current app graph. |
| `APP-GRAPH-LOCALE-DUPLICATE` | error | Loaded Locales duplicate a normalized `(target kind, target URL, locale)` tuple. |

Every rule above reads only resolved artifact handles and completed
ModuleResolver evidence. It does not fetch source payloads, choose a runtime
route, execute an action, or inspect filenames and local paths for identity.

## 8. Unsupported Features and Authorization

A processor MUST fail loud when a graph uses an artifact version, manifest
version, sibling slot, or feature outside the supplied support profile. It MUST
NOT silently ignore unknown non-extension graph features in order to produce a
partial app.

Fine-grained authorization remains outside this specification. Until a
dedicated authorization contract lands, the validator MAY carry binary
admission evidence supplied by the host or session boundary, but MUST reject
fields that attempt to define
per-actor, per-route, per-artifact, per-operation, per-widget-class, per-field,
or per-source authorization semantics.

## 9. Conformance

This v0.1 draft defines the prose validator contract, the shared report
schema/generation evidence, and paired source conformance for Component
route-target, route-bound-control Definition-context, Component node identity,
Screener `surface:<route-id>` target, UI Graph Policy Surface/route, UI Graph
Policy Locale-owner, hidden Definition, Theme widgetRef, App Manifest 2.4 entry,
Data Sources availability, Surface widget data/action, and Locale association
validator families. A conforming future implementation still needs later gates
to provide:

1. broader fixture-backed conformance beyond these built-in families and the
   typed `ModuleResolutionReport` diagnostic handoff,
2. broader extraction from lint, studio-core, and spike-local lessons without fixture
   assumptions, and
3. production consumers wired to shared validator output.

Until those gates land, tools MAY use this document to align interfaces and
diagnostic vocabulary, but MUST NOT claim production `AppGraphValidator`
conformance from this prose and report schema alone.

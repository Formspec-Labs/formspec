/**
 * @filedesc The gap ledger — the spike's actual deliverable.
 *
 * Every piece of this app that the platform did NOT supply is registered here,
 * with what it stands in for and where it belongs. The rule the spike runs on:
 * **a stub that renders convincingly and is not recorded is a failure, not a
 * success.** The running app exists to earn this list.
 *
 * `naturalHome` is a judgment, and it is the part of the ledger that shapes the
 * SaaS renderer work, so each entry says why that home and not another.
 */

/** Where a hand-built piece belongs once the platform grows up. */
export type NaturalHome =
  /** The public reference UI. It already owns respondent rendering + composition roots. */
  | 'formspec-web'
  /** A package that does not exist: reads a SurfaceDocument, composes an app. */
  | 'new: surface-shell package'
  /** The module Registry's widget contribution family (ADR 0150 §6.2). */
  | 'registry widget family'
  /** An existing shipped package that should have exported or owned this. */
  | 'existing package, unexported'
  /**
   * Not a renderer's to fix at all: the artefact contract itself is missing
   * something. Added after the shell shipped, because implementing the closed
   * taxonomies surfaced findings no package could close.
   */
  | 'spec or schema, upstream of any renderer'
  /** Legitimately spike-only. Does not belong anywhere. */
  | 'spike scaffolding';

export type GapKind =
  /** Nothing in the stack does this at all. */
  | 'missing-machinery'
  /** Something in the stack does this, but no consumer can reach it. */
  | 'unreachable-machinery'
  /** A widget the bundle names and nothing implements. */
  | 'stub-widget'
  /** Two shipped vocabularies that do not line up, bridged by hand. */
  | 'vocabulary-bridge';

/**
 * What landed, for an entry that has been closed.
 *
 * **Closed entries stay in the ledger.** A gap report that deletes what it
 * fixed loses the history that makes the rest of it credible: a reader cannot
 * tell a list that was always short from one that was worked down, and cannot
 * check that the fix went where the entry said it belonged. So a resolved entry
 * keeps its original `what` / `whyNeeded` / `homeRationale` verbatim — including
 * where it predicted the fix belonged — and carries this beside them.
 */
export interface GapResolution {
  /** Files that changed, so the claim is checkable rather than asserted. */
  landedIn: readonly string[];
  /** The permanent test or diagnostic that keeps it closed. */
  guardedBy: readonly string[];
  /** What the app measured before and after, in one line each. */
  before: string;
  after: string;
  /** Whether the fix landed where `naturalHome` predicted. */
  naturalHomeHeld: boolean;
  naturalHomeNote?: string;
}

export interface GapEntry {
  id: string;
  /** What the shell had to build, in product language. */
  what: string;
  /** Why the app could not run without it. */
  whyNeeded: string;
  /** Where it belongs, and why there. */
  naturalHome: NaturalHome;
  homeRationale: string;
  kind: GapKind;
  /**
   * File in this spike that HELD the hand-built code when the gap was recorded.
   * Several of these paths no longer exist — that is the point of keeping them.
   */
  source: string;
  /** Present ⇒ closed. The entry and its rationale stay put; see {@link GapResolution}. */
  resolved?: GapResolution;
}

export const GAP_LEDGER: readonly GapEntry[] = [
  {
    id: 'bundle-manifest-dereference',
    what: 'Turning the bundle export into typed documents: walking `manifest.definitions / experience / theme / registries / surfaces`, looking each `url` up in the export\'s `documents` map, and failing loudly when one is absent.',
    whyNeeded:
      'The manifest indirects every artifact through a URL. Before a single route can be matched, something has to resolve those URLs into a `SurfaceDocument`, a `ThemeDocument`, a `FormDefinition`. It is the first thing the app does and the shell wrote all of it.',
    naturalHome: 'existing package, unexported',
    homeRationale:
      'The shipped machinery that arguably covers this is `resolveArtifacts` in `@formspec-org/app-graph` — and it is a good piece of work: it is genuinely on the public export surface (unlike `ROUTE_CLASS_THEME_AUTHORITY`), it knows all fourteen manifest slots and their `$formspec*` discriminators, it version-gates slots by `$formspecBundle` (this export is `2.0`), and it returns per-slot diagnostics instead of throwing. The spike could not use it for two reasons, and both are shape rather than quality. First, it resolves **sibling refs through a caller-supplied `ArtifactLoader`** — it models a manifest whose artifacts live somewhere else. A bundle export has already inlined them under `documents`, so the loader the spike would pass is `({ ref }) => bundleExport.documents[ref.url]`: the exact lookup that is the gap, now wrapped. Second, `ArtifactResolutionHandle.document` is `unknown` by design — the schema calls it an "opaque loaded source document… preserved only as data evidence" — so a renderer still has to narrow every artifact by hand. The resolver is built to produce a validation report, not to hand a renderer typed artifacts. The bundle-export arm, and the typing, belong beside it.',
    kind: 'missing-machinery',
    source: 'src/bundle.ts',
    resolved: {
      landedIn: [
        'formspec/packages/formspec-surface/src/bundle.ts — `dereferenceBundleExport` walks every manifest slot and returns typed artifacts plus a diagnostic per absence.',
        'formspec/spikes/surface-render-v10/src/bundle.ts — the hand-written `document<T>()` walk is deleted; what is left is which two files on disk are read.',
      ],
      guardedBy: [
        'packages/formspec-surface/tests/bundle.test.ts — including a listed-but-absent document and a manifest slot pointing at a non-document.',
      ],
      before:
        'Every manifest slot dereferenced by hand in the spike, throwing on the first absence.',
      after:
        'One call. A missing document is a `BUNDLE-DOCUMENT-MISSING` diagnostic; `bundleIsRenderable()` is the refusal edge.',
      naturalHomeHeld: false,
      naturalHomeNote:
        'The entry put this beside `resolveArtifacts` in `@formspec-org/app-graph`; it landed in the shell package instead. The reason is the entry’s own second point: `ArtifactResolutionHandle.document` is `unknown` BY DESIGN, because the resolver produces a validation report. Typed artifacts for a renderer is a different job, and merging it would make the resolver serve two masters. This ships the typing job and only that — no validation, no version gating — so a host runs both. **Still open upstream:** the VALIDATING bundle-export arm, which would let `resolveArtifacts` model an export whose documents are already inlined. One mechanism change from the spike, and it was a correction: throwing told a host about one absence at a time and gave it nothing to show a person.',
    },
  },
  {
    id: 'surface-shell',
    what: 'The shell itself: reads the Surface documents\' routes, builds the navigation, matches the browser URL to a route, and renders the matched route.',
    whyNeeded:
      'A bundle export describes four routes across two Surfaces. Nothing in the stack turns that description into something a person can click through. This is the whole hypothesis, and it held.',
    naturalHome: 'new: surface-shell package',
    homeRationale:
      'It is not respondent-specific, so formspec-web is too narrow — the operator route is in the same bundle. It has no opinion about React beyond the slot renderers it delegates to, so it wants its own package with a renderer-shaped port, the way formspec-react and formspec-webcomponent already split.',
    kind: 'missing-machinery',
    source: 'src/shell/SurfaceShell.tsx',
    resolved: {
      landedIn: [
        'formspec/packages/formspec-surface — the renderer-independent core: composition, route matching, slot planning, theme authority, widget registry, transitions.',
        'formspec/packages/formspec-surface-react/src/SurfaceApp.tsx — the React binding.',
        'formspec/spikes/surface-render-v10/src/app.tsx — what the spike became: a host that supplies a verified bundle, widget modules, runtime data and chrome.',
      ],
      guardedBy: [
        'packages/formspec-surface/tests — 8 files; packages/formspec-surface-react/tests — route rendering and the widget set.',
        'scripts/check-dep-fences.mjs — surface at layer 2, surface-react at layer 3.',
      ],
      before:
        '`src/shell/SurfaceShell.tsx` in a spike. No Surface consumer anywhere in the stack read routes at render time.',
      after:
        'Two published packages. The spike imports them and its local shell/, slots/ and widgets/ directories are deleted.',
      naturalHomeHeld: true,
      naturalHomeNote:
        'Built exactly as the rationale argued — a core that plans and a thin React binding that renders, mirroring the formspec-react / formspec-webcomponent split. Placement went to the formspec npm layer rather than formspec-web because formspec-web is `private: true` and vendors its Formspec dependencies: a shell there could not be reached by case-portal, formspec-cloud or formspec-studio, and the operator route in this bundle is the proof that respondent-scope is too narrow. One thing the entry did not anticipate: navigation had to become a port (`location` / `onNavigate`), because a shell that owns history cannot be embedded in a host that already has a router.',
    },
  },
  {
    id: 'route-matching',
    what: 'Route path matching, including the `:caseRef` parameter in `/receipt/:caseRef`.',
    whyNeeded:
      'The Surface authors paths with parameter markers. Nothing parses them at runtime, so the shell hand-rolled a matcher and hand-supplied a placeholder case reference.',
    naturalHome: 'new: surface-shell package',
    homeRationale:
      'The Surface spec §3 "Route Parameters" already defines the marker grammar and a `params[]` declaration. A matcher that reads them is spec-implementing code, not app code, so it belongs beside the shell that consumes it.',
    kind: 'missing-machinery',
    source: 'src/shell/route-match.ts',
    resolved: {
      landedIn: [
        'formspec/packages/formspec-surface/src/route-path.ts — marker parsing, matching, filling, and the `params[]` cross-check from surface-spec §3.',
      ],
      guardedBy: [
        'packages/formspec-surface/tests/route-path.test.ts — 24 cases including both grammars, percent-encoding, separator containment and regex metacharacters in a path.',
      ],
      before:
        'A hand-rolled matcher in the spike, with a placeholder case reference baked in beside it.',
      after:
        'Shipped, with the parameter VALUE still a host input — `routeParams` — rather than a shell invention.',
      naturalHomeHeld: true,
      naturalHomeNote:
        'Two spike behaviours corrected on the way in. A marker with no supplied value now stays in the string and raises `ROUTE-PARAM-UNSUPPLIED`; the spike substituted the parameter NAME, so `/receipt/caseRef` was a broken link that looked like a working one. And a malformed percent-escape no longer throws out of a render.',
    },
  },
  {
    id: 'route-path-grammar-mismatch',
    what: 'Accepting two different route-parameter grammars in one matcher.',
    whyNeeded:
      'The Surface spec §3 pins v0.1 parameters as URI-Template markers — `/matter/{matterId}` — paired with a `params[]` declaration. The signed bundle authors `/receipt/:caseRef`: Express style, no `params[]`. Both are schema-valid, because `path` is constrained only to a non-empty string.',
    naturalHome: 'existing package, unexported',
    homeRationale:
      'This is a spec-and-schema defect, not a renderer one. A signed, shipped bundle carries a parameter marker the spec\'s own grammar does not define, and nothing caught it — not lint, not the app-graph validator, not the signing ceremony. Either `path` gets a pattern and the authoring tools emit the pinned grammar, or the spec adopts the grammar the tools actually emit. Leaving both is how two renderers end up disagreeing about what a URL means.',
    kind: 'vocabulary-bridge',
    source: 'src/shell/route-match.ts',
    /**
     * OPEN. `@formspec-org/surface` reads both grammars and raises
     * `ROUTE-PARAM-GRAMMAR` on the unpinned one, so a renderer is no longer
     * silently choosing — but silence was the symptom, not the defect. `path`
     * still carries no `pattern`, the authoring tools still emit `:name`, and a
     * second renderer implementing only the pinned grammar would still 404 a
     * signed bundle. Filed under 'existing package, unexported' when the
     * taxonomy had no better slot; today it would be
     * 'spec or schema, upstream of any renderer'.
     */
  },
  {
    id: 'slot-dispatch',
    what: 'Slot dispatch: mapping each of the five `slotType` values to something that renders.',
    whyNeeded:
      'The slot taxonomy is closed and shipped (ADR 0150 §6.2), and it is enforced by lint and by the app-graph validator. No runtime anywhere reads it. Every slot on screen goes through a dispatch table this spike wrote.',
    naturalHome: 'new: surface-shell package',
    homeRationale:
      'The taxonomy is closed, so the dispatch is exhaustive and belongs at exactly one site. Putting it in formspec-web would mean the web component flavour has to write it a second time.',
    kind: 'missing-machinery',
    source: 'src/slots/SlotRenderer.tsx',
    resolved: {
      landedIn: [
        'formspec/packages/formspec-surface/src/slot-plan.ts — `planRoute`, exhaustive over the taxonomy with no `default` arm and a `never` check.',
        'formspec/packages/formspec-surface-react/src/SurfaceSlot.tsx — binds each plan variant to elements and nothing else.',
      ],
      guardedBy: [
        'packages/formspec-surface/tests/slot-plan.test.ts — one assertion per slot type, plus embed composition, embed cycles and dangling embeds.',
        'The compiler: a sixth slot type fails to build at the decision site.',
      ],
      before:
        'A 40-line switch in a spike, with `embed-route` unimplemented.',
      after:
        'Dispatch happens once, in the renderer-independent core, and produces a typed plan a second renderer can consume unchanged.',
      naturalHomeHeld: true,
      naturalHomeNote:
        '**`embed-route` is now implemented**, which the spike deliberately skipped for want of a fixture. It recurses into the embedded route’s slots under the HOST route’s theme grant — an embedded `intake` route inside a `proof` route cannot restore branding, which is the same rule `ui-graph-policy.ts` walks embed edges for — steps heading levels down one, and terminates on cycles, since `routeRef` is constrained to a route id and not to an acyclic graph.',
    },
  },
  {
    id: 'module-widget-runtime',
    what: 'A runtime registry that resolves a `{moduleId, widgetName}` binding to a component.',
    whyNeeded:
      'Four of the ten slots in this bundle are module widgets. The Registry document declares their shape, the ModuleResolver admits them at validation time, and then nothing renders them.',
    naturalHome: 'registry widget family',
    homeRationale:
      'The Registry already owns widget identity, version, and `widgetShape` including `tokenSlots`. The runtime lookup should hang off the same identity, not off a second parallel table. `formspec-webcomponent` has a `ComponentRegistry`, but it keys on Definition component types (TextInput, Section) — a different vocabulary, not this one.',
    kind: 'missing-machinery',
    source: 'src/slots/ModuleWidgetSlot.tsx',
    resolved: {
      landedIn: [
        'formspec/packages/formspec-surface/src/registry.ts — `createWidgetRegistry`, generic over the component type, and `widgetContributionFor`.',
        'formspec/packages/formspec-surface-react/src/widget-api.ts — `SurfaceWidgetModule`, the delivery channel a module publishes components through.',
      ],
      guardedBy: [
        'packages/formspec-surface/tests/registry.test.ts — including the PascalCase case and an assertion that a binding written as the contribution id does NOT resolve.',
      ],
      before:
        'A `Record<string, Component>` keyed `moduleId/widgetName` in the spike. Nothing in the stack did the lookup.',
      after:
        'Resolution hangs off Registry identity, with three outcomes: `resolved`, `unimplemented` (declared, nothing ships it) and `undeclared`.',
      naturalHomeHeld: true,
      naturalHomeNote:
        'Hangs off the Registry identity exactly as the rationale asked, and the vocabulary detail is load-bearing: the lookup keys on `widgetShape.widgetName` reached through the declaring module’s `contributes[]`, which is what a Surface `module-widget` binding actually writes. ADR 0160 §2.4 — three fields called some variant of “widget name”, three vocabularies. A registry keyed on `RegistryEntry.name` resolves nothing the day a module uses a PascalCase widget name, which the schema explicitly permits. **Residual:** this is a second implementation of the same walk as app-graph’s module-private `widgetContributionNameFor`, pinned to it by doc comment and test rather than by shared code.',
    },
  },
  {
    id: 'widget-x-intake-banner',
    what: 'Stub for the `x-intake-banner` widget.',
    whyNeeded: 'The bundle binds it on /apply. No implementation exists in any repo.',
    naturalHome: 'registry widget family',
    homeRationale:
      'It is a tenant-supplied chrome widget: the module declares it, so the module should ship it. Today a module can declare a widget it has no way to deliver.',
    kind: 'stub-widget',
    source: 'src/widgets/tenant-chrome.tsx',
    resolved: {
      landedIn: [
        'formspec/packages/formspec-surface-react/src/widgets/intake-banner.tsx',
      ],
      guardedBy: [
        'packages/formspec-surface-react/tests/widgets.test.tsx — including the empty state and the composed heading level.',
      ],
      before:
        'A stub with invented reassurance copy: “Most people finish this in about ten minutes. Your answers are saved as you go.”',
      after:
        'Eyebrow, headline, body and checklist all from `binding.config`. Configured with nothing, it says so.',
      naturalHomeHeld: true,
      naturalHomeNote:
        'The delivery channel the entry asked for is `SurfaceWidgetModule`: a module declares widgets in its Registry entry, a host supplies components keyed by the same names. The invented copy is gone — it was a promise the renderer made on the tenant’s behalf about a draft store the bundle does not describe.',
    },
  },
  {
    id: 'widget-x-ceremony-frame',
    what: 'Stub for the `x-ceremony-frame` widget.',
    whyNeeded: 'The bundle binds it on /certify. No implementation exists in any repo.',
    naturalHome: 'registry widget family',
    homeRationale:
      'Same as the banner, with a sharper edge: this widget frames a signing act on a `ceremony` route, where tenant tokens are refused. A module-supplied widget that is required to render unbranded is a shape the Registry does not currently express.',
    kind: 'stub-widget',
    source: 'src/widgets/tenant-chrome.tsx',
    resolved: {
      landedIn: [
        'formspec/packages/formspec-surface-react/src/widgets/ceremony-frame.tsx',
      ],
      guardedBy: [
        'packages/formspec-surface-react/tests/widgets.test.tsx — `marks its theme posture in the DOM` and `offers no control that would look like signing`.',
      ],
      before:
        'A stub with placeholder affirmation text and a note admitting it was placeholder.',
      after:
        'Renders the statement being attested to — the preimage — from `binding.config`, and no control that looks like signing.',
      naturalHomeHeld: true,
      naturalHomeNote:
        '**The sharper edge held without the Registry expressing it.** The widget carries no unbranded rule of its own: it paints only through `--formspec-*` properties, and on a refusing route those were emitted from a theme document built from the platform token registry that never saw a tenant value. It cannot reach a tenant token because none is in scope. So the Registry still cannot say “this widget must render unbranded” — and does not need to, which is a better answer than adding the field.',
    },
  },
  {
    id: 'widget-x-receipt-panel',
    what: 'Stub for the `x-receipt-panel` widget — and, inside it, the entire receipt.',
    whyNeeded:
      'The bundle binds a receipt panel on the `proof` route and supplies nothing for it to show: no submitted answers, no case reference, no issued artifact. The spike renders the signature facts it does have, and invents the rest.',
    naturalHome: 'registry widget family',
    homeRationale:
      'The widget is registry-shaped, but its content is not. A receipt is an artifact the platform issues, and the bundle carries no session or response data to build one from. That is the gap under the gap — recorded separately as `no-runtime-state`.',
    kind: 'stub-widget',
    source: 'src/widgets/tenant-chrome.tsx',
    resolved: {
      landedIn: [
        'formspec/packages/formspec-surface-react/src/widgets/receipt-panel.tsx',
      ],
      guardedBy: [
        'packages/formspec-surface-react/tests/widgets.test.tsx — `invents no reference number when there is nothing to show`.',
      ],
      before:
        'A stub with an invented reference, an invented layout, and the signature facts alongside them.',
      after:
        'Every fact from the host data resolver, except the case reference, which comes from the route parameter. Handed nothing: “There is no receipt to show.”',
      naturalHomeHeld: true,
      naturalHomeNote:
        'The entry was right that the widget and the receipt are two things. The widget shipped; the receipt has not, and `no-runtime-state` stays open. The one fact the widget takes without a host is the route parameter, because a `/receipt/{caseRef}` route IS addressed by the reference — the URL is a fact, not an invention. A receipt panel that fabricates a reference number is worse than an empty one: the empty one cannot be mistaken for proof.',
    },
  },
  {
    id: 'widget-x-queue-panel',
    what: 'Stub for the `x-queue-panel` widget: a table of applications with columns, rows, and a decision affordance.',
    whyNeeded:
      'This is the whole operator route. The bundle names one widget and the widget is the product. Every row of data in it is invented by this spike.',
    naturalHome: 'registry widget family',
    homeRationale:
      'A queue table is the most obvious candidate for a first-party widget family: every operator surface in every tenant needs one. But it needs a data source, and the Surface slot binding for a module widget carries `{moduleId, widgetName}` and nothing else — no props, no query, no binding to a Data Source. Recorded separately as `widget-data-binding`.',
    kind: 'stub-widget',
    source: 'src/widgets/tenant-chrome.tsx',
    resolved: {
      landedIn: [
        'formspec/packages/formspec-surface-react/src/widgets/queue-table.tsx',
      ],
      guardedBy: [
        'packages/formspec-surface-react/tests/widgets.test.tsx — 9 cases including both empty-state paths, inferred columns, and the accessibility structure.',
      ],
      before:
        'Four invented applications with invented rents, invented months behind and invented waiting times — the most convincing thing on the screen.',
      after:
        'Renders whatever rows it is given. Given none it shows an empty state and no table at all; in this spike, that is what it shows.',
      naturalHomeHeld: true,
      naturalHomeNote:
        'Columns come from `binding.config` when the author declared them and are inferred from the rows’ own keys when they did not. A real `<caption>`, `scope` on every header, a row header per row, and a focusable labelled scroll region, because an operator tool people use all day is where accessibility stops being optional. `widget-data-binding` stays open: this queue is empty because there is still no channel from a Surface slot to a data source.',
    },
  },
  {
    id: 'widget-data-binding',
    what: 'Any way for a module widget to receive data.',
    whyNeeded:
      'The queue panel needs applications; the receipt panel needs a submission. The `module-widget` binding shape is `{moduleId, widgetName}` and is `additionalProperties: false` apart from `x-` extensions. There is no props channel, no Data Source ref, no query.',
    naturalHome: 'registry widget family',
    homeRationale:
      'The Registry entry already carries `widgetShape.props` as a JSON Schema — it describes props that the Surface has no way to supply. One of the two has to move: either the slot binding gains a props channel validated against `widgetShape.props`, or widgets bind to Data Sources. Either is a schema decision, not a renderer decision.',
    kind: 'missing-machinery',
    source: 'src/slots/ModuleWidgetSlot.tsx',
    /**
     * OPEN, and the entry's last sentence is why. Two things changed and
     * neither is the schema decision.
     *
     * `@formspec-org/surface-react` ships `SurfaceWidgetDataResolver`, a HOST
     * port: a host that has applications can hand them to a queue widget. It is
     * named as a host input rather than dressed up as a bundle channel.
     *
     * And the spike missed a channel that does exist: `binding.config`, which
     * lint E604 validates against `widgetShape.props`. The starter widgets read
     * it, which is where their copy comes from. But `config` is configuration,
     * not content — there is still no ref from a slot to a Data Source and no
     * query, so a queue still cannot say WHICH applications. A renderer
     * inventing that would fork the vocabulary before the schema settles it.
     */
  },
  {
    id: 'registry-entries-wiring',
    what: 'Handing the bundle\'s Registry to the shipped renderer: flattening every `registry.entries` into the flat array `FormspecForm` takes as its `registryEntries` prop.',
    whyNeeded:
      'The renderer needs registry entries to resolve component identity, and it takes them as a prop. The bundle carries them as Registry documents under `manifest.registries[]`. Nothing joins the two, so the shell does — three lines, and they are the only reason the form renders with its registry at all.',
    naturalHome: 'new: surface-shell package',
    homeRationale:
      'The shell is the only thing holding both the bundle and the renderer, so the join belongs to it. The join is also lossier than it looks, which is why this is a ledger entry and not a convenience: the manifest admits an ARRAY of registries and the prop is a flat list of entries, so two registries declaring the same `name` collapse silently — `flatMap` keeps both and the renderer takes whichever it finds first. Nothing in the spec, the schema, or the validator states a precedence rule for that, and this bundle carries one registry so the spike never had to answer it. A shell that ships has to.',
    kind: 'missing-machinery',
    source: 'src/slots/DefinitionFormSlot.tsx',
    resolved: {
      landedIn: [
        'formspec/packages/formspec-surface/src/registry.ts — `flattenRegistryEntries`.',
      ],
      guardedBy: [
        'packages/formspec-surface/tests/registry.test.ts — `gives the first declaration precedence and REPORTS the loser`.',
      ],
      before:
        '`flatMap` in the spike. Two registries declaring the same name collapsed silently and the renderer took whichever it found first.',
      after:
        'First declaration in manifest-then-author order wins; every later declaration of the same name raises `REGISTRY-ENTRY-NAME-COLLISION`.',
      naturalHomeHeld: true,
      naturalHomeNote:
        'The entry said a shell that ships has to answer the precedence question, and this is the answer: manifest order, because it is the only ordering the bundle states, with a diagnostic that turns an arbitrary choice into a reviewable one. Nothing in the spec, schema or validator states a rule — when one lands, this is the single site that changes.',
    },
  },
  {
    id: 'transition-has-no-trigger-source',
    what: 'A "continue to the next page" button, because the authored transition has nothing that can fire it.',
    whyNeeded:
      'The /apply route declares `transitions: [{trigger: "submit", to: "certify"}]`. The shipped renderer injects a submit button only when a Response Actions document publishes an Action with `submit` intent — deliberately, so nothing fires implicitly. This bundle carries no Response Actions document at all. The transition is authored, schema-valid and signed, and the app as described cannot leave its own first page.',
    naturalHome: 'new: surface-shell package',
    homeRationale:
      'The shell is the right owner of the affordance, because the shell owns route transitions — a module widget should not be navigating the app. But the finding underneath it is not a renderer gap: it is that nothing checks a transition trigger against anything that could produce it. Surface lint walks the route graph for reachability (E606) and never asks whether an edge can actually be traversed. That check belongs in lint or the app-graph validator, and it would have caught this before the bundle was signed.',
    kind: 'missing-machinery',
    source: 'src/shell/RouteView.tsx',
    /**
     * PARTIAL, and deliberately not marked `resolved` — the cause was fixed,
     * the check the entry actually asked for was not.
     *
     * Cause: the bundle carried no Response Actions document, so §10 correctly
     * gave the form no submit button. `addAction` minted the document and no
     * manifest slot named it, so `exportBundle` dropped it — ADR 0160 §4.2(b),
     * the same defect `ensureExperience` carried before 0160, and §6.5 never
     * excluded Response Actions. Fixed in
     * `formspec-studio/packages/formspec-studio-core/src/kernel/ProposalManagerFacade.ts`:
     * `addAction` writes the slot in the same op, `readAppManifest` emits it,
     * `exportBundle` serialises it, `resolveBundleLocal` serves it. The
     * exemplar bundle now publishes `submitApplication`, `/apply` renders a
     * real submit button, and the two residual
     * `APP-GRAPH-SURFACE-RESPONSE-ACTION-TRIGGER` diagnostics in
     * `lifecycle-demo-v10/evidence/stage-5-release.validation-report.json`
     * dropped to zero.
     *
     * Still open, and it is the half that matters: `/certify` declares
     * `{trigger: "submit", to: "receipt"}` and carries no form, so nothing on
     * that route can fire it — and the bundle is signed anyway. Nothing checks
     * a transition trigger against something that could produce it. Split out
     * as `transition-edge-traversability-unchecked` so the open half is
     * countable rather than buried in a resolved entry's note.
     *
     * THE AFFORDANCE QUESTION, ANSWERED — `@formspec-org/surface`
     * `src/transitions.ts`. The spike left one open question: does the shell own
     * a default trigger affordance, or must the bundle declare one? **The bundle
     * must declare one. The shell does not.** Not a taste call — surface-spec
     * §4 and §5.1 answer it twice: a router may advance "only after the
     * referenced action or closed-core intent has completed successfully under
     * Response Actions authority", and it "MUST NOT infer success from a click,
     * a rendered button, or a validation summary". A shell-supplied Continue
     * button is that inference wearing a label, and shipping one as a default
     * would put a spec violation in every host by construction — on the routes
     * where it matters most, since a `submit` transition off an intake route
     * means a submission happened.
     *
     * So `planTransitions` marks a transition `fireable` only when its trigger
     * resolves against a loaded Response Actions document AND the host supplied
     * an executor; `supplied-by-slot` when a `definition-form` slot already
     * draws the real control, so the shell does not put a second button beside
     * the form's own; and otherwise a stated refusal naming which half is
     * missing. `/apply` is `supplied-by-slot`. `/certify` is
     * `no-executor` — visible on the page, as a sentence, rather than papered
     * over by a navigating button. The spike's `TransitionAffordance` is
     * deleted.
     */
  },
  {
    id: 'no-runtime-state',
    what: 'A submitted response, a case reference, an issued receipt — anything the app is about after the form is filled in.',
    whyNeeded:
      'Three of the four routes are downstream of a submission. The bundle export has `sessions: []` and no response documents, so every downstream route renders a shape with nothing in it.',
    naturalHome: 'formspec-web',
    homeRationale:
      'formspec-web already owns the ports for this — draft store, submit transport, response-action ledger, status routes — and already has stub adapters for all of them. The shell should consume those ports rather than grow its own. What is missing is the wiring, not the concept.',
    kind: 'missing-machinery',
    source: 'src/widgets/tenant-chrome.tsx',
    /**
     * OPEN. The shell now has every seam this needs — `SurfaceWidgetDataResolver`
     * for widget data, `routeParams` for route parameters, `onFireTransition`
     * for an executor — and this spike supplies all three from the host by
     * hand. The wiring to formspec-web's draft / submit / ledger ports has not
     * been done, and the bundle still carries `sessions: []`. The visible cost
     * is the queue's empty state and the receipt's two-fact panel.
     */
  },
  {
    id: 'experience-unit-rendering',
    what: 'Rendering for `experience-unit` slots — the "why this screen exists" content.',
    whyNeeded:
      'The /apply route binds Experience unit `applyForHelp`, which carries a title and the needs it serves. Nothing renders an Experience unit. The spike prints the title and the need descriptions in a panel it designed.',
    naturalHome: 'new: surface-shell package',
    homeRationale:
      'The Experience document is a first-class bundle artifact with a stable shape. How a unit and its needs present to a respondent is a rendering decision, so it sits with the shell — but the *default* presentation should ship, or every host will invent a different one.',
    kind: 'missing-machinery',
    source: 'src/slots/ExperienceUnitSlot.tsx',
    resolved: {
      landedIn: [
        'formspec/packages/formspec-surface/src/experience-unit.ts — resolution, with needs separated from the title by audience.',
        'formspec/packages/formspec-surface-react/src/SurfaceSlot.tsx — the default presentation, behind `showExperienceNeeds`.',
      ],
      guardedBy: [
        'packages/formspec-surface/tests/slot-plan.test.ts — resolution and the unresolved-unit diagnostic.',
        'packages/formspec-surface-react/tests/route-view.test.tsx — `withholds Experience needs from a respondent surface by default`.',
      ],
      before:
        'The spike printed the unit title AND every need description on a live intake page.',
      after:
        'The title is respondent-facing and shows. The needs are marked as not respondent-facing and are off unless a host asks.',
      naturalHomeHeld: true,
      naturalHomeNote:
        'The default ships, as the entry asked. It also makes the call the spike flagged in a code comment and then did anyway: **the needs are not respondent-facing.** `needRefs[].description` is design rationale ABOUT the person — “this is the screen someone would want to leave and come back to” — not copy FOR them. A respondent renderer shows the title; an authoring or review surface passes `showExperienceNeeds` and gets both. Neither has to guess.',
    },
  },
  {
    id: 'static-content-rendering',
    what: 'Rendering for `static-content` slots (`kind: heading | text`).',
    whyNeeded:
      'Three of the four routes lead with a static heading. Nothing renders one. The `kind` vocabulary is not written down as a closed set anywhere the spike could find — the schema types `binding` loosely for this slot type.',
    naturalHome: 'new: surface-shell package',
    homeRationale:
      'Trivial to render and trivial to get subtly wrong (heading levels are an accessibility contract). It should ship once, with the `kind` vocabulary closed, rather than be re-guessed per host.',
    kind: 'missing-machinery',
    source: 'src/slots/StaticContentSlot.tsx',
    resolved: {
      landedIn: [
        'formspec/packages/formspec-surface/src/static-content.ts — all four kinds, and the heading-level contract.',
        'formspec/packages/formspec-surface-react/src/heading.tsx — every heading in the package takes its level as an input.',
      ],
      guardedBy: [
        'packages/formspec-surface/tests/static-content.test.ts — 16 cases on levels and kinds.',
        'packages/formspec-surface-react/tests/route-view.test.tsx — `gives the page exactly one h1` and `skips no heading level anywhere on the page`.',
      ],
      before:
        'Two of four kinds rendered. An authored `level: 1` produced a SECOND `h1` on `/certify` and `/receipt`, beside the route title.',
      after:
        'All four kinds. An authored level is a rank within the route, offset from `headingBaseLevel` (default 2), clamped, stepped down again inside an embed. Never a second `h1`, never a skip.',
      naturalHomeHeld: true,
      naturalHomeNote:
        '**CORRECTION: the vocabulary was already closed and this entry said otherwise.** `surface.schema.json` `$defs/Slot`’s static-content gate carries `enum: [heading, text, image, divider]`, and surface-spec §5 repeats it — “the four shapes Surface guarantees renderers know how to display without consulting a module”. The spike rendered two and reported the vocabulary as unwritten. An unknown kind is now reported as a schema violation rather than quietly rendered as text. The entry was right that heading levels are where the real work was, and understated it: the schema types `level` as an absolute 1–6, and absolute levels do not compose. Implementing the fourth kind surfaced `static-content-image-has-no-alt-channel`.',
    },
  },
  {
    id: 'theme-authority-unexported',
    what: 'Reaching `ROUTE_CLASS_THEME_AUTHORITY` — the map that says which route classes admit tenant theming.',
    whyNeeded:
      'This is the runtime half of THEME-ROUTE-CLASS and the thing bar R3 turns on. The map exists, is exhaustive over the schema enum by construction, and is exported from its module — but `@formspec-org/app-graph` does not re-export it from its index, and the package `exports` field only exposes `.`. A renderer cannot import it.',
    naturalHome: 'existing package, unexported',
    homeRationale:
      'The map is correct and well-defended where it is. The defect is purely reach: a rule that only a validator can see is a rule that only fires at authoring time. Adding it to the app-graph index is a one-line change — but the deeper question is whether a *rendering* concern should live inside the validator package at all, or in a small vocabulary package both can depend on.',
    kind: 'unreachable-machinery',
    source: 'src/theme-grant.ts',
    resolved: {
      landedIn: [
        'formspec/packages/formspec-app-graph/src/index.ts — `ROUTE_CLASS_THEME_AUTHORITY`, `TENANT_THEMING_REFUSING_ROUTE_CLASSES` and `CLOSED_RESPONSE_ACTION_INTENTS` are on the export surface.',
        'formspec/packages/formspec-surface/src/theme-authority.ts — imports the map and never restates which classes admit.',
      ],
      guardedBy: [
        'packages/formspec-surface/tests/theme-authority.test.ts — `refuses on every class the shipped map refuses, with no list of its own`, driven off the imported map.',
      ],
      before:
        'The spike reached past the package `exports` field into `dist/ui-graph-policy.js`.',
      after:
        'A normal import. No renderer needs to reach into `dist/` to find out what the platform’s own theming rule is.',
      naturalHomeHeld: true,
      naturalHomeNote:
        'The one-line change, made. `CLOSED_RESPONSE_ACTION_INTENTS` went with it for the same reason — a runtime router needs the same intent set the validator uses to decide whether a transition trigger is addressable at all. The deeper question the entry raised is deliberately NOT answered: the map stays in the validator package rather than moving to a shared vocabulary package, because splitting it would put the rule and its only enforcement in different release trains for no measured benefit.',
    },
  },
  {
    id: 'theme-refusal-copy',
    what: 'The words a person reads when a page refuses tenant branding — one sentence per refusing route class — plus the posture the shell takes when `routeClass` is absent entirely.',
    whyNeeded:
      'The authority map answers `admits` or `refuses`. It does not say why in language anyone outside this repo can read, and the refusal is on screen. The shell wrote seven sentences: six refusal reasons and one for an unclassified route.',
    naturalHome: 'existing package, unexported',
    homeRationale:
      'It belongs beside `ROUTE_CLASS_THEME_AUTHORITY`, because the reason and the rule are the same fact and they will drift the moment they live apart. The refusal is a trust claim — "this signing page is not branded so what you are agreeing to cannot be dressed up" — and every host inventing its own wording means the same normative rule reaches people as several different promises. The unclassified arm is the sharper half: ADR 0161 §6 says absence of `routeClass` is a distinct state and MUST NOT be read as `operation`, and then says nothing about what a renderer does with it. Reading absence as "refuse" is as much an invention as reading it as "admit"; the shell had to pick one and the spec should.',
    kind: 'missing-machinery',
    source: 'src/theme-grant.ts',
    resolved: {
      landedIn: [
        'formspec/packages/formspec-surface/src/theme-authority.ts — `ROUTE_CLASS_THEME_REASON` (`as const satisfies Record<RouteClass, string>`) and `UNCLASSIFIED_THEME_REASON`.',
      ],
      guardedBy: [
        'packages/formspec-surface/tests/theme-authority.test.ts — `carries a reason for every class in the vocabulary`, and the unclassified posture.',
        'The compiler: a new or renamed route class fails to build at the copy, as it already does at the map.',
      ],
      before:
        'Seven sentences written in a spike, reachable by nobody else.',
      after:
        'Shipped once, so the same normative rule reaches people as one promise instead of several.',
      naturalHomeHeld: false,
      naturalHomeNote:
        'It sits in `@formspec-org/surface`, not beside the map in `@formspec-org/app-graph` as the entry proposed. Product copy in a validator package is a rendering concern in the wrong release train — and the drift the entry feared is prevented structurally instead: the reasons are keyed `as const satisfies Record<RouteClass, string>`, so the copy breaks the build on a vocabulary change exactly as the map does. Which class admits is still the imported map’s call. **The sharper half stays open, in the spec:** this package refuses on an absent `routeClass` and says so as its own `unclassified` posture, never collapsed into `operation`, because reading absence as “admit” is fail-open on the one vocabulary whose whole purpose is a trust rule. That is still a renderer choosing, which is what the entry said the spec should do instead.',
    },
  },
  {
    id: 'theme-token-vocabulary-bridge',
    what: 'Mapping the bundle Theme\'s `color.accent` onto the platform token vocabulary.',
    whyNeeded:
      'The tenant Theme document authors `color.accent`. The platform token registry has no `accent` — its brand token is `color.primary`, and that is what every shipped stylesheet reads. Emitted as authored, the tenant\'s brand colour lands on a CSS variable nothing consumes, and the form renders in platform green with the tenant\'s burgundy sitting unused in the DOM.',
    naturalHome: 'existing package, unexported',
    homeRationale:
      'Either the token registry is the closed vocabulary and authoring should have refused `color.accent`, or it is open and the renderer needs an alias table. Right now it is neither: authoring accepts the token, validation passes it, and rendering silently drops it. This is a fail-quiet, and it is the single most dangerous thing the spike found — a tenant would see their brand ignored with no diagnostic anywhere.',
    kind: 'vocabulary-bridge',
    source: 'src/theme-grant.ts',
    resolved: {
      landedIn: [
        'formspec/specs/theme/token-registry-spec.md §2.4 — the registry is the closed vocabulary and `color.primary` is the one brand key. The fork this entry named is answered: NOT an alias table.',
        'formspec/specs/theme/token-registry-spec.md §5.3 — a validator that loads a Theme MUST report every non-`x-` token the registry does not declare. Previously MAY.',
        'formspec/packages/formspec-app-graph/src/theme-token-registry.ts — `validateThemeTokenRegistry`, wired into the built-in cross-artifact validator list.',
        'formspec/crates/formspec-lint/src/pass_theme/token_registry.rs — W708 gains a brand-lookalike hint naming `color.primary`.',
        'formspec/spikes/surface-render-v10/src/theme-grant.ts — `TOKEN_ALIASES` and `bridgeTenantTokens` deleted.',
      ],
      guardedBy: [
        'packages/formspec-app-graph/tests/theme-token-registry.test.ts — including `does NOT alias a lookalike onto the brand token — it only reports it`.',
        'crates/formspec-lint pass_theme tests — `w708_brand_lookalike_names_the_real_brand_token`.',
      ],
      before:
        'Authoring accepted `color.accent`, the app-graph validator passed it, the signing ceremony sealed it, the renderer emitted it, the cascade resolved it — and no reader anywhere was told the key names nothing. The spike bridged it by hand to get a measurement at all.',
      after:
        'The exemplar authors `color.primary`. An undeclared non-`x-` token produces a warning on both validation paths, and each names the real brand token in the message.',
      naturalHomeHeld: true,
      naturalHomeNote:
        'The entry framed this as a binary — closed vocabulary or alias table — and the closed arm won. What the entry did not see: the diagnostic had to land on the app-graph path too, not just formspec-lint. W708 already existed and already fired on `color.accent`; the release path this bundle went through never runs lint, which is why the chain was silent end to end.',
    },
  },
  {
    id: 'renderer-emits-tenant-tokens-to-document-root',
    what: 'Scrubbing tenant theme tokens off the `<html>` element every time a refusing route renders.',
    whyNeeded:
      'The shipped React provider calls `emitThemeTokens(themeDocument.tokens)` with no target, and that helper defaults to `document.documentElement`. There is no cleanup on unmount. Once the intake route has rendered once, the tenant\'s brand colour is an inline custom property on `<html>` for the life of the page — measured: 0 tokens on a fresh load, 46 after the intake route renders, still 46 after navigating to the receipt route (`evidence/r3-document-root-leak.json`).',
    naturalHome: 'existing package, unexported',
    homeRationale:
      'The fix is in `formspec-react`: scope the emission to the component\'s own container — which `FormspecForm` already does correctly, with cleanup — and stop writing to the document root. **The exposure is the write, not what a route happens to contain.** Putting a `definition-form` slot on a `proof` route is schema-valid and nothing forbids it, but this app MEASURES that it would not paint the receipt in the tenant\'s brand: the shell hands that slot the refusing route\'s grant, so `FormspecProvider` re-emits the 45 platform tokens over the leaked ones on `<html>` and `FormspecForm` writes the platform values inline on its own container. Reproduced in the running app with the tenant value on `<html>` and the platform value on the container, the form and every field inside it resolve the platform `#27594f` — the leaked token does not reach them (`evidence/r3-document-root-leak.json` → `correction.measurement`). And on the one route where the tenant brand does resolve, `tenant-brand-paints-nothing` measured zero elements painting with it. What is actually wrong is an unscoped global mutation that outlives the component that made it: a host can only clean up after it, never prevent it, and it reaches everything OUTSIDE a `.formspec-container` — host chrome, portalled content, a second embedded renderer, any future skin that does paint the brand token. So THEME-ROUTE-CLASS has no runtime owner: the shell\'s document root reads 0 tenant properties on every refusing route (`evidence/r3-theme-boundary-probe.json`) only because `enforceDocumentRootThemeBoundary` actively scrubs it.',
    kind: 'missing-machinery',
    source: 'src/theme-grant.ts',
    resolved: {
      landedIn: [
        'formspec/packages/formspec-react/src/context.tsx — FormspecProvider renders a `display: contents` `.formspec-theme-scope` element it owns and emits `themeDocument.tokens` onto THAT, with an unmount cleanup. `document.documentElement` is never written.',
        'formspec/spikes/surface-render-v10/src/theme-grant.ts — `enforceDocumentRootThemeBoundary` deleted; `documentRootThemeProperties()` reads and reports instead.',
        'formspec/spikes/surface-render-v10/src/chrome/DocumentRootProbe.tsx — the reading, on screen, on every route.',
      ],
      guardedBy: [
        'formspec/packages/formspec-react/tests/theme-token-scope.test.tsx — four assertions, and the docstring names this as the runtime half of the ADR 0161 theme-authority promise. Falsified twice on the way in: restoring the untargeted emission fails 4 of 5; deleting the effect cleanup fails the theme-swap case.',
      ],
      before:
        '0 `--formspec-*` properties on `<html>` on a fresh load, 46 after the intake route rendered, still 46 after navigating to the receipt route — with the tenant brand among them. Clean only where the shell scrubbed.',
      after:
        '0 at every step of the same walk, plus 0 after a client-side /apply → /receipt navigation, with NO shell workaround running (`evidence/r3-document-root-leak.json`, `evidence/r3-theme-boundary-probe.json`).',
      naturalHomeHeld: true,
      naturalHomeNote:
        'The entry said the fix belonged in `formspec-react`, scoped to the component\'s own container the way `FormspecForm` already did it. That is exactly where it landed. One correction to the entry\'s own reasoning: it assumed the provider could reuse `FormspecForm`\'s container, but `FormspecProvider` renders no DOM at all — so the fix had to give it one, and `display: contents` is what keeps that from being a layout change.',
    },
  },
  {
    id: 'tenant-brand-paints-nothing',
    what: 'Nothing. This one could not be worked around, and it is recorded because it falsified a bar.',
    whyNeeded:
      'After bridging `color.accent` onto `color.primary`, the tenant\'s burgundy genuinely reaches the form: the shipped renderer emits it and `--formspec-default-primary` resolves to `#7A1F3D` on the form container. Then a walk of every element inside the rendered form found ZERO that paint with it — no text, background, border, outline, or caret. The focus ring is platform green, because it derives from `color.ring`, which the tenant did not author. A tenant can set their brand colour, have it accepted, validated, signed, emitted and resolved, and see no difference on screen.',
    naturalHome: 'existing package, unexported',
    homeRationale:
      'The brand token only paints buttons and filled controls in the default skin, and this Definition has none — it is four plain inputs, and the submit button never renders because no Response Actions document publishes a submit intent. So three separate gaps compound into one silent product failure. The fix is not one change: the token vocabulary needs a defined fan-out (does a brand colour drive the focus ring? the label? nothing?), and the default skin needs to use it somewhere a plain form will show.',
    kind: 'vocabulary-bridge',
    source: 'src/theme-grant.ts',
    resolved: {
      landedIn: [
        'formspec/specs/theme/token-registry-spec.md §2.4 — `color.primary` is THE brand token. `color.accent` / `color.brand` / `color.highlight` are undeclared and processors MUST NOT alias them. The hand-built alias table in `src/theme-grant.ts` is deleted rather than shipped: a silent alias is what let both vocabularies appear to work.',
        'formspec/specs/theme/token-registry-spec.md §2.5 + schemas/token-registry.json — new `derivedFrom` field; `color.ring` declares `derivedFrom: "color.primary"`. A derived token MUST NOT be emitted into the platform theme\'s token map, because an explicit platform value is what made the CSS fan-out unreachable.',
        'formspec/packages/formspec-layout/src/platform-defaults.ts + scripts/generate-theme-from-registry.mjs — both stop emitting derived tokens (45 declared, 43 emitted).',
        'formspec/packages/formspec-layout/src/styles/default.tokens.css — `--formspec-default-focus: var(--formspec-color-ring, var(--formspec-color-primary, …))`, light and dark.',
        'formspec/packages/formspec-layout/src/styles/default.surfaces.css + default.base.css — brand accent rule on section/group/card headings and a brand marker under fieldset legends, so a form with structure shows the brand before anyone touches a control.',
        'formspec/spikes/lifecycle-demo-v10/src/exemplar.ts — the exemplar authors `color.primary` and `color.dark.primary`.',
      ],
      guardedBy: [
        'crates/formspec-lint `pass_theme` W708 — an undeclared non-`x-` token warns, and on a brand lookalike the message names `color.primary` (`w708_brand_lookalike_names_the_real_brand_token`).',
        '@formspec-org/app-graph `THEME-TOKEN-UNREGISTERED` (`validateThemeTokenRegistry`) — the same check on the path a release actually runs, which is how this defect reached a signed bundle with zero diagnostics.',
        'packages/formspec-layout/tests/theme-generation.test.ts — `omits derived tokens so their fan-out can resolve`.',
      ],
      before:
        'ZERO elements inside the rendered form painted with the tenant brand. Focus ring platform green. No submit button. No diagnostic anywhere in authoring, validation, signing, emission or cascade.',
      after:
        'Submit button filled `rgb(122, 31, 61)` at rest; focused input outline `rgb(122, 31, 61) solid 2px`; `--formspec-default-focus` resolves to `#7A1F3D` on the form container. Dark mode picks up `color.dark.primary`. (`evidence/r2-theme-reaches-and-paints.json`; the before numbers stay in `evidence/r2-theme-reaches-but-paints-nothing.json`.)',
      naturalHomeHeld: true,
      naturalHomeNote:
        'The entry predicted three separate fixes — a defined token fan-out, a skin that uses the brand where a plain form shows it, and the submit button — and all three were needed. It got the third one\'s owner wrong by omission: the renderer\'s refusal to invent a submit button is CORRECT (response-actions-spec §10 forbids implicit-default Actions), so the fix was in the authoring path, not the skin. See `transition-has-no-trigger-source`.',
    },
  },
  {
    id: 'response-actions-type-mismatch',
    what: 'A cast, to hand the bundle\'s Response Actions document to the shipped renderer.',
    whyNeeded:
      'Now that the bundle carries a Response Actions document, the shell passes it to `FormspecForm` as `responseActionsDocument` — and the two shipped types do not meet. `@formspec-org/types` generates `ResponseActionsDocument` from `response-actions.schema.json`; `@formspec-org/react` takes `ResponseActionsDocumentInput`, an engine type carrying an index signature. Neither is assignable to the other, so the only way to connect the schema-generated document to the renderer that consumes it is `as never`.',
    naturalHome: 'existing package, unexported',
    homeRationale:
      'This is a seam that exists twice. The schema-generated type is the contract a bundle author writes against; the engine type is the contract the renderer reads. A host holding a bundle has the first and needs the second, and nothing converts. One of them should be the renderer\'s prop type, or `@formspec-org/engine` should export a narrowing that accepts the generated shape. A cast at every host is the same defect as an alias table: it makes two vocabularies both appear to work.',
    kind: 'vocabulary-bridge',
    source: 'src/slots/DefinitionFormSlot.tsx',
  },
  {
    id: 'platform-theme-merge',
    what: 'Merging the platform theme under the tenant theme before handing it to the shipped renderer.',
    whyNeeded:
      '`FormspecForm`\'s `themeDocument` prop replaces the platform theme rather than layering over it. Passing the bundle Theme alone — which has exactly one token — drops every other platform token and the form loses its spacing, radii, and colours.',
    naturalHome: 'existing package, unexported',
    homeRationale:
      'The cascade belongs in `@formspec-org/layout` next to `buildPlatformTheme` and `emitMergedThemeCssVars`, both of which already exist. Every host that passes a partial tenant theme will hit this, and most will not notice, because the failure looks like a styling bug rather than a missing cascade.',
    kind: 'missing-machinery',
    source: 'src/theme-grant.ts',
    resolved: {
      landedIn: [
        'formspec/packages/formspec-surface/src/theme-authority.ts — `createThemeAuthority` layers the platform tokens under the tenant’s on an admitting route.',
      ],
      guardedBy: [
        'packages/formspec-surface/tests/theme-authority.test.ts — `layers the platform theme UNDER the tenant on an admitting route`.',
      ],
      before:
        'Hand-written spread in the spike. Any host passing a partial tenant theme would drop every platform token and read it as a styling bug.',
      after:
        'Shipped once. A one-token tenant theme still carries the platform spacing, radii and colours.',
      naturalHomeHeld: false,
      naturalHomeNote:
        'A compromise rather than a correction. The cascade sits in the shell because that is where the tenant/platform layering decision already lives, next to the route-class grant — not in `@formspec-org/layout` beside `buildPlatformTheme`, where the entry put it. **The original defect is unchanged for anyone who does not use the shell:** `FormspecForm`’s `themeDocument` prop still REPLACES rather than layers. The layering helper still belongs beside `buildPlatformTheme`.',
    },
  },
  {
    id: 'browser-bundle-verification',
    what: 'Loading a bundle export plus its authored signature in a browser and verifying it before render.',
    whyNeeded:
      'The spike\'s claim is that the bundle a person signed is the app people see. That is only true if the app checks. The cryptographic primitives are all shipped and all worked unchanged in the browser; what did not exist was the caller that reads an export, rebuilds the preimage, and gates rendering on the verdict.',
    naturalHome: 'formspec-web',
    homeRationale:
      'formspec-web is the trust-load-bearing reference implementation and already owns the verifier surface. The verification caller belongs there and the shell should consume it through a port, so a host that cannot verify renders a refusal rather than an app.',
    kind: 'missing-machinery',
    source: 'src/verify.ts',
    /**
     * OPEN, and half-closed by shape rather than by code. The entry asked for
     * the shell to consume verification "through a port, so a host that cannot
     * verify renders a refusal rather than an app" — that is exactly what
     * `SurfaceApp` does: it takes an already-dereferenced bundle and never
     * verifies anything, so the host decides whether the bundle earned the
     * right to render. The shell package deliberately grows no verifier. The
     * caller itself is still `src/verify.ts` in this spike and still belongs in
     * formspec-web.
     */
  },
  {
    id: 'verified-state-chrome',
    what: 'The chrome strip showing the verification verdict, signer, method, and digest.',
    whyNeeded: 'A verdict nobody can see is not a trust affordance.',
    naturalHome: 'formspec-web',
    homeRationale:
      'This is the verifier UI formspec-web already has in scope. The shell should host a slot for it, not own the component.',
    kind: 'missing-machinery',
    source: 'src/chrome/VerificationChrome.tsx',
    /**
     * OPEN. The slot the entry asked for exists — `SurfaceApp` takes `header`
     * and `footer`, and the shell hosts the chrome rather than owning it. The
     * component is still this spike's.
     */
  },
  {
    id: 'cross-surface-navigation',
    what: 'Presenting two Surfaces (respondent + staff) as one app with one navigation — including the label each group is filed under, because `SurfaceDocument.title` is optional and this bundle omits it on both.',
    whyNeeded:
      'The manifest lists two Surfaces, each with its own `entry` route. Nothing says how they compose into one running app, whether they share a URL space, or how an actor moves between them — the caseworker route is simply a fifth thing in the same bundle. With no title on either Surface, the shell also had to turn the ids `respondent` and `staff` into "For the person applying" and "For staff": invented copy in a navigation that R1 otherwise derives entirely from the export.',
    naturalHome: 'new: surface-shell package',
    homeRationale:
      'The App Manifest is the only artifact that sees both Surfaces, so the composition rule belongs to whatever reads the manifest. Today nothing does, at runtime. Note this is adjacent to actor scope (ADR 0152) but is not the same question: that governs who may write, this governs what renders where.',
    kind: 'missing-machinery',
    source: 'src/shell/SurfaceShell.tsx',
    resolved: {
      landedIn: [
        'formspec/packages/formspec-surface/src/composition.ts — `composeSurfaceApp`, `matchRoute`, `routeHref`.',
      ],
      guardedBy: [
        'packages/formspec-surface/tests/composition.test.ts — including the path-collision case and `labels a group with the Surface id when the document carries no title`.',
      ],
      before:
        'One flat URL space assumed to work because “their paths happen not to collide”, and two invented group labels: “For the person applying”, “For staff”.',
      after:
        'The rule is stated: one flat URL space in manifest order, first Surface’s `entry` is the app entry, colliding paths both stay in the table with `ROUTE-PATH-COLLISION` raised.',
      naturalHomeHeld: true,
      naturalHomeNote:
        '**The invented copy is gone.** A group’s label is `surface.title ?? surface.id` and nothing else; a host may supply a label resolver, which makes it a host input rather than a shell invention. “For the person applying” was a shell putting words in the author’s mouth for an artifact that declined to carry them, and the honest rendering of a missing optional title is the id.',
    },
  },
  {
    id: 'shell-visual-design',
    what: 'The shell\'s own CSS — layout, navigation, panels, the gap drawer — and the rest of the spike-only furniture: the boot copy for the checking / refused / error states (`src/main.tsx`), the gap drawer itself with its natural-home labels (`src/shell/GapDrawer.tsx`), the `StubFrame` that marks a stub on screen with its ledger id (`src/widgets/StubFrame.tsx`), and the `TENANT_TOKEN_VALUES` export that exists only so the R3 probe has something to grep the DOM for.',
    whyNeeded:
      'Something has to lay the page out, and something has to make the measurement visible — a stub that renders convincingly and is not marked is the failure mode this spike is built to avoid.',
    naturalHome: 'spike scaffolding',
    homeRationale:
      'Genuinely spike-only, all of it. A real shell takes its chrome from the host, does not draw a gap drawer, does not label its own stubs, and does not export its token values for a test to find. Recorded as one entry rather than five because splitting scaffolding inflates the ledger and the ledger\'s honesty is the deliverable — but itemised inside it, so the headline count cannot quietly absorb a piece that turned out to have a natural home after all. One deliberate exclusion: the `await initFormspecEngine()` the app makes before mounting the renderer is NOT here and is not a gap. It is documented, exported, and `formspec-web` makes the same call at its own boot. Friction, not absence.',
    kind: 'missing-machinery',
    source: 'src/app.css',
    /**
     * STILL SPIKE-ONLY, and smaller than it was — which is checkable only
     * because the entry itemised itself. Structural layout CSS moved to
     * `@formspec-org/surface-react/formspec-surface.css`, token-driven with no
     * hard-coded brand. **`StubFrame` is deleted: there are no stubs left to
     * mark.** What remains is genuinely spike-only: the boot copy, the gap
     * drawer, the on-screen document-root probe, the `probe-hooks` window
     * handle that lets `scripts/probe.mjs` take its numbers from the app's own
     * verification path, and `TENANT_TOKEN_VALUES`.
     */
  },
  {
    id: 'static-content-image-has-no-alt-channel',
    what: 'An accessible name for a `static-content` slot with `kind: image`.',
    whyNeeded:
      'The binding is `{kind, content, level?}` and `content` is "a URL or asset ref". There is no alt-text field. The nearest thing is `slot.title`, which is optional and is a chrome label rather than a description of the image. An image with no accessible name is a WCAG 1.1.1 failure, and a renderer cannot invent one.',
    naturalHome: 'spec or schema, upstream of any renderer',
    homeRationale:
      'Found by implementing the fourth `static-content` kind, which the spike skipped — the cost of reporting a vocabulary as unwritten instead of reading the schema. `@formspec-org/surface` does the only two honest things available to it: use `slot.title` as the accessible name when the author gave one, and otherwise mark the image decorative and raise `STATIC-IMAGE-NO-ALT`. Decorative is correct for an image that carries no meaning and wrong for one that does, and the binding gives no way to tell them apart. The fix is a field on the static-content binding — `alt`, required when `kind: image`, admitting the empty string as an explicit decorative declaration. That is a schema revision; a renderer picking a default is not a substitute for it.',
    kind: 'missing-machinery',
    source: 'packages/formspec-surface/src/static-content.ts',
  },
  {
    id: 'transition-edge-traversability-unchecked',
    what: 'Any check, before a bundle is signed, that an authored transition trigger has something that could produce it.',
    whyNeeded:
      'Split out of `transition-has-no-trigger-source`, whose affordance half is answered and whose finding half is not. `/certify` declares `{trigger: "submit", to: "receipt"}`, carries no `definition-form` slot, and so has nothing that can raise a submit. It is authored, schema-valid, signed, and dead. The app now says so on the page — which is a renderer REPORTING a defect, not the defect being caught.',
    naturalHome: 'spec or schema, upstream of any renderer',
    homeRationale:
      'Surface lint E606 walks the route graph for reachability and never asks whether an edge can be traversed. `validateSurfaceResponseActionTriggers` does ask, but only against a loaded Response Actions document — so it fires on a trigger the document contradicts and stays silent on a route with no way to raise the trigger in the first place. The missing rule is per-route rather than per-document: a transition whose trigger is a closed-core intent needs something ON that route capable of producing it. Belongs in lint or the app-graph validator; it would have caught this bundle before the signing ceremony.',
    kind: 'missing-machinery',
    source: 'packages/formspec-surface/src/transitions.ts',
  },
];

export function gapsBySource(source: string): readonly GapEntry[] {
  return GAP_LEDGER.filter((entry) => entry.source === source);
}

/** Entries a host consuming the shipped packages no longer hand-builds. */
export const RESOLVED_GAPS: readonly GapEntry[] = GAP_LEDGER.filter((entry) => entry.resolved);

/** Entries still standing. Each carries its reason in a comment or its rationale. */
export const OPEN_GAPS: readonly GapEntry[] = GAP_LEDGER.filter((entry) => !entry.resolved);

/**
 * Widget stubs still standing. Zero — all four ship as real widgets in
 * `@formspec-org/surface-react`. Derived from the ledger rather than asserted
 * about it, so it cannot drift from the rows above.
 */
export const STUB_COUNT = OPEN_GAPS.filter((entry) => entry.kind === 'stub-widget').length;

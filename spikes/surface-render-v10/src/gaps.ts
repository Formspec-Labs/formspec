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
  /** File in this spike that holds the hand-built code. */
  source: string;
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
  },
  {
    id: 'verified-state-chrome',
    what: 'The chrome strip showing the verification verdict, signer, method, and digest.',
    whyNeeded: 'A verdict nobody can see is not a trust affordance.',
    naturalHome: 'formspec-web',
    homeRationale:
      'This is the verifier UI formspec-web already has in scope. The shell should host a slot for it, not own the component.',
    kind: 'missing-machinery',
    source: 'src/shell/VerificationChrome.tsx',
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
  },
];

export function gapsBySource(source: string): readonly GapEntry[] {
  return GAP_LEDGER.filter((entry) => entry.source === source);
}

export const STUB_COUNT = GAP_LEDGER.filter((entry) => entry.kind === 'stub-widget').length;

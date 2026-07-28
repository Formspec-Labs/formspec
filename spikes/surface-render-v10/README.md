# surface-render-v10 — the signed bundle, running in a browser

The lifecycle spike ended at a signed bundle export. This spike opens that export in
a browser, checks the signature, and renders it as a four-route app a person can
click through.

**The composition is the measurement.** Every piece the shell had to build by hand
is a gap in the platform, and the gap report below is the deliverable. The running
app is how it was earned.

Bars were pre-registered before any code: [`formspec/thoughts/spikes/2026-07-27-surface-render-v10.md`](../../thoughts/spikes/2026-07-27-surface-render-v10.md).

## Run it

```sh
npm install
npm run dev        # http://localhost:4173  — /apply, /certify, /receipt/:caseRef, /queue
npm run build && npm run preview   # static build, http://localhost:4174
npm run typecheck
npm run gap-ledger # rewrites evidence/gap-ledger.json from src/gaps.ts
```

The input is read in place from `../lifecycle-demo-v10/evidence/`. Nothing is copied
into this directory, so the bytes the browser verifies are the bytes committed there.

### Reproducibility — what these numbers are pinned to

A concurrent session regenerated the lifecycle spike's evidence while this spike was
being built, so the input was moving underneath it. It has since been committed. The
signature check has been re-run against the committed bytes and reproduces exactly —
both the clean verdict and the falsification.

| | |
|---|---|
| Input bundle export | `../lifecycle-demo-v10/evidence/stage-4-signoff.bundle-export.json` |
| — raw file SHA-256 | `ac4d783d8c83dc15e63b99c66a4648dbba03871e78cae81f06dd265d9f1ea0f7` |
| Input authored signature | `../lifecycle-demo-v10/evidence/stage-4-signoff.authored-signature.json` |
| — raw file SHA-256 | `23b1a1ad8620e353a4bfd067d0e6ffdc5368cd2c70bed31ede48cb19442e495f` |
| Signed-payload digest (domain-framed JCS, recomputed) | `cb8e6db731cf08d025f5cfbc5cd0d4a5f8d3c2a951338b154f42b4019f16f9b9` |
| — as claimed in the signature record | identical ⇒ `digestMatches: true`, verdict `verified` |
| Falsification digest (`#7A1F3D` → `#7A1F3E` in the Theme) | `d29376dbd46e8377bdff5e37f2f816457d17a4fb52ca91bcf025dcddc49e2f69`, verdict `failed` |
| Method URI, from the COSE protected header | `urn:formspec:sig-method:ed25519-cose-sign1@1` |
| Method registry / adapter | `1.1.0` / `urn:integrity-stack:adapter:webcrypto@1` |

The two raw-file hashes are the reproducibility anchor: `shasum -a 256` those paths, and
if they match, every number in `evidence/` was taken against the bytes you have. The
signed-payload digest is not enough on its own — it is computed over the parsed JSON, so
it is insensitive to whitespace the file could have been reformatted with.

**The signature record did not change across the regeneration.** The digest the record
claims is the same value the README pinned mid-build, so the screenshots and the four
`evidence/*.json` probe files were all taken against the export as committed. The one
correction the re-verification forced was not in the numbers — see `evidence/r3-document-root-leak.json`
`correction`, and R3 below.

The input remains a regenerated artifact rather than a frozen one. A future regeneration
that changes the export changes the digest, and `evidence/` should be re-taken rather
than trusted.

## One scoping decision, stated

The lifecycle spike also produced a stage-6 merged Surface
(`stage-6-feedback.merged.surface.json`) that adds a fifth route, `/apply/money`. This
spike renders the **stage-4 signed export only**, because the story it is testing is
*the bundle a person signed is the app people see* — and the stage-6 merge is not
inside the signature. Rendering it would have added a route to a screenshot at the cost
of the one claim the spike exists to make. The merged surface is worth rendering once a
shell can show two versions side by side; that is a different spike.

## The hypothesis, and the answer

> No Surface-shell renderer exists anywhere in the stack. Nothing reads a
> `SurfaceDocument`'s routes and slots and composes a navigable app.

**Confirmed.** Every `SurfaceDocument` consumer in the stack is authoring-side or
validation-side:

| Where | What it does with a Surface |
|---|---|
| `formspec-studio/packages/formspec-studio-core` (kernel, `ProposalManagerFacade`, `regeneration-merge`) | authors and merges them |
| `formspec-studio/packages/formspec-mcp-wireframes` | authors them through MCP verbs |
| `formspec/packages/formspec-app-graph` (`ui-graph-policy`, `surface-definition-slots`, `component-routes`, …) | validates them |
| `formspec/crates/formspec-lint` (`pass_surface.rs`) | lints them |
| `formspec-web/src/adapters/browser/surface-router.ts` | **never opens one.** It takes a pre-flattened `{routeId, nextRouteId}` from config and rewrites a query parameter after a response action. |

`case-portal`, `formspec-cloud` and `policy-studio` contain no reference to a Surface
document at all.

So the closed slot-type taxonomy, the route-class vocabulary, the route graph and the
transition triggers are all authored, all enforced, and all read by nothing at render
time. This spike is the first thing in the stack that renders one.

## What the bars measured

| Bar | Verdict |
|---|---|
| **R1** four routes navigable from the signed export, zero hand-copied content | **met** |
| **R2** real Definition + theme on `/apply` via the shipped renderer | **not met** — the Definition and the theme both arrive; the brand paints nothing |
| **R3** tenant tokens structurally absent on proof and ceremony | **met** for the shell; **falsified for the platform** |
| **R4** operator route renders, every stub enumerated | **met** |
| **R5** gap report names every hand-built piece and its natural home | **met** — 26 entries |

Evidence: [`evidence/`](evidence/). Screenshots of all four routes in light and dark:
[`evidence/screenshots/`](evidence/screenshots/).

### R1 — met

Four routes, two Surfaces, ten slots, one navigation, all derived from the export.
Route ids, paths, titles, route classes, slot lists and transitions are read from the
bundle; none appear in the shell's source. The browser tab is named from
`manifest.title` too, after verification — `index.html` carries only a neutral
pre-verification label, so an unverified bundle does not get to name the tab either.
The signature is checked in the browser with the shipped COSE + WebCrypto path
**before anything renders**, and the verdict is in the chrome on every route.
`evidence/route-walk.json`, `evidence/signature-verification.json`.

Two strings on screen are *not* from the export, and both are ledger entries rather
than exceptions: the navigation's group labels, because `SurfaceDocument.title` is
optional and this bundle omits it on both Surfaces (`cross-surface-navigation`), and
the `:caseRef` value in `/receipt/:caseRef`, because there is no submission to take one
from (`no-runtime-state`).

The gate is falsifiable, and was falsified on purpose: altering one character of the
export — `#7A1F3D` → `#7A1F3E` in the Theme document — flips the verdict to `failed`,
the digest stops matching, and the app refuses to render rather than rendering with a
warning attached.

### R2 — not met, and this is the most product-relevant thing the spike found

The first clause holds: `/apply` renders the real `rent-assistance` Definition
through `FormspecForm` from `@formspec-org/react`, and the bundle's Theme reaches it
through the shipped theme path. `--formspec-color-primary` resolves to the tenant's
`#7A1F3D` on the form container.

The second clause fails. A walk of every element inside the rendered form found
**zero** painting with that colour — no text, background, border, outline or caret.
The focus ring is platform green. Three separate gaps compound:

1. The tenant authored `color.accent`. The platform token registry has no `accent`;
   its brand token is `color.primary`. Nothing maps between them, so unbridged the
   colour lands on a variable nothing reads.
2. Even bridged, the default skin paints the brand token on buttons and filled
   controls. This Definition is four plain inputs.
3. The submit button never renders, because it is injected only when a Response
   Actions document publishes a `submit` intent — and the bundle carries none.

A tenant can set their brand colour, have it accepted by authoring, pass validation,
be signed into the release, be emitted by the renderer, resolve correctly in the
cascade, and see no difference on screen. **There is no diagnostic anywhere in that
chain.** `evidence/r2-theme-reaches-but-paints-nothing.json`.

### R3 — met for the shell, falsified for the platform

The shell's boundary is structural. `resolveThemeGrant` is the only reader of the
tenant Theme in the whole app (`grep tenantTheme src/` — one importer), it is called
once per route at the route boundary, and only `grant.themeDocument` crosses into the
route. On a refusing class that object is built from the platform token registry and
never saw the tenant's tokens. Measured across all four routes: zero tenant token
values anywhere in a refusing route's subtree. `evidence/r3-theme-boundary-probe.json`.

**And it is not enough.** `FormspecProvider` calls `emitThemeTokens(themeDocument.tokens)`
with no target; that helper defaults to `document.documentElement` and has no unmount
cleanup. Measured: 0 `--formspec-*` properties on `<html>` on a fresh load, 46 after
the intake route renders once, still 46 after navigating to the receipt route — with
the tenant's brand colour among them. `evidence/r3-document-root-leak.json`.

A structurally correct host cannot prevent this from outside — only clean up after it.
The shell scrubs the document root on every refusing route, which is why
`r3-theme-boundary-probe.json` reads 0 root properties on `/certify`, `/receipt` and
`/queue`. Recorded as `renderer-emits-tenant-tokens-to-document-root`.

**One thing this spike first claimed here, and then falsified with its own app.** The
mid-build write-up said: put a `definition-form` slot on a `proof` route — schema-valid,
nothing forbids it — and the receipt renders in the tenant's brand. The first half is
true and stays. The second half is wrong, and wrong by measurement rather than by
argument. That slot receives the *refusing* route's grant, so `FormspecProvider`
re-emits the 45 platform tokens over the leaked ones on `<html>` and `FormspecForm`
writes the platform values inline on its own container. Reproduced in the running app
with the tenant value on `<html>` and the platform value on the container: the form
container and every field inside it resolve `--formspec-color-primary` to the **platform**
`#27594f`, not the tenant's `#7A1F3D`. The leaked token does not reach them. And R2
separately measured that the brand token paints nothing even where it *does* resolve.
`evidence/r3-document-root-leak.json` → `correction.measurement`.

So the exposure is not what a route contains — it is the write itself: an unscoped
global mutation that outlives the component that made it and reaches everything outside
a `.formspec-container`. Host chrome, portalled content, a second embedded renderer, any
future skin that does paint the brand token. Today it is latent. It is latent because of
a second defect (R2), which is not a defence.

### R4 — met

`/queue` renders both its slots. Every stub is marked on screen with its ledger id and
listed below. Four widget stubs, plus everything else the ledger names.

### R5 — met

26 entries. Below, and machine-readable in `evidence/gap-ledger.json`.

## The gap report

Twenty-six hand-built pieces. Grouped by where they belong.

### A Surface-shell package that does not exist — 8

Nothing owns route-and-slot composition at runtime. These are the pieces of that
missing package.

| Gap | What |
|---|---|
| `surface-shell` | Reads the Surfaces' routes, builds navigation, matches the URL, renders the matched route. The hypothesis, confirmed. |
| `route-matching` | Path matching, including the `:caseRef` parameter. |
| `slot-dispatch` | The five closed slot types → something that renders. 40 lines. The only place in the stack where a `slotType` becomes pixels. |
| `experience-unit-rendering` | The "why this screen exists" content. The most product-meaningful artifact in the bundle has no rendering. |
| `static-content-rendering` | Headings and text. Trivial, and heading levels are an accessibility contract, so it should ship once rather than be re-guessed. |
| `transition-has-no-trigger-source` | A continue button, because the authored `submit` transition has nothing that can fire it. |
| `registry-entries-wiring` | Flattening the bundle's Registry documents into the flat `registryEntries` prop the renderer takes. Lossy: the manifest admits an array of registries, the prop is one list, and nothing states a precedence rule when two declare the same name. |
| `cross-surface-navigation` | Two Surfaces, each with its own `entry`, presented as one app. Nothing states how they compose — including the group labels, since `SurfaceDocument.title` is optional and omitted on both. |

Why a new package and not `formspec-web`: the operator route ships in the same bundle
as the respondent routes, so a respondent-scoped home is too narrow. Why not inside
`formspec-react`: the shell has no opinion about React beyond the slot renderers it
delegates to — the same split `formspec-react` and `formspec-webcomponent` already have.

### The registry widget family — 6

| Gap | What |
|---|---|
| `module-widget-runtime` | `{moduleId, widgetName}` → a component. No lookup exists. `formspec-webcomponent`'s `ComponentRegistry` keys Definition component types, a different vocabulary. |
| `widget-data-binding` | Any way for a module widget to receive data. The Registry entry carries `widgetShape.props` as a JSON Schema, describing props the Surface has no channel to supply. |
| `widget-x-intake-banner` | Stub. |
| `widget-x-ceremony-frame` | Stub. Required to render unbranded on a `ceremony` route — a shape the Registry does not express. |
| `widget-x-receipt-panel` | Stub, and the receipt inside it is invented. |
| `widget-x-queue-panel` | Stub. This is the whole operator route; every row is invented. |

The structural finding: **a module can declare a widget it has no way to ship.** The
Registry carries name, version, status, `childrenPolicy` and `tokenSlots` — enough for
the ModuleResolver to admit it and the validator to reason about its theming, and not
enough for anything to draw it. There is no delivery channel. This is not a corner of
the bundle: four of its ten slots are module widgets, one on every route.

### Shipped packages that own the concern but do not expose or honour it — 8

| Gap | What |
|---|---|
| `theme-token-vocabulary-bridge` | `color.accent` authored, `color.primary` consumed, nothing maps between them. Authoring accepts, validation passes, rendering silently drops. |
| `tenant-brand-paints-nothing` | Bridged and resolved and still invisible. See R2. |
| `theme-authority-unexported` | `ROUTE_CLASS_THEME_AUTHORITY` is correct, exhaustive by construction, and unreachable: not re-exported from the `@formspec-org/app-graph` index, and the package `exports` field only exposes `.`. The shell reaches into `dist/`. A rule only a validator can import is a rule that only fires at authoring time. |
| `renderer-emits-tenant-tokens-to-document-root` | `FormspecProvider` writes tenant tokens to `<html>` with no cleanup. A host can clean up after it, never prevent it. See R3 for what the exposure is and, more importantly, is not. |
| `theme-refusal-copy` | The authority map says `admits` or `refuses` and never says why in words. The shell wrote a sentence per refusing class, plus a posture for absent `routeClass` that ADR 0161 §6 declares distinct and then leaves undefined. |
| `platform-theme-merge` | `FormspecForm`'s `themeDocument` prop replaces rather than layers. A partial tenant theme drops every platform token, and the failure looks like a styling bug. |
| `bundle-manifest-dereference` | Manifest URLs → typed documents. `resolveArtifacts` is exported and good, and models the wrong shape: sibling refs behind a caller-supplied loader, returning `document: unknown` as validation evidence. A bundle export has already inlined its documents, so the loader you would pass *is* the gap. |
| `route-path-grammar-mismatch` | The spec pins `{name}` markers; the signed bundle authors `:caseRef`. Both schema-valid, because `path` is only "a non-empty string". Nothing caught it — not lint, not the validator, not the signing ceremony. |

Six of these eight are theming, and they are ordered above by what a tenant actually
hits. That concentration is not a coincidence: theme authority is the one place where an
authoring-time rule was supposed to have a runtime consequence, and the runtime half was
never built.

### formspec-web — 3

| Gap | What |
|---|---|
| `browser-bundle-verification` | Loading an export plus its signature in a browser and gating render on the verdict. The primitives all worked unchanged; the caller did not exist. |
| `verified-state-chrome` | Showing the verdict. A verdict nobody can see is not a trust affordance. |
| `no-runtime-state` | A submission, a case reference, an issued receipt. Three of four routes are downstream of a submission the bundle has no room for (`sessions: []`). |

These belong in `formspec-web` because it already owns the verifier surface and the
draft/submit/ledger ports — with stub adapters for all of them. What is missing is the
wiring, not the concept. The shell should consume them through ports, so a host that
cannot verify renders a refusal rather than an app.

### Spike scaffolding — 1

`shell-visual-design`. All the shell's own CSS, and itemised inside that entry: the boot
copy for the checking / refused / error states, the gap drawer and its natural-home
labels, the `StubFrame` that marks each stub on screen with its ledger id, and the
`TENANT_TOKEN_VALUES` export that exists only so the R3 probe has something to grep the
DOM for. Recorded so the list is complete, so nobody reads the screenshots as a design
proposal, and so the headline count cannot quietly absorb a piece that turned out to
have a natural home after all.

Deliberately *not* here, and deliberately not a gap: the `await initFormspecEngine()`
the app makes before mounting the renderer. Documented, exported, and `formspec-web`
makes the same call at its own boot. Friction, not absence.

## What the platform did supply, and supplied well

Worth saying, because a gap report that only lists gaps is not a measurement.

- **The whole cryptographic path composed unchanged.** JCS canonicalization, the COSE
  helpers, the WebCrypto verifier adapter and the shipped method registry all worked in
  the browser with no modification. Ed25519 verified natively in Chromium. The method
  URI comes out of the COSE protected header rather than the JSON record beside it, so a
  record claiming a method the envelope does not carry cannot pass — that discipline was
  already there to inherit.
- **The respondent renderer is genuinely drop-in.** `FormspecForm` took the Definition
  and rendered four correctly-typed, correctly-labelled, accessible fields. Nothing about
  the form is drawn by this spike.
- **The route-class vocabulary is well-defended where it lives.** Closed, exhaustive over
  the schema enum by construction, with the reasoning for each value written down. The
  only thing wrong with it is that a renderer cannot import it.

- **The artifact resolver is on the export surface and knows the manifest.**
  `resolveArtifacts` handles all fourteen manifest slots, their `$formspec*`
  discriminators and their `$formspecBundle` version gates, and reports diagnostics
  rather than throwing. It is the counter-example to `theme-authority-unexported`: the
  same package, reachable. It just does not model a bundle export, which has already
  inlined its documents — `bundle-manifest-dereference`.

One piece of friction rather than a gap: the engine's WASM runtime must be initialised
with `await initFormspecEngine()` before the renderer mounts. Documented, exported, and
`formspec-web` does the same thing at its own boot.

## Layout

```
src/
  bundle.ts           read the export in place, dereference the manifest
  verify.ts           browser verification — shipped primitives, new caller
  theme-grant.ts      the ONE reader of the tenant Theme; route-class → grant
  gaps.ts             the gap ledger; the app renders it
  shell/              SurfaceShell, RouteView, route-match, VerificationChrome, GapDrawer
  slots/              SlotRenderer + one renderer per slot type
  widgets/            the four module-widget stubs + the stub frame
evidence/
  gap-ledger.json                            26 entries, machine-readable
  route-walk.json                            four routes as rendered
  signature-verification.json                clean + tampered verdicts
  r2-theme-reaches-but-paints-nothing.json   R2's falsification
  r3-theme-boundary-probe.json               R3 across all four routes
  r3-document-root-leak.json                 the renderer defect, measured
  screenshots/                               light + dark, all four routes
```

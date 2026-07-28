# surface-render-v10 — the signed bundle, running in a browser

The lifecycle spike ended at a signed bundle export. This spike opens that export in
a browser, checks the signature, and renders it as a four-route app a person can
click through.

**The composition is the measurement.** Every piece the shell had to build by hand
is a gap in the platform, and the gap report below is the deliverable. The running
app is how it was earned.

**The shell has since shipped.** What the spike hand-built as `src/shell/`,
`src/slots/` and `src/widgets/` is now
[`@formspec-org/surface`](../../packages/formspec-surface) (renderer-independent) and
[`@formspec-org/surface-react`](../../packages/formspec-surface-react) (the React
binding plus the four widgets, real). This app imports them; those directories are
deleted. The ledger keeps every closed row, so the diff between what it once said and
what it says now is itself the evidence.

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

**The input changed, on purpose.** Fixing R2 meant fixing the exemplar bundle: the
Theme now authors `color.primary` / `color.dark.primary` instead of the undeclared
`color.accent`, and the App Manifest now names the Response Actions document that
`addAction` had been minting and `exportBundle` had been dropping. So the lifecycle
spike was re-run (`cd ../lifecycle-demo-v10&& npm run spike`) and every digest below
moved. The numbers in the table are the current ones; the pre-fix digests are recorded
here so a reader can tell which evidence belongs to which export.

| | |
|---|---|
| Input bundle export | `../lifecycle-demo-v10/evidence/stage-4-signoff.bundle-export.json` |
| — raw file SHA-256 | `019b2f58cc05d5eedf6dfaf87408227abd28f71e0f3ca26201d70ff38e819069` (was `ac4d783d…`) |
| Input authored signature | `../lifecycle-demo-v10/evidence/stage-4-signoff.authored-signature.json` |
| — raw file SHA-256 | `0493b8231de95c49351c76d5ab3771d1012ff1613d5e7154726f315942ccdfc5` (was `23b1a1ad…`) |
| Signed-payload digest (domain-framed JCS, recomputed) | `a6e74d8192dc499985a00a64e6f8cc384efb579b72b5a09b000b7b464603cb37` (was `cb8e6db7…`) |
| — as claimed in the signature record | identical ⇒ `digestMatches: true`, verdict `verified` |
| Falsification digest (`#7A1F3D` → `#7A1F3E` in the Theme) | `0f00c49a5205365110cd6fc6d052cdbc133fe811598091840a214c6de54df591`, verdict `failed` |
| Method URI, from the COSE protected header | `urn:formspec:sig-method:ed25519-cose-sign1@1` |
| Method registry / adapter | `1.1.0` / `urn:integrity-stack:adapter:webcrypto@1` |

The two raw-file hashes are the reproducibility anchor: `shasum -a 256` those paths, and
if they match, every number in `evidence/` was taken against the bytes you have. The
signed-payload digest is not enough on its own — it is computed over the parsed JSON, so
it is insensitive to whitespace the file could have been reformatted with.

Every number in `evidence/` is re-taken by `node scripts/probe.mjs` against the static
build, and the signature numbers come from the **running app's own**
`verifyBundleSignature` via `window.__spikeProbe` rather than from a second Node
implementation that could agree by luck.

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
| **R2** real Definition + theme on `/apply` via the shipped renderer | **not met** on first measurement — the Definition and the theme both arrived and the brand painted nothing. **Met** after the fix below. |
| **R3** tenant tokens structurally absent on proof and ceremony | **met** for the shell; **falsified for the platform** on first measurement. **Met** for both after the fix below, with the shell's workaround deleted. |
| **R4** operator route renders, every stub enumerated | **met** — and there are now zero stubs to enumerate |
| **R5** gap report names every hand-built piece and its natural home | **met** — see `evidence/gap-ledger.json` for the current `total` / `open` / `resolved` counts |

Evidence: [`evidence/`](evidence/). Screenshots of all four routes in light and dark:
[`evidence/screenshots/`](evidence/screenshots/).

**R2 and R3 were both falsified first and fixed second, and both records are kept.**
The measurement that failed is the reason the fix exists, and a spike that overwrites
its failing numbers with passing ones has thrown away its own evidence. So
`evidence/r2-theme-reaches-but-paints-nothing.json` stays, carrying a `status` and a
`resolvedBy` list; `evidence/r2-theme-reaches-and-paints.json` is the new measurement
with a `before` block; and every closed gap-ledger entry keeps its row, its original
rationale, and a `resolved` block naming what landed, what guards it, and whether the
fix went where the entry predicted.

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

### R2 — was not met, now met. The fix is below; the original measurement stands.

**What the spike measured first.** `/apply` rendered the real `rent-assistance`
Definition through `FormspecForm`, and the bundle's Theme reached it through the
shipped theme path — and then a walk of every element inside the rendered form found
**zero** painting with the tenant's colour. No text, background, border, outline or
caret. Focus ring platform green. Three gaps compounded:

1. The tenant authored `color.accent`. The platform token registry has no `accent`;
   its brand token is `color.primary`. Nothing mapped between them, so unbridged the
   colour landed on a variable nothing reads.
2. Even bridged, the default skin painted the brand token on buttons and filled
   controls. This Definition is four plain inputs.
3. The submit button never rendered, because it is injected only when a Response
   Actions document publishes a `submit` intent — and the bundle carried none.

A tenant could set their brand colour, have it accepted by authoring, pass
validation, be signed into the release, be emitted by the renderer, resolve
correctly in the cascade, and see no difference on screen, with **no diagnostic
anywhere in that chain**. `evidence/r2-theme-reaches-but-paints-nothing.json` keeps
those numbers.

**What changed, cause by cause.**

*(a) The token name.* `color.primary` is now normatively THE brand token —
[`token-registry-spec §2.4`](../../specs/theme/token-registry-spec.md). `color.accent`,
`color.brand` and `color.highlight` are undeclared and **processors MUST NOT alias
them**. The spike's hand-built alias table is deleted rather than promoted: a silent
alias is precisely what let two vocabularies both appear to work, so the authoring
tool emitting the wrong one was never corrected and the renderer dropping it was
never blamed. §5.3 moved from "validators MAY warn" to **MUST report** every non-`x-`
token the registry does not declare. Two conforming implementations:
`formspec-lint` W708 (which already existed and already fired — the release path this
bundle went through never runs lint) and the new
`@formspec-org/app-graph THEME-TOKEN-UNREGISTERED`, on the path a release *does* run.
Both name `color.primary` in the message. The exemplar Theme now says
`color.primary: #7A1F3D` plus `color.dark.primary: #E3A0B4` (theme-spec §3.6 — a
tenant who sets only the light key correctly keeps the platform's dark palette, which
is surprising enough that a real tenant theme names both).

*(b) The skin.* The brand token painted only filled controls, so the fan-out was
undefined for everything else. `color.ring` now declares
`derivedFrom: "color.primary"` — a new registry field, [`§2.5`](../../specs/theme/token-registry-spec.md) —
and a **derived token MUST NOT be emitted into the platform theme's token map**. That
last rule is the load-bearing half: `buildPlatformTheme()` used to emit an explicit
`color.ring`, so `var(--formspec-color-ring, var(--formspec-color-primary, …))` could
never reach its second arm. The platform theme now carries 43 of its 45 declared
tokens. Alongside it, `default.surfaces.css` puts a brand rule on section / group /
card headings and `default.base.css` a brand marker under fieldset legends, so a form
with structure shows the brand before anyone touches a control. The primary button
already read the brand token and needed no change.

*(c) The submit button.* **The renderer was right and the bundle was wrong.**
`FormspecProvider` injects an ActionButton only when a Response Actions document
publishes a `submit`-intent Action, because response-actions-spec §10 forbids
implicit-default Actions — and it already emits `missingSubmitActionFinding()` when a
host wires `onSubmit` with no such Action. Inventing a default submit affordance
would have been the wrong fix. The bundle genuinely declared no submit behaviour, and
the reason is ADR 0160 §4.2(b): `addAction` minted the Response Actions document and
no manifest slot named it, so `readAppManifest` never emitted it and `exportBundle`
dropped it — the same defect `ensureExperience` carried before 0160, and §6.5 excludes
Locale, Mapping and Data Sources, never Response Actions. Fixed in
`formspec-studio/packages/formspec-studio-core/src/kernel/ProposalManagerFacade.ts`:
`addAction` writes the slot in the same op (with rollback on failure),
`readAppManifest` emits it, `exportBundle` serialises it, `resolveBundleLocal` serves
it. The exemplar bundle publishes `submitApplication`, and the two residual
`APP-GRAPH-SURFACE-RESPONSE-ACTION-TRIGGER` diagnostics in the lifecycle spike's
release report dropped to zero.

**Measured after** (`evidence/r2-theme-reaches-and-paints.json`):

| | before | after |
|---|---|---|
| elements painting the tenant brand, at rest | 0 | 1 — the submit button, `rgb(122, 31, 61)` |
| with an input focused | 0 | 2 — plus the focus outline, `rgb(122, 31, 61) solid 2px` |
| `--formspec-default-focus` on the form container | `#27594f` (platform) | `#7A1F3D` (tenant) |
| submit button | never rendered | rendered, filled in the tenant's brand |
| diagnostics when an undeclared token is authored | 0 | 2, both naming `color.primary` |

Screenshots: `evidence/screenshots/light-01-apply-intake.png` (and the `dark-` twin,
where the ring picks up `color.dark.primary`).

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
The shell scrubbed the document root on every refusing route, which is why
`r3-theme-boundary-probe.json` read 0 root properties on `/certify`, `/receipt` and
`/queue`. Recorded as `renderer-emits-tenant-tokens-to-document-root`.

**Fixed, and the workaround is gone.** `FormspecProvider` now renders a
`display: contents` element it owns — `.formspec-theme-scope` — and emits
`themeDocument.tokens` onto **that**, with cleanup on unmount and on every theme
change. It never touches `document.documentElement`. `display: contents` is inline
rather than in a stylesheet so the element generates no box even when the default
skin is not loaded; custom properties inherit through it regardless of `display`, so
the tokens reach exactly the subtree the provider owns and nothing above it. The
provider previously rendered no DOM at all, which is why the fix had to give it one
rather than reuse `FormspecForm`'s container.

`src/theme-grant.ts`'s `enforceDocumentRootThemeBoundary` is deleted, and
`@formspec-org/surface-react` deliberately ships no replacement.
`documentRootThemeProperties()` replaced it — the shell now **reads** `<html>` and
reports what is there, and `src/chrome/DocumentRootProbe.tsx` puts that reading on
screen on every route. A shell that manufactures the property it reports is not
measuring anything.

| | before | after |
|---|---|---|
| fresh load on `/certify` | 0 | 0 |
| after `/apply` renders | 46, tenant brand among them | **0** |
| after navigating to `/receipt` | 46 — **LEAKED** | **0** |
| after client-side `/apply → /receipt` (no reload) | not measured | **0** |
| shell workaround running | yes | **none** |

`evidence/r3-document-root-leak.json`, `evidence/r3-theme-boundary-probe.json`,
screenshot `evidence/screenshots/light-06-document-root-probe-after-intake.png`.

**The permanent test is in the shipped package**, not in the spike:
[`formspec/packages/formspec-react/tests/theme-token-scope.test.tsx`](../../packages/formspec-react/tests/theme-token-scope.test.tsx).
Its docstring says what it is — the runtime half of the ADR 0161 theme-authority
promise. Falsified twice on the way in: restoring the untargeted
`emitThemeTokens(themeDocument.tokens)` fails 4 of its 5 cases; deleting the effect
cleanup fails the theme-swap case (`expected '1.25rem' to be ''`). Both were restored.

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

So the exposure was not what a route contains — it was the write itself: an unscoped
global mutation that outlived the component that made it and reached everything outside
a `.formspec-container`. Host chrome, portalled content, a second embedded renderer, any
future skin that does paint the brand token. It was latent, and it was latent because of
a second defect (R2) — which was never a defence, and R2 is now fixed too. One check
before the fix landed: nothing in `formspec-react` or `formspec-layout` uses
`createPortal` or appends to `document.body`, so no document-level fallback was
required and none was kept. `emitThemeTokens(tokens, target?)` keeps its optional
target for hosts that deliberately paint the document root — the shipped examples do —
but no component calls it that way any more.

### R4 — met, and the thing it measured is gone

`/queue` renders both its slots. **There are no stubs left.** All four module widgets
are real components in `@formspec-org/surface-react`, resolved through the Registry
identity by `{moduleId, widgetName}` — the runtime seam that did not exist when the bar
was written.

What the operator sees instead is the honest version of the remaining gap: an empty
state that says *"Nothing is waiting. When applications arrive, they appear here."* The
spike's first pass drew four applications with invented rents, invented months behind
and invented waiting times, and it was the most convincing thing on the screen. The
queue is empty because a `module-widget` binding carries `{moduleId, widgetName, config}`
and there is still no channel from a Surface slot to a data source — `widget-data-binding`,
still open. `evidence/route-walk.json` records the empty state per slot, so "renders
nothing" and "renders an invention" cannot be confused in the record.

### R5 — met

Below, and machine-readable in `evidence/gap-ledger.json`, which carries `open` and
`resolved` counts beside the total so a shrinking list cannot be mistaken for a short
one. The counts live there and not in this prose — they move every time an entry
closes, and a number in a README that disagrees with the ledger is worse than no
number.

## The gap report

Grouped by where they belong; counts in `evidence/gap-ledger.json`.

**Closed entries keep their row.** A gap report that deletes what it fixed loses the
history that makes the rest of it credible — a reader cannot tell a list that was
always short from one that was worked down, and cannot check that the fix went where
the entry said it belonged. So each resolved entry keeps its original `what`,
`whyNeeded` and `homeRationale` verbatim and carries a `resolved` block: the files
that changed, the test or diagnostic that keeps it closed, one line of before and
after, and a `naturalHomeHeld` flag with a note on where the entry's own reasoning was
wrong. All three predicted their home correctly; all three got a detail wrong, and
the notes say which.

### The surface-shell package — 8, and it exists now

| Gap | What, and where it landed |
|---|---|
| ~~`surface-shell`~~ **shipped** | Reads the Surfaces' routes, builds navigation, matches the URL, renders the matched route. The hypothesis, confirmed — then built. `@formspec-org/surface` + `@formspec-org/surface-react`. |
| ~~`route-matching`~~ **shipped** | `route-path.ts`. Two spike behaviours corrected: an unsupplied parameter now stays in the string and raises `ROUTE-PARAM-UNSUPPLIED` instead of being replaced by the parameter NAME, and a malformed percent-escape no longer throws out of a render. |
| ~~`slot-dispatch`~~ **shipped** | `slot-plan.ts`. Dispatch happens once, in the renderer-independent core, producing a typed plan a second renderer consumes unchanged. **`embed-route` is now implemented** — the spike skipped it — carrying the host route's theme grant down every embed edge, stepping headings down, and terminating on cycles. |
| ~~`experience-unit-rendering`~~ **shipped** | `experience-unit.ts`. It also makes the call the spike flagged and then ignored: `needRefs[].description` is design rationale *about* the respondent, not copy *for* them, so it is off unless a host asks. |
| ~~`static-content-rendering`~~ **shipped** | `static-content.ts`. **The entry was wrong: the `kind` vocabulary was already closed** in `surface.schema.json` and surface-spec §5. All four kinds render. The real work was the heading contract — see below. |
| `transition-has-no-trigger-source` — **partial** | The affordance question is answered (below); the check the entry asked for is split out as `transition-edge-traversability-unchecked` and stays open. |
| ~~`registry-entries-wiring`~~ **shipped** | `flattenRegistryEntries`. The precedence question the entry said a shipping shell has to answer: **first declaration in manifest-then-author order wins, every later one raises `REGISTRY-ENTRY-NAME-COLLISION`.** |
| ~~`cross-surface-navigation`~~ **shipped** | `composeSurfaceApp`. One flat URL space in manifest order, colliding paths reported rather than silently dropped — and **the invented group labels are gone.** A label is `surface.title ?? surface.id`; "For the person applying" was a shell putting words in the author's mouth. |

**Placement, decided.** The formspec npm layer, not `formspec-web`. The operator route
ships in the same bundle as the respondent routes, so a respondent-scoped home is too
narrow — and `formspec-web` is `private: true` and vendors its Formspec dependencies, so
a shell living there could not be reached by `case-portal`, `formspec-cloud` or
`formspec-studio` at all. Two packages, not one, mirroring the `formspec-react` /
`formspec-webcomponent` split: layer 2 plans, layer 3 renders, `npm run check:deps`
passes.

**Heading levels, the one piece that was harder than it looked.** The schema types
`level` as an absolute 1–6, and absolute levels do not compose: a route renders its
title as the page `h1`, so an authored `level: 1` inside it produced a **second** `h1` —
which the spike shipped on `/certify` and `/receipt`. An authored level is now a rank
*within* the route, offset from `headingBaseLevel` (default 2), clamped, stepped down
again inside an `embed-route`. `evidence/route-walk.json` records the heading outline of
every route; there is exactly one `h1` per page and no skipped level.

**The transition-trigger question, answered.** The spike hand-built a Continue button
and asked whether the shell should own a default trigger affordance or whether the
bundle must declare one. **The bundle must declare one.** surface-spec §4 and §5.1 answer
it twice: a router may advance "only after the referenced action or closed-core intent
has completed successfully under Response Actions authority", and it "MUST NOT infer
success from a click, a rendered button, or a validation summary". A shell-supplied
Continue button is that inference wearing a label. So `planTransitions` marks a
transition `fireable` only when its trigger resolves against a loaded Response Actions
document *and* the host supplied an executor; `supplied-by-slot` when a `definition-form`
slot already draws the real control, so the shell does not put a second button next to
the form's own; and otherwise a stated refusal naming which half is missing. `/apply` is
`supplied-by-slot`. `/certify` renders the refusal, on the page, in a sentence.

### The registry widget family — 6, five shipped

| Gap | What, and where it landed |
|---|---|
| ~~`module-widget-runtime`~~ **shipped** | `createWidgetRegistry`, hanging off Registry identity as the entry argued. The lookup keys on `widgetShape.widgetName` reached through the declaring module's `contributes[]` — the vocabulary a Surface binding actually writes. ADR 0160 §2.4: three fields called some variant of "widget name", three vocabularies. A registry keyed on `RegistryEntry.name` resolves nothing the day a module uses a PascalCase widget name, which the schema permits; there is a test for exactly that. |
| `widget-data-binding` — **open** | Still no channel from a Surface slot to a data source. Two things did change: `binding.config` exists and the spike had missed it (lint E604 validates it against `widgetShape.props`), and `@formspec-org/surface-react` ships `SurfaceWidgetDataResolver` — a **host** port, named as one rather than dressed up as a bundle channel. |
| ~~`widget-x-intake-banner`~~ **shipped** | Real. Everything from `binding.config`; configured with nothing, it says so instead of promising a draft store the bundle does not describe. |
| ~~`widget-x-ceremony-frame`~~ **shipped** | Real, and **the sharp edge held without the Registry expressing it.** The widget carries no unbranded rule of its own — it paints only through `--formspec-*` properties, and on a refusing route those never saw a tenant value. It cannot reach a tenant token because none is in scope. |
| ~~`widget-x-receipt-panel`~~ **shipped** | Real. Every fact from the host resolver, except the case reference, which comes from the route parameter — a `/receipt/{caseRef}` route IS addressed by the reference. Handed nothing: "There is no receipt to show." |
| ~~`widget-x-queue-panel`~~ **shipped** | Real. Renders whatever rows it is given; given none, an empty state and no table. Real `<caption>`, `scope` on every header, a row header per row, focusable labelled scroll region. |

The structural finding was: **a module can declare a widget it has no way to ship.** The
delivery channel now exists — `SurfaceWidgetModule`, keyed by `widgetShape.widgetName`,
so a module's declaration and a host's components meet on the identity the Registry
already owns. What has not changed is the second wall: the Registry can describe props
(`widgetShape.props`) the Surface still has no way to supply. Four of this bundle's ten
slots are module widgets, one on every route, and two of them render empty because of
it.

### Shipped packages that own the concern but do not expose or honour it

| Gap | What |
|---|---|
| ~~`theme-token-vocabulary-bridge`~~ **resolved** | `color.accent` authored, `color.primary` consumed, nothing mapped between them. The entry framed a fork — closed vocabulary, or alias table — and the closed arm won: `token-registry-spec §2.4` makes `color.primary` normative and forbids aliasing; §5.3 makes the diagnostic mandatory. What the entry missed: W708 already existed and already fired. The release path this bundle went through never runs lint, which is why the chain was silent end to end, so the check had to land on the app-graph path too (`THEME-TOKEN-UNREGISTERED`). |
| ~~`tenant-brand-paints-nothing`~~ **resolved** | Bridged and resolved and still invisible. Three fixes, all needed: `color.primary` normative, `color.ring` declaring `derivedFrom` (and the platform theme no longer emitting derived tokens, which is what made the CSS chain reachable), and a skin that paints the brand on headings and legends. The entry got the third cause's owner wrong by omission — the renderer's refusal to invent a submit button is correct, so that fix went to the authoring path. See R2. |
| ~~`renderer-emits-tenant-tokens-to-document-root`~~ **resolved** | `FormspecProvider` wrote tenant tokens to `<html>` with no cleanup. Now emits onto a `display: contents` element it owns, with cleanup. The entry predicted the right home and the right shape; it assumed the provider could reuse `FormspecForm`'s container, and the provider rendered no DOM at all. See R3. |
| `theme-authority-unexported` | `ROUTE_CLASS_THEME_AUTHORITY` is correct, exhaustive by construction, and unreachable: not re-exported from the `@formspec-org/app-graph` index, and the package `exports` field only exposes `.`. The shell reaches into `dist/`. A rule only a validator can import is a rule that only fires at authoring time. |
| `theme-refusal-copy` | The authority map says `admits` or `refuses` and never says why in words. The shell wrote a sentence per refusing class, plus a posture for absent `routeClass` that ADR 0161 §6 declares distinct and then leaves undefined. |
| `platform-theme-merge` | `FormspecForm`'s `themeDocument` prop replaces rather than layers. A partial tenant theme drops every platform token, and the failure looks like a styling bug. |
| `response-actions-type-mismatch` | **New, surfaced by the R2 fix.** Now that the bundle carries a Response Actions document, the shell has to pass it to `FormspecForm` — and `@formspec-org/types`' schema-generated `ResponseActionsDocument` is not assignable to `@formspec-org/react`'s `ResponseActionsDocumentInput`. A cast at every host is the same defect as an alias table. |
| `bundle-manifest-dereference` | Manifest URLs → typed documents. `resolveArtifacts` is exported and good, and models the wrong shape: sibling refs behind a caller-supplied loader, returning `document: unknown` as validation evidence. A bundle export has already inlined its documents, so the loader you would pass *is* the gap. |
| `route-path-grammar-mismatch` | The spec pins `{name}` markers; the signed bundle authors `:caseRef`. Both schema-valid, because `path` is only "a non-empty string". Nothing caught it — not lint, not the validator, not the signing ceremony. |

Six of these nine are theming, and they are ordered above by what a tenant actually
hits. That concentration is not a coincidence: theme authority is the one place where an
authoring-time rule was supposed to have a runtime consequence, and the runtime half was
never built. The three that closed are the three a tenant hits first — and closing them
took a spec change, a schema field, a registry change, a CSS change, a renderer change
and a kernel change, which is roughly the shape of "the runtime half was never built".

`transition-has-no-trigger-source` (filed under the surface-shell group) is **partially**
closed and deliberately not marked resolved. The cause is fixed — the bundle now
publishes its submit intent, so `/apply` gets a real submit button and the shell's
stand-in stands down there. The check the entry actually asked for is not: `/certify`
declares `{trigger: "submit", to: "receipt"}`, carries no form, and nothing on that
route can fire it. The bundle is signed anyway. Surface lint walks the route graph for
reachability (E606) and still never asks whether an edge can be traversed.

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

### The spec and the schema — 2, both new

Neither is a renderer's to fix, and both were found by implementing a closed taxonomy
properly rather than by reading about it.

| Gap | What |
|---|---|
| `static-content-image-has-no-alt-channel` | The `static-content` binding has no `alt` field, and `kind: image` is one of its four closed kinds. An image with no accessible name is a WCAG 1.1.1 failure. The shell uses `slot.title` when the author gave one and otherwise marks the image decorative and raises `STATIC-IMAGE-NO-ALT` — decorative is right for a meaningless image and wrong for a meaningful one, and the binding gives no way to tell them apart. The fix is a schema field, not a renderer default. |
| `transition-edge-traversability-unchecked` | Split out of `transition-has-no-trigger-source`. `/certify` declares `{trigger: "submit", to: "receipt"}`, carries no form, and so has nothing that can raise a submit — authored, schema-valid, signed, dead. E606 walks the route graph for reachability and never asks whether an edge can be traversed; `validateSurfaceResponseActionTriggers` asks only against a loaded Response Actions document, so it stays silent on a route that cannot raise the trigger at all. The app reporting it on the page is a renderer describing a defect, not the defect being caught. |

### Spike scaffolding — 1

`shell-visual-design`, and it is **smaller than it was** — which is checkable only
because the entry itemised itself rather than being recorded as one opaque row.
Structural layout CSS moved to `@formspec-org/surface-react/formspec-surface.css`,
token-driven with no hard-coded brand. **`StubFrame` is deleted: there are no stubs left
to mark.** What remains is genuinely spike-only: the boot copy, the gap drawer, the
on-screen document-root probe, the `probe-hooks` window handle, and
`TENANT_TOKEN_VALUES`.

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
  only thing wrong with it was that a renderer could not import it — a one-line index
  export, since made. `@formspec-org/surface` reads the map and never restates which
  classes admit; the compiler breaks the shell's refusal copy on a vocabulary change the
  same way it breaks the map itself.
- **The closed taxonomies were worth the discipline.** Five slot types and seven route
  classes, both closed and both schema-generated, meant the shell's dispatch could be
  exhaustive with no `default` arm and a `never` check — a sixth slot type breaks the
  build at the decision site rather than shrugging at runtime. That is only possible
  because the vocabularies were closed first.

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

**What this spike is now.** A host, not a shell. `src/shell/`, `src/slots/` and
`src/widgets/` are deleted; the app imports `@formspec-org/surface-react`. What is left
is what a host actually supplies: the verified bundle, which widget modules exist,
runtime data through the host port, a route parameter value, and its own chrome.

```
src/
  app.tsx             the host: SurfaceApp + widget modules + widget data + chrome
  bundle.ts           read the export in place; dereferenceBundleExport does the rest
  verify.ts           browser verification — shipped primitives, new caller
  tenant-theme-probe.ts  READS the document root; the tenant values the R3 probe greps for
  probe-hooks.ts      hands scripts/probe.mjs the app's own verification path
  gaps.ts             the gap ledger; the app renders it
  chrome/             VerificationChrome, GapDrawer, DocumentRootProbe — spike-only
scripts/
  probe.mjs           drives the static build and re-takes every measured number
  emit-gap-ledger.ts  writes the ledger to evidence/
evidence/
  gap-ledger.json                            the ledger, with total / open / resolved counts
  route-walk.json                            four routes as rendered
  signature-verification.json                clean + tampered verdicts, from the app's own verifier
  r2-theme-reaches-but-paints-nothing.json   R2's falsification — kept as the BEFORE record
  r2-theme-reaches-and-paints.json           R2 after the fix, with before/after
  r3-theme-boundary-probe.json               R3 across all four routes, workaround deleted
  r3-document-root-leak.json                 the renderer defect, before and after
  screenshots/                               light + dark, all four routes, plus the document-root probe
```

The shell itself:

```
packages/formspec-surface/          layer 2, renderer-independent — plans, renders nothing
  route-path.ts       both parameter grammars, matching, filling, the params[] cross-check
  composition.ts      N Surfaces → one app: URL space, entry, collisions, nav groups
  slot-plan.ts        the closed taxonomy → typed plans, exhaustive, embed-route included
  static-content.ts   the four kinds and the heading-level contract
  experience-unit.ts  unit resolution, needs separated by audience
  theme-authority.ts  the ONE reader of the tenant Theme; the imported map decides
  registry.ts         {moduleId, widgetName} → component; registry flattening + precedence
  transitions.ts      plan, and refuse to fire — the trigger call lives here
  bundle.ts           bundle export → typed artifacts, absences as diagnostics
  diagnostics.ts      the closed code set: never a silent default

packages/formspec-surface-react/    layer 3, the React binding
  SurfaceApp.tsx      the shell; navigation as a port
  SurfaceRoute.tsx    one route, scoped token emission with cleanup, one h1
  SurfaceSlot.tsx     plan variant → elements, and nothing else
  SurfaceTransitions.tsx  a control only for a fireable transition; otherwise a refusal
  widgets/            the four starter widgets, real, plus the empty state they share
```

## Re-taking the evidence

```sh
cd ../lifecycle-demo-v10&& npm run spike     # regenerate the signed bundle export
cd ../surface-render-v10&& npm run build     # static build against the fixed packages
npm run preview &                              # http://localhost:4174
node scripts/probe.mjs                         # rewrites evidence/*.json + screenshots
npm run gap-ledger                             # rewrites evidence/gap-ledger.json
```

Nothing in `evidence/` is typed by hand except the prose fields. If a number in this
README disagrees with `evidence/`, `evidence/` is right and the README is stale.

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
deleted. The ledger keeps every historical row, so the diff between what it once said and
what it says now is itself the evidence.

Bars were pre-registered before any code: [`formspec/thoughts/spikes/2026-07-27-surface-render-v10.md`](../../thoughts/spikes/2026-07-27-surface-render-v10.md).

## Run it

```sh
npm install
npm run dev        # http://localhost:4173  — /apply, /certify, /receipt/RA-2026-0412, /queue
npm run build && npm run preview   # static build, http://localhost:4174
npm run probe      # second terminal; retakes current JSON + screenshot evidence
npm run typecheck
npm run test:unit
npm run gap-ledger # rewrites evidence/gap-ledger.json from src/gaps.ts
```

The input is read in place from `../lifecycle-demo-v10/evidence/`. Nothing is copied
into this directory, so the bytes the browser verifies are the bytes committed there.

### Reproducibility — what these numbers are pinned to

**The input changed, on purpose.** The lifecycle refresh aligns the exemplar with
App Manifest 2.4, Surface 0.2 and Registry 1.1, including the manifest's explicit
`entrySurface`. Its spike-only signature now uses a fixed RFC 8032 test key, so two
complete lifecycle runs produce identical stage-4 bytes. The current browser result
is separate from the frozen historical measurement; see
[`evidence/QUARANTINED-SIGNATURE-EVIDENCE.md`](evidence/QUARANTINED-SIGNATURE-EVIDENCE.md).

| | |
|---|---|
| Input bundle export | `../lifecycle-demo-v10/evidence/stage-4-signoff.bundle-export.json` |
| — raw file SHA-256 | `54d63131dbe575e7abaf3ead61dffb29911ed999603201be25c9822690fe366a` |
| Input authored signature | `../lifecycle-demo-v10/evidence/stage-4-signoff.authored-signature.json` |
| — raw file SHA-256 | `f83bae49519a850388d95d91f398917d715cdd654cf71ec9e856a00c37f2a10d` |
| Input method registry | `../../registries/signature-method-registry.json` |
| — raw file SHA-256 | `2db63aa7822ac97c7f2fa648a0ea2838511a4571dc504e9c2bef3d0436994e3c` |
| Signed-payload digest (domain-framed JCS, recomputed) | `006a885e4ee1fc85a4367f7e49404388a5d1ca0041c42895f4557426ea040e3d` |
| — as claimed in the signature record | identical ⇒ `digestMatches: true`, verdict `verified` |
| Falsification digest (`#7A1F3D` → `#7A1F3E` in the Theme) | `f69bbf88d932ef8796a7bbbd7eb6ce8df7e8dd5bdecb379141f034cade9bc499`, verdict `failed` |
| Method URI, from the COSE protected header | `urn:formspec:sig-method:ed25519-cose-sign1@1` |
| Method registry / adapter | `1.1.0` / `urn:integrity-stack:adapter:webcrypto@1` |

The three raw-file hashes are the reproducibility anchor: `shasum -a 256` those paths, and
if they match, `evidence/signature-verification-current.json` was taken against the
bytes you have. The signed-payload digest is not enough on its own — it is computed
over parsed JSON, so it is insensitive to whitespace.

Current JSON and screenshot evidence is re-taken by `node scripts/probe.mjs` against
the static build. Signature numbers come from the **running app's own**
`verifyBundleSignature` via `window.__spikeProbe` rather than from a second Node
implementation that could agree by luck. Named `before` measurements and
`signature-verification.json` remain unchanged as spike history.

The input remains a regenerated artifact rather than a frozen one. A future regeneration
that changes the export changes the digest, and `evidence/` should be re-taken rather
than trusted.

## One scoping decision, stated

The lifecycle spike also produced a stage-6 Iteration merged Surface
(`stage-6-iteration.merged.surface.json`) that adds a fifth route, `/apply/money`. This
spike renders the **stage-4 signed export only**, because the story it is testing is
*the bundle a person signed is the app people see* — and the stage-6 merge is not
inside the signature. Rendering it would have added a route to a screenshot at the cost
of the one claim the spike exists to make. The merged surface is worth rendering once a
shell can show two versions side by side; that is a different spike.

## The initial hypothesis and first-run answer

> **Initial hypothesis, 2026-07-27:** No Surface-shell renderer exists anywhere
> in the stack. Nothing reads a
> `SurfaceDocument`'s routes and slots and composes a navigable app.

**First-run answer: confirmed.** At that snapshot, every `SurfaceDocument`
consumer in the stack was authoring-side or validation-side:

| Where | What it does with a Surface |
|---|---|
| `formspec-studio/packages/formspec-studio-core` (kernel, `ProposalManagerFacade`, `regeneration-merge`) | authors and merges them |
| `formspec-studio/packages/formspec-mcp-wireframes` | authors them through MCP verbs |
| `formspec/packages/formspec-app-graph` (`ui-graph-policy`, `surface-definition-slots`, `component-routes`, …) | validates them |
| `formspec/crates/formspec-lint` (`pass_surface.rs`) | lints them |
| `formspec-web/src/adapters/browser/surface-router.ts` | **never opens one.** It takes a pre-flattened `{routeId, nextRouteId}` from config and rewrites a query parameter after a response action. |

At that snapshot, `case-portal`, `formspec-cloud`, and `policy-studio` contained
no reference to a Surface document.

The closed slot-type taxonomy, route-class vocabulary, route graph, and
transition triggers were authored and enforced, but no runtime read them. This
spike was the first stack component to render a Surface. The current packages
and disposition are recorded at the top of this README and in the gap report.

## What the bars measured

| Bar | Verdict |
|---|---|
| **R1** four routes navigable from the signed export, zero hand-copied content | **met** |
| **R2** real Definition + theme on `/apply` via the shipped renderer | **not met** on first measurement — the Definition and the theme both arrived and the brand painted nothing. **Met** after the fix below. |
| **R3** tenant tokens structurally absent on proof and ceremony | **met** for the shell; **falsified for the platform** on first measurement. **Met** for both after the fix below, with the shell's workaround deleted. |
| **R4** operator route renders, every stub enumerated | **met** — and there are now zero stubs to enumerate |
| **R5** gap report names every hand-built piece and its natural home | **met** — see `evidence/gap-ledger.json` for `total` and the generated `byDisposition` counts |

Evidence: [`evidence/`](evidence/). Screenshots of all four routes in light and dark:
[`evidence/screenshots/`](evidence/screenshots/).

**R2 and R3 were both falsified first and fixed second, and both records are kept.**
The measurement that failed is the reason the fix exists, and a spike that overwrites
its failing numbers with passing ones has thrown away its own evidence. So
`evidence/r2-theme-reaches-but-paints-nothing.json` stays, carrying a `status` and a
`resolvedBy` list; `evidence/r2-theme-reaches-and-paints.json` is the new measurement
with a `before` block; and every historical gap-ledger entry keeps its row. An
`implemented` or `corrected` disposition carries a `resolved` evidence block naming
what landed, what guards it, and whether the fix went where the entry predicted. A
`split` names existing leaf child rows and never counts as shipped. Each leaf
keeps its own disposition as work lands.

### R1 — met

Four routes, two Surfaces, ten slots, one navigation, all derived from the export.
Route ids, paths, titles, route classes, slot lists and transitions are read from the
bundle; none appear in the shell's source. The browser tab is named from
`manifest.title` too, after verification — `index.html` carries only a neutral
pre-verification label, so an unverified bundle does not get to name the tab either.
The signature is checked in the browser with the shipped COSE + WebCrypto path
**before shell core or the React binding loads and before anything
bundle-derived renders**. The verdict is in the chrome on every route.
`evidence/route-walk.json`, `evidence/signature-verification-current.json`.

Two strings on screen are *not* from the export, and both are ledger entries rather
than exceptions: the navigation's group labels, because `SurfaceDocument.title` is
optional and this bundle omits it on both Surfaces (`cross-surface-navigation`), and
the `caseRef` value in `/receipt/{caseRef}`, because there is no submission to take one
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
and `evidence/screenshots/light-03-receipt-proof.png`, whose chrome includes the
document-root probe. The generator removes the former identical second copy.

**The permanent test is in the shipped package**, not in the spike:
[`formspec/packages/formspec-react/tests/theme-token-scope.test.tsx`](../../packages/formspec-react/tests/theme-token-scope.test.tsx).
Its docstring says what it is — the runtime half of the ADR 0161 theme-authority
promise. Falsified twice on the way in: restoring the untargeted
the provider tests fail when untargeted emission is restored, and the theme-swap
case fails when effect cleanup is removed. Both faults remain pinned.

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

What the operator sees instead is an explicit empty state. The spike's first
pass drew four applications with invented rents, months behind, and waiting
times; it was the most convincing lie on the screen. Surface 0.2, Registry 1.1,
and Data Sources 1.0 now provide an authorized named-input channel, but this
public spike has no staff identity or authorized operator source. The
`operator-runtime-state` leaf therefore remains open in `case-portal`.
`evidence/route-walk.json` records the empty state per slot, so "no authorized
rows" cannot be confused with invented success.

### R5 — met

Below, and machine-readable in `evidence/gap-ledger.json`, which carries generated
`open`, `implemented`, `corrected`, and `split` counts under `byDisposition` so a
shrinking list cannot be mistaken for a short one. The counts live there and not in
this prose — they move every time an entry changes disposition, and a number in a
README that disagrees with the ledger is worse than no number.

## The gap report

Grouped by where they belong; counts in `evidence/gap-ledger.json`.

**Historical entries keep their row.** A gap report that deletes what it fixed loses the
history that makes the rest of it credible — a reader cannot tell a list that was
always short from one that was worked down, and cannot check that the fix went where
the entry said it belonged. `implemented` and `corrected` entries carry permanent
source and guard evidence in `resolved`; `split` entries carry existing leaf
child IDs. Open leaves carry no disposition. The generator rejects missing or
non-leaf children, duplicate IDs, empty evidence, and
plan/tracker/screenshot-only evidence.

### The surface-shell package — 8, and it exists now

| Gap | What, and where it landed |
|---|---|
| ~~`surface-shell`~~ **shipped** | Reads the Surfaces' routes, builds navigation, matches the URL, renders the matched route. The hypothesis, confirmed — then built. `@formspec-org/surface` + `@formspec-org/surface-react`. |
| ~~`route-matching`~~ **shipped** | `route-path.ts`. Two spike behaviours corrected: an unsupplied parameter now stays in the string and raises `ROUTE-PARAM-UNSUPPLIED` instead of being replaced by the parameter NAME, and a malformed percent-escape no longer throws out of a render. |
| ~~`slot-dispatch`~~ **shipped** | `slot-plan.ts`. Dispatch happens once, in the renderer-independent core, producing a typed plan a second renderer consumes unchanged. **`embed-route` is now implemented** — the spike skipped it — carrying the host route's theme grant down every embed edge, stepping headings down, and terminating on cycles. |
| ~~`experience-unit-rendering`~~ **shipped** | `experience-unit.ts`. It also makes the call the spike flagged and then ignored: `needRefs[].description` is design rationale *about* the respondent, not copy *for* them, so it is off unless a host asks. |
| ~~`static-content-rendering`~~ **shipped** | `static-content.ts`. **The entry was wrong: the `kind` vocabulary was already closed** in `surface.schema.json` and surface-spec §5. All four kinds render. The real work was the heading contract — see below. |
| ~~`transition-has-no-trigger-source`~~ **shipped** | The form receives the exact Response Actions document targeting its Definition, and the shell credits only a control the selected binding actually renders. E611 covers the separate pre-signing traversability warning. |
| ~~`registry-entries-wiring`~~ **shipped** | `flattenRegistryEntries`. A colliding name resolves to no entry and raises one `REGISTRY-ENTRY-NAME-COLLISION`; Registry §2.2 forbids an order-based winner. |
| ~~`cross-surface-navigation`~~ **shipped** | `composeSurfaceApp`. One flat URL space in manifest order, colliding paths reported rather than silently dropped — and **the invented group labels are gone.** A label is `surface.title ?? surface.id`; "For the person applying" was a shell putting words in the author's mouth. |

**Placement, decided.** The formspec npm layer, not `formspec-web`. The operator route
ships in the same bundle as the respondent routes, so a respondent-scoped home is too
narrow — and `formspec-web` is `private: true` and vendors its Formspec dependencies, so
a shell living there could not be reached by `case-portal`, `formspec-cloud` or
`formspec-studio` at all. Two packages, not one, mirroring the `formspec-react` /
`formspec-webcomponent` split: layer 2 plans, layer 3 renders, `npm run check:deps`
passes.

**Heading levels, the one piece that was harder than it looked.** The schema now
describes `level` as a rank because absolute levels do not compose: a route renders
its title as the page `h1`, so an authored `level: 1` inside it previously produced a
**second** `h1` — which the spike shipped on `/certify` and `/receipt`. An authored level is a rank
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
document *and* the host supplied an executor; `supplied-by-slot` only when the selected
binding actually draws the matching control, so the shell does not put a second button
next to the form's own; and otherwise a stated refusal naming which half is missing.
`/apply` is `supplied-by-slot`. `/certify` renders the refusal, on the page, in a
sentence and emits E611 during app-graph validation.

### The registry widget family — 6 implemented

| Gap | What, and where it landed |
|---|---|
| ~~`module-widget-runtime`~~ **shipped** | `createWidgetRegistry`, hanging off Registry identity as the entry argued. The lookup keys on `widgetShape.widgetName` reached through the declaring module's `contributes[]` — the vocabulary a Surface binding actually writes. ADR 0160 §2.4: three fields called some variant of "widget name", three vocabularies. A registry keyed on `RegistryEntry.name` resolves nothing the day a module uses a PascalCase widget name, which the schema permits; there is a test for exactly that. |
| ~~`widget-data-binding`~~ **implemented** | Registry 1.1 declares named inputs; Surface 0.2 binds each one to an exact Data Sources catalog/source pair. AppGraph validates the graph, then the canonical `DataSourceLoader` path checks availability, host authorization, load result, schema, freshness, and failure mode before giving the widget a frozen named object. `binding.config` remains configuration, never payload. |
| ~~`widget-x-intake-banner`~~ **shipped** | Real. Everything from `binding.config`; configured with nothing, it says so instead of promising a draft store the bundle does not describe. |
| ~~`widget-x-ceremony-frame`~~ **shipped** | Real, and **the sharp edge held without the Registry expressing it.** The widget carries no unbranded rule of its own — it paints only through `--formspec-*` properties, and on a refusing route those never saw a tenant value. It cannot reach a tenant token because none is in scope. |
| ~~`widget-x-receipt-panel`~~ **shipped** | Real. Every fact from the host resolver, except the case reference, which comes from the route parameter — a `/receipt/{caseRef}` route IS addressed by the reference. Handed nothing: "There is no receipt to show." |
| ~~`widget-x-queue-panel`~~ **shipped** | Real. Renders whatever rows it is given; given none, an empty state and no table. Real `<caption>`, `scope` on every header, a row header per row, focusable labelled scroll region. |

The structural finding had two parts, and both now have explicit channels.
`SurfaceWidgetModule`, keyed by `widgetShape.widgetName`, connects a declared
widget to its implementation. Registry `dataInputs` and Surface `dataBindings`
connect qualified runtime values through one authorized loader. `widgetShape.props`
and `binding.config` still carry configuration only.

### Existing-package gaps

| Gap | What |
|---|---|
| ~~`theme-token-vocabulary-bridge`~~ **corrected** | The proposed alias bridge was the wrong fix: `color.primary` was already the closed brand key. Authoring now uses it, and both validation paths reject undeclared non-extension tokens. |
| ~~`tenant-brand-paints-nothing`~~ **implemented** | Bridged and resolved and still invisible. Three fixes, all needed: `color.primary` normative, `color.ring` declaring `derivedFrom` (and the platform theme no longer emitting derived tokens, which is what made the CSS chain reachable), and a skin that paints the brand on headings and legends. The entry got the third cause's owner wrong by omission — the renderer's refusal to invent a submit button is correct, so that fix went to the authoring path. See R2. |
| ~~`renderer-emits-tenant-tokens-to-document-root`~~ **implemented** | `FormspecProvider` wrote tenant tokens to `<html>` with no cleanup. Now emits onto a `display: contents` element it owns, with cleanup. The entry predicted the right home and the right shape; it assumed the provider could reuse `FormspecForm`'s container, and the provider rendered no DOM at all. See R3. |
| ~~`theme-authority-unexported`~~ **implemented** | `ROUTE_CLASS_THEME_AUTHORITY` and `CLOSED_RESPONSE_ACTION_INTENTS` now have public exports, so runtime code uses the same closed vocabularies as validation. |
| ~~`theme-refusal-copy`~~ **implemented** | The shell owns one exhaustive refusal-reason table keyed by `RouteClass`. The absent-`routeClass` policy remains an upstream specification question recorded in the row’s evidence note. |
| ~~`platform-theme-merge`~~ **implemented** | One layout helper composes the platform Theme beneath the tenant Theme for direct React, web component, and Surface consumers. |
| ~~`response-actions-type-mismatch`~~ **implemented** | The engine input derives from the generated Response Actions document, which now reaches `FormspecForm` without `as never`. |
| ~~`bundle-manifest-dereference`~~ **implemented** | `resolveBundleExportArtifacts` validates exact own-key inline documents; `dereferenceBundleExport` then produces the typed renderer view with diagnostics. |
| ~~`route-path-grammar-mismatch`~~ **implemented** | The spec pins `{name}` markers, but the signed bundle authored `:caseRef` and schema validation accepted it. `Route.path` now rejects unpinned parameter grammars; Studio preserves `params[]` and edge maps; the regenerated signed bundle authors `/receipt/{caseRef}`; and the browser gate deep-links `/receipt/RA-2026-0412` without `ROUTE-PARAM-GRAMMAR`. |

Six of these nine are theming. That concentration is not a coincidence: Theme
authority is where an authoring-time rule needed a runtime consequence. Eight
rows carry `implemented` evidence and one carries `corrected` evidence.

`transition-has-no-trigger-source` and its authoring-time child
`transition-edge-traversability-unchecked` are both **implemented**. The form supplies
the declared submit control, the shell advances only after a successful action result,
and AppGraphValidator E611 warns before signing when a resolved trigger has no
validator-readable control source. E611 remains a warning because a private widget or
host executor can supply behavior that static validation cannot see.

### formspec-web — 5

| Gap | What |
|---|---|
| ~~`browser-bundle-verification`~~ **implemented** | The public host acquires raw bytes, verifies publisher/app authority and preflights release policy, validates AppGraph/actor/entry rules, dereferences and proves renderability, atomically commits the release, and only then admits and renders. Replaced or refused candidates publish no stale report, release, title, or bundle-derived DOM. |
| ~~`verified-state-chrome`~~ **implemented** | Persistent host chrome shows authenticated publisher/release facts separately from local method, adapter, digest, and checked-at metadata. |
| `no-runtime-state` — **split, not shipped** | The historical row now points to separate respondent, operator, and public-signer child rows. |
| ~~`respondent-runtime-state`~~ **implemented**, tracker `fs-q1ex` | The verified public Surface reuses formspec-web’s production identity, draft, action-ledger, submit, and status boundaries. A real confirmation addresses and supplies the receipt; session refresh restores it or shows an explicit unavailable state. |
| `public-signer-ceremony` — **open**, tracker `fs-5g59` | A separate public ceremony with an explicit control, signed preimage, mapped Response Action, idempotent invocation, and receipt evidence. |

These belong in `formspec-web` because it owns the verifier surface and
draft/submit/ledger ports. The ceremony remains a separate product slice;
shipping the respondent child does not claim the ceremony or operator child.

### case-portal — 1

| Gap | What |
|---|---|
| `operator-runtime-state` — **open**, tracker `fs-3b30` | Authorized staff queue and case state in a staff-specific host. The public respondent deployment must not receive the staff Surface or its data. |

### The spec and the schema — 6

These findings require an owning specification or schema before a renderer can close
them.

| Gap | What |
|---|---|
| ~~`static-content-image-has-no-alt-channel`~~ **implemented** | Surface 0.2 requires exact authored meaningful or empty `alt` on images. Malformed missing input is unavailable; runtime synthesizes no title, URL, filename, or fallback. |
| ~~`transition-edge-traversability-unchecked`~~ **implemented** | AppGraphValidator E611 checks for a validator-readable trigger source before signing while preserving host-only behavior as a warning. |
| ~~`app-entry-surface-undeclared`~~ **implemented** | App Manifest 2.4 selects one exact entry Surface and fails on ambiguous or unresolved selection. |
| ~~`widget-action-output-undeclared`~~ **implemented** | Registry 1.1 declares output names; Surface 0.2 maps each one to an exact Response Action. Runtime refuses undeclared or unmapped emissions and preserves stable invocation identity. |
| ~~`locale-app-integration`~~ **implemented** | Locale 2.0 targets the exact app and owns the closed shell key set. The respondent host selects app and Definition Locale documents separately; live switching updates both consumers without crossing target identity. |
| ~~`bundle-publishing-trust-and-rollback`~~ **implemented** | The signed-bundle profile uses independently configured trust anchors, authenticated publisher/app authority, and pinned or monotonic release policy. |

### Spike scaffolding — 1

`shell-visual-design` is **corrected**, not an open all-or-nothing product gap.
Structural layout, navigation, loading, empty, unavailable, refusal, and
verification states moved into the host and Surface React packages. What
remains is intentionally diagnostic spike furniture: boot copy, the gap drawer,
the document-root probe, the `probe-hooks` window handle, and
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
  gap-ledger.json                            the ledger, with generated disposition counts
  route-walk.json                            four routes as rendered
  signature-verification-current.json        current clean + tampered browser verdicts
  signature-verification.json                frozen historical browser verdicts; never regenerated
  QUARANTINED-SIGNATURE-EVIDENCE.md           exact Git objects and hashes for the frozen run
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

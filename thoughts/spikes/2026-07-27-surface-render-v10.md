---
title: Surface render v10 — the signed bundle as a running app
status: complete
date: 2026-07-27
scope:
  - formspec
  - formspec-web
sources:
  - formspec/spikes/lifecycle-demo-v10/evidence/stage-4-signoff.bundle-export.json
  - thoughts/adr/0150-formspec-as-layered-ui-substrate.md
  - thoughts/adr/0161-route-class-and-rendering-ring-boundary.md
  - formspec/specs/surface/surface-spec.md
---

# Surface render v10

## What this spike is for

The lifecycle spike ended at a signed bundle export. A bundle export is a
description of an app. Nobody has ever opened it in a browser and clicked
through it.

This spike does that, and the point of doing it is the measurement. Every piece
the shell has to hand-build to get from "the platform describes this app" to
"a person clicks through it" is a gap in the platform. **The gap report is the
deliverable.** The running app is how the gap report is earned.

## Hypothesis, stated before building

**No Surface-shell renderer exists anywhere in the stack.** Nothing reads a
`SurfaceDocument`'s `routes[]` / `slots[]` and composes a navigable app. Every
Surface consumer is authoring-side or validation-side.

Reported either way in §Findings.

## The five bars, pre-registered

Written before a line of the app. A bar is met or it is not; a partially met bar
is not met.

### R1 — Four routes navigable from the signed export, zero hand-copied content

The app loads `stage-4-signoff.bundle-export.json` and the authored signature
from the lifecycle spike's evidence directory, **verifies the signature in the
browser first**, and only then renders. Four routes — `/apply`, `/certify`,
`/receipt/:caseRef`, `/queue` — are reachable by clicking. Every title, every
piece of body copy, every field label on screen traces to a byte in the export.
No string in the shell's source is content the export already carries.

The signature is not decoration. The spike's whole story is *the bundle a
person signed is the app people see*, so the verified state — verdict, digest,
signer, method — shows in the shell chrome on every route.

### R2 — Real Definition, real theme, on `/apply`, through the shipped renderer

`/apply` renders `rent-assistance` through `FormspecForm` from
`@formspec-org/react` — the shipped respondent-rendering path, not a
re-implementation. The bundle's Theme document (`color.accent: #7A1F3D`) reaches
the form as a theme document the renderer consumes, and the accent is visibly on
screen.

### R3 — Tenant tokens structurally absent on proof and ceremony

`/receipt` (`routeClass: proof`) and `/certify` (`routeClass: ceremony`) render
with platform chrome only. This is the runtime half of `THEME-ROUTE-CLASS`,
which until now existed only as an authoring-time validator diagnostic.

**Structural, not cosmetic.** The bar is not "those routes look unbranded." The
bar is that the shell has no code path that can put a tenant token on them: the
tenant theme is resolved once per route from `routeClass`, and on a refusing
class the shell holds ~~`null`~~ **a platform `ThemeDocument`** — there is
nothing to leak. Falsification: assert in the browser that no `--formspec-*`
custom property carrying a tenant value is set anywhere in the route's subtree,
and that the resolved accent on those routes is the platform value, not
`#7A1F3D`.

> **Correction, post-build — the mechanism changed, the bar did not.** The
> pre-registered mechanism was `null` on a refusing class. What was built holds
> a `ThemeDocument` constructed from `buildPlatformTheme()` instead, because a
> refusing route still has to render *something* and `FormspecForm` falls back
> to its own bundled default when handed nothing — which would put the choice of
> platform styling inside the renderer rather than at the shell's boundary. The
> structural property the bar was written for is unchanged and is what was
> measured: the object crossing into a refusing route was built from the platform
> token registry and never read `tenantTheme`, and every slot renderer receives
> the same type on every route, so there is no null branch for a later prop to
> fill in with the tenant theme.

### R4 — Operator route renders, and every stub is named

`/queue` (`routeClass: operation`) renders its slots. The queue widget does not
exist anywhere in the stack, so it is hand-stubbed. Every stub — every widget,
every slot type, every piece of chrome the shell had to invent — is enumerated
in the gap report with what it stands in for. A stub that renders convincingly
and is not recorded is a spike failure, not a spike success.

### R5 — The gap report names every hand-built piece and its natural home

For each hand-built piece: what it is, why the shell needed it, and where it
belongs — `formspec-web`, a new surface-shell package, the registry widget
family, or nowhere (spike scaffolding). This is the work order for the real
renderer. Its honesty outranks its optimism: a gap report that makes the
platform look closer to done than it is has negative value.

## What this spike does not do

- No new spec, schema, or ADR. Nothing here is a promotion candidate.
- No edits outside `formspec/spikes/surface-render-v10/` and this document.
- The lifecycle spike's evidence is read-only input, read in place, never copied.
- The signing key is the lifecycle spike's committed dev key. Not a key ceremony.

## Findings

Built. Runs on a dev server and as a static build; driven with Playwright; `tsc`
clean. Full gap report: [`formspec/spikes/surface-render-v10/README.md`](../../spikes/surface-render-v10/README.md).
Evidence: `formspec/spikes/surface-render-v10/evidence/`.

The lifecycle spike's evidence was regenerated by a concurrent session while this
spike was being built, and has since been committed. The signature check has been
re-run against the committed bytes and reproduces exactly — same signed-payload digest
`cb8e6db7…`, same `verified` verdict, same `d29376db…` on the falsification. So every
measurement and screenshot here was taken against the export as committed. Raw-file
hashes for both inputs are pinned in the README's reproducibility table; hash those two
paths and you know whether the numbers still apply.

**Hypothesis confirmed.** No Surface-shell renderer exists. Every `SurfaceDocument`
consumer in the stack authors them (`studio-core` kernel, MCP wireframe verbs) or
validates them (app-graph validator, `formspec-lint`). `formspec-web`'s
`surface-router.ts` never opens a Surface document — it takes a pre-flattened
`{routeId, nextRouteId}` from config. `case-portal`, `formspec-cloud` and
`policy-studio` contain no Surface reference at all. The closed slot taxonomy, the
route-class vocabulary, the route graph and the transition triggers are authored,
enforced, and read by nothing at render time.

### Bars

**R1 — met.** Four routes across two Surfaces, all derived from the export; no route
id, path, title, class or slot list in the shell's source. Signature verified in the
browser with the shipped COSE + WebCrypto path before render, verdict in the chrome.
Falsifiable and falsified: one character altered in the export flips the verdict to
`failed` and the app refuses rather than warning.

**R2 — not met.** The Definition renders through `FormspecForm` and the bundle Theme
reaches it: `--formspec-color-primary` resolves to `#7A1F3D` on the form container.
Then zero elements inside the rendered form paint with it. Three gaps compound — the
tenant authored `color.accent` and the platform brand token is `color.primary` with
nothing mapping between them; the default skin paints the brand token on buttons and
this Definition has none; the submit button never renders because no Response Actions
document publishes a `submit` intent. A tenant can set their brand colour, have it
accepted, validated, signed, emitted and resolved, and see no difference, with no
diagnostic anywhere in the chain. Under the pre-registered rule that a partially met
bar is not met, R2 is not met — and the reason is the most product-relevant thing the
spike measured.

**R3 — met for the shell, falsified for the platform.** The shell's boundary is
structural: one reader of the tenant Theme, called once per route, and only the
resolved grant crosses into the route. Zero tenant token values in any refusing
route's subtree. **And it is not enough:** `FormspecProvider` writes the theme's
tokens to `document.documentElement` with no unmount cleanup, so after the intake
route renders once, the tenant's brand colour sits on `<html>` for the life of the
page — 0 properties on a fresh load, 46 after intake, still 46 on the receipt route.
A structurally correct host cannot prevent that from outside; it can only clean up
after it, which is what the shell does, and why the committed probe reads 0 root
properties on every refusing route. THEME-ROUTE-CLASS's runtime half does not exist,
and the renderer actively undoes it.

*One claim written here mid-build was falsified by this spike's own app and has
been struck:* that a `definition-form` slot on a `proof` route would render the
receipt in the tenant's brand. Schema-valid, yes. Branded, no — that slot receives
the refusing route's grant, so `FormspecProvider` re-emits the platform tokens over
the leaked ones and `FormspecForm` writes platform values inline on its own
container. Reproduced in the running app with the tenant value on `<html>` and the
platform value on the container: the form and every field inside it resolve the
platform `#27594f`. R2 independently measured that the brand token paints nothing
even where it does resolve. **The exposure is the unscoped global write itself**,
which outlives its component and reaches everything outside a `.formspec-container`
— not slot placement. Corrected in `evidence/r3-document-root-leak.json` under
`correction`, with the original measurements left untouched.

**R4 — met.** The operator route renders both slots. Four widget stubs, each marked
on screen with its ledger id, all enumerated.

**R5 — met.** 26 entries at the time of writing, machine-readable in
`evidence/gap-ledger.json` — which now carries `total` / `open` / `resolved` counts and
has grown past 26, for the reasons in §Since the spike. By natural
home: a surface-shell package that does not exist (8), shipped packages that own the
concern but do not expose or honour it (8), the registry widget family (6),
`formspec-web` (3), spike scaffolding (1).

### The three findings that outrank the rest

Ranked by what a tenant hits, not by how structural the defect is. Six of the eight
"shipped package" gaps are theming, and the ordering below reflects a correction made
after the first write-up: the document-root leak is the more structural defect, and the
brand-paints-nothing compound is the one with a measured, present-tense consequence.

1. **A tenant's brand is accepted at every layer and paints nothing.** Authored as
   `color.accent`; the platform brand token is `color.primary` and nothing maps between
   them. Bridge it and the value genuinely resolves on the form container — and zero
   elements paint with it, because the default skin puts the brand token on buttons and
   filled controls and this Definition is four plain inputs whose submit button never
   renders. Accepted by authoring, passed by validation, signed into the release,
   emitted by the renderer, resolved in the cascade, invisible on screen, **and no
   diagnostic anywhere in that chain.** Measured, not inferred.
2. **Theme authority has no runtime half, and the renderer undoes it.**
   `ROUTE_CLASS_THEME_AUTHORITY` is correct and unreachable — not on the package's
   export surface, so only a validator can import it. And `formspec-react` writes tenant
   tokens to the document root with no cleanup, so a host can clean up after the leak but
   never prevent it. The authoring-time rule ships; the runtime consequence does not.
   Latent today rather than visible — and only because of finding 1, which is not a
   defence.
3. **A module can declare a widget it has no way to ship, and no way to feed.** The
   Registry carries name, version, status, `childrenPolicy`, `tokenSlots`, and a
   `widgetShape.props` JSON Schema describing props the Surface has no channel to
   supply. Admission is complete; delivery does not exist. Four of this bundle's ten
   slots are module widgets — one on every route.

Just below the cut, and structural: **a signed bundle can describe an app that cannot
run.** `/apply` declares `transitions: [{trigger: "submit", to: "certify"}]` and the
bundle carries nothing that can fire a submit. Surface lint walks the route graph for
reachability and never asks whether an edge can be traversed. Separately, the bundle
authors `/receipt/:caseRef` while the spec pins `{name}` markers — both schema-valid,
neither caught by lint, the validator, or the signing ceremony.

### What composed cleanly

The cryptographic path, unchanged and in the browser: JCS, the COSE helpers, the
WebCrypto adapter, the shipped method registry, Ed25519 native in Chromium, method URI
read from the protected header rather than the record. `FormspecForm` is genuinely
drop-in. The route-class vocabulary is well-defended where it lives. And
`resolveArtifacts` is the counter-example to `theme-authority-unexported` — the same
package, properly on its export surface, knowing every manifest slot and version gate;
it simply models sibling refs behind a loader rather than a bundle export that has
already inlined its documents. The gaps are in reach and delivery, not in the
primitives.

## Since the spike — what the work order bought

The bars and findings above are the record as measured, and are deliberately not
rewritten. What has changed since is recorded in the ledger's own rows, which keep their
original text and carry a `resolved` block; `evidence/gap-ledger.json` has the current
counts and the ids still open. Three things are worth naming here because they change
what the *hypothesis* means.

**The shell exists.** `@formspec-org/surface` (renderer-independent) and
`@formspec-org/surface-react` (the React binding) ship in the formspec npm layer — not
in `formspec-web`, which is `private: true` and vendors its Formspec dependencies, so a
shell there could not be reached by `case-portal`, `formspec-cloud` or
`formspec-studio`. The spike now imports them; its `src/shell/`, `src/slots/` and
`src/widgets/` directories are deleted. The hypothesis is no longer true, which is the
outcome a confirmed hypothesis is supposed to have.

**The four widget stubs are real widgets.** The module-widget runtime seam —
`{moduleId, widgetName}` resolving through Registry identity — is what let them be
delivered, and the naming detail was load-bearing: a Surface binding's `widgetName`
matches `widgetShape.widgetName`, not `RegistryEntry.name` (ADR 0160 §2.4). None of them
invents content; the queue renders an honest empty state, which is the visible cost of
`widget-data-binding` still being open.

**The transition question is answered, against the shell.** The spike asked whether a
shell should own a default trigger affordance. It should not:
`surface-spec.md` §5.1 says a router "MUST NOT infer success from a click, a rendered
button, or a validation summary", and a shell-supplied Continue button is that inference
wearing a label. The shell plans transitions and refuses to fire them; the bundle
declares the trigger and the host supplies the executor. The finding underneath —
nothing checks, before signing, that a transition trigger has anything that could
produce it — is split out as `transition-edge-traversability-unchecked` and stays open,
because it belongs in lint or the app-graph validator rather than in any renderer.

Two findings were added by doing the work rather than by writing the spike, both
upstream of any renderer: `static-content-image-has-no-alt-channel` (the `static-content`
binding has no `alt` field, and `kind: image` is one of its four closed kinds) and the
transition check above. And one entry's claim was corrected against the schema: the
`static-content` `kind` vocabulary **was** already closed, in
`surface.schema.json` and surface-spec §5, and the spike reported it as unwritten.

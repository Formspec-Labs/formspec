# @formspec-org/surface

The Surface shell, without a renderer. Reads a bundle export's `SurfaceDocument`s
and plans a navigable app: routes, matching, slot dispatch over the closed
taxonomy, theme authority, the module-widget runtime seam, and transitions.

It renders nothing. [`@formspec-org/surface-react`](../formspec-surface-react)
turns the plans into elements; a web-component or server-side binding would be
the same size, because the taxonomy, the route graph and the theme boundary are
not React facts.

## Why this package exists

Every `SurfaceDocument` consumer in the stack was authoring-side (`studio-core`'s
kernel, the MCP wireframe verbs) or validation-side (the app-graph validator,
`formspec-lint`). The closed slot taxonomy, the route-class vocabulary, the route
graph and the transition triggers were **authored, enforced, and read by nothing
at render time.** The `surface-render-v10` spike measured that and produced a
26-entry work order; this package is the eight entries whose home was "a
surface-shell package that does not exist".

## Using it

```ts
import {
  dereferenceBundleExport,
  composeSurfaceApp,
  createThemeAuthority,
  createWidgetRegistry,
  flattenRegistryEntries,
  matchRoute,
  planRoute,
  planTransitions,
} from '@formspec-org/surface';

const bundle = dereferenceBundleExport(exported);
const app = composeSurfaceApp(bundle.surfaces);
const authority = createThemeAuthority({ tenantTheme: bundle.tenantTheme });
const { entries } = flattenRegistryEntries(bundle.registries);
const widgets = createWidgetRegistry({ modules: myModules, registryEntries: entries });

const match = matchRoute(app, window.location.pathname);
const grant = authority.grantFor(match.handle.route);   // the ONLY theme output
const plan = planRoute({ handle: match.handle, widgets, registryEntries, ... });
```

## The calls this package makes, and why they are here

Each of these is a question the spec, schema or validator leaves open. Leaving
them to hosts means every host answers differently and the platform's rules stop
being the platform's.

| Question | The call | Where it belongs long-term |
|---|---|---|
| Which route classes admit tenant theming? | **Not this package's call.** `ROUTE_CLASS_THEME_AUTHORITY` decides; this reads it. The refusal *wording* ships here, keyed exhaustively over the vocabulary. | The map stays in `@formspec-org/app-graph`. |
| What does a renderer do with an absent `routeClass`? | Refuse tenant theming, as its own `unclassified` posture — never collapsed into `operation`. Reading absence as "admit" is fail-open on the one vocabulary whose purpose is a trust rule. | `surface-spec.md` §3 should state it. ADR 0161 §6 declares absence distinct and leaves the renderer posture undefined. |
| Two Surfaces, one app — how do they compose? | One flat URL space in manifest order; the first Surface's `entry` is the app entry; path collisions are reported, never silently resolved. | The App Manifest is the only artifact that sees both Surfaces, so the rule belongs to whatever reads it. |
| What labels a Surface in a navigation? | `title ?? id`, and nothing else. A host may supply a label resolver. The shell does not write product copy for an artifact that declined to carry it. | `SurfaceDocument.title` staying optional is fine; inventing copy for it is not. |
| Two Registries declare the same entry `name` — which wins? | First in manifest-then-author order, with `REGISTRY-ENTRY-NAME-COLLISION` on every loser. | Nothing states a precedence rule. When one lands, `flattenRegistryEntries` is the single site that changes. |
| Does the shell supply a default transition trigger? | **No.** See below. | — |
| Absolute heading levels inside a composed route? | An authored `level` is a rank *within the route*, offset from `headingBaseLevel` (default 2, because the route title is the page `h1`). No skips, never a second `h1`, embeds step down. | The schema's absolute 1–6 does not compose; the offset is the shell's to own. |
| A tenant token the platform vocabulary does not carry? | Emit it and raise `THEME-TOKEN-UNKNOWN`. No built-in alias table — a host may supply one. | The token registry and the authoring tools own the vocabulary decision. |

### The transition-trigger call, stated

The `surface-render-v10` spike hand-built a "Continue" button because an authored
`submit` transition had nothing that could fire it, and asked whether the shell
should own a default trigger affordance or whether the bundle must declare one.

**The bundle must declare one.** `surface-spec.md` §4 and §5.1 already answer it:
a router may advance "only after the referenced action or closed-core intent has
completed successfully under Response Actions authority", and "MUST NOT infer
success from a click, a rendered button, or a validation summary". A
shell-supplied Continue button is that inference wearing a label, and shipping
one as a default would put a spec violation in every host by construction.

So `planTransitions` marks a transition `fireable` only when its trigger resolves
against a loaded Response Actions document **and** the host supplied an executor.
Everything else renders as a stated refusal naming which half is missing. A
signed bundle describing an app that cannot leave its first page is a fact worth
putting on the page.

**What this leaves open:** nothing checks, before signing, that a transition
trigger has anything that could produce it. Lint's E606 walks the route graph for
reachability and never asks whether an edge can be traversed;
`validateSurfaceResponseActionTriggers` does ask, but only when a Response
Actions document is loaded — so a bundle carrying none has no trigger to
contradict. That check belongs in lint or the app-graph validator.

## Diagnostics, not silence

The spike's sharpest finding was that a tenant's brand colour was accepted by
authoring, passed validation, signed into the release, emitted by the renderer,
resolved in the cascade, and painted nothing — **with no diagnostic anywhere in
that chain.** Every call above that the platform does not state produces a
`SurfaceDiagnostic` rather than a silent default. The code set is closed
(`SURFACE_DIAGNOSTIC_CODES`) so a host can handle it exhaustively.

## Layering

Layer 2 (`scripts/check-dep-fences.mjs`): depends on `@formspec-org/types` (0),
`@formspec-org/app-graph` (1) and `@formspec-org/layout` (1). No React, no DOM.

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
const app = composeSurfaceApp(bundle.surfaces, { entrySurface: bundle.entrySurface });
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
| What does a renderer do with an absent `routeClass`? | Refuse tenant theming, as its own `unclassified` posture — never collapsed into `operation`. Reading absence as "admit" is fail-open on the one vocabulary whose purpose is a trust rule. | `surface-spec.md` §3 distinguishes the authoring-time posture; `surface-shell-spec.md` §4.3 owns runtime refusal. |
| Two Surfaces, one app — how do they compose? | One flat URL space in manifest order. App Manifest 2.4 selects the entry Surface by exact `entrySurface` URL; its `entry` selects the route. Invalid or omitted multi-Surface selection has no fallback. Older 2.x manifests retain their historical first-Surface rule. Path collisions are reported, never silently resolved. | The App Manifest is the only artifact that sees both Surfaces, so the rule belongs to whatever reads it. |
| What labels a Surface in a navigation? | `title ?? id`, and nothing else. A host may supply a label resolver. The shell does not write product copy for an artifact that declined to carry it. | `SurfaceDocument.title` staying optional is fine; inventing copy for it is not. |
| Two Registries declare the same entry `name` — which wins? | Neither. `flattenRegistryEntries` reports `REGISTRY-ENTRY-NAME-COLLISION` once and omits every declaration of that name. | Registry §2.2 requires exactly-one unqualified lookup and rejects order-based winners. |
| Does the shell supply a default transition trigger? | **No.** See below. | — |
| Absolute heading levels inside a composed route? | An authored `level` is a rank *within the route*, offset from `headingBaseLevel` (default 2, because the route title is the page `h1`). No skips, never a second `h1`, embeds step down. | Surface schema and Surface Shell §3.4.1 define the same rank semantics. |
| May an authored image URL be dereferenced? | Only after the host's `SurfaceStaticAssetResolver` admits it. The resolver applies the deployment's origin allowlist and may map an asset reference to a runtime URL. No resolver or a refusal produces an unavailable slot and `STATIC-IMAGE-SOURCE-REFUSED`. | Surface Shell §3.4.2 and §8.5 make admission a host obligation. |
| How does a widget receive runtime data? | Its Registry-declared input resolves through the exact Surface `{catalogRef, sourceRef}` binding. The canonical `DataSourceLoader` runs only after availability and host authorization; a declared payload schema must validate before a frozen named object is exposed. | Data Sources §12 and Surface Shell §3.3. |
| May a widget invoke or choose navigation? | No. It may emit only a Registry-declared output name. Surface maps that name to one exact Response Actions id, owns stable invocation/replay discipline, and advances only one current eligible transition after a valid completed terminal. | Surface §4 and Surface Shell §5.3. |
| A tenant token the platform vocabulary does not carry? | Never alias it. Runtime rendering does not depend on the Registry. | Registry-aware validation reports `THEME-TOKEN-UNREGISTERED`. |

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

A resolved trigger still remains unavailable when its target route shares a URL
with another composed route. `routeHref` reports that collision refusal through
the same address-availability result used by navigation bindings and the final
transition boundary.

App-graph validation emits E611 when a resolved transition has no
validator-readable control source. The warning complements runtime planning:
validation cannot see a host executor or private widget behaviour, while the
shell can report the actual runtime posture.

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

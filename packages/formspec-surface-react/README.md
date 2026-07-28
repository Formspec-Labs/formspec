# @formspec-org/surface-react

React binding for [`@formspec-org/surface`](../formspec-surface), plus the
starter module-widget set.

`@formspec-org/surface` plans; this renders. Same split as `formspec-react` and
`formspec-webcomponent`, for the same reason: a second renderer must not have to
re-derive the slot taxonomy, the route graph or the theme boundary.

```tsx
import { SurfaceApp, starterWidgetModule, useBrowserLocation } from '@formspec-org/surface-react';
import '@formspec-org/surface-react/formspec-surface.css';

const [location, navigate] = useBrowserLocation();

<SurfaceApp
  bundle={dereferenceBundleExport(exported)}
  location={location}
  onNavigate={navigate}
  widgetModules={[starterWidgetModule('x-formspec-tenant-chrome')]}
/>
```

`location`/`onNavigate` are props, not an owned router — a shell that owned
history could not be embedded. `useBrowserLocation` is there for hosts that have
none.

## The module-widget delivery channel

The Registry could always *declare* a widget — name, version, status,
`childrenPolicy`, `tokenSlots`, a `widgetShape.props` JSON Schema. Nothing could
*deliver* one, so a module could declare a widget it had no way to ship. A
`SurfaceWidgetModule` is the delivery side:

```ts
const module = { moduleId: 'x-acme-chrome', widgets: { IntakeBanner: MyBanner } };
```

Keys are **`widgetShape.widgetName`** values — the name a Surface `module-widget`
binding writes. Three fields in the substrate are called some variant of "widget
name" and they are three vocabularies (ADR 0160 §2.4):

| Field | Vocabulary | Pattern |
|---|---|---|
| `RegistryEntry.name` | globally unique contribution id | `^x-[a-z][a-z0-9]*(-…)*$` |
| `RegistryEntry.widgetShape.widgetName` | the module's own widget name | **none** — often PascalCase |
| Theme `widget` (`CustomWidgetName`) | a third | `^x-[A-Za-z0-9][A-Za-z0-9_.-]*$` |

A Surface binding uses the second. `@formspec-org/surface`'s
`widgetContributionFor` maps it to the first; nothing in this package should.

## The starter widget set

Four widgets, plain and functional, themed entirely through `--formspec-*`
custom properties emitted from the route's theme grant.

| Widget | For | Data |
|---|---|---|
| `IntakeBanner` | Setting expectations above a form | `binding.config` |
| `CeremonyFrame` | Framing what is being attested to | `binding.config` |
| `ReceiptPanel` | What a person keeps after submitting | host resolver + route params |
| `QueueTable` | An operator's work list | host resolver |

**None of them invents content.** Handed nothing, each renders an empty state
saying so, marked `data-widget-empty` so a probe can find it. That rule is the
whole point: the `surface-render-v10` spike's queue table drew four applications
with invented rents and invented waiting times, and it was the most convincing
thing on the screen.

Runtime data reaches a widget through `widgetData`, a **host** port — because a
`module-widget` binding carries `{moduleId, widgetName, config}` and nothing
else. There is no Data Source ref and no query. Adding one is a schema decision
(gap ledger `widget-data-binding`), and a renderer inventing a channel would fork
the vocabulary before the schema settles it.

`CeremonyFrame` is the sharp one: it lands on a `ceremony` route, where tenant
chrome is refused, and it renders unbranded without carrying a rule of its own —
the tokens in scope on a refusing route were built from the platform registry and
never saw a tenant value. It also offers no control that looks like signing,
because there is no signing act in a slot binding to wire one to.

## Theme tokens are scoped, with cleanup

`SurfaceRouteView` emits the grant's tokens on **its own element** and removes
them on unmount — the same thing `FormspecForm` does correctly on its container.
`FormspecProvider` used to write unscoped to `document.documentElement` with no
cleanup; it now renders a provider-owned scope element and emits onto that
(`packages/formspec-react/src/context.tsx`, pinned by
`tests/theme-token-scope.test.tsx`).

**There is no `scrubDocumentRoot` prop.** An earlier revision of this file
documented one "(default on)"; it never survived the provider fix, and a reader
who trusted it would have believed a defence was running that is not. A shell
must not scrub in any case: if it finds Formspec properties on the document root
it reports `THEME-DOCUMENT-ROOT-CONTAMINATED` and leaves them, because a shell
that manufactures the property it reports is not measuring anything and the leak
it silently repairs stays broken for every consumer that is not this shell
(surface-shell-spec §4.5).

`SurfaceApp` also restores the previous `document.title` on unmount. Setting a
global and not cleaning it up is the same defect as the token leak, one channel
over.

## Layering

Layer 3 (`scripts/check-dep-fences.mjs`): peer-depends on `@formspec-org/surface`
(2), `@formspec-org/react` (2), `@formspec-org/layout` (1),
`@formspec-org/types` (0) and React.

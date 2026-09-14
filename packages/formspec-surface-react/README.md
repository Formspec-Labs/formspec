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

## Navigation refusal

`SurfaceNav` sends `onNavigate` only usable destinations. A route whose URL
collides with another route renders with unavailable link semantics, as does a
parameterized route whose values are missing. The item keeps its label and is
exposed to assistive technology as a disabled link, but has no `href`, click
handler, or tab stop. Collision claimants stay visible so a person and the host
can account for every refused route.

The same refusal applies to transitions. A transition targeting a colliding URL
renders no action control, and the final navigation boundary checks the refusal
again before calling `onNavigate`.

## Static image admission

`SurfaceApp` never dereferences an authored image source directly. The host
supplies `staticAssetResolver`, applies its origin policy, and returns either an
admitted runtime source or a refusal. Without the resolver, or when it refuses,
the binding renders the slot as unavailable and reports
`STATIC-IMAGE-SOURCE-REFUSED`.

## Diagnostic delivery

`onDiagnostics` receives the complete ordered list once when a host subscribes
and once after each semantic change. Equivalent inline arrays and objects do
not trigger another delivery. Object key order does not matter; diagnostic
order and nested array order do.

Replacing one callback with another while subscribed does not replay the
current list. The replacement receives the next change. Removing the callback
and later supplying one starts a new subscription, which receives the current
list once. Development `StrictMode` delivers one initial list per logical
mount.

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

Five widgets, plain and functional, themed entirely through `--formspec-*`
custom properties emitted from the route's theme grant.

| Widget | For | Data |
|---|---|---|
| `IntakeBanner` | Setting expectations above a form | `binding.config` |
| `CeremonyFrame` | Framing what is being attested to | `binding.config` |
| `ReceiptPanel` | What a person keeps after submitting | declared named inputs |
| `QueueTable` | An operator's work list | declared named inputs |
| `StructuredPanel` | Generic metrics, facts, lists, responsive tables, progress, and mapped actions | traced `binding.config` plus declared named inputs |

**None of them invents product content.** The focused widgets use their
existing generic empty-state defaults. `StructuredPanel` renders only independently
traced configuration and bound data; without either, it renders nothing. That
rule is the whole point: the `surface-render-v10` spike's queue table drew four
applications with invented rents and waiting times, and it looked convincing.

Runtime data reaches a widget through Surface 0.2 `dataBindings`. Each Registry
1.1 input name maps to one exact `{catalogRef, sourceRef}` pair. `SurfaceApp`
passes that resolved descriptor and the active route/slot/module context to the
canonical `DataSourceLoader`; separate host ports authorize and validate the
payload before the widget receives a frozen named object. Missing required data
renders an explicit catalog-directed failure posture. No value travels through
`config`.

A traced `config.stateViews` object may define loading, empty, unavailable, and
error UI. Each state and each state action needs its own Need anchor and
`renderedConfigNodes` inventory entry. `config.emptyWhen` selects an admitted
input through safe own-property paths. Loader details remain in diagnostics.

A widget receives only `emitAction(outputName, input?)`. The optional `input`
is selected finite JSON data. The shell clones and freezes it, checks the Registry
declaration and exact Surface `actionBindings` map, allocates the stable
invocation id, includes the input in replay identity, coalesces double delivery,
replays a durable prior terminal, and
delegates the exact action id to the host's Response Actions executor. The
widget never receives the action id, route table, executor, or navigation
function. `StructuredPanel` can use the returned lifecycle handle for traced
pending, success, and failure feedback.

A `StructuredPanel` table row action may declare a traced `confirmation`
object. The first activation renders its heading, explanation, confirm label,
and cancel label without emitting the action. Confirm emits the selected row
payload once; cancel returns to the row action. The Registry must list the
confirmation in `renderedConfigNodes` and validate it through
`widgetShape.props`, so destructive copy cannot bypass schema or Needs review.

Hosts that need their existing draft/submit runtime use
`renderDefinitionForm`. Its single input contains the resolved form slot plan,
route theme grant, route context, and the one Response Actions document
targeting that Definition. Without the callback, the package renders the same
`FormspecForm` as before.

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

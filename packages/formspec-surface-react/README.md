# @formspec-org/surface-react

Response-scoped module-widget actions declare `responseInput` on their Surface
action binding. It names a required Registry data input whose qualified Data
Source uses `schema: {"$ref":"https://formspec.org/schemas/response/1.0"}`.
The shell resolves the action's loaded target Definition, captures and validates
an immutable full Response before widget access, then supplies
`SurfaceWidgetActionExecutorInput.responseContext` separately from widget-selected
`input`. App actions omit this context. Draft actions retain their own validation
and persistence policy.

The host validates the exact snapshot through the existing Response Actions
`submit` preparation port, checks current ownership/revision, and dispatches
registered durable effects. It preserves signatures and extensions rather than
regenerating a Response. `SurfaceWidgetActionOutcomeKey.responseIdentity` is a
private deterministic replay key containing the complete subject; never log it
or put it in a route. Shell delivery IDs and host durable operation IDs remain
distinct; retain one host operation ID across retry and replay.

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
Panel `actions[]` entries accept the same `confirmation`. A declared
confirmation missing any label or its own Need anchor withholds the action and
its semantic output; app-graph reports
`STRUCTURED-PANEL-ACTION-CONFIRMATION-INVALID` from the same admission rule.

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

## SigningCeremony

`SigningCeremony` adds an explicit signing act beside the display-only
`CeremonyFrame`. Publish `SIGNING_CEREMONY_WIDGET_SHAPE` as the admitted Registry
entry's `widgetShape`, version `0.1.0`, and supply `starterWidgetModule(moduleId)`.
Its delivery identity is `@formspec-org/surface-react/SigningCeremony@0.1`.
The root configuration and each `copy` locale object need current adopted Need
anchors when strict data-only validation applies. Configuration is qualified by
AppGraph's native ModuleResolver. The source-reference props fragment is generated
from Common's canonical schema so Registry validation needs no external schema
fetch. Run `npm run schema:generate` after changing that Common definition.

Configuration selects exact `contentRefs` by locale and supplies locale-specific
ordinary UI `copy`: heading, read instruction, read confirmation, signer-name
label, pending, signed, failed, and unavailable text. Legal wording belongs in
`Definition.extensions['x-formspec-signing-content']`, not widget configuration.
Resolve it with `resolveAuthoredSigningContent` and the maintained Common schema
validator. No implicit locale fallback is permitted for legal wording.

Declare all six required inputs through qualified Data Sources:

- `content`: the schema-valid resolved `SigningContent` shown to the signer.
- `response`: the exact current persisted completed canonical Response.
- `draft`: `{id, version, responseHash}`; the hash identifies the frozen preparation.
- `actor`: `{id}` from verified identity.
- `signingResult`: `{state:'unsigned'}` before signing, or the verified signed result
  `{state:'signed', response, draft:{id,version}, verification:{mode:'delegated-service-key',provider,keyId}}`.
- `actionLabels`: exact mapped Action label refs resolved with the admitted Locale.
  Literal labels use the mapped Action directly. Missing labels refuse the control.

The widget requires an unbranded `ceremony` route. It preserves full plaintext,
provides native keyboard scrolling, separates reading from electronic consent,
and captures a detached displayed snapshot. Changes reset assent; nested mutation
without a render also refuses action emission. A signed refresh displays the
committed name. The paper alternative stays visible, with an optional `paper`
output that performs neither Sign nor Submit.

Map `sign` and `submit` to separate admitted Response Actions. Sign emits
`{draftId,draftVersion,responseId,responseHash,source,locale,signerName,consentAccepted:true}`
only after the explicit act. The host creates one signed-at time, saves the covered
commitment at unsigned revision `n`, checks the exact saved candidate, and calls
its signing producer. Retries retain that candidate and operation identity.
The producer returns the full signed Response at `n+1`; the commitment stays at
`n`. Submit emits `{draftId,draftVersion,canonical_response}` with the exact signed
Response. It must pass fresh server revision, snapshot, identity, content and
cryptographic admission. Do not regenerate it with `getResponse()` or discard its
metadata through `loadResponseData()`.

The widget checks consistency with the qualified verification result; it does no
cryptographic verification itself. Completed action feedback alone leaves Submit
disabled. The displayed delegated-service-key notice must describe the actual
producer; it must not imply possession of a personal signing key. Application
signing requirements remain explicit server policy and do not change core form
validation merely because a content catalog exists.

## Frozen Response review

`ResponseReview` displays every present answer from a detached full Response, in
Definition order with groups and repeats. Extra answers remain visible with their
stored keys and lossless JSON values. It uses no engine values, relevance filters,
calculations, defaults, answer writes or Response export. Signature count describes
recorded metadata; the renderer verifies neither signatures nor legal validity.

The generic starter widget declares required inputs `definition`, `response`, and
`presentation`, and omits optional `actionOutputs` because it emits none.
The Registry requires a nonempty array whenever that field is present. Publish
`RESPONSE_REVIEW_WIDGET_SHAPE` in an
actual Registry contribution; configuration follows `RESPONSE_REVIEW_CONFIG_SCHEMA`.
`RESPONSE_REVIEW_PRESENTATION_SCHEMA` describes the separate qualified metadata input.
The Definition source supplies the complete canonical root Definition using
`{"$ref":"https://formspec.org/schemas/definition/1.0"}`; a SigningContent
fragment cannot supply its items. The Response source retains the canonical
root Response schema reference. Qualified Data Source/host admission performs
complete canonical schema validation; the renderer checks markers, structure
and matching pins defensively.

Presentation supplies exact Definition pins, full-Response JCS/SHA-256 hash,
`locale`, `actorRef`, `draft:{id,version}`, `phase:'before-sign'|'before-submit'`, and
`fields:{[instancePath]:{label,options?:[{value,label}]}}`. Capture labels and option
text through maintained public field metadata at the exact candidate. Include
labels for present groups and repeated fields. Do not refresh dynamic options or
interpolate labels against changed live answers. The host checks the Definition
bytes against the loaded artifact and qualifies metadata provenance. This widget
requires a matching explicit `displayedLocale`; missing language evidence refuses
review. Before-submit also requires recorded signatures, a shape check only.

Configuration has authored `copy:{[locale]:...}` with the exact closed keys in
`RESPONSE_REVIEW_COPY_KEYS`, including all pending/failure/empty-value labels.
There is no English fallback or new `$ui` key. An unavailable input without valid
language/copy cannot manufacture localized text.

Use `starterWidgetModule(moduleId,{responseReview:{readAttachment,onReviewState}})`
or `createResponseReviewWidget(...)` to inject the narrow host capabilities.
They remain outside authored JSON. `readAttachment(request,{signal})` receives the
exact detached descriptor, actual field/array path, and complete captured inputs.
The host checks private actor/session/form/ownership/revision and returns verified
bytes through its admitted reader. The renderer independently checks retained
`hash:'sha256:<hex>'`, size, MIME aliases and raster byte signature, then waits for
successful image decoding. PNG/JPEG/GIF/WebP previews use owned Blob URLs, never a
stored URL or URN as image source. Unsupported, missing or failed previews keep
availability false. Details preserve the entire stored descriptor. Reads abort on
replacement; preview URLs revoke on replacement/unmount.

`onReviewState` reports `pending|ready|unavailable` with the exact response hash,
actor, draft revision, phase and locale. Ready adds `contextIdentity`, the full
captured input hash (`responseReviewHash({definition,response,presentation})`).
The host must reset its gate for every new route/generation/candidate and compare
that identity before accepting availability. This reports presentation availability,
not proof that a person read it. Explicit assent stays in SigningCeremony; host and
server ownership, signing and submission checks remain separate. Keep injected
callbacks stable within a generation. Use the completed unsigned candidate before
assent and the exact full returned signed Response before Submit. Preserve both
originals; do not regenerate either from the review display.

For a ceremony that requires full answer/photo review, set authored
`requireResponseReview:true` on SigningCeremony and provide the declared optional
`review` input. It carries `{contextIdentity,state}` as described by
`SIGNING_CEREMONY_REVIEW_SCHEMA`; state uses `RESPONSE_REVIEW_STATE_SCHEMA`.
The host computes the expected identity independently from its current captured
review inputs, then publishes callback state only for that same candidate. It
must compare the Response, loaded Definition/content, actor, draft revision,
locale, phase and route/session generation; copying the callback identity alone
is insufficient. Pending/unavailable states can omit their reported identity.

The opted-in ceremony disables both Sign and Submit and rechecks their emission
unless review is ready with the exact expected identity and current context.
Changes to the expected identity reset reading, consent and name. The requirement
is captured with the mounted ceremony; mutating configuration cannot bypass it.
Add authored `reviewPending` and `reviewUnavailable` strings to every selected
ceremony Locale copy; the config schema requires them only when opted in. Preview
failures offer a native retry of the same immutable descriptor. Neither retries
nor ready feedback establish human reading or consent.

Keep paper access available by delivering a loaded `unavailable` review state or
setting that optional review source's `failureMode: degraded-widget`. The default
Data Sources policy can block a widget even for an optional failed source. This
is a source-policy choice; the loader is unchanged. Legacy ceremony configurations
retain their existing behavior. D1 full-review authoring opts in explicitly.

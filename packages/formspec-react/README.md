# @formspec-org/react

React hooks and auto-renderer for Formspec. Composes a [`FormEngine`](../formspec-engine/README.md) into a `<FormspecProvider>` context, then walks a `LayoutNode` tree (from `@formspec-org/layout`) into React elements via the bundled renderer — or builds custom UIs from the granular hooks.

**Runtime dependencies (peer):** `react ^18 || ^19`, `@preact/signals-core ^1.8`, `@formspec-org/engine`, `@formspec-org/layout`
**Module format:** ESM (`dist/index.js`)
**Build:** `npm run build` (`tsc` → `dist/`)

---

## Install

```json
"dependencies": {
  "@formspec-org/react": "^0.1.0"
}
```

---

## Quick Usage

```tsx
import { FormspecProvider, FormspecFormContent } from '@formspec-org/react';
import { FormEngine, initFormspecEngine } from '@formspec-org/engine';

await initFormspecEngine();

const engine = new FormEngine({ /* definition */ });

export function MyForm() {
  return (
    <FormspecProvider engine={engine}>
      <FormspecFormContent />
    </FormspecProvider>
  );
}
```

Two entry points:

- **`@formspec-org/react`** — full export: provider, renderer, default components, every hook.
- **`@formspec-org/react/hooks`** — hooks-only barrel for custom UIs (no renderer, tree-shakeable).

---

## SSR / Next.js App Router

Every component and hook in this package is a **client component** — each module that touches React hooks (`useState`, `useEffect`, `useRef`, `useSyncExternalStore`, `useContext`, etc.) carries `'use client'` at the top.

What this means for consumers:

- **Server components can import from this package.** Next.js / RSC will treat the imported symbols as client components and ship them to the client bundle automatically. No wrapper file required.
- **Components execute on the client.** They subscribe to the engine's Preact signals via `useSyncExternalStore`, which is intentionally client-side reactivity — there is no server-side reactive engine.
- **Initial-render hydration is signal-safe.** `useSignal` implements `getServerSnapshot`, so the first render on a hydrating client matches the server-rendered HTML and does not flash. (Initial hydration support landed in fs-qzzb.)
- **`FormEngine` itself is framework-agnostic** — it can run in a Node SSR pass — but the React bindings here do not subscribe during server render. If you need server-side form state (e.g. server actions, validation), call `FormEngine` methods directly from your server code, not through these hooks.

The only modules in `src/` that do **not** carry `'use client'` are pure re-export barrels (`index.ts`, `hooks.ts`, `screener/index.ts`) and type-only modules (`component-map.ts`, `screener/types.ts`). Barrels do not need the directive because re-exports inherit the boundary from the source module.

---

## Architecture

Three concentric layers — pick the one that matches your need:

| Layer | API | When to use |
| --- | --- | --- |
| Auto-renderer | `<FormspecForm />` | Default rendering with the bundled default components. |
| Renderer + component map | `<FormspecForm components={...} />` | Replace specific layout/field components, keep the renderer walk. |
| Hooks | `useField`, `useForm`, `useWhen`, `useSignal`, ... | Hand-build the UI; the hooks expose the same reactive view models the renderer consumes. |

See [`src/`](src/) for the full hook surface. Each hook is a thin React adapter around the engine's `FieldViewModel` / form-level signals.

`ActionButton` rendering requires a `responseActionsDocument` whose `actions[*].id`
matches the button's `actionRef`. When an action cannot be resolved, the button is
rendered inert and `onActionFinding` receives a `COMP-REFERENTIAL-INTEGRITY`
finding. A resolved action calls `onSubmit` only when it declares a
`hostEvent` effect for `formspec-submit`; all host events flow through
`onHostEvent`, durable effects use `dispatchActionEffect` plus
`resolveActionIdempotencyKey`, and final action terminals flow through
`onActionResult`.

`FormspecFormContent` owns a stable action-status region outside conditional
nodes. A completed action can therefore announce its existing localized result
after a readiness change removes its button. The latest started action owns the
provider's feedback, and only its originating content root announces it. A
standalone `FormspecNode` retains local feedback. Pending controls keep their
existing promise guard and focus behavior independently of feedback clearing.

The private feedback record clears when observable answer values, repeat counts,
or effective relevance change, or when its provider, semantic subject, engine,
or content outlet is replaced. Equal values, readiness scratch, Locale changes,
and manual semantic revisions preserve feedback. Hosts implementing Clear must
retire the provider or content outlet even for equal empty answers. Original
action results and findings still reach their existing callbacks; displayed
completion does not establish durable save, signature or submission authority.

Freshness requires signals from the same stock Preact peer. Custom or mixed
signal instances, unsupported JSON values and excessive content refuse persistent
feedback while allowing the action to execute. The bounded check uses maintained
`canonicalize` and synchronous `@noble/hashes/sha2.js` SHA-256; it retains a fixed
digest and finite status/provenance metadata. It admits at most 128 levels,
100,000 visited nodes and 1 MiB of text per complete transient cohort. Public
path enumeration precedes admission. Observable A→B→A invalidates old feedback;
changes hidden inside one atomic Preact batch are observed as its final state.
In-place changes that do not notify public signals are outside observation;
activation and terminal checks still compare current content. These are private
freshness checks, separate from canonical Response and signature profiles.
The hash dependency requires Node 20.19 or later for Node consumers.

### Renderer chrome for custom controls

Import `useChromeText` and `ChromeText` from `@formspec-org/react` or
`@formspec-org/react/hooks`. The hook returns
`(key: ChromeStringKey, params?: Record<string, string | number>) => string`.
Use the closed suffix without `$ui.`, for example
`chrome('fileUpload.remove', { filename })`. Authored Definition-targeted Locale
strings override shared English defaults; locale loads and switches update the
rendered text. Parameters substitute literally, without expression evaluation.

For upload chrome, `percent` is a display percentage from 0–100 (the template
adds `%`); `limit` is an already formatted size such as `25 MB`. Store keys and
parameters for pending/error state and resolve them while rendering so language
switches update existing feedback. The hook also supplies shared defaults outside
a Formspec provider. See Locale §3.1.10 for the complete closed key inventory.

Receipt, preview and form-settings chrome uses the same hook. The host selects
received, restored, clearing and language-save-failed states; translating a label
does not establish backend acknowledgment. `receipt.pendingFilingAndSigning`
reports unconfirmed filing/signing. Render a submission ID as unchanged host data
beside `receipt.submissionId`, rather than embedding it in translated copy.

The root and `/hooks` entry points also export `chromeText(engine | undefined,
key, params)`, the same pure resolver used by `useChromeText`. Hosts can resolve
cleared-access confirmation text with the current qualified engine before
releasing answer state, then retain only the resulting strings. Outside an
engine it uses shared English defaults. Recovery feedback is selected by the
host; the `draft.versionChanged` version parameter is opaque literal text.


`FormspecFormContent` renders beneath an existing `FormspecProvider`. Its only
prop is `className`; it uses that provider's engine, layout, Component/Theme,
action ports, semantic controls, and token-emission policy. It includes the
standard `.formspec-container`, scoped theme tokens with cleanup, issuer chrome,
and the maintained layout walk. Render issuer chrome exactly once; a host with
an external issuer header must choose which component owns it.

Use `FormspecForm` when the renderer should create the provider. The content
component does not run the outer renderer's screener gating or parse query issuer
overrides; the host and existing provider retain those responsibilities. It adds
no submit handler or automatic action controls beyond the provider's configuration.

When a completed action removes its originally focused button during the completion transition, the originating persistent status receives focus once, using native browser focus to reveal the result. This fallback uses the current action ownership and answer freshness. It cancels on intervening focus or navigation, window withdrawal, content changes, or provider/outlet retirement; surviving controls and non-success results keep ordinary focus behavior. A stable exact-button callback ref identifies renderer detachment before native removal; ordinary connected-source blur still cancels recovery. Reattachment resets that marker. The status uses `tabIndex=-1` and adds no sequential tab stop. Later unrelated branch removal and standalone nodes without a persistent outlet do not trigger recovery.

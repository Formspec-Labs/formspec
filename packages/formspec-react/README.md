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
import { FormspecProvider, FormspecForm } from '@formspec-org/react';
import { FormEngine, initFormspecEngine } from '@formspec-org/engine';

await initFormspecEngine();

const engine = new FormEngine({ /* definition */ });

export function MyForm() {
  return (
    <FormspecProvider engine={engine}>
      <FormspecForm />
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

---
"@formspec-org/engine": minor
"@formspec-org/webcomponent": minor
"@formspec-org/walk": minor
---

<!-- tier: foundation -->

Accessibility checks for publish (ADR 0166 §3). `@formspec-org/webcomponent/host` builds one self-contained HTML page (`renderHostPage`) that draws `<formspec-render>` from pinned Definition, Theme and Locale documents with no network. `@formspec-org/walk` gains `formspec-walk a11y` and `formspec-walk serve` (`AccessibilityServer`): axe-core (WCAG A/AA) on every page and again with validation errors shown, as a structured report; a timeout or browser failure is a failed report, never a pass. `@axe-core/playwright` is an optional peer dependency. `initFormspecEngine` accepts `{ wasmBytes }` for hosts that cannot fetch the `.wasm`. Walk now depends on the webcomponent.

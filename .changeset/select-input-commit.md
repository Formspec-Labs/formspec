---
"@formspec-org/react": patch
---

<!-- tier: foundation -->

Native selects now commit on the browser's input event before a host autosave update can rerender the old controlled value. Shared event handling deduplicates the later change event against the displayed option; change-only integrations still work. Numeric selects retain the authored option spelling when the engine canonicalizes the answer. This covers form fields, editable DataTable cells, repeat rows and native screener choice and Yes/No controls.

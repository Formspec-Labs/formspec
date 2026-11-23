---
"@formspec-org/engine": minor
"@formspec-org/surface-react": minor
---

<!-- tier: foundation -->

Breaking: for a subject-declaring Definition, `FormEngine` ignores a supplied `responseSubject.id` and derives `Response.subject.id` once, at construction, from the validated `type` and `keys`. `getResponse({ subject })` now throws for a subject-declaring Definition. While the subject is refused, `getResponse`, `getResponseSnapshot` and `captureSubmitSnapshot` throw `Response subject refused: <path>: <message>`; `hasSubjectRefusal()` and the `TYPE_MISMATCH` finding in `getValidationReport()` remain. A host entity subject on a Definition without a subject declaration must carry `responseSubject.id`, or construction throws. Rust: `formspec_core::response_selection::{subject_id, subject_id_json}` moved to `formspec_core::subject_key` (no alias).

A subject-declaring form no longer loads the tools WebAssembly (4.66 MB, 1.59 MB gzip) to name its filing unit; the runtime WebAssembly grows by about 15 KB (5 KB gzip). `responseSubjectId(type, keys)` needs only `initFormspecEngine()` and is also exported from `@formspec-org/engine/render`. In `@formspec-org/surface-react`, the Definition form slot and draft keys derive the id from the planned subject through runtime WebAssembly: the slot shows no loading state for tools, an unhashable subject shows the localized unavailable message, and a renderer-supplied id neither keys a draft nor recreates the engine. A slot whose initial data names a Mapping (`initialData.mappingRef`) still downloads the tools WebAssembly, now on its own before reversing the Mapping, so the saving above does not apply to it; a failed tools load shows the localized unavailable message.

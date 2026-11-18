---
"@formspec-org/layout": minor
"@formspec-org/react": minor
"@formspec-org/surface": patch
"@formspec-org/surface-react": patch
"@formspec-org/walk": patch
---

<!-- tier: foundation -->

Section IDs and titles now follow the authored page or the Heading that names a loose run. Loose content without a section ID stays in authored order within a neighboring section. Flat forms render continuously. Unknown section links open the first section. Authored titles retain their translations and responsive overrides. Theme Items outside page regions share a trailing section with a link based on the first available Item key. If every candidate key is in use, the Items stay at the end of the final Theme page.

Use `resolvePageSequence` directly for section ownership and progress. The plan now includes the attachments previously applied by `workspaceSections`.

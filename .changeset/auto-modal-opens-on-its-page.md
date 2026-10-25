---
"@formspec-org/layout": minor
"@formspec-org/webcomponent": minor
"@formspec-org/react": patch
---

<!-- tier: foundation -->

A `trigger: "auto"` Modal opens only while its `when` holds and its page is shown (Component spec §6.16, §8.1). The renderers called `showModal()` as soon as `when` held, even inside a hidden wizard page or tab panel: the invisible open dialog made every other page inert, so Next and every other control stopped responding. `@formspec-org/layout` adds `bindAutoModal(dialog, onOpen)`, which opens the dialog when `when` holds and its place in the form is rendered, closes it when either stops, and opens it again when the respondent returns to its page; a resize while it stays shown does not reopen a dismissed modal. `ModalLayoutBehavior` gains `bindAutoOpen(dialog, onOpen)` so every webcomponent adapter shares that binding, and the React `ModalLayout` uses `bindAutoModal` too, which fixes an auto Modal on an inactive tab.

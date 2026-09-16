---
"@formspec-org/webcomponent": patch
---

<!-- tier: foundation -->

A click on an option lands even when focus is already on a sibling option of the same required field. Focus moving between a field's own controls, or leaving because of a pointer press inside the field, no longer marks the field touched, so the required error does not appear between the press and its release and move the label out from under the pointer.

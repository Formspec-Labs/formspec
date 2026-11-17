---
"@formspec-org/react": patch
"@formspec-org/webcomponent": patch
---

<!-- tier: foundation -->

Focusing or leaving a field the filer cannot change no longer reveals its errors. A read-only, calculated, or (React) protected field was marked touched on blur, so clicking into an empty required identity field and tabbing away showed "Required" on a field the filer could not fill. React `useField().touch()` and `inputProps.onBlur`, and the webcomponent's `markFieldTouched` (every behavior's `touch()` and the field's `focusout`/`change` tracking), now leave such a field untouched. Its errors still show after an explicit pass over all fields, such as save, submit, or a wizard step (Core §5.5). Editable fields are unchanged.

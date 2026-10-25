---
"@formspec-org/adapters": patch
---

<!-- tier: integration -->

The USWDS Modal hands a `trigger: "auto"` dialog to the webcomponent's `ModalLayoutBehavior.bindAutoOpen`, so it opens only while its `when` holds and its page is shown, and no longer blocks the rest of the form from a hidden wizard page. Its `when` now also resolves against the Modal's own scope (`whenPrefix`), as the default adapter's does.

# v12 static-content shortcut finding

The first corrected SaaS replay exported a valid 13-route app in 57 public
calls. It covered the `SAAS-V1.md` feature areas and labeled capabilities
`LIVE`, `ASSISTED`, `PREVIEW`, or `DISABLED`, but every route used only a
static-content slot.

A fresh scorer rated that result Level 2. The wireframe was a sitemap plus
product copy, not a useful structured proof:

- all 21 transitions emitted `E611` because no visible control could produce
  their Actions;
- the sole Definition was empty;
- no Registry widget, Data Source, or Experience unit represented reusable
  controls, live regions, or multi-step work; and
- every minimum-live feature was asserted in text rather than modeled.

The structured recovery deliberately adds those public resource types. Its
purpose is still wireframing, not runtime qualification: structured inputs,
data bindings, and action producers make the design inspectable, but they do
not prove persistence, billing, tenant isolation, delivery, or browser
behavior.

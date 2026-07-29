# Formspec Cloud SaaS V1 — fast builder attempt

The replay plan now contains exactly 52 calls: one app start, 13 routes, one Definition declaration, four declared closed-core navigation actions, 13 route bindings, 16 transitions, and the final summary, preview, validate, and export calls.

The 13 routes keep customer work, organization administration, and public completion distinct. Customer navigation covers forms, the parameterized detail route `/app/forms/{formId}`, preview, responses/exports, signatures, integrations, billing, and support/trust. Organization administration covers setup, roles, invitations, branding, and feature visibility. Public users get only anonymous completion and receipt/proof status, not an account or dashboard.

All transition triggers are declared actions in a fresh session: `navReview` (`review`), `navSaveDraft` (`save-draft`), `navSubmit` (`submit`), and `navEvidence` (`request-evidence`). Each uses a closed-core intent and a `hostEvent` effect. The Definition declaration precedes all actions, as required by the action catalog.

Visible content labels every capability `LIVE`, `ASSISTED`, `PREVIEW`, or `DISABLED`, including the minimum live SaaS surface and deliberately limited capabilities. This is a replay plan only; no builder call was executed.

# Formspec Cloud SaaS V1 — recovery attempt 2

The prior replay reported six unreachable routes from `dashboard`: onboarding, integrations, administration, billing, public completion, and public receipt. This replay adds entry-reachable transitions from the dashboard to the first five; public receipt remains reachable through public completion. All 13 routes are therefore reachable from the entry.

The plan preserves the same SaaS coverage, parameterized `/app/forms/{formId}` route, declared Definition and four closed-core actions, visible feature-state labels, and final summary/preview/validate/export sequence. It has 57 calls: the prior 52 plus five entry transitions. It is a replay plan only; no calls were executed.

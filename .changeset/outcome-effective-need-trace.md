---
"@formspec-org/outcome-verification": minor
---

<!-- tier: foundation -->

Export `indexOutcomeNeedTraces` to resolve the exact Need revisions that an
App Graph node inherits or declares. The verifier's rule index now cites
AppGraphValidator's `rendered-node.effective-need-trace` rule. Outcome
Verification cases and reports use the `need-trace` relation in place of
`direct-need-trace`. The verifier requires `@formspec-org/types` 0.3.0 or later
in the 0.3 release line for the effective trace types.

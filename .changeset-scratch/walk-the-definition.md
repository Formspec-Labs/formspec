---
"@formspec-org/walk": minor
---

<!-- tier: foundation -->

New package: the Definition walk. `derivePlan` reads a Definition, Locale and Theme
into the names, states, options, groups, repeats and conditions a rendered form must
present; `Walk` checks them on a live page by keyboard and screen reader (Guidepup's
virtual reader in the page, or the OS's own); `walkDefinition` runs them all;
`formspec-walk emit` writes them out as a readable Playwright spec.

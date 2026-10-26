---
"@formspec-org/engine": patch
---

<!-- tier: foundation -->

The engine declares `@formspec-org/integrity-canonical` as `^0.1.1` instead of a `file:` path into a sibling `integrity-stack` checkout, which no install outside the formspec-stack could resolve. Inside the stack the workspace root links that sibling, so local builds resolve the same package. Installing the published engine still needs `@formspec-org/integrity-canonical`, `@formspec/signature-port` and `@formspec/signature-cose` on npm.

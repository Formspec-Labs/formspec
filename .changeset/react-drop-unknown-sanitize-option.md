---
"@formspec-org/react": patch
---

<!-- tier: foundation -->

Markdown sanitizing no longer passes `allowedSchemesRelative`, which is not a `sanitize-html` option: it failed `tsc` on the package's sources and never had an effect. Protocol-relative links keep sanitize-html's default (`allowProtocolRelative: true`), so rendered output is unchanged.

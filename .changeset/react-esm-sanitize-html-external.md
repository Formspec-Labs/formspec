---
"@formspec-org/react": patch
---

<!-- tier: foundation -->

`import '@formspec-org/react'` works under Node ESM again. The ESM build bundled the CommonJS `sanitize-html` (and `postcss` beneath it), whose `require("path")` threw "Dynamic require of \"path\" is not supported" on import. `sanitize-html` is now left external, resolved from the package's own dependency; only the ESM-only `canonicalize`, `@noble/hashes` and `marked` stay bundled for the CommonJS build.

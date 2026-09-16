---
"@formspec-org/types": minor
---

<!-- tier: kernel -->

Regenerate the Locale and Theme types: the closed `$ui.<ChromeStringKey>` family now
covers every word a renderer draws for itself, and a token registry entry can declare
`adapterDefault` — a token each adapter resolves from its own design system while a
Theme leaves it unset.

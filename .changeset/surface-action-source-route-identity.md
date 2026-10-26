---
"@formspec-org/surface-react": patch
---

<!-- tier: foundation -->

A widget action's `source.route` again carries only the declared route identity (`surfaceId`, `surfaceRef`, `routeId`, `routeClass`, `params`). The route context gained the presented, localized `title` for widget rendering, and it leaked into the action source, so hosts that admit an emission by exact source identity (formspec-web's signing controller) refused Sign and Submit emitted from the Surface as a context mismatch. Widgets still receive the title on their route prop.

---
"@formspec-org/surface-react": patch
---

<!-- tier: foundation -->

`SurfaceWidgetActionSource.route` is typed as the new `SurfaceWidgetRouteIdentity` (`surfaceId`, `surfaceRef`, `routeId`, `routeClass`, `params`), and the shell builds it with one `routeIdentity()` projection, so the presented title cannot re-enter an action source by a hand copy drifting. `SurfaceWidgetRouteContext` extends it and now declares the `title?` widgets already received.

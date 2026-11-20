# @formspec-org/surface-react

## 3.0.0

### Minor Changes

- 3a61bc2: <!-- tier: foundation -->

  Place a filing tracker on every Surface route, and count paired warning follow-ups once. Validate each roster against the subject keys of its target forms. Show each authorized roster member’s form progress and name the members with a confirmed outstanding filing.

- eb9721c: <!-- tier: foundation -->

  Authoring validation can check module widgets against what the deployment host ships, so a bundle that passes it no longer fails publication's widget resolver.

  - `@formspec-org/app-graph` owns the delivery-contract comparison (`widgetContractMismatchReasons`, `WidgetRuntimeContract`) and adds `hostWidgetContracts` to the validation request. When a caller supplies it, `validateHostWidgetContracts` reports `WIDGET-UNIMPLEMENTED` for a binding the host does not supply and `WIDGET-DELIVERY-CONTRACT-MISMATCH` (with the resolver's reasons, e.g. `registry-entry-version-mismatch`, `rendered-config-inventory-mismatch`, `runtime-contract-missing`) for a Registry entry no shipped variant matches. A widget listed with an empty variant list is shipped without a delivery contract and resolves exactly as the runtime resolver does. `hostWidgetContractSet(modules)` builds the data from a host's widget module variants (widget names plus contracts); `selectHostWidgetContract` and `hostWidgetContractVariants` let a host select from it.
  - `@formspec-org/surface`'s `createWidgetRegistry` now calls that comparison, so runtime and authoring refuse with the same reasons; `WidgetRuntimeContract` types are re-exported from app-graph.
  - `@formspec-org/surface-react` publishes its starter delivery contracts React-free from `./widget-metadata`: `starterWidgetContracts(options)`, `STRUCTURED_PANEL_REGISTRY_ENTRY_VERSIONS`, `ACCEPTED_RESPONSE_REVIEW_REGISTRY_ENTRY_VERSIONS`, and the delivery ids and rendered-config inventories. `starterWidgetModule` delivers exactly that table. `StarterWidgetModuleOptions` is now exported from the package root.

- f3aa11f: <!-- tier: foundation -->

  Start a new filing unit from an authored route and resume it at its own address.

- ceb352e: <!-- tier: foundation -->

  Breaking: submit-profile validation now requires current answers for warning
  Shapes authored with confirm, explain or acknowledge mode. The engine exposes
  the current findings and pending edits. Accepted-record review displays the
  explanations retained in the filing.

- 1cca148: <!-- tier: foundation -->

  Render the authored workspace with section navigation, localized question search, live findings, and shared Save actions. Surface links preserve each form's section and handle browser focus and titles. Definition Walk can open an instruction-only workspace and find the right repeat by its binding.

### Patch Changes

- 2509341: <!-- tier: foundation -->

  Section IDs and titles now follow the authored page or the Heading that names a loose run. Loose content without a section ID stays in authored order within a neighboring section. Flat forms render continuously. Unknown section links open the first section. Authored titles retain their translations and responsive overrides. Theme Items outside page regions share a trailing section with a link based on the first available Item key. If every candidate key is in use, the Items stay at the end of the final Theme page.

  Use `resolvePageSequence` directly for section ownership and progress. The plan now includes the attachments previously applied by `workspaceSections`.

- d477324: <!-- tier: foundation -->

  A widget action's `source.route` again carries only the declared route identity (`surfaceId`, `surfaceRef`, `routeId`, `routeClass`, `params`). The route context gained the presented, localized `title` for widget rendering, and it leaked into the action source, so hosts that admit an emission by exact source identity (formspec-web's signing controller) refused Sign and Submit emitted from the Surface as a context mismatch. Widgets still receive the title on their route prop.

- 322f869: <!-- tier: foundation -->

  `SurfaceWidgetActionSource.route` is typed as the new `SurfaceWidgetRouteIdentity` (`surfaceId`, `surfaceRef`, `routeId`, `routeClass`, `params`), and the shell builds it with one `routeIdentity()` projection, so the presented title cannot re-enter an action source by a hand copy drifting. `SurfaceWidgetRouteContext` extends it and now declares the `title?` widgets already received.

- Updated dependencies [bc35e3d]
- Updated dependencies [e190c49]
- Updated dependencies [e190c49]
- Updated dependencies [7566f80]
- Updated dependencies [6e3468f]
- Updated dependencies [307b20d]
- Updated dependencies [e4cac2a]
- Updated dependencies [49c104a]
- Updated dependencies [3f7c97d]
- Updated dependencies [7a3307c]
- Updated dependencies [a097e0d]
- Updated dependencies [a8e3230]
- Updated dependencies [226b1d3]
- Updated dependencies [582f4b7]
- Updated dependencies [96331a0]
- Updated dependencies [37c2c94]
- Updated dependencies [77182ed]
- Updated dependencies [bfda53a]
- Updated dependencies [3a61bc2]
- Updated dependencies [c9ed6d8]
- Updated dependencies [2509341]
- Updated dependencies [f945d75]
- Updated dependencies [eb9721c]
- Updated dependencies [e25db1a]
- Updated dependencies [b494889]
- Updated dependencies [b494889]
- Updated dependencies [6471622]
- Updated dependencies [1639f33]
- Updated dependencies [7566f80]
- Updated dependencies [80a4421]
- Updated dependencies [c6eba42]
- Updated dependencies [35d3b2f]
- Updated dependencies [ff8ca95]
- Updated dependencies [96331a0]
- Updated dependencies [2cb3f74]
- Updated dependencies [d02f0af]
- Updated dependencies [9e50ff3]
- Updated dependencies [b0b7393]
- Updated dependencies [dabfe0d]
- Updated dependencies [2285933]
- Updated dependencies [9c44160]
- Updated dependencies [9c44160]
- Updated dependencies [0974c9f]
- Updated dependencies [dafa76f]
- Updated dependencies [f3aa11f]
- Updated dependencies [f3aa11f]
- Updated dependencies [624fafb]
- Updated dependencies [582f4b7]
- Updated dependencies [750682a]
- Updated dependencies [86fa695]
- Updated dependencies [ceb352e]
- Updated dependencies [ae6af9b]
- Updated dependencies [1cca148]
- Updated dependencies [1cca148]
  - @formspec-org/engine@3.0.0
  - @formspec-org/types@0.3.0
  - @formspec-org/app-graph@3.0.0
  - @formspec-org/layout@3.0.0
  - @formspec-org/react@3.0.0
  - @formspec-org/surface@3.0.0

## 2.1.0

## 2.0.2

### Patch Changes

- @formspec-org/engine@2.0.2
- @formspec-org/app-graph@2.0.2
- @formspec-org/layout@2.0.2
- @formspec-org/react@2.0.2
- @formspec-org/surface@2.0.2

## 2.0.1

### Patch Changes

- <!-- tier: foundation -->

  The registry refuses `2.0.0` for app-graph and surface — those numbers were used and
  unpublished once, and npm never lets an unpublished number back. The fixed group moves
  to 2.0.1 together so every package still carries one number.

- Updated dependencies
  - @formspec-org/engine@2.0.1
  - @formspec-org/app-graph@2.0.1
  - @formspec-org/layout@2.0.1
  - @formspec-org/react@2.0.1
  - @formspec-org/surface@2.0.1

## 2.0.0

### Minor Changes

- 96f5f6d: <!-- tier: foundation -->

  Add production signed-bundle admission, complete vNext AppGraph validation,
  platform-under-tenant Theme layering, target-aware Locale handling, and
  runtime Surface data, action, form, and widget integrations. Add generic
  semantic controls, deterministic preview/test Definition Response delivery,
  and data-only outcome verification.

### Patch Changes

- Updated dependencies [96f5f6d]
- Updated dependencies [96f5f6d]
- Updated dependencies [aa22031]
- Updated dependencies [aa22031]
  - @formspec-org/types@0.2.0
  - @formspec-org/engine@2.0.0
  - @formspec-org/app-graph@2.0.0
  - @formspec-org/layout@2.0.0
  - @formspec-org/react@2.0.0
  - @formspec-org/surface@2.0.0

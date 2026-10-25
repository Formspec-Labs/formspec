---
"@formspec-org/app-graph": minor
"@formspec-org/surface": patch
"@formspec-org/surface-react": minor
---

<!-- tier: foundation -->

Authoring validation can check module widgets against what the deployment host ships, so a bundle that passes it no longer fails publication's widget resolver.

- `@formspec-org/app-graph` owns the delivery-contract comparison (`widgetContractMismatchReasons`, `WidgetRuntimeContract`) and adds `hostWidgetContracts` to the validation request. When a caller supplies it, `validateHostWidgetContracts` reports `WIDGET-UNIMPLEMENTED` for a binding the host does not supply and `WIDGET-DELIVERY-CONTRACT-MISMATCH` (with the resolver's reasons, e.g. `registry-entry-version-mismatch`, `rendered-config-inventory-mismatch`) for a Registry entry no shipped variant matches. `selectHostWidgetContract`, `hostWidgetContractVariants` and `hostWidgetContractSet` let a host select and build the same data.
- `@formspec-org/surface`'s `createWidgetRegistry` now calls that comparison, so runtime and authoring refuse with the same reasons; `WidgetRuntimeContract` types are re-exported from app-graph.
- `@formspec-org/surface-react` publishes its starter delivery contracts React-free from `./widget-metadata`: `starterWidgetContracts(options)`, `STRUCTURED_PANEL_REGISTRY_ENTRY_VERSIONS`, `ACCEPTED_RESPONSE_REVIEW_REGISTRY_ENTRY_VERSIONS`, and the delivery ids and rendered-config inventories. `starterWidgetModule` delivers exactly that table. `StarterWidgetModuleOptions` is now exported from the package root.

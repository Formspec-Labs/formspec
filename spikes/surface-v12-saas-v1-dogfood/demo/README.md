# v12 browser demo

This host renders the final `BundleExport` from the v12 Wireframes MCP replay
through the shipped `@formspec-org/surface-react` runtime. It adds the runtime
pieces an export cannot contain: the `SaaSRoutePanel` widget, admitted sample
data, completed action results, and browser navigation.

Run it:

```sh
# From the formspec repository root, build the workspace packages once.
npm install
npm run build

# Then start the demo.
cd spikes/surface-v12-saas-v1-dogfood/demo
npm install
npm run dev
```

Open <http://127.0.0.1:4183/app>. The navigation exposes all 13 generated
routes. Route actions also follow the transitions authored in the bundle.

Verification:

```sh
npm run typecheck
npm run build
```

This is an unsigned local dogfood build. It demonstrates that the generic
Wireframes MCP output can reach the real Surface renderer; it does not claim
release admission or deployment.

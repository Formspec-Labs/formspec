# Generic v12 Surface preview host

This directory contains one fixed browser host for every bundle in
[`../artifacts/preview-set.json`](../artifacts/preview-set.json). The preview
set is the host's only product input. It supplies each bundle, scenario,
initial path, route parameters, data-source outcomes, and simulated action
outcomes.

The host delegates application behavior to the shipped runtimes:

- `@formspec-org/surface` resolves the bundle and selected scenario profile.
- `@formspec-org/surface-react` renders the Surface and supplies the starter
  `StructuredPanel` widget module.
- `@formspec-org/react` renders complete Definitions without host-side field
  filtering.

The selected bundle defines product routes, actions, data-source fixtures,
navigation copy, and visual choices. The shipped Surface runtime supplies
navigation and fallback content. The same compiled source renders every
preview entry.

## Run

Build the workspace packages first, then install and start this demo:

```sh
# From the formspec repository root:
npm install
npm run build

cd spikes/surface-v12-saas-v1-dogfood/demo
npm install
npm run dev
```

Open <http://127.0.0.1:4183/> to use the preview set's defaults.

Select any preview key with `?preview=<key>` and any profile declared by that
preview with `?profile=<key>`. For the checked-in set:

- <http://127.0.0.1:4183/?preview=main>
- <http://127.0.0.1:4183/?preview=main&profile=empty>
- <http://127.0.0.1:4183/?preview=main&profile=unavailable>
- <http://127.0.0.1:4183/?preview=control>

When the browser starts at `/`, the host replaces that path with the selected
scenario's `initialPath`. It preserves the query selection during in-app
navigation.

## Verify

Run the artifact and seven-phase AppGraph integrity gate from the Formspec
repository root:

```sh
node spikes/surface-v12-saas-v1-dogfood/verify-artifacts.mjs
```

Then run the host-local checks from this `demo` directory:

```sh
npm run check:generic-host
npm test
npm run build
```

`check:generic-host` reads the preview artifact, derives its bundle, route,
action, field, module, data-source, and sample-data identifiers, and rejects
those identifiers in the executable host. It also rejects custom application
chrome, custom fallback or navigation copy, Definition filtering, Surface CSS
overrides, and product inputs other than the preview set.

This is an unsigned local preview host. It does not claim release admission,
publishing, or deployment.

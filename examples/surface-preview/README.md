# Static Surface preview

Run `npm run build:surface-preview` after building the workspace packages. Serve this directory’s `dist/` over HTTP. The stack build includes the synthetic passport and municipal service-request exports from deployment-tools.

For another publication, set `FORMSPEC_PREVIEW_ASSETS` to a directory containing only the files to publish. Vite copies its contents into the output. Supply the BundleExports, optional Surface Preview Scenario sidecars, optional font assets and a `preview.json` file.

```json
{
  "editions": [
    { "scope": "spring", "bundle": "spring.bundle.json" },
    { "scope": "fall", "bundle": "fall.bundle.json", "scenario": "fall.scenario.json" }
  ],
  "fontStylesheet": "fonts.css"
}
```

Each edition needs a distinct, stable scope on its hosting origin. Omit `fontStylesheet` when using the default fonts. A sidecar selects its default profile and initial route. Without one the preview opens the authored entry and starts with no fixture filings or source values. An entry requiring subject parameters needs a sidecar with a concrete initial path. Local Submit and the tracker use the same edition store. The browser address retains the selected edition and route on reload.

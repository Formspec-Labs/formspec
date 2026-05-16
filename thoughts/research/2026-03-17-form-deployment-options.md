# Form Deployment Options — Research

**Date:** 2026-03-17
**Goal:** Find the easiest way for someone to take a Formspec form and deploy it as a live, publicly accessible page.

---

## Current State

Formspec forms are rendered by `<formspec-render>`, a standard Web Component. A minimal deployable form needs:

1. **One HTML file** — loads the JS bundle and mounts the component
2. **One JS bundle** — `formspec-webcomponent` (includes `formspec-engine`, Preact signals, Chevrotain parser)
3. **One CSS file** — `formspec-base.css`
4. **Form artifacts** — `definition.json` (required), plus optional `component.json`, `theme.json`, `registry.json`

No server-side rendering. No backend required for basic form display and client-side validation. It's a pure static site — a perfect fit for edge/CDN hosting.

---

## The Simplest Possible Deploy: Single HTML File + CDN Bundle

The absolute fastest path is a **single `index.html`** that inlines or fetches everything:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>My Form</title>
  <link rel="stylesheet" href="./formspec-base.css">
</head>
<body>
  <formspec-render></formspec-render>
  <script type="module">
    import { FormspecRender } from './formspec-bundle.esm.js';
    customElements.define('formspec-render', FormspecRender);

    const el = document.querySelector('formspec-render');
    const def = await fetch('./definition.json').then(r => r.json());
    el.definition = def;

    // Optional: component doc + theme
    // const comp = await fetch('./component.json').then(r => r.json());
    // const theme = await fetch('./theme.json').then(r => r.json());
    // el.componentDocument = comp;
    // el.themeDocument = theme;
  </script>
</body>
</html>
```

This means a deployable form is just a folder with 3-5 files. Drag it anywhere.

---

## Platform Comparison

### 1. Vercel (Recommended for Git-integrated teams)

**How:** `vercel deploy` or connect a Git repo.

- Auto-detects static sites — no config needed for a plain HTML folder.
- Add `vercel.json` only if you want SPA routing:
  ```json
  { "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }] }
  ```
- **Deploy from CLI:** `npx vercel --prod` (zero config for static files)
- **Deploy from Git:** Push to GitHub → Vercel auto-builds and deploys on every push
- **Free tier:** 100 GB bandwidth/month, unlimited sites

**Pros:** Fastest deploys (~10s), great preview URLs per PR, zero config for static
**Cons:** 100 GB bandwidth cap on free tier, commercial projects need Pro ($20/mo)

### 2. Cloudflare Pages (Recommended for maximum free tier)

**How:** `npx wrangler pages deploy ./dist` or connect Git repo.

- No config file needed for static sites.
- **Deploy from CLI:** `npx wrangler pages deploy ./my-form-folder`
- **Deploy from Git:** Connect GitHub repo → set build output directory
- **Free tier:** Unlimited bandwidth, unlimited sites, 500 builds/month

**Pros:** Unlimited free bandwidth (best free tier), global edge network, fast
**Cons:** No server-side execution without Workers (not needed for forms)

### 3. Firebase Hosting (Already configured in this repo)

**How:** `firebase deploy` — we already have `firebase.json`.

- Already the deployment target for formspec.org.
- For a standalone form, a user would need `firebase init hosting` and set the public directory.
- **Deploy:** `firebase deploy --only hosting`
- **Free tier:** 10 GB storage, 360 MB/day transfer

**Pros:** Familiar, good integration with Firebase backend services (auth, Firestore for submission storage), already in use
**Cons:** Smallest free bandwidth, requires Firebase CLI setup, most config friction

### 4. Netlify

**How:** Drag-and-drop folder in dashboard, or `netlify deploy --prod`.

- **Deploy from CLI:** `npx netlify-cli deploy --prod --dir=./my-form`
- **Deploy from Git:** Connect repo → auto-builds
- **Free tier:** 100 GB bandwidth/month

**Pros:** Drag-and-drop deploy (literally zero tooling), good form handling built-in
**Cons:** Similar limits to Vercel, slightly slower builds

### 5. GitHub Pages (Simplest for open-source)

**How:** Push to `gh-pages` branch or enable in repo settings.

- No CLI needed — just push static files.
- **Free tier:** Unlimited for public repos, 100 GB bandwidth/month
- Can use GitHub Actions to auto-build and deploy

**Pros:** Zero additional accounts needed if already on GitHub, completely free for public repos
**Cons:** Only public repos on free tier, no SPA routing without a 404.html hack, slower propagation

---

## Recommended Strategy: `formspec deploy` CLI Command

The easiest mechanism for users is a **single command** that takes a form's artifact folder and produces a deployable package (or deploys directly). Three tiers of ease:

### Tier 1 — Export a deployable folder (no account needed)

```bash
npx formspec deploy export ./my-form --out ./deploy
# Produces:
#   deploy/
#   ├── index.html          (generated, loads form)
#   ├── formspec-bundle.esm.js  (pre-built web component bundle)
#   ├── formspec-base.css
#   ├── definition.json     (copied from input)
#   ├── component.json      (if present)
#   └── theme.json          (if present)
```

User can then drag this folder to Netlify, Cloudflare Pages, or any static host. This is the **minimum viable product** — generate a self-contained static site from form artifacts.

### Tier 2 — One-command deploy to a platform

```bash
# Deploy to Vercel
npx formspec deploy vercel ./my-form

# Deploy to Cloudflare Pages
npx formspec deploy cloudflare ./my-form

# Deploy to Netlify
npx formspec deploy netlify ./my-form
```

Under the hood: Tier 1 export → platform CLI deploy. Requires the user to have authenticated with the target platform. Could be a thin wrapper around `vercel deploy`, `wrangler pages deploy`, etc.

### Tier 3 — Hosted deploy (formspec.org/forms/abc123)

Future: Upload form artifacts to formspec.org and get a live URL instantly. No CLI, no platform accounts. This is the "Typeform experience" — but that's a bigger investment.

---

## What We'd Need to Build

### For Tier 1 (Export — do this first)

1. **Pre-built UMD/ESM bundle** of `formspec-webcomponent` published to npm or included as a build artifact. Currently the package is source-only with bare imports — it needs Vite/bundler to resolve. A self-contained bundle is essential.

2. **HTML template generator** — takes a form artifact directory and produces an `index.html` that:
   - Loads the bundle from a relative path (or a CDN like unpkg/esm.sh)
   - Fetches definition/component/theme JSON
   - Mounts `<formspec-render>`
   - Optionally includes a submit button that posts to a configurable endpoint

3. **`npx formspec export`** CLI command (or a script in this repo) that:
   - Copies the bundle + CSS
   - Copies form artifacts
   - Generates `index.html` from template
   - Outputs a ready-to-deploy folder

### For Tier 2 (Platform deploy)

4. **Platform adapters** — thin wrappers that:
   - Run Tier 1 export to a temp directory
   - Invoke the platform's CLI (`vercel`, `wrangler`, `netlify`, `firebase`)
   - Print the live URL

### CDN Bundle Alternative (Zero-build option)

If we publish `formspec-webcomponent` as a bundled ESM to npm, users could skip all tooling:

```html
<script type="module">
  import { FormspecRender } from 'https://esm.sh/formspec-webcomponent';
  customElements.define('formspec-render', FormspecRender);
  // ... load definition, mount
</script>
```

This is the absolute minimum friction — a single HTML file with no build step. The form definition JSON could even be inlined in a `<script type="application/json">` tag.

---

## The Backend Problem: Server-Side Validation

Client-side rendering is static, but **form submission requires Python server-side logic**:

1. **`DefinitionEvaluator.process(data)`** — 4-phase validation pipeline (rebuild → recalculate → revalidate → apply NRB)
2. **`MappingEngine.forward(data)`** — transforms response data to target schema (CSV/XML/JSON)
3. **`lint(definition)`** — authoring diagnostics
4. **Adapters** — serialize to CSV/XML wire formats

The existing reference server (`examples/references/server/main.py`) is a FastAPI app with these endpoints:

| Endpoint | Purpose |
|---|---|
| `POST /submit` | Run full validation pipeline, return `ValidationReport` + mapped data |
| `POST /export/{format}` | Transform + serialize to CSV/XML/JSON |
| `POST /evaluate` | Evaluate FEL expressions server-side |
| `GET /dependencies` | Extract FEL dependency graph |

**Python dependencies:** `fastapi`, `uvicorn`, `jsonschema`, `pydantic` + the `formspec` package itself (pure Python, no native extensions).

---

## Backend Deployment Options

### Option A: Cloudflare Workers with Python (Recommended)

Cloudflare Workers now run Python via Pyodide (CPython compiled to WebAssembly). This is the **same platform** as Pages — one account, one deploy, both frontend and backend.

**How it works:**
- Workers runtime provides an ASGI server directly to Python Workers
- FastAPI works out of the box on Cloudflare Workers
- Packages like Pydantic, jsonschema are available
- Cold starts: ~1s with snapshots (10s without)
- Free tier: 100K requests/day, 10ms CPU time per invocation

**Architecture:**
```
Cloudflare Pages (static)          Cloudflare Worker (Python)
┌──────────────────────┐           ┌──────────────────────────┐
│ index.html           │           │ FastAPI app              │
│ formspec-bundle.js   │  POST     │   /submit                │
│ formspec-base.css    │ ────────► │   /export/{format}       │
│ definition.json      │           │   /evaluate              │
│ component.json       │ ◄──────── │                          │
│ theme.json           │  JSON     │ formspec.evaluator       │
└──────────────────────┘           │ formspec.mapping         │
                                   │ formspec.adapters        │
                                   └──────────────────────────┘
```

**What we'd need:**
1. A `wrangler.toml` configuring a Python Worker
2. The `formspec` Python package bundled into the Worker
3. A stripped-down FastAPI app (just `/submit` + `/export`) — no file-system access needed, definition JSON passed in the request body
4. Pages → Worker routing (Cloudflare Service Bindings or just a `/api/*` route)

**Key question: Can the full formspec package run in Pyodide?**
- The formspec package is pure Python (no C extensions) ✅
- Uses `jsonschema` (available in Pyodide) ✅
- Uses `pydantic` (available in Pyodide) ✅
- No filesystem I/O in the core evaluator ✅
- **Likely yes** — but needs testing. The 10ms CPU limit on free tier may be tight for complex forms.

### Option B: Vercel Serverless Functions (Python)

Vercel supports Python serverless functions. Drop a `.py` file in `api/` and it becomes an endpoint.

**Setup:**
```
deploy/
├── index.html              (static frontend)
├── formspec-bundle.js
├── definition.json
├── api/
│   ├── submit.py           (POST /api/submit)
│   └── export.py           (POST /api/export/{format})
├── requirements.txt        (fastapi, pydantic, jsonschema)
└── vercel.json
```

```json
// vercel.json
{
  "rewrites": [
    { "source": "/api/(.*)", "destination": "/api/$1" }
  ]
}
```

**Pros:** Very simple file-based routing, good Python support
**Cons:** 250 MB unzipped size limit, 10s execution timeout (free), 100 GB bandwidth/mo

### Option C: Firebase Cloud Functions + Hosting (Already partially configured)

Firebase Hosting for static + Cloud Functions (Python) for the API. We already have `firebase.json`.

**Setup:**
- Add `functions/` directory with Python Cloud Function
- Configure `firebase.json` to rewrite `/api/*` to the function
- `firebase deploy` deploys both

**Pros:** Already in use, single deploy command, good integration
**Cons:** Cloud Functions (2nd gen) requires Google Cloud billing account, Python cold starts can be slow (~2-5s), smallest free tier

### Option D: Self-contained — Pyodide in the Browser (No backend at all)

Run the Python validation **entirely in the browser** via Pyodide/WebAssembly. No server needed.

```javascript
// Load Pyodide + formspec package in a Web Worker
const pyodide = await loadPyodide();
await pyodide.loadPackage(['jsonschema', 'pydantic']);
// Load formspec as a pure Python package
await pyodide.runPythonAsync(`
    from formspec.evaluator import DefinitionEvaluator
    ev = DefinitionEvaluator(definition_json)
    result = ev.process(submitted_data)
`);
```

**Pros:** Truly zero backend — the entire form + validation is a static site. No server costs, no cold starts, works offline.
**Cons:** ~10-20 MB initial download (Pyodide runtime), ~2-5s load time, browser CPU only. Complex forms with many FEL expressions might be slow. Not suitable if you need to *store* submissions server-side.

### Option E: Hybrid — Client-side Pyodide + Webhook for Storage

Best of both worlds: run validation in-browser with Pyodide, then POST validated data to a simple webhook/storage endpoint (Cloudflare Workers KV, Firebase Firestore, a Google Sheet, etc.).

```
Browser                           Storage (any)
┌─────────────────────┐           ┌──────────────────┐
│ formspec-render     │           │ CF Workers KV    │
│ Pyodide (WASM)      │  POST     │ OR Firebase      │
│   formspec.evaluator│ ────────► │ OR Google Sheets │
│   validation ✓      │  validated│ OR S3 bucket     │
│   mapping ✓         │  JSON     │ OR webhook URL   │
└─────────────────────┘           └──────────────────┘
```

**The storage endpoint is dead simple** — it just receives validated JSON and stores it. No Python needed server-side. A Cloudflare Worker for this is ~10 lines of code.

---

## Recommendation: Cloudflare Pages + Workers

**Primary target: Cloudflare.** One platform, one account, one deploy for both static frontend and Python validation backend.

### Phase 1: Static export + Cloudflare Pages (frontend only)

1. Pre-built ESM bundle of `formspec-webcomponent`
2. `formspec export` CLI generates deployable folder
3. `wrangler pages deploy ./deploy` → live form in seconds
4. Client-side validation only (no server submit)

### Phase 2: Add Cloudflare Worker for server validation

1. Python Worker running stripped-down FastAPI (`/submit`, `/export`)
2. `formspec` package bundled into the Worker
3. Pages → Worker routing via Service Bindings
4. Full server-side validation + mapping + export

### Phase 3 (stretch): Pyodide-in-browser option

For users who want truly zero-backend forms (e.g., surveys, intake forms where client validation is sufficient), offer a Pyodide build that runs the Python evaluator entirely in the browser. This eliminates the Worker and makes the form a pure static site that still gets server-grade validation.

### What to build first

1. **Pre-built ESM bundle** of `formspec-webcomponent` (prerequisite for everything)
2. **`formspec export` CLI** — generates a deployable folder with static frontend
3. **Cloudflare Worker template** — minimal Python Worker with `/submit` endpoint
4. **`formspec deploy cloudflare` CLI** — deploys Pages + Worker together
5. **Submission storage** — Cloudflare Workers KV or D1 (SQLite) for persisting responses

---

## Sources

- [Cloudflare Pages — free hosting with unlimited bandwidth](https://pages.cloudflare.com/)
- [Cloudflare SPA routing docs](https://developers.cloudflare.com/workers/static-assets/routing/single-page-application/)
- [Cloudflare Python Workers — fast cold starts and packages](https://blog.cloudflare.com/python-workers-advancements/)
- [FastAPI on Cloudflare Workers](https://developers.cloudflare.com/workers/languages/python/packages/fastapi/)
- [Write Cloudflare Workers in Python](https://developers.cloudflare.com/workers/languages/python/)
- [Deploy FastAPI on Vercel Serverless](https://dev.to/abdadeel/deploying-fastapi-app-on-vercel-serverless-18b1)
- [FastAPI on Vercel (GitHub example)](https://github.com/hebertcisco/deploy-python-fastapi-in-vercel)
- [FastAPI Cloud Deployment docs](https://fastapi.tiangolo.com/deployment/cloud/)
- [Pyodide — Python in the browser via WebAssembly](https://pyodide.org/)
- [Cloudflare bringing Python to Workers via Pyodide](https://blog.cloudflare.com/python-workers/)
- [Deploy React/SPA to Cloudflare, Vercel, Netlify](https://www.freecodecamp.org/news/deploy-react-app/)
- [Cloudflare Pages + Firebase MVP stack](https://medium.com/@able_wong/building-your-startup-mvp-a-simple-guide-to-cloudflare-pages-firebase-f30d2beac4d8)

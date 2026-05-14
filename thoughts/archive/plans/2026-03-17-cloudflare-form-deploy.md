# Cloudflare Form Deployment — Implementation Plan

**Date:** 2026-03-17
**Goal:** Let anyone deploy a live, functional Formspec form (with server-side Python validation) to Cloudflare in under 5 minutes.

---

## Architecture

```
Cloudflare (single project)
┌─────────────────────────────────────────────────────────────────┐
│                                                                  │
│  Static Assets (Pages)              Python Worker                │
│  ┌────────────────────┐             ┌──────────────────────┐    │
│  │ index.html          │   /api/*   │ FastAPI (ASGI)       │    │
│  │ formspec.bundle.js  │ ─────────► │   POST /api/submit   │    │
│  │ formspec-base.css   │            │   POST /api/export/* │    │
│  │ definition.json     │ ◄───────── │   POST /api/lint     │    │
│  │ component.json      │   JSON     │                      │    │
│  │ theme.json          │            │ formspec (full pkg)  │    │
│  └────────────────────┘             │  .evaluator .mapping │    │
│                                      │  .adapters .validator│    │
│                                      └──────┬───────────────┘    │
│                                             │                    │
│                                      ┌──────▼───────────────┐    │
│                                      │ D1 (SQLite)          │    │
│                                      │  submissions table   │    │
│                                      └──────────────────────┘    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**How it works:**
- Static assets serve the form UI (HTML + bundled web component + JSON artifacts)
- `run_worker_first = ["/api/*"]` routes API calls to the Python Worker
- Worker runs `DefinitionEvaluator.process()` for server-side validation
- Worker optionally stores validated submissions in D1 (Cloudflare's SQLite)
- Everything deploys with `wrangler deploy`

---

## Phases

### Phase 1: Self-Contained ESM Bundle

**What:** Add a Vite library-mode build to `formspec-webcomponent` that outputs a single `.js` file with all dependencies inlined.

**Why:** Currently the web component requires a bundler (bare workspace imports). A self-contained bundle is the prerequisite for any deploy story.

**Files to create/modify:**
- `packages/formspec-webcomponent/vite.config.bundle.ts` — Vite library-mode config
- `packages/formspec-webcomponent/package.json` — add `build:bundle` script, add `browser` export

**Vite config (sketch):**
```ts
import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      formats: ['es'],
      fileName: 'formspec',
    },
    rollupOptions: {
      // Inline everything — no external deps
    },
    outDir: 'dist/bundle',
  },
});
```

**Output:**
- `dist/bundle/formspec.js` — single ESM file (~200-400 KB estimated, includes Chevrotain, Preact signals, AJV, all components)
- `dist/bundle/formspec-base.css` — base stylesheet

**Verification:** A plain `index.html` with `<script type="module">import { FormspecRender } from './formspec.js'</script>` works in a browser with no build tools.

**Estimated effort:** Small. Vite library mode is well-documented, the dependency tree is clean.

---

### Phase 2: Form Export CLI

**What:** A script that takes a form artifact directory and produces a ready-to-deploy folder.

**File to create:**
- `scripts/export-form.mjs` (Node.js script, runnable via `npx` or `node`)

**Input:** A directory containing form artifacts:
```
my-form/
├── definition.json       (required)
├── component.json        (optional)
├── theme.json            (optional)
└── registry.json         (optional)
```

**Output:** A deploy-ready folder:
```
deploy/
├── index.html            (generated — loads bundle, fetches artifacts, mounts <formspec-render>)
├── formspec.js           (copied from formspec-webcomponent/dist/bundle/)
├── formspec-base.css     (copied)
├── definition.json       (copied)
├── component.json        (copied if present)
├── theme.json            (copied if present)
└── registry.json         (copied if present)
```

**Generated `index.html` template:**
```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{{formTitle}}</title>
  <link rel="stylesheet" href="./formspec-base.css">
  <style>
    body { font-family: system-ui, sans-serif; margin: 0; padding: 2rem; }
    formspec-render { max-width: 48rem; margin: 0 auto; display: block; }
  </style>
</head>
<body>
  <formspec-render></formspec-render>
  <script type="module">
    import { FormspecRender } from './formspec.js';
    customElements.define('formspec-render', FormspecRender);

    const el = document.querySelector('formspec-render');

    const [def, comp, theme, reg] = await Promise.all([
      fetch('./definition.json').then(r => r.json()),
      fetch('./component.json').then(r => r.ok ? r.json() : null).catch(() => null),
      fetch('./theme.json').then(r => r.ok ? r.json() : null).catch(() => null),
      fetch('./registry.json').then(r => r.ok ? r.json() : null).catch(() => null),
    ]);

    if (reg) el.registryDocuments = [reg];
    el.definition = def;
    if (comp) el.componentDocument = comp;
    if (theme) el.themeDocument = theme;

    // Submit handler — POST to /api/submit if available, else log to console
    el.addEventListener('formspec-submit', async (e) => {
      const { response, validationReport } = e.detail;
      if (!validationReport.valid) return; // scroll-to-error already handled

      try {
        const res = await fetch('/api/submit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(response),
        });
        const result = await res.json();
        console.log('Server validation:', result);
        // TODO: success UI
      } catch {
        console.log('No backend — client-only mode. Response:', response);
      }
    });
  </script>
</body>
</html>
```

**CLI interface:**
```bash
node scripts/export-form.mjs ./examples/grant-application --out ./deploy
# or eventually:
# npx formspec export ./examples/grant-application --out ./deploy
```

**Estimated effort:** Small. String templating + file copy.

---

### Phase 3: Cloudflare Worker for Python Validation

**What:** A Python Worker that runs `DefinitionEvaluator` and `MappingEngine` on submitted form data. The form definition is sent in the request body (no filesystem access needed).

**Directory structure to create:**
```
deploy-templates/cloudflare/
├── wrangler.jsonc              (Cloudflare config)
├── src/
│   └── entry.py                (Python Worker entry point — FastAPI app)
├── requirements.txt            (fastapi, pydantic)
└── README.md                   (setup instructions)
```

**`wrangler.jsonc`:**
```jsonc
{
  "name": "formspec-form",
  "compatibility_date": "2026-03-17",
  "compatibility_flags": ["python_workers"],
  "main": "src/entry.py",
  "assets": {
    "directory": "./public"       // static form files
  },
  // Route /api/* to Worker, everything else to static assets
  "run_worker_first": ["/api/*"],
  // D1 database for submission storage
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "formspec-submissions",
      "database_id": ""            // filled in by user after `wrangler d1 create`
    }
  ]
}
```

**`src/entry.py` (Python Worker):**
```python
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from datetime import datetime, timezone

# Full formspec package — bundled as local source
from formspec.evaluator import DefinitionEvaluator
from formspec.mapping.engine import MappingEngine
from formspec.adapters import get_adapter
from formspec.registry import Registry
from formspec.validator.linter import lint
from formspec.validator.schema import SchemaValidator

app = FastAPI()

# Pre-load schemas once at module level (bundled as dicts, no filesystem)
# Generated by deploy script from schemas/*.json → Python dicts
from _bundled_schemas import SCHEMAS
_schema_validator = SchemaValidator(preloaded_schemas=SCHEMAS)

class SubmitRequest(BaseModel):
    definition: dict          # full definition JSON (sent by client)
    definitionUrl: str
    definitionVersion: str
    status: str
    authored: str
    data: dict
    mapping: dict | None = None    # optional mapping document
    registry: dict | None = None   # optional registry document
    schemas: dict | None = None    # optional: component/theme/etc. for schema validation

class SubmitResponse(BaseModel):
    valid: bool
    results: list[dict]
    counts: dict[str, int]
    timestamp: str
    mapped: dict
    diagnostics: list[str]

@app.post("/api/submit")
async def submit(request: SubmitRequest, req: Request):
    # Build registries
    registries = [Registry(request.registry)] if request.registry else []

    # Run 4-phase validation
    evaluator = DefinitionEvaluator(request.definition, registries=registries)
    result = evaluator.process(request.data)

    # Run linter for authoring diagnostics
    registry_documents = [request.registry] if request.registry else []
    lint_diags = lint(request.definition, mode="authoring", registry_documents=registry_documents)
    diagnostics = [
        f"[{d.severity}] {d.path or '(root)'}: {d.message}"
        for d in lint_diags
        if d.severity in ("error", "warning")
    ]

    # Optional mapping
    mapped = {}
    if request.mapping:
        engine = MappingEngine(request.mapping)
        mapped = engine.forward(result.data)

    response = SubmitResponse(
        valid=result.valid,
        results=result.results,
        counts=result.counts,
        timestamp=datetime.now(timezone.utc).isoformat(),
        mapped=mapped,
        diagnostics=diagnostics,
    )

    # Store in D1 if available
    try:
        db = req.scope["env"].DB
        await db.prepare(
            "INSERT INTO submissions (definition_url, version, data, valid, created_at) VALUES (?, ?, ?, ?, ?)"
        ).bind(
            request.definitionUrl,
            request.definitionVersion,
            __import__('json').dumps(request.data),
            result.valid,
            response.timestamp,
        ).run()
    except Exception:
        pass  # D1 is optional

    return response

@app.post("/api/export/{format}")
async def export_data(format: str, request: SubmitRequest):
    evaluator = DefinitionEvaluator(request.definition)
    result = evaluator.process(request.data)

    if not request.mapping:
        return JSONResponse({"error": "No mapping document provided"}, status_code=400)

    engine = MappingEngine(request.mapping)
    mapped = engine.forward(result.data)

    adapter_config = request.mapping.get("adapters", {}).get(format)
    target_schema = request.mapping.get("targetSchema")
    adapter = get_adapter(format, config=adapter_config, target_schema=target_schema)

    content_types = {"json": "application/json", "csv": "text/csv", "xml": "application/xml"}
    content = adapter.serialize(mapped)

    from fastapi.responses import Response
    return Response(content=content, media_type=content_types.get(format, "application/octet-stream"))

@app.get("/api/health")
async def health():
    return {"status": "ok"}
```

**Key design decisions:**
- **Definition sent in request body** — no filesystem access needed. The client already has the definition JSON loaded; it sends it along with the submission. This avoids the Worker needing to know about file paths.
- **D1 storage is optional** — if the binding exists, submissions are stored. If not, the Worker is validation-only.
- **Mapping document also sent in body** — keeps the Worker stateless.

**Python package bundling:**
- The **entire** `formspec` package can run in the Worker — it's pure Python with no C extensions
- External deps (`jsonschema`, `referencing`, `pydantic`) are all pure Python and available in Pyodide
- Only change needed: `SchemaValidator` in `validator/schema.py` reads schemas from disk via `_schemas_dir()` / `_load_schema()`. Fix: add an alternate constructor that accepts pre-loaded schema dicts, or bundle the JSON schemas as Python dicts in a `_bundled_schemas.py` module
- Use `wrangler` which bundles packages into the Worker automatically
- Add `formspec` as a local dependency in `requirements.txt`, or copy the source files into the Worker's `src/` directory
- This means the Worker gets the **full pipeline**: evaluator, FEL, mapping, adapters, linter, schema validation, registry — everything the reference server does

**One small code change required in `src/formspec/validator/schema.py`:**
```python
# Current: reads from filesystem
class SchemaValidator:
    def __init__(self, schema_dir: Path | None = None):
        self.schema_dir = schema_dir or _schemas_dir()
        self.schemas = {
            doc_type: _load_schema(self.schema_dir / filename)
            for doc_type, filename in SCHEMA_FILES.items()
        }

# Add: accept pre-loaded schemas for serverless environments
class SchemaValidator:
    def __init__(self, schema_dir: Path | None = None, *, preloaded_schemas: dict | None = None):
        if preloaded_schemas:
            self.schemas = preloaded_schemas
        else:
            self.schema_dir = schema_dir or _schemas_dir()
            self.schemas = {
                doc_type: _load_schema(self.schema_dir / filename)
                for doc_type, filename in SCHEMA_FILES.items()
            }
```

**Estimated effort:** Medium. The FastAPI app is simple (port of existing reference server), but Python Workers are beta — may hit packaging edge cases.

---

### Phase 4: Deploy CLI (`formspec deploy cloudflare`)

**What:** A single command that assembles a complete Cloudflare project (static + Worker) and deploys it.

**File to create:**
- `scripts/deploy-cloudflare.mjs`

**Flow:**
```
1. Run export-form.mjs → produces static files in temp/public/
2. Copy deploy-templates/cloudflare/ → temp/
3. Copy formspec Python package into temp/src/formspec/
4. Generate temp/src/_bundled_schemas.py from schemas/*.json (Python dicts)
5. Move static output to temp/public/
6. Run `wrangler deploy` (or `wrangler deploy`) in temp/
7. Print live URL
```

**CLI interface:**
```bash
node scripts/deploy-cloudflare.mjs ./examples/grant-application
# → Deploying to Cloudflare...
# → ✓ Static assets: 6 files
# → ✓ Python Worker: formspec evaluator + mapping
# → ✓ D1 database: formspec-submissions
# →
# → Live at: https://formspec-form.your-account.workers.dev
```

**Prerequisites the user needs:**
1. Cloudflare account (free)
2. `wrangler` CLI authenticated (`wrangler login`)
3. Optionally: `wrangler d1 create formspec-submissions` for persistence

**Estimated effort:** Medium. Mostly glue code, but needs testing of the `wrangler` deploy flow.

---

### Phase 5: Submission Storage & Retrieval

**What:** D1 schema for persisting form submissions, plus a simple retrieval endpoint.

**D1 Schema:**
```sql
CREATE TABLE IF NOT EXISTS submissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  definition_url TEXT NOT NULL,
  version TEXT NOT NULL,
  data TEXT NOT NULL,            -- JSON blob
  valid INTEGER NOT NULL,        -- 0 or 1
  validation_results TEXT,       -- JSON blob
  created_at TEXT NOT NULL,
  updated_at TEXT
);

CREATE INDEX idx_submissions_definition ON submissions(definition_url);
CREATE INDEX idx_submissions_created ON submissions(created_at);
```

**Additional endpoints on the Worker:**
```python
@app.get("/api/submissions")
async def list_submissions(req: Request, limit: int = 50, offset: int = 0):
    db = req.scope["env"].DB
    rows = await db.prepare(
        "SELECT id, definition_url, version, valid, created_at FROM submissions ORDER BY created_at DESC LIMIT ? OFFSET ?"
    ).bind(limit, offset).all()
    return {"submissions": rows.results}

@app.get("/api/submissions/{id}")
async def get_submission(id: int, req: Request):
    db = req.scope["env"].DB
    row = await db.prepare(
        "SELECT * FROM submissions WHERE id = ?"
    ).bind(id).first()
    if not row:
        return JSONResponse({"error": "Not found"}, status_code=404)
    return row
```

**Estimated effort:** Small. D1 API is straightforward.

---

### Phase 6: Studio Diagnostics Panel (Python Linter Integration)

**What:** A "Diagnostics" panel in Studio that calls the Python linter (via Worker or local server) and shows the full 9-pass lint pipeline results inline — schema errors, reference integrity, FEL compilation, dependency cycles, extension checks, theme/component validation. This gives authors real-time access to validation the TypeScript engine can't do.

**What the Python linter catches that the TS engine doesn't:**
- **E100-E101:** JSON Schema violations (structural correctness)
- **E200-E201:** Tree indexing errors (duplicate keys, invalid nesting)
- **E300-E302, W300:** Reference integrity (dangling binds, orphan references)
- **E400:** FEL expression compilation errors (static analysis, not just runtime)
- **E500:** Dependency cycle detection across FEL expressions
- **E600:** Unresolved extensions (missing registry entries)
- **W700-W704:** Theme token/reference errors
- **E800-E807, W800-W804:** Component structural + bind checks

**Architecture:**

```
Studio (browser)
┌──────────────────────────────────┐
│  Project state changes           │
│         │                        │
│         ▼                        │
│  useDiagnostics() hook           │
│    - debounce (500ms)            │
│    - POST bundle to lint endpoint│
│    - cache results               │
│         │                        │
│         ▼                        │
│  DiagnosticsPanel component      │
│    - grouped by severity/file    │
│    - click → navigate to item    │
│    - badge count on tab          │
└──────────┬───────────────────────┘
           │ HTTP
           ▼
   Lint endpoint (one of):
   ├── Deployed Worker:  POST https://my-form.workers.dev/api/lint
   ├── Local dev server: POST http://localhost:8000/api/lint
   └── Wrangler dev:     POST http://localhost:8787/api/lint
```

**New Worker endpoint (`/api/lint`):**
```python
class LintRequest(BaseModel):
    definition: dict
    component: dict | None = None
    theme: dict | None = None
    mapping: dict | None = None
    registry: dict | None = None
    mode: str = "authoring"         # "authoring" | "submission"

@app.post("/api/lint")
async def lint_documents(request: LintRequest):
    linter = FormspecLinter(
        schema_validator=_schema_validator,  # pre-loaded, no filesystem
    )

    all_diagnostics: list[dict] = []

    # Lint each document the author has open
    for doc_name, doc in [
        ("definition", request.definition),
        ("component", request.component),
        ("theme", request.theme),
        ("mapping", request.mapping),
        ("registry", request.registry),
    ]:
        if doc is None:
            continue
        diags = linter.lint(
            doc,
            component_definition=request.component,
            registry_documents=[request.registry] if request.registry else None,
        )
        for d in diags:
            all_diagnostics.append({
                "document": doc_name,
                "severity": d.severity,
                "code": d.code,
                "message": d.message,
                "path": d.path,
                "category": d.category,
                "detail": d.detail,
            })

    return {
        "diagnostics": all_diagnostics,
        "counts": {
            "error": sum(1 for d in all_diagnostics if d["severity"] == "error"),
            "warning": sum(1 for d in all_diagnostics if d["severity"] == "warning"),
            "info": sum(1 for d in all_diagnostics if d["severity"] == "info"),
        },
    }
```

**Studio-side implementation:**

Files to create:
```
packages/formspec-studio/src/
├── state/useDiagnostics.ts        # Hook: debounced POST to lint endpoint
├── workspaces/diagnostics/
│   └── DiagnosticsPanel.tsx       # Problems panel (like VS Code)
```

**`useDiagnostics.ts` hook:**
```typescript
// Watches project state, debounces, POSTs bundle to lint endpoint
// Returns { diagnostics, counts, isLoading, error }
// Configurable endpoint URL via Studio settings (default: none / disabled)

import { useState, useEffect, useRef } from 'react';
import { useProject } from './useProject';
import { useProjectState } from './useProjectState';

interface LintDiagnostic {
  document: string;
  severity: 'error' | 'warning' | 'info';
  code: string;
  message: string;
  path: string;
  category: string;
  detail?: string;
}

interface DiagnosticsState {
  diagnostics: LintDiagnostic[];
  counts: { error: number; warning: number; info: number };
  isLoading: boolean;
  error: string | null;
}

export function useDiagnostics(endpointUrl: string | null) {
  const project = useProject();
  const state = useProjectState();  // triggers on every change
  const [result, setResult] = useState<DiagnosticsState>({
    diagnostics: [], counts: { error: 0, warning: 0, info: 0 },
    isLoading: false, error: null,
  });
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!endpointUrl) return;

    const timer = setTimeout(async () => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setResult(prev => ({ ...prev, isLoading: true }));
      try {
        const bundle = project.export();
        const res = await fetch(endpointUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            definition: bundle.definition,
            component: bundle.component,
            theme: bundle.theme,
            mapping: bundle.mapping,
          }),
          signal: controller.signal,
        });
        const data = await res.json();
        setResult({ diagnostics: data.diagnostics, counts: data.counts, isLoading: false, error: null });
      } catch (e: any) {
        if (e.name !== 'AbortError') {
          setResult(prev => ({ ...prev, isLoading: false, error: e.message }));
        }
      }
    }, 500);  // 500ms debounce

    return () => clearTimeout(timer);
  }, [state, endpointUrl]);

  return result;
}
```

**`DiagnosticsPanel.tsx`:**
- Table view grouped by document, sorted by severity
- Click diagnostic → navigate to the item (via `formspec:navigate-workspace` event)
- Severity icons + color coding
- Badge in the tab bar showing error/warning counts
- "No diagnostics endpoint configured" empty state when no URL set

**Integration into Shell.tsx:**
- Add "Diagnostics" to `WORKSPACES` map
- Add lint endpoint URL to Studio settings (persisted in localStorage)
- Show badge count on the Diagnostics tab

**Estimated effort:** Medium. The Worker endpoint is simple (just wires up `FormspecLinter`). The Studio UI is a new panel but follows existing patterns. The `useDiagnostics` hook is the only tricky part (debouncing, abort, error handling).

---

## Build Order & Dependencies

```
Phase 1: ESM Bundle
   │  (no deps — can start immediately)
   ▼
Phase 2: Export CLI
   │  (depends on Phase 1 output)
   ▼
Phase 3: Python Worker  ◄── can start in parallel with Phase 2
   │  (needs formspec Python package, independent of JS bundle)
   ├──────────────────────────────────┐
   ▼                                  ▼
Phase 4: Deploy CLI              Phase 6: Studio Diagnostics
   │  (Phase 2 + Phase 3)           (needs Phase 3's /api/lint endpoint)
   ▼
Phase 5: D1 Storage
   (depends on Phase 3)
```

**Phases 1 and 3 can be developed in parallel.** Phase 6 (Studio) only needs the Worker's `/api/lint` endpoint, so it can start as soon as Phase 3 is functional — independent of the deploy CLI.

---

## Client-Side Changes

The generated `index.html` (Phase 2) needs to send the **definition JSON along with the submission** to the Worker. This is a small change from the current reference app pattern (where the server loads definitions from disk). The client already has the definition in memory — it just needs to include it in the POST body.

**Modified submit payload:**
```javascript
el.addEventListener('formspec-submit', async (e) => {
  const { response } = e.detail;
  const body = {
    ...response,                    // definitionUrl, definitionVersion, data, etc.
    definition: currentDefinition,  // full definition JSON
    mapping: currentMapping,        // optional
    registry: currentRegistry,      // optional
  };
  const res = await fetch('/api/submit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
});
```

---

## Plan Review Findings (2026-03-17)

Critical issues identified during Opus review of the plan:

### BLOCKER: `rpds-py` is a Rust extension — `jsonschema` won't import

The claim that "jsonschema and referencing are both pure Python" is **wrong**. The dependency chain is:
```
jsonschema → referencing → rpds-py (Rust extension, built with maturin)
```
`rpds-py` is NOT in Pyodide's built-in packages and has no pre-built Emscripten/WASM wheel. This means `from jsonschema import Draft202012Validator` will fail on a Python Worker.

**Options:**
- **Option A:** Run schema validation only on the evaluator/FEL/mapping pipeline (which has ZERO external deps). Skip `SchemaValidator` in the Worker entirely — it's an authoring-time lint, not a runtime need.
- **Option B:** Build an Emscripten wheel for `rpds-py` via maturin + pyodide-build. Feasible but non-trivial.
- **Option C:** Use an older `jsonschema<4.18` which depended on `pyrsistent` instead of `rpds-py` — but `pyrsistent` is also a C extension with the same problem.
- **Option D:** Vendor a pure-Python fallback for the `rpds` data structures used by `referencing`.

**Recommendation:** Option A for MVP. The evaluator, FEL, mapping, and adapters are all pure Python with zero external deps. Schema validation is a nice-to-have in the Worker — the real value is server-side FEL evaluation and response processing.

### BLOCKER: Pydantic v2 incompatible with Pyodide

Pydantic v2 uses `pydantic-core` (Rust extension) which will NOT run on Pyodide/Python Workers. Options:
- **Option A (recommended):** Drop Pydantic. Use plain dataclasses or TypedDict for request/response models. FastAPI supports these natively.
- **Option B:** Pin `pydantic<2` (v1 is pure Python but deprecated).

### BLOCKER: CPU time limits

10ms free tier CPU limit is unrealistic for evaluator + FEL + linting. Default `wrangler.jsonc` to **Unbound** usage model (30s CPU, 400ms billing granularity). Don't treat Unbound as a fallback — it's the baseline.

### Other findings

- **`wrangler` doesn't exist** — references should all say `wrangler`. Python Workers use standard wrangler + `compatibility_flags: ["python_workers"]`.
- **No D1 migration step** — Phase 5 defines SQL schema but no phase runs `wrangler d1 execute` to apply it.
- **Lint endpoint over-designed** — don't loop over each document type separately. Just `lint(definition, component_definition=component, registry_documents=[registry])` once.
- **No success UI** — generated index.html has `// TODO: success UI`. Needs at minimum a confirmation message.
- **Rate limiting** — open endpoints + non-trivial compute = abuse risk. Free tier has no rate limiting. Known risk.
- **CSS extraction** — Vite library mode may not extract CSS to a separate file. May need `vite-plugin-css-injected-by-js` or explicit config.
- **Snapshot risk** — if any formspec module does filesystem access at import time, Python Worker snapshots will fail and cold starts will be very slow.
- **`SchemaValidator` proposed fix is incomplete** — the `preloaded_schemas` branch only sets `self.schemas` but skips building `self.validators`, the `referencing.Registry`, and all component-specific infrastructure (lines 183-247 in `schema.py`). It would crash at runtime. The fix must replicate the full init path.
- **Lint endpoint context mismatch** — for theme linting, `lint_theme_semantics(document, definition_doc=...)` expects the definition document, but the plan passes `request.component` as `component_definition`. Wrong parameter for the wrong document type.
- **Missing Phase 1 deps** — `formspec-layout` and `formspec-types` packages are not mentioned but are dependencies of the webcomponent/engine. The Vite bundle must inline them.
- **No D1 migration step** — Phase 5 defines SQL DDL but no phase applies it. Need `wrangler d1 execute` or `wrangler d1 migrations apply`.

### Recommended execution order

**Spike Phase 3 first** (2-hour proof of concept):
1. Minimal Python Worker with FastAPI + `formspec.evaluator` + `jsonschema`
2. Prove it loads, prove evaluation completes within CPU limits
3. This de-risks the entire plan before investing in Phases 1-2

Then: Phase 1 → Phase 2 → Phase 4 → Phase 5 and 6 in parallel.

---

## Prerequisites & Code Changes Required Before Implementation

These must be resolved before or during implementation. They are not new phases — they're blockers within existing phases.

### 1. CORS headers on the Worker (blocks Phase 6)

Studio at `localhost:5173` (Vite dev) or a different domain calling the Worker at `*.workers.dev` will fail without CORS headers. The FastAPI app needs a CORS middleware:

```python
from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],          # tighten in production
    allow_methods=["POST", "GET"],
    allow_headers=["Content-Type"],
)
```

For production, restrict `allow_origins` to the Studio deployment URL. For `wrangler dev` (localhost:8787), CORS is still needed since Studio runs on a different port.

### 2. Fix absolute imports in validator (blocks Phase 3)

Two files use absolute imports that won't resolve when the package is copied into the Worker:

- `src/formspec/validator/dependencies.py` line 11:
  `from formspec.fel.dependencies import ...` → `from ..fel.dependencies import ...`
- `src/formspec/validator/expressions.py` lines 14-15:
  `from formspec.fel.errors import ...` → `from ..fel.errors import ...`
  `from formspec.fel.parser import ...` → `from ..fel.parser import ...`

### 3. Worker `requirements.txt` must list all deps (Phase 3)

The Python package has no `setup.py`/`pyproject.toml` declaring dependencies. The Worker's `requirements.txt` must explicitly include:

```
fastapi
pydantic
jsonschema
referencing
jsonschema-specifications
```

All are pure Python, all available in Pyodide.

### 4. Authentication (Phase 3 — defer or implement)

All endpoints (`/api/submit`, `/api/lint`, `/api/export/*`) are completely open. Options:
- **Defer:** Acceptable for personal/internal use. Forms are public anyway.
- **Simple API key:** `X-API-Key` header checked against a Cloudflare secret. Studio stores the key in settings.
- **Origin check:** Only allow requests from known origins (deployed form URL + Studio URL).

Recommend: defer for MVP, add API key as a follow-up.

### 5. Local dev workflow (Phase 3 + 6)

`wrangler dev` runs the Python Worker locally at `localhost:8787`. Studio's lint endpoint setting just points there. Two terminals:

```bash
wrangler dev                                    # localhost:8787 — Worker
cd packages/formspec-studio && npm run dev      # localhost:5173 — Studio
```

No special tooling needed. CORS (prerequisite #1) still applies since the ports differ.

### 6. `_bundled_schemas.py` generation (Phase 4)

The deploy script needs to read `schemas/*.json` and emit a Python module:

```javascript
// In deploy-cloudflare.mjs
const schemas = {};
for (const [docType, filename] of Object.entries(SCHEMA_FILES)) {
  schemas[docType] = JSON.parse(fs.readFileSync(`schemas/${filename}`, 'utf8'));
}
fs.writeFileSync('temp/src/_bundled_schemas.py',
  `SCHEMAS = ${JSON.stringify(schemas, null, 2)}\n`);
```

---

## Cloudflare-Specific Constraints & Risks

| Constraint | Impact | Mitigation |
|---|---|---|
| Python Workers are **beta** | API may change | Pin `compatibility_date`, test thoroughly |
| 10ms CPU free tier limit | Complex forms may timeout | Paid plan has 50ms; or move to unbound (30s) |
| 1s cold start (with snapshots) | First request slow-ish | Acceptable for form submission; not for page load |
| `formspec` not on PyPI | Can't `pip install` in Worker | Bundle source directly into Worker `src/` |
| `SchemaValidator` reads from disk | Won't work without filesystem | Add `preloaded_schemas` kwarg (~10 line change) |
| D1 10 GB limit (free) | Fine for form data | Thousands of submissions before this matters |
| Pyodide package size | Worker bundle may be large | Snapshots reduce cold start impact |

---

## What This Enables

After all 6 phases, a user can:

```bash
# 1. Author a form (definition + component + theme JSON)
# 2. Deploy it
node scripts/deploy-cloudflare.mjs ./my-form/

# Result:
# - Live form at https://my-form.workers.dev
# - Full Python validation pipeline on submit (evaluator + FEL + linter + schema validation)
# - Mapping engine for CSV/XML/JSON export
# - Submissions stored in D1 SQLite
# - Global edge deployment (330 locations)
# - Free tier covers most use cases

# And in Studio:
# - Diagnostics panel shows real-time Python lint results as you author
# - Schema errors, reference integrity, FEL cycle detection, extension checks
# - Click any diagnostic → jumps to the offending item
```

---

## Sources

- [Cloudflare Workers Python docs](https://developers.cloudflare.com/workers/languages/python/)
- [FastAPI on Cloudflare Workers](https://developers.cloudflare.com/workers/languages/python/packages/fastapi/)
- [Python Workers — fast cold starts (Jan 2026)](https://blog.cloudflare.com/python-workers-advancements/)
- [Wrangler configuration reference](https://developers.cloudflare.com/workers/wrangler/configuration/)
- [Cloudflare Workers static assets routing](https://developers.cloudflare.com/workers/static-assets/)
- [Query D1 from Python Workers](https://developers.cloudflare.com/d1/examples/query-d1-from-python-workers/)
- [D1 overview](https://developers.cloudflare.com/d1/)
- [Python packages supported in Workers](https://developers.cloudflare.com/workers/languages/python/packages/)
- [Pyodide built-in packages](https://pyodide.org/en/stable/usage/packages-in-pyodide.html)

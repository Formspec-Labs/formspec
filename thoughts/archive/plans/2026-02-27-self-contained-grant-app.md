# Self-Contained Grant Application Example Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make `examples/grant-application/` a fully self-contained Vite app that runs with `cd examples/grant-application && npm run dev` after the monorepo packages are built.

**Architecture:** The example gets its own `package.json` (workspace member), `vite.config.ts`, and `main.js`. It references the local packages via workspace `"*"` dependencies — the same mechanism already used between packages. The webcomponent build is extended to copy `formspec-base.css` to `dist/` and declare it in an `exports` map, enabling `import 'formspec-webcomponent/formspec-base.css'` without reaching into `src/`. The E2E test infrastructure (Vite on port 8080, `tests/e2e/fixtures/`) is untouched.

**Tech Stack:** Vite 5, npm workspaces, TypeScript (packages only — example is plain JS), Preact Signals (via engine dep)

---

## Task 1: Ship `formspec-base.css` from webcomponent dist

The webcomponent build currently only runs `tsc`, which ignores CSS. We need the CSS in `dist/` so a consumer can import it by package name.

**Files:**
- Modify: `packages/formspec-webcomponent/package.json`

**Step 1: Update the build script to copy CSS after tsc**

In `packages/formspec-webcomponent/package.json`, change the `"build"` script from:
```json
"build": "tsc"
```
to:
```json
"build": "tsc && cp src/formspec-base.css dist/formspec-base.css"
```

Also add an `"exports"` field so consumers can import the CSS by package name:
```json
"exports": {
  ".": "./dist/index.js",
  "./formspec-base.css": "./dist/formspec-base.css"
}
```

The full updated `package.json`:
```json
{
  "name": "formspec-webcomponent",
  "version": "1.0.0",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "exports": {
    ".": "./dist/index.js",
    "./formspec-base.css": "./dist/formspec-base.css"
  },
  "scripts": {
    "build": "tsc && cp src/formspec-base.css dist/formspec-base.css",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "formspec-engine": "*"
  },
  "devDependencies": {
    "happy-dom": "^17.6.1",
    "typescript": "^5.0.0",
    "vitest": "^3.2.4"
  }
}
```

**Step 2: Rebuild the webcomponent**

```bash
npm run build --workspace=formspec-webcomponent
```

Expected: tsc succeeds, then `cp` runs. Verify:
```bash
ls packages/formspec-webcomponent/dist/formspec-base.css
```
Expected output: the file exists (no "No such file" error).

**Step 3: Commit**

```bash
git add packages/formspec-webcomponent/package.json
git commit -m "build(webcomponent): copy formspec-base.css to dist and add exports map"
```

---

## Task 2: Add the example to root workspaces

The root `package.json` manages the monorepo via `"workspaces"`. Adding the example here means `npm install` at root wires up its dependencies automatically.

**Files:**
- Modify: `package.json` (root)

**Step 1: Add example to workspaces array**

In root `package.json`, change:
```json
"workspaces": [
  "packages/*"
]
```
to:
```json
"workspaces": [
  "packages/*",
  "examples/grant-application"
]
```

Also add a convenience script so you can start the example from the root:
```json
"start:grant-app": "npm run dev --workspace=grant-application-example"
```

The `scripts` block after the change:
```json
"scripts": {
  "start:test-server": "vite --port 8080 --host 127.0.0.1",
  "start:demo": "vite --root . --port 8082 --host 127.0.0.1",
  "start:grant-app": "npm run dev --workspace=grant-application-example",
  ...rest unchanged...
}
```

**Step 2: Run npm install to pick up the new workspace**

```bash
npm install
```

Expected: npm resolves the new workspace member. No errors. (The example's `package.json` doesn't exist yet — npm will warn about it, that's fine for now. We create it next.)

**Step 3: Commit**

```bash
git add package.json
git commit -m "build: add grant-application example to npm workspaces"
```

---

## Task 3: Create `examples/grant-application/package.json`

**Files:**
- Create: `examples/grant-application/package.json`

**Step 1: Write the package.json**

```json
{
  "name": "grant-application-example",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "@preact/signals-core": "*",
    "formspec-engine": "*",
    "formspec-webcomponent": "*"
  },
  "devDependencies": {
    "vite": "^5.0.0"
  }
}
```

Note: `"*"` for the formspec packages means "any version" — with npm workspaces, this resolves to the local workspace packages automatically.

`@preact/signals-core` is listed explicitly so it's unambiguously hoisted to `node_modules` — the `effect()` call in `main.js` imports it directly.

**Step 2: Run npm install to wire up the workspace**

```bash
npm install
```

Expected: npm creates symlinks in `examples/grant-application/node_modules` (or hoists to root). No errors.

Verify the symlink resolves:
```bash
ls examples/grant-application/node_modules/formspec-engine 2>/dev/null || ls node_modules/formspec-engine
```
Expected: the package directory is accessible.

**Step 3: Commit**

```bash
git add examples/grant-application/package.json
git commit -m "feat(example): add package.json for self-contained grant application"
```

---

## Task 4: Create `examples/grant-application/vite.config.ts`

Vite needs a config so the dev server uses port 8081 (keeps 8080 free for the E2E test server).

**Files:**
- Create: `examples/grant-application/vite.config.ts`

**Step 1: Write the config**

```ts
import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 8081,
    open: true,
  },
  preview: {
    port: 8081,
  },
});
```

No `root` override needed — Vite defaults to the directory containing `vite.config.ts`, which is `examples/grant-application/`. `open: true` opens the browser automatically on `npm run dev`.

**Step 2: Commit**

```bash
git add examples/grant-application/vite.config.ts
git commit -m "feat(example): add vite.config.ts with port 8081"
```

---

## Task 5: Extract app script to `main.js`

The `index.html` currently has a 150-line `<script type="module">` block. Extract it to `main.js`, replacing hardcoded relative paths with bare package imports.

**Files:**
- Create: `examples/grant-application/main.js`
- Modify: `examples/grant-application/index.html`

**Step 1: Write `main.js`**

The key changes from the inline script:
- Add `import 'formspec-webcomponent/formspec-base.css'` at top (was a `<link>` tag)
- Change `import { FormEngine } from '../../packages/formspec-engine/dist/index.js'` → `import { effect } from '@preact/signals-core'` and drop the unused `FormEngine` import
- Change `import { FormspecRender } from '../../packages/formspec-webcomponent/dist/index.js'` → `import { FormspecRender } from 'formspec-webcomponent'`
- Remove `import { effect } from '@preact/signals-core'` relative path → already bare

Full `main.js`:

```js
import 'formspec-webcomponent/formspec-base.css';
import { effect } from '@preact/signals-core';
import { FormspecRender } from 'formspec-webcomponent';

customElements.define('formspec-render', FormspecRender);

const SERVER = 'http://localhost:8000';

async function loadJSON(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Failed to load ${path}: ${res.status}`);
  return res.json();
}

function formatMoney(moneyVal) {
  if (!moneyVal || moneyVal.amount == null) return '—';
  const n = parseFloat(moneyVal.amount);
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: moneyVal.currency || 'USD' }).format(n);
}

const formEl = document.getElementById('form');
const btnSubmit = document.getElementById('btn-submit');
const shapeErrorsEl = document.getElementById('shape-errors');
const serverResponseEl = document.getElementById('server-response');
const serverResponsePre = document.getElementById('server-response-pre');
const footerGrandTotal = document.getElementById('footer-grand-total');
const footerRequested = document.getElementById('footer-requested');
const footerMatch = document.getElementById('footer-match');

// Load all artifacts in parallel
const [definition, componentDoc, themeDoc] = await Promise.all([
  loadJSON('./definition.json'),
  loadJSON('./component.json'),
  loadJSON('./theme.json'),
]);

formEl.definition = definition;
formEl.componentDocument = componentDoc;
formEl.themeDocument = themeDoc;

const engine = formEl.getEngine();

// ── Reactive footer totals ──
effect(() => {
  engine.structureVersion.value;

  const grandTotalSignal = engine.variableSignals['#:grandTotal'];
  const requestedSignal  = engine.signals['budget.requestedAmount'];

  const gt = grandTotalSignal?.value;
  const rq = requestedSignal?.value;

  footerGrandTotal.textContent = formatMoney(gt);
  footerRequested.textContent  = formatMoney(rq);

  if (gt && rq && gt.amount != null && rq.amount != null) {
    const diff = Math.abs(parseFloat(gt.amount) - parseFloat(rq.amount));
    if (diff < 1) {
      footerMatch.textContent = '✓ Amounts match';
      footerMatch.className = 'totals-match ok';
    } else {
      footerMatch.textContent = `⚠ Difference: ${new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(diff)}`;
      footerMatch.className = 'totals-match mismatch';
    }
  } else {
    footerMatch.textContent = '';
  }
});

// ── Wizard page tracking ──
const progressStepEls = Array.from(document.querySelectorAll('#progress-steps li'));
const submitAreaEl = document.querySelector('.submit-area');
const PAGE_TITLES = progressStepEls.map(li => li.getAttribute('data-page'));
const LAST_PAGE = PAGE_TITLES[PAGE_TITLES.length - 1];

function getCurrentPageTitle() {
  const panel = formEl.querySelector('.formspec-wizard-panel:not(.formspec-hidden)');
  return panel?.querySelector('h2')?.textContent?.trim() ?? '';
}

function updateWizardUI() {
  const current = getCurrentPageTitle();
  const currentIdx = PAGE_TITLES.indexOf(current);
  const isLastPage = current === LAST_PAGE;

  progressStepEls.forEach((li, i) => {
    li.classList.toggle('active', i === currentIdx);
    li.classList.toggle('valid', i < currentIdx);
    li.classList.toggle('invalid', false);
  });

  submitAreaEl.style.display = isLastPage ? '' : 'none';

  const wizardNextBtn = formEl.querySelector('button.formspec-wizard-next');
  if (wizardNextBtn) wizardNextBtn.style.display = isLastPage ? 'none' : '';
}

new MutationObserver(updateWizardUI).observe(formEl, { subtree: true, attributeFilter: ['class'] });
requestAnimationFrame(updateWizardUI);

// ── Shape error display ──
function refreshShapeErrors(mode = 'continuous') {
  const report = engine.getValidationReport({ mode });
  const shapeResults = report.results.filter(r => r.source === 'shape' || r.constraintKind === 'shape');
  shapeErrorsEl.innerHTML = '';
  if (shapeResults.length === 0) {
    shapeErrorsEl.classList.remove('visible');
    return;
  }
  shapeErrorsEl.classList.add('visible');
  for (const r of shapeResults) {
    const div = document.createElement('div');
    div.className = r.severity === 'warning' ? 'shape-warning-callout' : 'shape-error-callout';
    div.textContent = r.message;
    shapeErrorsEl.appendChild(div);
  }
}

effect(() => {
  engine.structureVersion.value;
  refreshShapeErrors('continuous');
});

// ── Submit ──
btnSubmit.addEventListener('click', async () => {
  const report = engine.getValidationReport({ mode: 'submit' });
  if (!report.valid) {
    refreshShapeErrors('submit');
    alert(`Please fix ${report.counts.error} error(s) before submitting.`);
    return;
  }

  const response = engine.getResponse({ mode: 'submit' });
  btnSubmit.disabled = true;
  btnSubmit.textContent = 'Submitting…';

  try {
    const res = await fetch(`${SERVER}/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(response),
    });
    const result = await res.json();
    serverResponsePre.textContent = JSON.stringify(result, null, 2);
    serverResponseEl.classList.add('visible');
    serverResponseEl.scrollIntoView({ behavior: 'smooth' });
  } catch (e) {
    serverResponsePre.textContent = `Error contacting server: ${e.message}\n\nMake sure the server is running:\n  cd examples/grant-application\n  pip install -r server/requirements.txt\n  PYTHONPATH=../../../src uvicorn server.main:app --port 8000`;
    serverResponseEl.classList.add('visible');
  } finally {
    btnSubmit.disabled = false;
    btnSubmit.textContent = 'Submit Application';
  }
});
```

**Step 2: Update `index.html`**

Three changes:
1. Remove the entire `<script type="importmap">` block (lines 7–14)
2. Remove the `<link rel="stylesheet" href="../../packages/formspec-webcomponent/src/formspec-base.css">` line
3. Replace `<script type="module">...entire script...</script>` (the big inline block) with `<script type="module" src="./main.js"></script>`

The `<head>` section goes from this:
```html
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Federal Grant Application — Formspec Demo</title>
  <script type="importmap">
  {
    "imports": {
      "@preact/signals-core": "/node_modules/@preact/signals-core/dist/signals-core.mjs",
      "formspec-engine": "/packages/formspec-engine/dist/index.js"
    }
  }
  </script>
  <link rel="stylesheet" href="../../packages/formspec-webcomponent/src/formspec-base.css">
  <style>
    ...all inline styles unchanged...
  </style>
</head>
```

to this:
```html
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Federal Grant Application — Formspec Demo</title>
  <style>
    ...all inline styles unchanged...
  </style>
</head>
```

And the bottom of `<body>` goes from:
```html
<script type="module">
  import { FormEngine } from '../../packages/formspec-engine/dist/index.js';
  ...150 lines...
</script>
```

to:
```html
<script type="module" src="./main.js"></script>
```

**Step 3: Commit**

```bash
git add examples/grant-application/main.js examples/grant-application/index.html
git commit -m "feat(example): extract app script to main.js with bare package imports"
```

---

## Task 6: Smoke test and verify

Verify the example runs end-to-end before wrapping up.

**Step 1: Build all packages from root**

```bash
npm run build
```

Expected: both `formspec-engine` and `formspec-webcomponent` build cleanly. Confirm CSS was copied:
```bash
ls packages/formspec-webcomponent/dist/formspec-base.css
```

**Step 2: Run the example dev server**

```bash
cd examples/grant-application && npm run dev
```

Or from root:
```bash
npm run start:grant-app
```

Expected: Vite starts on `http://localhost:8081`, browser opens, grant application loads and is interactive (wizard navigation, budget totals footer reactive).

**Step 3: Verify E2E tests still pass**

The E2E tests use their own server on port 8080 and inject JSON programmatically — they should be unaffected. Confirm from root:

```bash
npm test
```

Expected: all 156 tests pass.

**Step 4: Commit if needed**

If any small fixups were made during smoke test, commit them:
```bash
git add -p
git commit -m "fix(example): smoke test fixups"
```

---

## Summary of files touched

| File | Action |
|------|--------|
| `packages/formspec-webcomponent/package.json` | Modify — add exports map + CSS copy in build script |
| `package.json` (root) | Modify — add example to workspaces, add `start:grant-app` script |
| `examples/grant-application/package.json` | **Create** |
| `examples/grant-application/vite.config.ts` | **Create** |
| `examples/grant-application/main.js` | **Create** |
| `examples/grant-application/index.html` | Modify — remove importmap + CSS link + inline script |

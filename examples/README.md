# Examples

Example projects demonstrate Formspec features at increasing complexity. Each contains a `validate.py` script that runs all artifacts through the Python artifact validator.

```bash
# Validate any example
PYTHONPATH=src python3 examples/<name>/validate.py

# Or validate with the CLI directly
python3 -m formspec.validate examples/<name>/ --registry registries/formspec-common.registry.json
```

---

## invoice/

Line-item invoice with calculated totals. The simplest example — one definition, one theme, one component document.

**Demonstrates:** repeatable groups (`lineItems`), per-row calculations (`unitCost * quantity`), multi-hop totals (subtotal → tax/discount → grand total), CSV export via mapping.

| Artifact | Purpose |
|---|---|
| `invoice.definition.json` | Fields, binds, repeat group (1–20 line items) |
| `invoice.component.json` | Single-page layout with DataTable |
| `invoice.theme.json` | Web theme tokens |
| `invoice.mapping.json` | CSV export rules |
| `fixtures/` | 5 response fixtures (empty, single, multi, max, null-qty) |

---

## clinical-intake/

Patient intake form with triage routing and external data sources.

**Demonstrates:** screener routing, secondary instances with pre-population, remote options, nested repeats (conditions → medications), composed validation shapes, `nonRelevantBehavior: keep`.

| Artifact | Purpose |
|---|---|
| `intake.definition.json` | Wizard-mode form with screener, instances, nested repeats |
| `intake.component.json` | Multi-page wizard layout |
| `intake.theme.json` | Web theme |
| `instances/` | External data: drug database, provider options, patient record |
| `fixtures/` | 6 response fixtures (empty, partial, complete, nested-repeat, demand-shape, screener variants) |

---

## grant-report/

CSBG Tribal Annual Report — demonstrates definition derivation and multi-variant forms. A base definition spawns short and long variants; the long form extends the short with demographic breakdowns.

**Demonstrates:** `derivedFrom` (definition inheritance), multiple definitions sharing one theme, changelog across versions, mapping rules for grant data export.

| Artifact | Purpose |
|---|---|
| `tribal-base.definition.json` | Shared base module (v3.0.0) |
| `tribal-short.definition.json` | Short form variant |
| `tribal-long.definition.json` | Long form variant (derives from base) |
| `tribal-short.component.json` | Short form layout |
| `tribal-long.component.json` | Long form layout |
| `tribal.theme.json` | Shared theme |
| `tribal.changelog.json` | Version changelog |
| `tribal-grant.mapping.json` | Export mapping |
| `fixtures/` | Response fixtures for short-to-long migration |

---

## grant-application/

Kitchen-sink reference that exercises nearly every Formspec feature across all specification tiers. Includes a Vite dev server, FastAPI backend with 9 endpoints, and a 5-tab developer tools dashboard.

**Demonstrates:** 6-page wizard, 13 data types, all bind MIPs, nested repeats, variables, 12 validation shapes, screener routing, instances, pre-population, `$ref` composition, version migrations, option sets, 3 mapping adapters (JSON/CSV/XML), extension registry, changelog, responsive components, custom components, and more.

See [`grant-application/README.md`](grant-application/README.md) for full details, running instructions, and feature coverage inventory.

| Artifact | Purpose |
|---|---|
| `definition.json` | 6-page grant application (items, binds, variables, shapes, screener, instances, migrations) |
| `component.json` | 118-node wizard layout (17 core + 15 progressive + 2 custom component types) |
| `theme.json` | USWDS-flavored web theme |
| `theme-pdf.json` | PDF-specific print theme |
| `mapping.json` | Bidirectional JSON transform (23 rules) |
| `mapping-csv.json` | CSV export adapter |
| `mapping-xml.json` | XML export with namespaces and CDATA |
| `changelog.json` | v1.0 → v1.1 migration (8 changes) |
| `contact-fragment.json` | Reusable `$ref` target |
| `fixtures/` | 4 submission samples (complete, in-progress, amended, stopped) |
| `server/` | FastAPI backend (FEL evaluation, export, submit, registry) |

---

## uswds-grant/

Community development grant application rendered with the **USWDS adapter**. A focused two-document example (definition + theme, no component document) that demonstrates the headless behavior/adapter architecture with USWDS v3 CSS markup.

**Demonstrates:** USWDS render adapter, 4-page wizard via theme pages, repeatable budget line items, FEL-calculated totals (direct → indirect → grand total), conditional subcontractor section, cross-field validation shapes, 8 data types, responsive 12-column grid, USWDS design tokens.

| Artifact | Purpose |
|---|---|
| `grant.definition.json` | 25-field grant application with option sets, repeats, binds, shapes |
| `grant.theme.json` | USWDS v3 theme with tokens, cascade selectors, 4-page layout |
| `fixtures/` | 2 response fixtures (empty, complete) |

---

## references/

Interactive reference dashboard that loads all example definitions and renders them with `<formspec-render>`. Revalidation, mapping export, FEL tools, and changelog run in the browser via **formspec-engine** (Rust/WASM), not the Python package. Runs on port 8082.

**Host page CSS:** Do not apply global `input` / `textarea` / `select` / `button` resets to the whole document — they leak into the live preview and break both the default skin and the **USWDS adapter** (`usa-*` classes + injected integration CSS). Scope shell styling to named classes only (this dashboard follows that rule).

```bash
cd examples/references
npm run dev    # Vite only (from monorepo root: npm run start:references)
```

| File | Purpose |
|---|---|
| `index.html` | Reference examples portal |
| `tools.html` | Developer tools page |
| `main.js` | Dashboard controller |
| `serve.py` | Optional static preview after `npm run build` (stdlib HTTP server) |

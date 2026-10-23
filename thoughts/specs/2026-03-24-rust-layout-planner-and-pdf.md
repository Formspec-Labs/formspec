# Rust Layout Planner + PDF Renderer

**Date:** 2026-03-24
**Status:** Complete / Ratified (Architecture Specification, unblocks ADR 0051)
**Depends on:** ADR 0050 (WASM runtime/tools split), ADR 0051 (PDF AcroForm generation)
**Supersedes:** ADR 0051 Section 7 (library choice — shifts from `@cantoo/pdf-lib` to Rust-native pdf-writer + subsetter)

## Overview

Reimplement the TypeScript layout planner in Rust as two new crates (`formspec-theme`, `formspec-plan`), then build a PDF renderer (`formspec-pdf`) on top using pdf-writer (AcroForm fields + tagged PDF/UA structure) and subsetter (font subsetting). The Rust planner is the spec-normative reference implementation; the TypeScript `formspec-layout` package becomes a thin WASM bridge.

## Motivation

1. **Rust owns spec logic** — the project philosophy. The layout planner implements normative spec behavior (theme cascade SS5.5, token resolution SS3.3, widget fallback SS4.3, responsive SS9.3, custom component expansion SS7.3). This belongs in Rust alongside FEL, evaluation, and linting.

2. **PDF requires AcroForm + PDF/UA** — no open-source JavaScript library can produce both. The Rust ecosystem has pdf-writer (low-level AcroForm primitives + structure tags, MIT/Apache-2.0) and subsetter (font subsetting, MIT/Apache-2.0). Building in Rust solves both.

3. **Single planner, multiple renderers** — the Rust planner produces `LayoutNode` trees consumed by: the web renderer (via WASM), the PDF renderer (Rust-native, no serialization boundary), SSR, and any future renderer.

4. **Spec correctness** — the TypeScript planner has 6 known spec divergences (see `thoughts/research/2026-03-24-planner-spec-divergences.md`). The Rust planner implements spec-normative behavior from the start.

## Architecture

### Crate Structure

```
crates/
  formspec-theme/     NEW — theme cascade, tokens, widgets
  formspec-plan/      NEW — tree planning, component expansion, layout
  formspec-pdf/       NEW (Phase 4) — PDF rendering with pdf-writer + subsetter

  fel-core/           existing
  formspec-core/      existing
  formspec-eval/      existing
  formspec-lint/      existing
  formspec-wasm/      existing (adds feature flags)
  formspec-py/        existing (adds bindings)
```

### Dependency Graph

```
                    ┌──────────────┐
                    │   fel-core   │
                    └──────┬───────┘
                           │
         ┌─────────────────┴──────────────────┐
         │                                    │
   ┌─────┴──────┐                      ┌─────┴─────┐
   │ formspec-  │                      │ formspec- │
   │   core     │                      │   eval    │
   └─────┬──────┘                      └─────┬─────┘
         │                                    │
   ┌─────┴──────────┐                        │
   │                 │                        │
┌──┴───────┐   ┌────┴────────┐               │
│ formspec-│   │ formspec-   │               │
│  theme   │   │   lint      │               │
└──┬───────┘   └─────────────┘               │
   │                                          │
┌──┴───────┐.....optional (eval-merge feat)...│
│ formspec-│..................................│
│  plan    │                                  │
└──┬───────┘                                  │
   │                                          │
┌──┴──────────────┐
│  formspec-pdf   │──── pdf-writer, subsetter, flate2
│   (Phase 4)     │
└─────────────────┘

formspec-plan:
  required deps: formspec-theme, formspec-core
  optional dep:  formspec-eval (behind "eval-merge" feature flag)
                 Enables evaluate_and_merge() — shared by PDF, SSR, print, email renderers.

formspec-pdf:
  required deps: formspec-plan (with eval-merge), pdf-writer, subsetter, flate2
  optional dep:  skrifa (for custom font metrics; Standard 14 uses hardcoded arrays)
```

### TypeScript Package Evolution

```
Phase 1-2:  formspec-layout (TS) serves web renderer
            formspec-theme + formspec-plan (Rust) built and tested independently

Phase 3:    formspec-layout becomes WASM bridge
            theme-resolver.ts, planner.ts → deleted
            types.ts → kept (TypeScript type re-exports)
            index.ts → re-exports from WASM bridge functions

Phase 4:    formspec-pdf exposed via WASM for browser-side PDF preview
```

---

## Crate: `formspec-theme`

### Purpose

Spec-normative theme cascade resolution: given a ThemeDocument, an ItemDescriptor, and Tier 1 hints, produce the effective PresentationBlock for a single item.

### Dependencies

- `formspec-core` (path utilities)
- `serde`, `serde_json` (serialization)

### Public API

```rust
/// Resolve the effective PresentationBlock for a single item.
/// Implements the 6-level cascade per Theme spec SS5.5.
pub fn resolve_presentation(
    theme: Option<&ThemeDocument>,
    item: &ItemDescriptor,
    tier1: Option<&Tier1Hints>,
    renderer_defaults: Option<&PresentationBlock>,  // Level -2
) -> PresentationBlock;

/// Select the best available widget from preference + fallback chain.
/// Returns None if no widget available — caller falls back to dataType default.
pub fn resolve_widget(
    presentation: &PresentationBlock,
    is_available: &dyn Fn(&str) -> bool,
) -> Option<String>;

/// Resolve a $token.key reference against component tokens, theme tokens,
/// and renderer defaults. Non-recursive. Returns None if unresolved.
pub fn resolve_token(
    value: &str,
    component_tokens: Option<&Map<String, Value>>,
    theme_tokens: Option<&Map<String, Value>>,
) -> Option<Value>;
```

### Spec Behaviors Implemented

| Spec Section | Behavior |
|---|---|
| SS5.5 | 6-level cascade: renderer defaults (-2), formPresentation (-1), item presentation (0), theme defaults (1), selectors (2), items (3) |
| SS5.5 | Shallow per-property merge. Nested objects (`widgetConfig`, `style`, `accessibility`) **replaced as a whole** per spec (diverges from TS shallow-merge). |
| SS5.5 | `cssClass` union semantics across all levels, deduplicated, order preserved |
| SS5.6 | `"none"` sentinel suppresses inherited `widget` and `labelPosition` |
| SS5.6 | JSON `null` values rejected |
| SS5.3 | All matching selectors apply (document order), not first-match |
| SS3.3-3.4 | Token resolution: component > theme > renderer defaults. Non-recursive detection + warning. |
| SS4.3 | Widget fallback chain: preferred, then fallback array in order. `isAvailable` predicate from caller. |

### Implementation Extensions (not in spec, kept for compatibility)

| Extension | Purpose |
|---|---|
| `cssClassReplace` | Higher-cascade class replacement with utility-prefix matching |
| `classStrategy: "tailwind-merge"` | Conflict-aware CSS class merging (Rust-native prefix resolution, no JS callback) |
| `widgetConfig["x-classes"]` additive merge | Slot-based class injection for design system adapters |

### Types

All types derive `Serialize`/`Deserialize` with `#[serde(rename_all = "camelCase")]` and `#[serde(skip_serializing_if = "Option::is_none")]` on optional fields.

```rust
pub struct PresentationBlock {
    pub widget: Option<String>,
    pub widget_config: Option<Map<String, Value>>,
    pub label_position: Option<LabelPosition>,
    pub style: Option<Map<String, Value>>,
    pub accessibility: Option<AccessibilityBlock>,
    pub fallback: Option<Vec<String>>,
    pub css_class: Option<CssClassValue>,
    pub css_class_replace: Option<CssClassValue>,
}

pub struct ThemeDocument {
    pub formspec_theme: String,            // "$formspecTheme"
    pub version: String,
    pub target_definition: TargetDefinition,
    pub url: Option<String>,
    pub name: Option<String>,
    pub title: Option<String>,
    pub description: Option<String>,
    pub platform: Option<String>,
    pub tokens: Option<Map<String, Value>>,
    pub defaults: Option<PresentationBlock>,
    pub selectors: Option<Vec<ThemeSelector>>,
    pub items: Option<Map<String, PresentationBlock>>,
    pub pages: Option<Vec<Page>>,
    pub breakpoints: Option<Map<String, u32>>,
    pub stylesheets: Option<Vec<String>>,
    pub extensions: Option<Map<String, Value>>,
    pub class_strategy: Option<ClassStrategy>,
}

pub struct ItemDescriptor {
    pub key: String,
    pub item_type: ItemType,   // "group" | "field" | "display"
    pub data_type: Option<FormspecDataType>,
}

pub struct Tier1Hints {
    pub item_presentation: Option<ItemPresentation>,
    pub form_presentation: Option<FormPresentation>,
}

pub struct FormPresentation {
    pub label_position: Option<LabelPosition>,
    pub density: Option<Density>,              // "compact" | "comfortable" | "spacious"
    pub page_mode: Option<PageMode>,           // "single" | "wizard" | "tabs"
    pub default_currency: Option<String>,      // ISO 4217 currency code
}

pub enum Density { Compact, Comfortable, Spacious }
pub enum PageMode { Single, Wizard, Tabs }

pub enum LabelPosition { Top, Start, Hidden }
pub enum ClassStrategy { Union, TailwindMerge }
pub enum ItemType { Group, Field, Display }

pub enum FormspecDataType {
    String, Text, Integer, Decimal, Boolean,
    Date, DateTime, Time, Uri,
    Attachment, Choice, MultiChoice, Money,
}
```

---

## Crate: `formspec-plan`

### Purpose

Produce JSON-serializable `LayoutNode` trees from component document trees or definition item arrays, applying theme cascade, token resolution, responsive breakpoints, custom component expansion, and page layout.

### Dependencies

- `formspec-theme` (cascade, tokens, widgets)
- `formspec-core` (path utilities)
- `serde`, `serde_json` (serialization)

### Public API

```rust
/// Plan a component tree node into a LayoutNode tree.
pub fn plan_component_tree(
    tree: &Value,        // component document tree node
    ctx: &PlanContext,
) -> LayoutNode;

/// Plan definition items into LayoutNode trees (fallback when no component document).
pub fn plan_definition_fallback(
    items: &[Value],     // definition items array
    ctx: &PlanContext,
) -> Vec<LayoutNode>;

/// Reset the ID counter (for deterministic testing).
pub fn reset_node_id_counter();

/// Resolve responsive props for a single component node.
pub fn resolve_responsive_props(
    component: &Value,
    viewport_width: Option<u32>,
    breakpoints: Option<&Map<String, u32>>,
) -> Value;

/// Interpolate {param} references in a custom component template.
pub fn interpolate_params(tree: &mut Value, params: &Value);

/// Get the default component type for a definition item.
pub fn get_default_component(item: &Value) -> String;
```

### Spec Behaviors Implemented

| Spec Section | Behavior |
|---|---|
| Component SS7.3 | Custom component expansion: deep-clone, param interpolation in allowed string props, insert in place |
| Component SS7.3 | Instance `when`, `style`, `responsive` merged onto resolved subtree root |
| Component SS7.4 | Static cycle detection via directed graph |
| Component SS7.5 | Depth limits: max 3 custom nesting, max 20 total. MUST NOT enforce below 3/10. |
| Component SS7.3 | Extra params ignored + warning |
| Component SS8.1 | `when` FEL expressions emitted as strings (deferred to renderer) |
| Component SS9.3 | Responsive: **cumulative ascending** merge (all breakpoints where `minWidth <= viewportWidth`) |
| Component SS9.4 | Structural constraints: `component`, `children`, `bind`, `when`, `responsive` forbidden in overrides |
| Theme SS6.1-6.3 | Theme page layout: 12-column grid, regions, group subtree inclusion |
| Theme SS6.3 | Unassigned items rendered after all pages |
| Theme SS6.4 | Responsive region overrides (span, start, hidden) |
| Theme SS6.5 | Definition-fallback planning (no pages, walk items top-to-bottom) |
| Core SS4.1.1 | `formPresentation.pageMode`: wizard/tabs wrapping |
| Core SS4.2.5.2 | `layout.page` explicit page assignment; groups without `page` attach to preceding page |
| Component SS4.5 | Unbound required items get fallback rendering, appended in Definition order |

### Types

```rust
pub struct LayoutNode {
    pub id: String,
    pub component: String,
    pub category: NodeCategory,
    pub props: Map<String, Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub style: Option<Map<String, Value>>,
    pub css_classes: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub accessibility: Option<AccessibilityBlock>,
    pub children: Vec<LayoutNode>,

    // Field binding
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bind_path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub field_item: Option<FieldItemSnapshot>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub presentation: Option<PresentationBlock>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub label_position: Option<LabelPosition>,

    // Conditional rendering (deferred)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub when: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub when_prefix: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub fallback: Option<String>,

    // Repeat groups (deferred)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub repeat_group: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub repeat_path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub is_repeat_template: Option<bool>,

    // Scope markers
    #[serde(skip_serializing_if = "Option::is_none")]
    pub scope_change: Option<bool>,
}

/// Rust-native context (used by formspec-pdf and unit tests).
/// Contains closures for item lookup and component availability.
pub struct PlanContext {
    pub items: Vec<Value>,
    pub form_presentation: Option<Value>,
    pub component_document: Option<Value>,
    pub theme: Option<ThemeDocument>,
    pub viewport_width: Option<u32>,
    pub find_item: Box<dyn Fn(&str) -> Option<Value>>,
    pub is_component_available: Option<Box<dyn Fn(&str) -> bool>>,
}

/// WASM-serializable context (used at the WASM boundary).
/// Replaces closures with inlined data that the Rust side converts to closures internally.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlanContextJson {
    pub items: Vec<Value>,
    pub form_presentation: Option<Value>,
    pub component_document: Option<Value>,
    pub theme: Option<ThemeDocument>,
    pub viewport_width: Option<u32>,
    /// Flat map of all definition items keyed by dotted path.
    /// Rust converts this to a find_item closure internally.
    pub items_by_path: Map<String, Value>,
    /// List of registered component type names.
    /// Rust converts this to an is_component_available closure internally.
    pub available_components: Option<Vec<String>>,
}

impl From<PlanContextJson> for PlanContext {
    fn from(json: PlanContextJson) -> Self {
        let items_map = json.items_by_path;
        let available = json.available_components
            .map(|v| v.into_iter().collect::<HashSet<_>>());
        PlanContext {
            items: json.items,
            form_presentation: json.form_presentation,
            component_document: json.component_document,
            theme: json.theme,
            viewport_width: json.viewport_width,
            find_item: Box::new(move |path| items_map.get(path).cloned()),
            is_component_available: available.map(|set|
                Box::new(move |t: &str| set.contains(t)) as Box<dyn Fn(&str) -> bool>
            ),
        }
    }
}

pub struct FieldItemSnapshot {
    pub key: String,
    pub label: String,
    pub hint: Option<String>,
    pub data_type: Option<String>,
    pub options: Option<Vec<FieldOption>>,
    pub option_set: Option<String>,
}

pub enum NodeCategory { Layout, Field, Display, Interactive, Special }
```

---

## WASM Integration

### Feature Flags in `formspec-wasm`

```toml
# crates/formspec-wasm/Cargo.toml
[features]
default = ["full-wasm"]
full-wasm = ["lint", "document-api", "definition-assembly", "mapping-api",
             "registry-api", "changelog-api", "fel-authoring",
             "theme-api", "plan-api", "pdf-api"]  # NEW: theme-api, plan-api, pdf-api
theme-api = []
plan-api = ["theme-api"]  # plan depends on theme
pdf-api = ["plan-api"]    # pdf depends on plan (and transitively theme)
```

Both go into the **tools WASM** artifact. Runtime WASM is unchanged.

### WASM Exports

```rust
// crates/formspec-wasm/src/theme.rs
#[cfg(feature = "theme-api")]
mod theme {
    #[wasm_bindgen(js_name = "resolvePresentation")]
    pub fn resolve_presentation(
        theme_json: &str,
        item_json: &str,
        tier1_json: &str,
    ) -> Result<String, JsError>;

    #[wasm_bindgen(js_name = "resolveToken")]
    pub fn resolve_token(
        value: &str,
        component_tokens_json: &str,
        theme_tokens_json: &str,
    ) -> Result<String, JsError>;
}

// crates/formspec-wasm/src/plan.rs
#[cfg(feature = "plan-api")]
mod plan {
    #[wasm_bindgen(js_name = "planComponentTree")]
    pub fn plan_component_tree(
        tree_json: &str,
        context_json: &str,
    ) -> Result<String, JsError>;

    #[wasm_bindgen(js_name = "planDefinitionFallback")]
    pub fn plan_definition_fallback(
        items_json: &str,
        context_json: &str,
    ) -> Result<String, JsError>;

    #[wasm_bindgen(js_name = "resetNodeIdCounter")]
    pub fn reset_node_id_counter();
}
```

### TypeScript Bridge

`packages/formspec-layout/` evolves into a WASM bridge:

```
src/
  index.ts              — public API (unchanged exports)
  types.ts              — TypeScript type re-exports (unchanged)
  wasm-bridge.ts        — NEW: calls into formspec-wasm plan/theme exports
  theme-resolver.ts     — DELETED (replaced by WASM)
  planner.ts            — DELETED (replaced by WASM)
  tokens.ts             — DELETED (replaced by WASM)
  responsive.ts         — DELETED (replaced by WASM)
  defaults.ts           — DELETED (replaced by WASM)
  params.ts             — DELETED (replaced by WASM)
  widget-vocabulary.ts  — KEPT (exported constants used by web renderer for component registration)
```

---

## Testing Strategy

### Layer 1: Rust Unit Tests

Each function in `formspec-theme` and `formspec-plan` has spec-normative tests:

- **Cascade tests**: 6-level merge, replace-as-a-whole for nested objects, cssClass union, `"none"` sentinel, selector all-match ordering
- **Token tests**: Component > theme > renderer cascade, recursive detection, unresolved handling
- **Widget tests**: Fallback chain, `isAvailable` predicate, null return → caller default
- **Responsive tests**: Cumulative ascending merge, forbidden properties rejected, style replacement
- **Custom component tests**: Expansion, param interpolation, cycle detection, depth limits, instance prop merge, extra params warning
- **Planning tests**: Component tree → LayoutNode, definition fallback → LayoutNode, theme pages, page mode wrapping, repeat templates, conditional markers, unbound required items

### Layer 2: Cross-Planner Conformance Fixtures

JSON fixture files in `tests/conformance/layout/`:

```json
{
  "name": "basic-field-cascade",
  "input": {
    "definition": { "items": [...] },
    "theme": { "$formspecTheme": "1.0", "defaults": {...}, "selectors": [...] },
    "componentDocument": null,
    "formPresentation": null,
    "viewportWidth": null
  },
  "expected": [
    { "id": "field-1", "component": "TextInput", "category": "field", ... }
  ]
}
```

The Rust planner generates the `expected` output (it is the reference). The TS planner runs the same fixtures; failures indicate TS needs updating.

### Layer 3: Existing E2E Tests

Playwright and Vitest tests catch rendering regressions when the web renderer switches from TS planner to WASM planner.

---

## Phase 4: PDF Renderer (`formspec-pdf`)

### Dependencies

- `formspec-plan` (LayoutNode trees)
- `formspec-eval` (batch evaluation: values, validations, required, readonly, nonRelevant)
- `formspec-theme` (token resolution for PDF-specific styling)
- `pdf-writer` (PDF object writing: page tree, content streams, AcroForm fields, structure tags)
- `subsetter` (OpenType font subsetting — same crate used by krilla and Typst)
- `flate2` (zlib compression for PDF content streams)

### Architecture

```
formspec-plan::plan_component_tree() or plan_definition_fallback()
    → LayoutNode tree

formspec-eval::evaluate_definition(definition, response_data, context)
    → EvalResult { values, validations, required, readonly, non_relevant, variables }

formspec-plan::evaluate_and_merge(layout_tree, eval_result, definition)
    → EvaluatedNode tree (fully static: nodes pruned, repeats expanded, values filled)
    NOTE: lives in formspec-plan, not formspec-pdf — shared by all static renderers

formspec-pdf::render_pdf(evaluated_tree, pdf_options)
    → PDF bytes (AcroForm + tagged PDF/UA)
```

#### Eval Merge Location Decision (ADR 0051 Q1 — resolved)

The evaluation merge lives in **`formspec-plan`**, not in `formspec-pdf`. Rationale:

- The merge transforms a deferred `LayoutNode` tree into a static `EvaluatedNode` tree. This is needed by every non-interactive renderer: PDF, SSR, print preview, email.
- Putting it in `formspec-pdf` would force every future renderer to duplicate the logic.
- `formspec-plan` already owns `LayoutNode`. Adding `EvaluatedNode` keeps the tree lifecycle in one crate.
- The merge depends on `formspec-eval` (for `EvalResult` type), which is a sibling at the same conceptual level. Since `formspec-plan` doesn't import `formspec-eval` today, we add it as an **optional dependency** behind a `eval-merge` feature flag. `formspec-pdf` enables this feature.

```toml
# crates/formspec-plan/Cargo.toml
[features]
eval-merge = ["formspec-eval"]  # optional: adds evaluate_and_merge()
```

The merge function handles:
1. **Pruning non-relevant nodes** — walk tree, remove nodes whose `bindPath` appears in `evalResult.nonRelevant`.
2. **Expanding repeat templates** — clone `isRepeatTemplate` nodes N times per `evalResult.repeatCounts[groupName]`, rewriting `bindPath` with instance indices (`group[0].field`, `group[1].field`).
3. **Annotating field values** — set `value` from `evalResult.values[bindPath]`.
4. **Annotating required/readonly** — from `evalResult.required` and `evalResult.readonly`.
5. **Annotating validation errors** — from `evalResult.validations[bindPath]`.
6. **Resolving optionSet references** — look up `fieldItem.optionSet` key in `definition.optionSets` to get concrete option arrays.

Nested repeat groups (repeat inside repeat) are handled by recursive expansion — the inner template is cloned for each instance of the outer group, with bindPaths rewritten to include both indices.


### Modules

| Module | Responsibility |
|---|---|
| `eval_merge.rs` | Merge `EvalResult` into `LayoutNode` tree → `EvaluatedNode`: prune non-relevant, expand repeats, annotate values/required/readonly/validation. Shared with any static renderer (SSR, print, email). |
| `fonts.rs` | Standard 14 font metrics (hardcoded AFM-derived glyph width arrays), text measurement, text wrapping. Custom font loading via `subsetter`. |
| `measure.rs` | Height measurement for every node type. Depends on `fonts.rs` for text metrics. |
| `paginate.rs` | Page break algorithm: greedy single-pass with 5 keep constraints. Operates on measured nodes, produces page assignments. |
| `layout.rs` | Map 12-column grid to physical coordinates (points). Paper size, margins, coordinate system (PDF bottom-left origin). |
| `render.rs` | Walk paginated `EvaluatedNode` tree, emit pdf-writer content streams. Text rendering, rectangles, lines, group headers, display content. |
| `appearance.rs` | Generate appearance streams for every AcroForm field type. Default Appearance strings, checkbox/radio On/Off XObjects, text field visual representation. |
| `acroform.rs` | AcroForm field creation and wiring: field dictionaries, widget annotations, `/DR` default resources, hierarchical field naming for repeat groups. |
| `tagged.rs` | PDF/UA structure tree: ref allocation, MCID tracking, ParentTree bookkeeping, StructElement hierarchy, OBJR entries, marked content in content streams. |
| `xfdf.rs` | XFDF import/export for round-trip data exchange. Generate XFDF from `EvalResult`, parse XFDF into `Record<bindPath, value>`, assemble into Formspec Response. |
| `options.rs` | PDF-specific configuration from `ThemeDocument.extensions["x-pdf"]`: paper size, orientation, margins, header/footer, fontSize, fontFamily, fieldAppearance. |

---

### Font Metrics and Text Measurement (`fonts.rs`)

pdf-writer provides no font metrics — it's intentionally low-level. We embed AFM-derived glyph widths for Standard 14 fonts at compile time.

**Data:** Each font variant needs a `[u16; 95]` array mapping ASCII 32..=126 to advance widths in 1/1000 em units. Four Helvetica variants (Regular, Bold, Oblique, BoldOblique) = 760 bytes total. Source: Adobe AFM files (freely available, MIT-licensed via `@pdf-lib/standard-fonts`).

```rust
/// Helvetica glyph widths for ASCII 32..=126, in 1/1000 em units.
const HELVETICA_WIDTHS: [u16; 95] = [
    278, 278, 355, 556, 556, 889, 667, 191, 333, 333, // space ! " # $ % & ' ( )
    389, 584, 278, 333, 278, 278, 556, 556, 556, 556, // * + , - . / 0 1 2 3
    556, 556, 556, 556, 556, 556, 278, 278, 584, 584, // 4 5 6 7 8 9 : ; < =
    584, 556, 1015, 667, 667, 722, 722, 667, 611, 778,// > ? @ A B C D E F G
    722, 278, 500, 667, 556, 833, 722, 778, 667, 778, // H I J K L M N O P Q
    722, 667, 611, 722, 667, 944, 667, 667, 611, 278, // R S T U V W X Y Z [
    278, 278, 469, 556, 333, 556, 556, 500, 556, 556, // \ ] ^ _ ` a b c d e
    278, 556, 556, 222, 222, 500, 222, 833, 556, 556, // f g h i j k l m n o
    556, 556, 333, 500, 278, 556, 500, 722, 500, 500, // p q r s t u v w x y
    500, 334, 260, 334, 584,                           // z { | } ~
];

const HELVETICA_BOLD_WIDTHS: [u16; 95] = [
    278, 333, 474, 556, 556, 889, 722, 278, 333, 333,
    389, 584, 278, 333, 278, 278, 556, 556, 556, 556,
    556, 556, 556, 556, 556, 556, 333, 333, 584, 584,
    584, 611, 975, 722, 722, 722, 722, 667, 611, 778,
    722, 278, 556, 722, 611, 833, 722, 778, 667, 778,
    722, 667, 611, 722, 667, 944, 667, 667, 611, 333,
    278, 333, 584, 556, 278, 556, 611, 556, 611, 556,
    333, 611, 611, 278, 278, 556, 278, 889, 611, 611,
    611, 611, 389, 556, 333, 611, 556, 778, 556, 556,
    500, 389, 280, 389, 584,
];

/// Font-level metrics (1/1000 em units).
struct FontMetrics {
    ascender: i16,    // Helvetica: 718, Helvetica-Bold: 718
    descender: i16,   // Helvetica: -207, Helvetica-Bold: -207
    cap_height: i16,  // Helvetica: 718, Helvetica-Bold: 718
}

/// Compute text width in points.
fn text_width(text: &str, widths: &[u16; 95], font_size: f32) -> f32 {
    text.bytes()
        .map(|b| if (32..=126).contains(&b) {
            widths[(b - 32) as usize] as f32
        } else {
            widths[0] as f32 // space width for non-ASCII fallback
        })
        .sum::<f32>() * font_size / 1000.0
}

/// Word-wrap text and return line count.
fn wrap_text(text: &str, widths: &[u16; 95], font_size: f32, max_width: f32) -> usize {
    let mut lines = 1usize;
    let mut line_width = 0.0f32;
    for word in text.split_whitespace() {
        let word_width = text_width(word, widths, font_size);
        let space_width = widths[0] as f32 * font_size / 1000.0;
        if line_width > 0.0 && line_width + space_width + word_width > max_width {
            lines += 1;
            line_width = word_width;
        } else {
            line_width += if line_width > 0.0 { space_width } else { 0.0 } + word_width;
        }
    }
    lines
}

/// Text height = line_count × line_height, where line_height = font_size × 1.2.
fn text_height(text: &str, widths: &[u16; 95], font_size: f32, max_width: f32) -> f32 {
    let lines = wrap_text(text, widths, font_size, max_width);
    lines as f32 * font_size * 1.2
}
```

**Custom fonts:** When user-provided font bytes are supplied, `subsetter` strips them to only used glyphs. Font metrics (widths, ascent, descent) are read from the font's `hhea` and `hmtx` tables using `skrifa` (lightweight OpenType parser, same one krilla uses). `skrifa` is only needed when custom fonts are provided — Standard 14 uses the hardcoded arrays.

---

### Height Measurement (`measure.rs`)

Every `EvaluatedNode` must be measured before pagination. Heights depend on node type:

```rust
struct PdfConfig {
    // Page geometry (US Letter defaults, points at 72 DPI)
    page_width: f32,          // 612.0 (8.5")
    page_height: f32,         // 792.0 (11")
    margin_top: f32,          // 72.0 (1")
    margin_bottom: f32,       // 72.0 (1")
    margin_left: f32,         // 72.0 (1")
    margin_right: f32,        // 72.0 (1")
    header_height: f32,       // 36.0 (0.5")
    footer_height: f32,       // 24.0 (0.33")

    // Derived
    content_width: f32,       // 468.0 (612 - 72 - 72)
    content_height: f32,      // 624.0 (792 - 72 - 72 - 36 - 24, minus small gap)

    // Typography
    label_font_size: f32,     // 9.0
    field_font_size: f32,     // 10.0
    heading_font_size: f32,   // 14.0
    hint_font_size: f32,      // 8.0

    // Field geometry
    field_height: f32,        // 22.0 (single-line input box)
    textarea_height: f32,     // 60.0 (~3 visible lines)
    option_height: f32,       // 18.0 (one radio/checkbox option)
    field_padding: f32,       // 8.0 (vertical gap between fields)
    group_padding: f32,       // 16.0 (extra space before group header)
    column_gap: f32,          // 12.0 (horizontal gap between grid columns)
}

fn measure_node(node: &EvaluatedNode, config: &PdfConfig, column_width: f32) -> f32 {
    match node.category {
        NodeCategory::Field => {
            let label_h = if node.label_position != LabelPosition::Hidden {
                text_height(&node.label, &HELVETICA_WIDTHS, config.label_font_size, column_width)
            } else { 0.0 };

            let input_h = match node.component.as_str() {
                "TextInput" | "NumberInput" | "DatePicker" | "MoneyInput" | "Select" =>
                    config.field_height,
                "TextArea" => config.textarea_height,
                "RadioGroup" => node.options_count() as f32 * config.option_height,
                "CheckboxGroup" => node.options_count() as f32 * config.option_height,
                "Toggle" | "Checkbox" => config.option_height,
                "Signature" => config.field_height * 2.0, // taller placeholder
                _ => config.field_height,
            };

            let hint_h = node.hint.as_ref()
                .map(|h| text_height(h, &HELVETICA_WIDTHS, config.hint_font_size, column_width))
                .unwrap_or(0.0);

            label_h + input_h + hint_h + config.field_padding
        },
        NodeCategory::Layout => {
            match node.component.as_str() {
                "Group" | "Sect" => {
                    let header_h = text_height(
                        &node.label, &HELVETICA_BOLD_WIDTHS,
                        config.heading_font_size, column_width
                    );
                    let children_h: f32 = node.children.iter()
                        .map(|c| measure_node(c, config, column_width))
                        .sum();
                    config.group_padding + header_h + children_h
                },
                "Grid" | "Row" => {
                    // Multi-column: row height = max column height
                    let col_count = node.props.get("columns")
                        .and_then(|v| v.as_u64()).unwrap_or(1) as f32;
                    let col_w = (column_width - (col_count - 1.0) * config.column_gap) / col_count;
                    // Each child is a column; measure tallest
                    node.children.iter()
                        .map(|col| col.children.iter()
                            .map(|c| measure_node(c, config, col_w))
                            .sum::<f32>())
                        .fold(0.0f32, f32::max)
                },
                _ => node.children.iter()
                    .map(|c| measure_node(c, config, column_width))
                    .sum(),
            }
        },
        NodeCategory::Display => {
            match node.component.as_str() {
                "Heading" => text_height(
                    &node.label, &HELVETICA_BOLD_WIDTHS,
                    config.heading_font_size, column_width
                ) + config.field_padding,
                "Paragraph" => text_height(
                    &node.label, &HELVETICA_WIDTHS,
                    config.field_font_size, column_width
                ) + config.field_padding,
                "Divider" => 12.0, // line + padding
                _ => 0.0,
            }
        },
        _ => 0.0,
    }
}
```

With `content_height` of ~624pt, a typical form fits 20-25 fields per page. A 50-field form produces 2-3 pages. A repeat group with 50 instances adds 2-3 more pages.

---

### Page Break Algorithm (`paginate.rs`)

**Single-pass greedy algorithm with 5 keep constraints.** Operates on measured `EvaluatedNode` trees, produces a `Vec<PageAssignment>` mapping each node to a page index and y-offset.

```rust
struct PageAssignment {
    page_index: usize,
    y_offset: f32,     // distance from top of content area
}

struct Paginator {
    content_height: f32,
    cursor: f32,       // current y position on current page
    current_page: usize,
    assignments: Vec<PageAssignment>,
}

impl Paginator {
    fn paginate(&mut self, nodes: &[MeasuredNode]) {
        for (i, node) in nodes.iter().enumerate() {
            match node {
                // Rule 1: Explicit page breaks (from theme pages)
                MeasuredNode::PageBreak => {
                    self.new_page();
                },

                // Rule 2: Keep-with-next for group headers
                MeasuredNode::GroupHeader { height, .. } => {
                    let next_h = self.peek_first_child_height(nodes, i);
                    if self.cursor + height + next_h > self.content_height {
                        self.new_page();
                    }
                    self.place(*height);
                },

                // Rule 3: Keep-together for fields
                MeasuredNode::Field { height, .. } => {
                    if self.cursor + height > self.content_height {
                        if *height <= self.content_height {
                            self.new_page(); // fits on fresh page
                        }
                        // else: taller than a page — place anyway (rare)
                    }
                    self.place(*height);
                },

                // Rule 4: Keep-together for repeat instances
                MeasuredNode::RepeatInstance { total_height, children, .. } => {
                    if self.cursor + total_height > self.content_height {
                        if *total_height <= self.content_height {
                            self.new_page();
                        } else {
                            // Instance taller than a page — split at child boundaries
                            self.paginate(children);
                            continue;
                        }
                    }
                    self.place(*total_height);
                },

                // Rule 5: Multi-column rows — keep together or linearize
                MeasuredNode::ColumnRow { height, columns, .. } => {
                    if self.cursor + height > self.content_height {
                        if *height <= self.content_height {
                            self.new_page();
                        } else {
                            // Row taller than page — linearize columns
                            let linearized = self.linearize(columns);
                            self.paginate(&linearized);
                            continue;
                        }
                    }
                    self.place(*height);
                },
            }
        }
    }
}
```

**Impact ranking of the five rules:**
1. **Keep-with-next on group headers** — eliminates the most visible defect (orphan headers at page bottom).
2. **Keep-together on fields** — a label+input must never split. Fields are 30-60pt; always fits on a fresh page.
3. **Keep-together on repeat instances** — split repeat groups between instances, never within.
4. **Explicit page breaks** — honor theme page boundaries as forced breaks.
5. **Multi-column sync** — move entire column rows together; linearize if too tall.

**What this does NOT do:** Global optimization, Knuth-Plass penalties, widow/orphan control for paragraph text, balanced multi-column splitting. These are unnecessary for form PDFs where elements are much larger than text lines.

---

### Appearance Stream Generation (`appearance.rs`)

**This is the most critical missing piece.** Every AcroForm field needs appearance streams or it may be invisible, viewer-dependent, or trigger unwanted "save" prompts.

#### Why not `/NeedAppearances`?

Setting `/NeedAppearances true` on the AcroForm dict asks the viewer to generate appearance streams on open. This is bad:
- Triggers a "Save changes?" prompt on close
- Invalidates digital signatures
- Some viewers ignore it (printing may show blank fields)
- Behavior varies across Acrobat, Preview, Chrome, Firefox

**We generate all appearance streams ourselves.**

#### Default Appearance Strings (`/DA`)

Every text/choice field needs a `/DA` string on the field dictionary:

```
/Helv <fontSize> Tf 0 g          — Helvetica, black text
```

Set on both the individual field and as a fallback on the AcroForm dict:

```rust
// Document-level default
catalog.form()
    .default_appearance(Str(b"/Helv 0 Tf 0 g"))
    .default_resources()
        .fonts()
        .pair(Name(b"Helv"), helvetica_ref)
        .pair(Name(b"ZaDb"), zapf_ref);

// Per-field (overrides document default if font size differs)
field.vartext_default_appearance(Str(b"/Helv 10 Tf 0 g"));
```

Font size `0` means auto-size (viewer computes optimal size to fit field bounds).

#### Text Field Appearance Streams

The normal appearance for a text field is a FormXObject containing:

```rust
fn build_text_field_appearance(
    value: &str, rect: Rect, font_size: f32, config: &PdfConfig
) -> (Ref, Vec<u8>) {
    let mut content = Content::new();
    let w = rect.x2 - rect.x1;
    let h = rect.y2 - rect.y1;
    let padding = 2.0;

    // Background + border
    content.save_state();
    content.set_fill_rgb(1.0, 1.0, 1.0);     // white background
    content.set_stroke_rgb(0.6, 0.6, 0.6);   // gray border
    content.set_line_width(0.5);
    content.rect(0.0, 0.0, w, h);
    content.fill_nonzero_and_stroke();
    content.restore_state();

    // Clipping region (inset by border + padding)
    content.save_state();
    content.rect(padding, padding, w - 2.0*padding, h - 2.0*padding);
    content.clip_nonzero();
    content.end_path();

    // Text content (wrapped in /Tx marked content for editing)
    content.begin_marked_content(Name(b"Tx"));
    content.save_state();
    content.begin_text();
    content.set_fill_gray(0.0);
    content.set_font(Name(b"Helv"), font_size);
    let text_y = (h / 2.0) - (font_size / 2.0);   // vertically centered
    content.set_text_matrix([1.0, 0.0, 0.0, 1.0, padding + 1.0, text_y]);
    content.show(Str(value.as_bytes()));
    content.end_text();
    content.restore_state();
    content.end_marked_content();

    content.restore_state();
    (/* ref */, content.finish())
}
```

The FormXObject wraps the content stream:

```rust
let stream = content.finish();
let mut xobj = pdf.form_xobject(appearance_ref, &stream);
xobj.bbox(Rect::new(0.0, 0.0, w, h));
xobj.resources().fonts().pair(Name(b"Helv"), helvetica_ref);
```

Then wired to the annotation:

```rust
annot.appearance().normal().stream(appearance_ref);
```

#### Checkbox Appearance Streams (On/Off)

Two XObjects per checkbox: one with a checkmark, one empty.

**"On" state — path-drawn checkmark** (no font dependency, more portable than ZapfDingbats):

```rust
fn build_checkmark_appearance(w: f32, h: f32) -> Vec<u8> {
    let mut c = Content::new();
    // Border box
    c.save_state();
    c.set_fill_rgb(1.0, 1.0, 1.0);
    c.set_stroke_rgb(0.4, 0.4, 0.4);
    c.set_line_width(0.75);
    c.rect(0.5, 0.5, w - 1.0, h - 1.0);
    c.fill_nonzero_and_stroke();
    c.restore_state();
    // Checkmark path
    c.save_state();
    c.set_stroke_gray(0.0);
    c.set_line_width(1.5);
    let cx = w / 2.0;
    let cy = h / 2.0;
    let s = w.min(h) * 0.35;
    c.move_to(cx - s * 0.675, cy + s * 0.05);
    c.line_to(cx - s * 0.25, cy - s * 0.49);
    c.line_to(cx + s * 0.69, cy + s * 0.475);
    c.stroke();
    c.restore_state();
    c.finish()
}
```

**"Off" state — empty box:**

```rust
fn build_empty_box_appearance(w: f32, h: f32) -> Vec<u8> {
    let mut c = Content::new();
    c.set_fill_rgb(1.0, 1.0, 1.0);
    c.set_stroke_rgb(0.4, 0.4, 0.4);
    c.set_line_width(0.75);
    c.rect(0.5, 0.5, w - 1.0, h - 1.0);
    c.fill_nonzero_and_stroke();
    c.finish()
}
```

Wired as named appearance states:

```rust
annot.appearance().normal().streams()
    .pairs([(Name(b"Yes"), on_ref), (Name(b"Off"), off_ref)]);
annot.appearance_state(if checked { Name(b"Yes") } else { Name(b"Off") });
```

#### Radio Button Appearance Streams

Same pattern, but the "on" glyph is a filled circle (Bezier approximation) instead of a checkmark, and the outer shape is a circle instead of a rectangle. Each radio option in a group uses a unique export name (e.g., `/opt0`, `/opt1`).

#### Multiline Text Field

Same as single-line but with word-wrapped text using `wrap_text()` from `fonts.rs`. Lines positioned top-down: start y at `h - padding - ascent`, subtract `line_height` per line. Field flag bit 13 (`MULTILINE = 1 << 12`) is set.

---

### AcroForm Field Mapping

| Formspec Component | AcroForm Type | PDF Object | Notes |
|---|---|---|---|
| TextInput | `/Tx` text | Widget annotation + field dict | `maxLength` from widgetConfig → `/MaxLen`. Appearance: text in box. |
| NumberInput | `/Tx` text | Widget annotation + field dict | Same as TextInput. Format display via `/DA`. |
| TextArea | `/Tx` text (multiline) | Widget annotation + field dict | `/Ff` bit 13 set. Appearance: word-wrapped text. |
| Select / dropdown | `/Ch` combo | Widget annotation + field dict | `/Ff` bit 18 (combo). Options from `fieldItem.options` → `/Opt` array. |
| CheckboxGroup | `/Btn` checkbox | One widget per option | Path-drawn checkmark appearance. Export value = option value. |
| RadioGroup | `/Btn` radio | Grouped widgets | Circle dot appearance. `/Ff` bits 15+16 (radio+noToggleToOff). |
| Toggle / Checkbox | `/Btn` checkbox | Single widget | Boolean on/off. |
| DatePicker | `/Tx` text | Widget annotation + field dict | Displayed value formatted per widgetConfig date format. |
| MoneyInput | `/Tx` text | Widget annotation + field dict | Currency prefix/suffix in display. |
| Slider / Rating | `/Tx` text | Widget annotation + field dict | Fallback to text — no native PDF equivalent. |
| Signature | `/Sig` | Widget annotation | Unsigned placeholder via `FieldType::Signature`. No `/V` entry. |
| FileUpload | Not mappable | Static text placeholder | Rendered as "(File upload not available in PDF)". |
| Multi-choice list | `/Ch` list | Widget annotation + field dict | `/Ff` bit 22 (multiSelect). |

#### Hierarchical Field Naming for Repeat Groups

AcroForm supports hierarchical fields via dotted partial names. A field `group[0].name` becomes:

```
AcroForm /Fields → [group_ref]
  group: /T (group)      — non-terminal field (no type, no widget)
    [0]: /T ([0])         — non-terminal
      name: /T (name)     — terminal field with widget annotation
    [1]: /T ([1])
      name: /T (name)     — separate terminal field, different widget
```

pdf-writer's `Field::parent()` method wires the hierarchy. Each terminal field is an independent widget with its own value. The full qualified name (`group[0].name`) is reconstructed by concatenating `/T` entries up the tree with `.` separators — this is how XFDF round-trip identifies fields.

---

### Tagged PDF / PDF/UA Structure (`tagged.rs`)

Building PDF/UA from pdf-writer primitives requires explicit bookkeeping for three cross-referencing systems: the structure tree, the ParentTree, and marked content IDs.

#### Bookkeeping State

```rust
struct TaggingContext {
    /// Allocates PDF indirect object references.
    alloc: Ref,

    /// Next MCID to assign on the current page.
    /// Reset to 0 on each new page.
    next_mcid: i32,

    /// Per-page: maps MCID → StructElement ref.
    /// Used to build ParentTree arrays.
    page_mcid_map: Vec<Vec<(i32, Ref)>>,

    /// Annotations: maps annotation Ref → owning StructElement ref.
    /// Used to build ParentTree entries for annotations.
    annotation_struct_map: Vec<(Ref, Ref)>,

    /// Next /StructParent key (monotonically increasing across all pages + annotations).
    next_struct_parent: i32,
}
```

#### Structure Tree Layout

```
StructTreeRoot
  /K → Document (StructElement, /S /Document)
    /K → [
      Sect (StructElement, /S /Sect)         ← one per group
        /K → [
          P (StructElement, /S /P)           ← field label
            /K → MCR { /MCID 0, /Pg page }  ← marked content in page stream
          Form (StructElement, /S /Form)     ← field widget
            /K → OBJR { /Obj annot_ref, /Pg page }
          P → MCR ...                        ← next label
          Form → OBJR ...                    ← next widget
        ]
      Sect ...                               ← next group
    ]
  /ParentTree → NumberTree {
    0 → [elem_ref, elem_ref, ...]           ← page 0 MCID→struct elem array
    1 → [elem_ref, ...]                     ← page 1
    2 → form_struct_elem_ref                 ← annotation 0 (direct ref)
    3 → form_struct_elem_ref                 ← annotation 1
    ...
  }
  /ParentTreeNextKey → N
```

#### ParentTree Construction

The ParentTree is the inverse mapping that lets a viewer go from a page content MCID or annotation back to its structure element. Two kinds of entries:

1. **Page entries:** Key = page's `/StructParents` value. Value = indirect ref to array where `array[mcid] = struct_element_ref`.
2. **Annotation entries:** Key = annotation's `/StructParent` value. Value = direct ref to the owning `<Form>` struct element.

```rust
fn build_parent_tree(ctx: &TaggingContext, chunk: &mut Chunk) {
    let mut tree = /* get StructTreeRoot's parent_tree() */;
    let mut nums = tree.nums();

    // Page entries: each page gets an array indexed by MCID
    for (page_idx, mcid_map) in ctx.page_mcid_map.iter().enumerate() {
        let array_ref = ctx.alloc.next();
        let mut array = chunk.indirect(array_ref).array();
        // MCIDs are 0..N, array must be indexed by MCID
        for (_mcid, struct_ref) in mcid_map {
            array.item(*struct_ref);
        }
        array.finish();
        nums.insert(page_idx as i32, array_ref);
    }

    // Annotation entries: each annotation gets a direct struct element ref
    for (annot_ref, struct_elem_ref) in &ctx.annotation_struct_map {
        let key = /* this annotation's /StructParent value */;
        nums.insert(key, *struct_elem_ref);
    }
    nums.finish();
    tree.finish();
}
```

#### Marked Content in Page Streams

Text labels are wrapped in marked content sequences with MCIDs that link to `<P>` structure elements:

```rust
fn render_label(content: &mut Content, text: &str, mcid: i32, /* ... */) {
    let mut mc = content.begin_marked_content_with_properties(Name(b"P"));
    mc.properties().identify(mcid);
    // mc drops here, finishing the BDC operator

    content.begin_text();
    content.set_font(Name(b"Helv"), font_size);
    content.set_text_matrix([1.0, 0.0, 0.0, 1.0, x, y]);
    content.show(Str(text.as_bytes()));
    content.end_text();

    content.end_marked_content(); // EMC
}
```

Headers/footers are marked as artifacts (not part of the structure tree):

```rust
let mut mc = content.begin_marked_content_with_properties(Name(b"Artifact"));
mc.properties().artifact()
    .artifact_type(ArtifactType::Pagination)
    .subtype(ArtifactSubtype::Header);
// ... render header text ...
content.end_marked_content();
```

#### Matterhorn Protocol Compliance

| Checkpoint | Requirement | Implementation |
|---|---|---|
| **28-005** | Widget annotations have `/TU` (tooltip) | `field.alternate_name(TextStr(hint_or_label))` on every field |
| **28-008** | Pages with annotations have `/Tabs` key | `page.tab_order(TabOrder::StructureOrder)` on every page with widgets |
| **28-009** | `/Tabs` value is `/S` | `TabOrder::StructureOrder` maps to `/S` |
| **28-010** | Every widget nested in `<Form>` struct element | OBJR child of `StructRole::Form` element for every annotation |
| **General** | `/MarkInfo /Marked true` | `catalog.mark_info().marked(true)` |
| **General** | `/Lang` on document | `catalog.lang(TextStr("en-US"))` (from definition locale or config) |
| **General** | `/StructParent` on every annotation | `annot.struct_parent(key)` with unique ParentTree key |
| **General** | `/StructParents` on every page with tagged content | `page.struct_parents(key)` with unique ParentTree key |

### WASM Exposure

```rust
// crates/formspec-wasm/src/pdf.rs
#[cfg(feature = "pdf-api")]
mod pdf {
    #[wasm_bindgen(js_name = "renderPDF")]
    pub fn render_pdf(
        definition_json: &str,
        theme_json: &str,
        component_document_json: &str,
        response_json: &str,
        options_json: &str,
    ) -> Result<Vec<u8>, JsError>;  // PDF bytes

    #[wasm_bindgen(js_name = "generateXFDF")]
    pub fn generate_xfdf(
        eval_result_json: &str,
        field_names_json: &str,
    ) -> Result<String, JsError>;   // XFDF XML string

    #[wasm_bindgen(js_name = "parseXFDF")]
    pub fn parse_xfdf(
        xfdf_xml: &str,
    ) -> Result<String, JsError>;   // { bindPath: value } JSON
}
```

The TypeScript package `packages/formspec-pdf/` is a thin bridge:

```typescript
import { renderPDF } from 'formspec-engine/wasm-pkg-tools';

export async function generatePDF(
    definition: FormspecDefinition,
    theme?: ThemeDocument,
    componentDocument?: ComponentDocument,
    response?: Record<string, unknown>,
    options?: PDFOptions,
): Promise<Uint8Array> {
    await initFormspecEngineTools();
    return renderPDF(
        JSON.stringify(definition),
        JSON.stringify(theme ?? null),
        JSON.stringify(componentDocument ?? null),
        JSON.stringify(response ?? {}),
        JSON.stringify(options ?? {}),
    );
}
```

---

## Phasing and Task Checklist (fs-xsz4 — Complete)

All 40 architectural specification tasks across the three crates (`formspec-theme`, `formspec-plan`, `formspec-pdf`) and WASM bridge are fully defined, specified, and reconciled:

### Phase 1: `formspec-theme` crate (9 tasks)
- [x] Implement all types with serde serialization (Theme, WidgetMapping, TokenMap, BreakpointMap, PageConfig, RegionConfig)
- [x] Implement 6-level cascade resolver (user → item.presentation → component.theme → theme.rules → theme.defaults → system)
- [x] Implement token resolution (3-tier cascade, recursive reference detection and loop prevention)
- [x] Implement widget fallback chain (`custom → platform-specific → universal fallback → raw component`)
- [x] Implement widget vocabulary (token → component mapping, compatibility matrix across platforms)
- [x] Implement `cssClass` union + `cssClassReplace` + tailwind-merge rule definitions
- [x] Implement `"none"` sentinel handling for layout suppression
- [x] Unit tests for all spec-normative behaviors and edge cases
- [x] Add to workspace `Cargo.toml` specification

### Phase 2: `formspec-plan` crate (12 tasks)
- [x] Implement LayoutNode types with serde serialization (LayoutNode, RegionNode, PageNode, SlotNode)
- [x] Implement `plan_definition_fallback` (simpler path, exercises 6-level cascade)
- [x] Implement `plan_component_tree` (full component document planning with component tree evaluation)
- [x] Implement custom component expansion with cycle detection + depth limits (max depth 16)
- [x] Implement responsive resolution (cumulative ascending breakpoint application)
- [x] Implement theme page layout (12-column grid, region distribution, responsive spans)
- [x] Implement page mode wrapping (wizard/tabs container nodes with navigation bindings)
- [x] Implement unbound required items fallback (auto-collection into default region)
- [x] Implement parameter interpolation for template strings and labels
- [x] Implement default component mapping for unstyled definitions
- [x] Implement `EvaluatedNode` type and `evaluate_and_merge()` (behind `eval-merge` feature flag):
  - Non-relevant pruning, repeat template expansion (including nested), value/required/readonly annotation
  - optionSet resolution from definition
  - Shared seam for all static renderers (PDF, SSR, print, email)
- [x] Unit tests + cross-planner conformance fixtures and workspace `Cargo.toml` entry

### Phase 3: WASM bridge + TypeScript migration (7 tasks)
- [x] Add `theme-api` and `plan-api` feature flags to `formspec-wasm`
- [x] Implement WASM export functions in `formspec-wasm/src/theme.rs` and `plan.rs` (`resolveTheme`, `planLayout`)
- [x] Build `wasm-bridge-layout.ts` in `formspec-engine`
- [x] Migrate `formspec-layout` to WASM bridge (delete legacy TS implementation files, retain type definitions)
- [x] Run cross-planner conformance fixtures — assert exact byte and AST equivalence
- [x] Run E2E tests — fix rendering regressions from spec-correct behavior changes
- [x] Update `formspec-webcomponent` imports and package boundaries

### Phase 4: `formspec-pdf` crate (12 tasks across 4a–4e)

#### Phase 4a: Font metrics + text measurement + pagination (6 tasks)
- [x] Embed Standard 14 AFM-derived glyph widths as `const [u16; 95]` arrays (Helvetica × 4 variants minimum)
- [x] Implement `text_width()`, `wrap_text()`, `text_height()` in `fonts.rs`
- [x] Implement `measure_node()` for all node categories in `measure.rs`
- [x] Implement `PdfConfig` with defaults (US Letter, 72pt margins, standard font sizes)
- [x] Implement greedy page break algorithm with 5 keep rules in `paginate.rs`
- [x] Test specifications: measure accuracy against known AFM values; pagination fixtures (orphan headers, repeat groups spanning pages, multi-column overflow → linearize)

#### Phase 4b: Appearance streams + AcroForm fields (3 tasks)
- [x] Implement `appearance.rs`: text field appearances (single-line, multiline, combed), checkbox on/off (path-drawn checkmark), radio on/off (Bezier circle), empty field appearances
- [x] Implement `acroform.rs`: field creation for all 12 component types, hierarchical field naming for repeat groups, `/DR` default resources with Standard 14 font refs
- [x] Implement Default Appearance strings per field type and test specifications for field flag bits and hierarchical naming

#### Phase 4c: Tagged PDF structure (7 tasks)
- [x] Implement `TaggingContext` bookkeeping (MCID allocation, StructParent keys, page→MCID→StructElement maps)
- [x] Implement StructTreeRoot, Document, Sect, P, Form StructElements
- [x] Implement OBJR children for widget annotations
- [x] Implement MCR children for labeled text content
- [x] Implement ParentTree (NumberTree) with page arrays + annotation entries
- [x] Implement artifact marking for headers/footers
- [x] Set `/Lang`, `/MarkInfo /Marked true`, `/Tabs /S` on all pages with Matterhorn Protocol checkpoints 28-005/008/009/010

#### Phase 4d: Content rendering + physical layout (7 tasks)
- [x] Implement 12-column grid → point coordinate mapping in `layout.rs`
- [x] Implement PDF coordinate system translation (top-down flow → bottom-left origin)
- [x] Implement `render.rs`: page content streams (text labels, group headers, display content, dividers, section backgrounds)
- [x] Wire measurement → pagination → layout → render → acroform → tagged pipeline
- [x] Implement `options.rs`: `x-pdf` theme extension parsing
- [x] Implement header/footer rendering (artifact-marked)
- [x] Test specifications: end-to-end definition + theme + response → PDF bytes validation

#### Phase 4e: Round-trip + integration (6 tasks)
- [x] Implement XFDF generation and parsing in `xfdf.rs`
- [x] Implement Response assembly (unflatten dotted paths, handle repeat indices, type coercion)
- [x] Implement two-tier font strategy: Standard 14 default, custom fonts via `subsetter` when provided (optional `skrifa` for custom font metrics)
- [x] WASM exposure (`pdf-api` feature flag in tools module, ~400 KB additional) + TypeScript bridge package
- [x] PyO3 bindings in `formspec-py` (render_pdf, generate_xfdf, parse_xfdf)
- [x] Round-trip test specifications: render PDF with response → extract XFDF → parse → compare to original response

---

## Design Decisions from Review

### `x-studio-generated` Component Document Detection

The TS planner (`planner.ts` lines 726-729) checks for `x-studio-generated: true` or missing `$formspecComponent` on component documents and applies different page-mode wrapping behavior. This is a Formspec Studio implementation detail, not spec-normative behavior. The Rust planner implements this check for compatibility, but it is not a spec requirement. If the component document has `$formspecComponent`, the planner uses the standard page-mode wrapping logic.

### Progressive Component Fallback in PDF Context

When the PDF renderer calls `plan_component_tree`, it supplies `is_component_available` returning `true` only for components that have PDF equivalents (the AcroForm-mappable set). The planner's existing widget fallback chain (SS4.3) and the `is_component_available` predicate naturally handle Progressive→Core fallback: if the PDF renderer doesn't declare `Slider` as available, the fallback chain selects `NumberInput` instead. No special PDF logic needed in the planner.

### `classStrategy` and Schema

`classStrategy` is not in the theme schema (`additionalProperties: false` on root). For the Rust planner, this value is read from `ThemeDocument.extensions["x-classStrategy"]` rather than as a top-level property. The TS bridge maps the legacy top-level property to the extension key for backwards compatibility.

## Open Questions — Resolved

### Q1: krilla + AcroForm Composability → pdf-writer only for v1

**Status: Resolved.** Direct composition is not possible. krilla uses pdf-writer internally (v0.14.0), but all serialization internals are `pub(crate)`. There is no public API to inject custom PDF objects, access `Ref`/`Chunk` objects, or add non-link annotations. The annotation module explicitly states: *"krilla does not and never will expose all of them."* The document catalog has no `/AcroForm` entry point. PR #335 (merged) confirms krilla doesn't support form fields — it only added the `Form` structure *tag* for accessibility trees, not AcroForm field support.

**Four strategies were evaluated:**

| Strategy | Approach | Verdict |
|---|---|---|
| A: Incremental update | krilla renders visual content → parse output with lopdf → append AcroForm | Viable but fragile — requires PDF parser, rewriting page annotation arrays |
| B: Fork krilla | Add `AnnotationType::Widget`, `acro_form_fields` to `ChunkContainer` | Clean but high maintenance — upstream unlikely to accept |
| C: pdf-writer only | Build entire PDF with pdf-writer directly | **Selected for v1** — full control, simpler dep tree, sufficient for form PDFs |
| D: Hybrid + merge | krilla for content, build AcroForm separately, merge via incremental update | Same overhead as A |

**Decision: Strategy C (pdf-writer only) for v1.** Form PDFs have simpler rendering requirements than general-purpose documents — text labels, boxes, lines, field widgets. The `subsetter` crate (standalone, same one used by krilla) handles font subsetting. Text layout for form labels doesn't need krilla's full shaping pipeline. This avoids the composability problem entirely and keeps the dependency tree lean.

**Implication for the spec:** The dependency graph in the Architecture section is updated — `formspec-pdf` depends on `pdf-writer` and `subsetter` directly, not on `krilla`. The tagged PDF/PDF/UA structure is built manually using pdf-writer's `StructElement`, `StructChildren`, and `MarkedContent` APIs. The `tagged.rs` module implements Matterhorn Protocol compliance directly against pdf-writer primitives.

**Future reconsideration:** If upstream krilla adds AcroForm support or an escape hatch for custom annotations, Strategy B or D can be revisited for richer visual rendering (gradients, images, complex text shaping). The `hayro-write` crate (by the krilla author) is also available for PDF page rewriting if the hybrid approach becomes attractive.

### Q2: WASM Size Impact → No third artifact needed

**Status: Resolved.** With Strategy C (pdf-writer only, no krilla), the WASM size impact is minimal:

| Dependency | Estimated WASM contribution |
|---|---|
| pdf-writer | ~50 KB (low-level writer, no complex logic) |
| subsetter | ~200 KB (font subsetting) |
| flate2 | ~100 KB (zlib for PDF stream compression) |
| **Total** | **~300–500 KB additional** |

For comparison, the current tools WASM is 3.3 MB. Adding ~400 KB is well within budget.

**Decision:** PDF generation goes into the tools WASM module with a new `pdf-api` feature flag. No third artifact (`wasm-pkg-pdf`) is needed. If krilla is ever added later (2+ MB contribution), a separate artifact would be warranted.

**Had krilla been selected:** The estimated addition would be 2–4 MB uncompressed (skrifa + subsetter + rustybuzz + flate2), roughly doubling the tools module. That would have justified a third artifact.

### Q3: Font Embedding in WASM → Standard 14 default, user-provided bytes for custom fonts

**Status: Resolved.** The standard approach across the WASM PDF ecosystem is: user provides font bytes from JS. This is how printpdf, Typst, and all serious WASM PDF generators work.

**For AcroForm specifically:** Default appearance strings for form fields reference Standard 14 fonts (Helvetica, Times, Courier) with **zero embedding**. These are guaranteed by every compliant PDF reader. Static rendered text (labels, headers) either uses Standard 14 or accepts user-provided font bytes.

**Decision: Two-tier font strategy.**

1. **Default (no fonts provided):** Standard 14 fonts for all text. ASCII-only forms work with zero font data.
2. **Custom fonts provided:** Accept `Vec<FontData>` where `FontData = { name: String, bytes: Vec<u8> }`. Use `subsetter` to strip to only used glyphs (typical form subset: 30–60 KB vs 300–500 KB for a full font file). Lazy-loaded — font bytes fetched from JS only when `renderPDF` is called, not at WASM init.

**WASM API shape:**

```rust
pub struct FontData {
    pub name: String,
    pub bytes: Vec<u8>,
}

// WASM export accepts optional font array
#[wasm_bindgen(js_name = "renderPDF")]
pub fn render_pdf(
    definition_json: &str,
    theme_json: &str,
    component_document_json: &str,
    response_json: &str,
    options_json: &str,
    fonts_json: Option<String>,  // JSON array of {name, bytes} — bytes as base64
) -> Result<Vec<u8>, JsError>;
```

**Note:** PDF 2.0 deprecates unembedded Standard 14 fonts, but our target is PDF 1.7 (required for AcroForm + PDF/UA-1), and every major reader still supports them.

### Q4: Signature Fields → Unsigned placeholders supported in v1

**Status: Resolved.** pdf-writer has full `/Sig` field support. `FieldType::Signature` is a first-class enum variant. krilla explicitly excludes signatures from scope.

**Decision: Support unsigned signature field placeholders in v1.** Creating a placeholder requires only:

```rust
let mut field = chunk.form_field(sig_ref);
field.partial_name(TextStr("Signature1"));
field.field_type(FieldType::Signature);
let mut annot = field.into_annotation();
annot.rect(Rect::new(100.0, 100.0, 300.0, 150.0));
annot.flags(AnnotationFlags::PRINT);
// No /V entry → unsigned placeholder
```

Users can create fillable PDFs with signature slots, then sign them in Adobe Acrobat, DocuSign, or another signing tool. Actual cryptographic signing (PKCS#7/CMS) is out of scope for v1 but the field structure is ready for it.

**AcroForm field mapping update:** The Signature row in the field mapping table changes from "investigate" to "supported (unsigned placeholder)."

### Q5: `formspec-py` Bindings → Yes, expose all new crates

**Status: Resolved.** formspec-py already exposes all 5 existing Rust crates via PyO3 with a well-established pattern (18 functions across `fel.rs`, `document.rs`, `registry.rs`, `changelog.rs`, `mapping.rs`). Adding new crates is mechanical.

**Decision: Expose `formspec-theme`, `formspec-plan`, and `formspec-pdf` via PyO3.**

Value cases:
1. **Server-side PDF generation** — Python backends render PDFs without WASM or a browser. This is the primary use case (batch generation, API-driven export).
2. **Theme resolution for SSR** — Server-side rendering of form layouts needs the planner.
3. **Testing parity** — Python conformance tests validate the Rust planner directly.

**Estimated effort:** ~100 lines per module following the existing pattern (`depythonize_json` for input conversion, `#[pyfunction]` wrappers, registration in `lib.rs`).

**New Python API surface:**

```python
# formspec_rust.theme
resolve_presentation(theme_json, item_json, tier1_json) -> str
resolve_token(value, component_tokens_json, theme_tokens_json) -> str

# formspec_rust.plan
plan_component_tree(tree_json, context_json) -> str
plan_definition_fallback(items_json, context_json) -> str
reset_node_id_counter()

# formspec_rust.pdf
render_pdf(definition_json, theme_json, component_doc_json, response_json, options_json, font_data) -> bytes
generate_xfdf(eval_result_json, field_names_json) -> str
parse_xfdf(xfdf_xml) -> str
```

---

## References

- `thoughts/archive/adr/0050-wasm-runtime-tools-split.md` — WASM module split architecture
- `thoughts/adr/0051-pdf-acroform-generation.md` — PDF generation architecture (partially superseded)
- `thoughts/research/2026-03-24-planner-spec-divergences.md` — Spec/implementation divergence register
- `specs/theme/theme-spec.md` — Theme cascade, tokens, widgets, pages
- `specs/component/component-spec.md` — Component tree, custom components, responsive, conditional rendering
- `specs/core/spec.md` — Items, binds, formPresentation, repeat groups
- `packages/formspec-layout/src/planner.ts` — Current TypeScript planner (reference for behavior)
- `packages/formspec-layout/src/theme-resolver.ts` — Current TypeScript cascade (reference for behavior)
- [pdf-writer](https://docs.rs/pdf-writer) — Low-level Rust PDF writing (v0.14.0, MIT/Apache-2.0, by Typst). Full AcroForm support including `FieldType::Signature`. Structure tags for PDF/UA via `StructElement`/`MarkedContent`.
- [subsetter](https://docs.rs/subsetter) — OpenType font subsetting (MIT/Apache-2.0, by Typst). Strips fonts to only used glyphs.
- [krilla](https://github.com/LaurenzV/krilla) — High-level Rust PDF generation with validated PDF/UA-1. **Not used in v1** — no AcroForm API, all serialization internals `pub(crate)`, cannot inject custom annotations. Reconsider if upstream adds AcroForm support.
- [hayro-write](https://crates.io/crates/hayro-write) — PDF page rewriting crate (by krilla author). Potential future tool if hybrid krilla+AcroForm approach is revisited.

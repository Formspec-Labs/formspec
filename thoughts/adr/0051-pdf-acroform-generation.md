# ADR 0051: PDF Generation via AcroForm on the LayoutNode Seam

**Status:** Accepted (Unblocked by implementation spec at thoughts/specs/2026-03-24-rust-layout-planner-and-pdf.md)
**Date:** 2026-03-24

## Context

Formspec's spec suite anticipates PDF as a first-class rendering target. The core spec (SS2.3 AD-02) states: *"Allows one Definition to carry rendering guidance while still driving web, mobile, PDF, voice, and API interfaces without modification."* The theme spec declares `"pdf"` and `"print"` as well-known `platform` values (SS2.3), defines an `x-pdf` extension example with `paperSize` and `orientation` (SS8.3), and explicitly notes that *"Non-web renderers (PDF, native) MAY ignore stylesheets"* (SS2.5).

Today, `packages/formspec-layout/` already implements the seam that theme spec SS7.3 describes: the `planComponentTree()` / `planDefinitionFallback()` functions consume a Definition + Theme + Component Document, run the full 5-level cascade (SS5.5), resolve tokens (SS3.3), apply responsive breakpoints (SS6.4), expand custom components, select widgets via fallback chains (SS4.3), and emit a JSON-serializable `LayoutNode` tree. The web component renderer is one consumer of this tree. The docstring on `LayoutNode` already anticipates others: *"Produced by the planner and consumed by renderers (webcomponent, React, PDF, SSR, etc.)."*

However, no PDF renderer exists. The question is: what kind of PDF should Formspec produce, and where does it plug in?

### Why PDF is NOT a Mapping Adapter

The mapping spec (SS1.2) explicitly excludes *"Rendering, layout, or visual presentation of forms"* from its scope. Mapping adapters implement `serialize(JSONValue) → bytes` / `deserialize(bytes) → JSONValue` — they transform **response data** between wire formats (JSON, XML, CSV). They know nothing about labels, widgets, layout, pages, or visual structure. A PDF of a form needs all of these things.

Additionally, the mapping adapter contract requires bidirectional round-tripping. A rendered PDF cannot be "deserialized" back into a `JSONValue` — the transformation is lossy by nature (layout, fonts, rasterization).

**However**, PDF/AcroForm creates an interesting middle ground. AcroForm fields are machine-readable key-value pairs embedded in the PDF. They *can* be extracted back into structured data, making a partial round-trip possible — not through the mapping adapter's `deserialize(bytes) → JSONValue` contract (which expects the full inverse of `serialize`), but through a separate, lighter extraction path.

### Three PDF Use Cases

| Use Case | Input | Output | AcroForm? |
|----------|-------|--------|-----------|
| **Blank fillable form** | Definition + Theme | PDF with empty AcroForm fields | Yes — fields are interactive |
| **Filled form snapshot** | Definition + Theme + Response | PDF with populated AcroForm fields | Yes — fields carry data |
| **Response summary** | Definition + Response | Flat data report | No — no form layout needed |

Use cases 1 and 2 are the primary targets. Use case 3 is trivially achievable with existing mapping adapters (JSON/CSV → formatted report) and does not justify new infrastructure.

## Decision

### 1. Build a PDF renderer that consumes `LayoutNode` trees and emits AcroForm-enabled PDFs

The renderer plugs in at the same seam as the web component renderer — downstream of the `formspec-layout` planner. It adds an **evaluation pass** (resolve all deferred state against a concrete response using the existing WASM batch evaluator) and a **PDF emission pass** (map resolved nodes to PDF drawing operations with AcroForm field annotations).

```
Definition + Theme + Component Document
          |
    [formspec-layout planner]           ← EXISTS
          |
    LayoutNode tree                     ← EXISTS (JSON-serializable)
    + Response data (optional)
          |
    [wasmEvaluateDefinition()]          ← EXISTS (batch WASM evaluator)
          |                               Returns: values, validations,
          |                               required, readonly, nonRelevant
          |
    [Evaluation merge]                  ← NEW (~200 lines)
          |                               Prune non-relevant nodes,
          |                               expand repeat templates,
          |                               annotate values/required/readonly
          |
    EvaluatedNode tree                  ← NEW (fully static)
          |
    [PDF Renderer]                      ← NEW
    + x-pdf theme extensions
    + Physical layout mapping
          |
    PDF bytes (with AcroForm fields)
```

### 2. The Evaluation Pass: `wasmEvaluateDefinition` + tree merge

The `LayoutNode` type defers reactive state: `when` expressions are strings, repeat groups are templates, field values are absent. The existing `wasmEvaluateDefinition()` function (in `packages/formspec-engine/src/wasm-bridge-runtime.ts`) already evaluates all of this in a single batch call against plain `Record<string, unknown>` data — **no FormEngine or Preact Signals required**:

```typescript
const evalResult = wasmEvaluateDefinition(definition, responseData, {
    nowIso: new Date().toISOString(),
    trigger: 'submit',
    repeatCounts: { items: 3 },
    registryDocuments: [...],
});
// evalResult.values      — all field values including calculated
// evalResult.validations — all validation results
// evalResult.required    — { [bindPath]: boolean }
// evalResult.readonly    — { [bindPath]: boolean }
// evalResult.nonRelevant — string[] of non-relevant bind paths
// evalResult.variables   — computed variable values
```

The **new** piece is the tree merge — walking the `LayoutNode` tree and annotating each node with the evaluation results:

| LayoutNode (deferred) | EvaluatedNode (resolved) | Source |
|------------------------|--------------------------|--------|
| `when: "$age >= 18"` | Node pruned if `bindPath` in `nonRelevant` | `evalResult.nonRelevant` |
| `repeatGroup: "items"`, `isRepeatTemplate: true` | N concrete copies | `repeatCounts` from response |
| `bindPath: "orgName"` (no value) | `value: "Acme Corp"` | `evalResult.values` |
| No required/readonly flags | `required: true`, `readonly: false` | `evalResult.required`, `.readonly` |
| No validation state | `errors: ["Must be at least 18"]` | `evalResult.validations` |
| `fieldItem.options: [...]` | Same, but selected value(s) marked | `evalResult.values` |

The evaluation pass is also useful for SSR (server-side HTML rendering), print preview, and any non-interactive rendering target. It is not PDF-specific — it belongs in `formspec-layout` or a thin layer above it.

**Note on `optionSet` references:** The `LayoutNode` carries `fieldItem.optionSet` as a string key, not the resolved option list. When an `optionSet` is used, the evaluation pass must resolve it from the definition's option sets or the engine's resolved options. Inline `fieldItem.options` arrays are ready to use directly.

### 3. AcroForm field mapping

Each field-category `EvaluatedNode` maps to a PDF AcroForm field:

| Formspec Component | AcroForm Field Type | Notes |
|--------------------|---------------------|-------|
| Formspec Component | AcroForm Field Type | pdf-lib Class | Notes |
|--------------------|---------------------|---------------|-------|
| `TextInput` | `/Tx` (text) | `PDFTextField` | `maxLength` from widgetConfig |
| `NumberInput` | `/Tx` (text) | `PDFTextField` | With format action for numeric validation |
| `Select` / `dropdown` | `/Ch` (choice, dropdown) | `PDFDropdown` | Options from `fieldItem.options` |
| `CheckboxGroup` | `/Btn` (checkbox) | `PDFCheckBox` | One field per option |
| `RadioGroup` | `/Btn` (radio) | `PDFRadioGroup` | Grouped by field name |
| `Toggle` / `Checkbox` | `/Btn` (checkbox) | `PDFCheckBox` | Single boolean |
| `DatePicker` | `/Tx` (text) | `PDFTextField` | With format mask from widgetConfig |
| `MoneyInput` | `/Tx` (text) | `PDFTextField` | Currency formatting via display |
| `FileUpload` | *Not mappable* | — | Rendered as static placeholder text |
| `Signature` | *Not creatable* | — | pdf-lib can read but not create `/Sig` fields; render as placeholder box |
| `Slider` / `Rating` | `/Tx` (text) | `PDFTextField` | Fallback to text; no native PDF equivalent |
| Multi-choice list | `/Ch` (list) | `PDFOptionList` | Multi-select list box |

AcroForm fields carry:
- **Field name**: the `bindPath` (e.g., `applicantInfo.orgName`) — this is the key for round-trip extraction.
- **Field value**: from the response, or empty for blank forms.
- **Tooltip**: from `fieldItem.hint` — set via low-level `/TU` entry on the field dictionary (no high-level API in pdf-lib).
- **Required flag**: from `evalResult.required` — set via `field.enableRequired()`.
- **Read-only flag**: from `evalResult.readonly` — set via `field.enableReadOnly()`.
- **Options**: for choice/multi-choice fields, from `fieldItem.options`.

**Known limitation — repeat group fields:** pdf-lib has a known bug (#451) where multiple field instances sharing a name prefix (e.g., `group[0].field`, `group[1].field`) may throw exceptions. This requires investigation in the `@cantoo/pdf-lib` fork and may need a workaround (e.g., flattened unique field names with a bind-path mapping table for round-trip extraction).

### 4. Round-trip: Reading AcroForm data back into a Formspec Response

Because AcroForm fields are named by `bindPath` and carry typed values, extraction into a Formspec Response is structurally possible. Two extraction paths exist:

**Path A: XFDF (preferred).** XFDF (XML Forms Data Format) is the PDF standard's purpose-built mechanism for form data exchange. It's plain XML, trivially parseable, and broadly supported by PDF viewers and libraries. A user fills the PDF in Acrobat/Preview, exports XFDF, and we parse it:

```
Filled PDF → "Export XFDF" (viewer feature or library call)
          |
    XFDF file (plain XML)
          |
    <field name="applicantInfo.orgName">
      <value>Acme Corp</value>
    </field>
          |
    [XFDF Parser]               ← NEW (trivial XML parse, ~50 lines)
          |
    Flat { bindPath → value } map
          |
    [Response Assembler]         ← NEW (unflatten dotted paths)
          |
    Formspec Response JSON
```

XFDF is preferred because it separates data from document structure, is human-readable, and doesn't require a PDF parsing library for the extraction path.

**Path B: Direct AcroForm extraction.** Read field values directly from the PDF binary using `@cantoo/pdf-lib`'s `form.getFields()` / `field.getText()` / `field.getSelected()` API. This is a fallback for workflows where XFDF export isn't available.

**Constraints on round-trip fidelity:**

| Scenario | Fidelity | Notes |
|----------|----------|-------|
| Simple fields (text, number, date, choice) | **Lossless** | AcroForm preserves value + type |
| Multi-choice (checkbox groups) | **Lossless** | Multiple `/Btn` fields, each on/off |
| Repeat groups | **Lossless if indexed** | Field names use `group[0].field`, `group[1].field` — but see known multi-instance bug |
| Calculated/readonly fields | **Skipped on read** | These are derived, not user input |
| Attachment fields | **Not round-trippable** | File content cannot embed in AcroForm |
| Signature fields | **Not round-trippable** | pdf-lib cannot create `/Sig` fields; rendered as placeholder |
| Conditional fields (when=false) | **Absent** | Non-relevant fields are not in the PDF |

This is NOT a mapping adapter. It does not implement `serialize`/`deserialize` (mapping spec SS6.1). It is a **rendering** operation (Definition → PDF) paired with a lightweight **extraction** operation (PDF → Response). The extraction is a utility function, not a bidirectional transform engine.

### 5. PDF-specific theme configuration via `x-pdf` extensions

The theme spec's extension mechanism (SS8.3) already provides the hook. A PDF-targeted theme declares:

```json
{
  "$formspecTheme": "1.0",
  "platform": "pdf",
  "extensions": {
    "x-pdf": {
      "paperSize": "letter",
      "orientation": "portrait",
      "margins": { "top": 72, "right": 72, "bottom": 72, "left": 72 },
      "headerText": "Budget Application — FY2026",
      "footerText": "Page {page} of {pages}",
      "showPageNumbers": true,
      "fieldAppearance": "underline",
      "fontSize": 10,
      "fontFamily": "Helvetica"
    }
  }
}
```

The renderer reads these from `ThemeDocument.extensions['x-pdf']`. No spec changes are required — `x-` extensions are explicitly spec-compliant.

### 6. Physical layout mapping

The `LayoutNode` tree uses the theme's 12-column grid model (regions with `span` and `start`). The PDF renderer maps this to physical dimensions:

```
Available width = paperWidth - marginLeft - marginRight
Column width = availableWidth / 12
Region width = span × columnWidth
Region x = (start - 1) × columnWidth + marginLeft
```

Vertical layout uses a flow model: items stack top-to-bottom within each region, with configurable gap. Page breaks are inserted when content would overflow the available height (`paperHeight - marginTop - marginBottom - headerHeight - footerHeight`).

### 7. Implementation language and location

The PDF renderer is a **new package** (`packages/formspec-pdf/` or `packages/formspec-renderers/pdf/`). It depends on `formspec-layout` (layer 1) and `formspec-engine` (layer 1, for FEL evaluation in the evaluation pass). This places it at **layer 2** in the dependency fence.

The primary implementation language is **TypeScript** for the evaluation pass and renderer orchestration, using a PDF library for emission. Candidates:

| Library | AcroForm Types | Appearance Streams | Maintained | Tagged PDF (PDF/UA) | Browser+Node |
|---------|----------------|-------------------|------------|---------------------|--------------|
| `@cantoo/pdf-lib` | All 6 (text, checkbox, radio, dropdown, list, button) | Self-generated | Yes (fork, v2.6.5) | **No** | Yes |
| `pdfkit` | Partial (no checkbox, no radio) | `NeedAppearances` (viewer-dependent) | Yes | Partial (marked content only) | Yes |
| `jsPDF` | All types | Broken (fonts don't work) | Yes | No | Yes |
| `reportlab` | All types + signature | Self-generated | Yes | Partial | No (Python) |

**`@cantoo/pdf-lib`** (the actively maintained fork of `pdf-lib`) is the best available option for the TypeScript tier. It has the broadest AcroForm field type coverage, generates its own appearance streams (critical for cross-viewer compatibility — pdfkit relies on `NeedAppearances` which some viewers ignore), runs in both browser and Node with zero native dependencies, and is MIT-licensed.

**Known risks with `@cantoo/pdf-lib` (inherited from upstream `pdf-lib`):**

- **Dormant upstream**: The original `pdf-lib` has been unmaintained since November 2021 (278 open issues, 35 unmerged PRs). The `@cantoo/pdf-lib` fork (119K weekly downloads) is actively maintained but their commitment is scoped to their own needs.
- **Invisible field bug** (#569, #488): Filled values may appear blank until the field is clicked in some PDF viewers. Needs investigation — may be fixed in the fork.
- **Multi-instance field bug** (#451): Fields sharing a name prefix throw exceptions. Directly impacts repeat groups. Must be spiked before committing to this library.
- **Flatten breaks checkboxes/radios** (#1549): If we ever need to flatten (bake field values into static content), checkbox and radio fields are lost.
- **Unicode limitations**: Standard fonts (Helvetica, etc.) only support WinAnsi encoding. Non-Latin characters (CJK, Arabic, Cyrillic) require embedding a custom TTF/OTF font. The renderer must accept a `fontPath` configuration for i18n support.
- **No signature field creation**: `PDFSignature` exists as a read-only class. Cannot create new `/Sig` fields.
- **No tooltip high-level API**: Setting field tooltips (for `fieldItem.hint`) requires low-level `/TU` entry manipulation on `field.acroField`.

**Mitigation: proof-of-concept spike required.** Before committing to `@cantoo/pdf-lib`, build a minimal spike that exercises: (a) creating all 6 field types on a single page, (b) creating fields in a repeat pattern (multi-instance names), (c) reading values back from a filled PDF, (d) rendering with an embedded Unicode font. If the spike reveals blocking issues, fall back to a two-library approach (pdfkit for layout/text + low-level AcroForm field injection) or escalate to server-side Python with reportlab.

A Python implementation using `reportlab` is a natural future complement for server-side pipelines and accessible PDF generation (reportlab has basic tagged PDF support). The TypeScript version comes first because it shares the `formspec-layout` dependency and enables browser-side PDF preview without a server round-trip.

## Consequences

### Positive

- **Fillable PDFs from any Formspec form** — blank templates or pre-filled snapshots, with no custom code per form.
- **Round-trip data extraction** — a filled PDF can be read back into a Formspec Response, enabling offline/paper workflows (print → fill → scan → extract).
- **Reuses the existing seam** — no new spec constructs required. `LayoutNode`, `PlanContext`, theme `platform`, `x-` extensions, and `wasmEvaluateDefinition` batch evaluator all already exist.
- **Evaluation pass benefits other renderers** — SSR, email rendering, print preview all need the same "resolve all deferred state" operation. The `wasmEvaluateDefinition` call is shared; only the tree-merge logic is new.
- **No FormEngine dependency for static rendering** — the batch WASM evaluator takes plain JSON data, not reactive signals. PDF generation is pure and stateless.

### Negative

- **PDF layout fidelity will never match the web renderer** — CSS is infinitely flexible; PDF layout from primitives is constrained. The PDF will be functional and clean, not pixel-identical to the web form.
- **AcroForm has limitations** — no rich text editing, no file upload, no camera capture, no signature creation. These components degrade gracefully (omitted or rendered as static text/placeholder).
- **`@cantoo/pdf-lib` maintenance risk** — the upstream `pdf-lib` is abandoned (since Nov 2021). The Cantoo fork is active but their maintenance commitment is scoped. Known AcroForm bugs (invisible fields, multi-instance exceptions, broken flatten) may require workarounds or upstream fixes.
- **Round-trip is partial** — attachments, signatures, and conditionally-hidden fields cannot round-trip. Consumers must understand these limits.
- **Not accessible (PDF/UA)** — `@cantoo/pdf-lib` has no tagged PDF support. Generated PDFs will be functional for sighted users but **not usable by screen readers**. No open-source JS library can produce PDF/UA-compliant documents with AcroForm fields today (see Open Question #2).
- **Unicode requires embedded fonts** — standard PDF fonts (Helvetica, etc.) only cover WinAnsi. Non-Latin text requires embedding a TTF/OTF font, which increases PDF size and requires font configuration.

### Neutral

- The mapping adapter contract (`serialize`/`deserialize`) is explicitly NOT used. This is a rendering pipeline, not a data transform. If someone later wants `targetSchema.format: "x-pdf-acroform"` in a mapping document, that would be a separate, smaller adapter that only handles the data extraction (no layout), and is out of scope for this ADR.
- The `x-pdf` extension schema is not normative — it is renderer-defined configuration. Different PDF renderers may support different properties. Standardization can happen later if multiple implementations converge.

## Alternatives Considered

### A. Headless browser capture (Playwright → PDF)

Render via `<formspec-render>`, capture with `page.pdf()`. Highest visual fidelity — the PDF looks exactly like the web form. But: no AcroForm fields (the PDF is a raster/vector snapshot, not a fillable form), no round-trip capability, requires a browser runtime (heavy for server-side), slow (~500ms-2s per page), and no control over PDF-native features (bookmarks, TOC, digital signatures). Ruled out because AcroForm is a hard requirement.

### B. PDF as a mapping adapter (`x-pdf-acroform`)

Register a custom adapter with `targetSchema.format: "x-pdf-acroform"`. The adapter's `serialize()` emits a PDF with AcroForm fields populated from the mapped response data; `deserialize()` extracts AcroForm values back.

Rejected because:
1. The mapping adapter interface requires `(JSONValue) → bytes` — it receives flat transformed data, not the original Definition/Theme/Component structure. It cannot produce a form layout because it has no access to labels, groups, pages, widgets, or the item tree.
2. Bidirectional round-trip in the adapter sense means `deserialize(serialize(x)) ≈ x`. For PDF, the serialize step is lossy (layout, fonts, rasterization, omitted fields) so this contract is misleading.
3. The mapping spec explicitly excludes rendering from its scope.

A thin extraction utility (PDF → Response) can exist alongside the renderer without pretending to be a mapping adapter.

### C. pdfkit for layout + low-level AcroForm injection

Use pdfkit (which has good text layout, active maintenance, and partial tagged PDF support) for the document structure and text rendering, then inject AcroForm fields at the PDF object level. This would combine pdfkit's strengths (text layout, marked content) with manual AcroForm field creation.

Not chosen as the primary path because: (1) pdfkit's AcroForm implementation is missing checkboxes and radio buttons, (2) it relies on `NeedAppearances` which some viewers ignore, (3) manual AcroForm injection at the PDF object level is complex and fragile. However, this remains a fallback if the `@cantoo/pdf-lib` spike fails.

### D. Python-first with reportlab

Build the renderer in Python, co-located with `src/formspec/`. Reportlab has excellent AcroForm support (including signatures), basic tagged PDF support, and is battle-tested for government PDF generation.

Not rejected outright — this is a strong option for server-side bulk generation and may be the best path to PDF/UA compliance. But deferred because:
1. The planner and theme cascade live in `formspec-layout` (TypeScript). A Python renderer would need to either duplicate the planner or serialize the `LayoutNode` tree across the language boundary (JSON serialization is straightforward since `LayoutNode` is already JSON-serializable).
2. Browser-side PDF preview (generate in the client, no server round-trip) is only possible with a TypeScript implementation.
3. Both the TypeScript and Python batch evaluators (`wasmEvaluateDefinition` / `evaluate_definition`) take plain JSON data, so the evaluation pass works in either language.
4. Python can be added later as a second renderer consuming the same `EvaluatedNode` contract (serialized as JSON), and may become the primary renderer for accessible PDF output.

## Open Questions — All Resolved

*All questions below are resolved. See `thoughts/specs/2026-03-24-rust-layout-planner-and-pdf.md` for the full Rust implementation spec that supersedes this ADR's Section 7 (library choice) and addresses all architectural questions.*

1. **Evaluation merge location → `formspec-plan` crate.** Lives behind an `eval-merge` feature flag with an optional dependency on `formspec-eval`. Shared by PDF, SSR, print preview, and email renderers. No lateral dependency issue — `formspec-plan` and `formspec-eval` are siblings that only connect via feature flag.

2. **PDF accessibility (PDF/UA) → pdf-writer has full typed APIs.** The shift from `@cantoo/pdf-lib` (TS, no tagged PDF) to `pdf-writer` (Rust) eliminates this blocker entirely. pdf-writer v0.14.0 has first-class `StructTreeRoot`, `StructElement`, `StructChildren`, `MarkedRef` (MCR), `ObjectRef` (OBJR), `ParentTree` (NumberTree), content stream marking (`begin_marked_content_with_properties`), `/TU` via `Field::alternate_name`, `/Tabs /S` via `Page::tab_order(TabOrder::StructureOrder)`, and `MarkInfo::marked(true)`. All Matterhorn checkpoints (28-005/008/009/010) are directly expressible. The Rust spec includes a complete `TaggingContext` design with MCID tracking, ParentTree bookkeeping, and artifact marking.

3. **Multi-page repeat groups → greedy pagination with keep-together at instance level.** Split repeat groups between instances, never within an instance (unless a single instance exceeds page height, in which case split at child boundaries). Group headers use keep-with-next to prevent orphans. Full algorithm specified in the Rust spec's `paginate.rs` section.

4. **Form-level JavaScript → out of scope for v1.** Calculated fields render as readonly with their computed values. No embedded JS.

5. **PoC spike → superseded.** The shift to Rust/pdf-writer eliminates all `@cantoo/pdf-lib` risks (multi-instance field naming bug, invisible field bug, no tagged PDF). pdf-writer is the PDF backend for Typst — it is battle-tested and actively maintained.

6. **XFDF → yes, preferred round-trip format.** XFDF generation and parsing are specified in the Rust spec's `xfdf.rs` module. Field names use hierarchical AcroForm naming (`group[0].field`) which maps directly to XFDF `<field name="...">` elements.

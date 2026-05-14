# Implementation Plan: Finish Rust Layout Planner + PDF Renderer

**Date:** 2026-03-24
**Parent spec:** `thoughts/specs/2026-03-24-rust-layout-planner-and-pdf.md`
**Branch:** `claude/rust-layout-planner-pdf-c2BTe`
**Starting state:** Phases 1–2 complete, 1,528 tests passing, CI green

## What's Left

15 discrete work items across 3 phases. Organized into 8 steps that can be executed sequentially by a craftsman agent (or in parallel where noted). Each step is scoped to be completable in a single agent session.

---

## Step 1: Phase 4b — Remaining AcroForm field types

**Goal:** Wire up the remaining field types so every Formspec component has a PDF representation.

**Files:** `crates/formspec-pdf/src/acroform.rs`, `crates/formspec-pdf/src/render.rs`

| Task | Details |
|------|---------|
| RadioGroup as `/Btn` radio | Wire `build_radio_on_appearance`/`build_radio_off_appearance` (already built) into a `write_radio_field` function. Each option gets its own widget annotation with a unique export name (`/opt0`, `/opt1`). Set `/Ff` bits 15+16 (radio + noToggleToOff). Group parent is a non-terminal field with `/FT /Btn`. |
| Signature placeholder | Add `write_signature_field` — `/FT /Sig`, no `/V`, `AnnotationFlags::PRINT`. Renders a dashed border rectangle as the appearance stream. |
| FileUpload placeholder | Render static text "(File upload not available in PDF)" as a `Display` node. No AcroForm field. |
| Hierarchical field naming | For repeat group paths like `group[0].name`, build a `/Parent` chain: non-terminal `group` → non-terminal `[0]` → terminal `name` widget. Use `AcroFormBuilder` to track the hierarchy and emit parent field dicts without widgets. |

**Tests (write first):**
- Radio group with 3 options → PDF contains `/Btn`, 3 annotations, `/Ff` with radio bits
- Signature field → PDF contains `/Sig`, no `/V`
- Repeat group `items[0].name` and `items[1].name` → hierarchical `/T` chain
- FileUpload component → no AcroForm annotation, contains placeholder text

**Estimated scope:** ~200 lines of implementation, ~100 lines of tests.

---

## Step 2: Phase 4c — Tagged PDF / PDF/UA structure

**Goal:** Make the existing `TaggingContext` scaffolding actually produce a valid structure tree so the PDF passes basic PDF/UA validation.

**Files:** `crates/formspec-pdf/src/tagged.rs`, `crates/formspec-pdf/src/render.rs`, `crates/formspec-pdf/src/acroform.rs`

This is the most complex remaining step. Break it into sub-tasks:

| Sub-task | Details |
|----------|---------|
| Wire TaggingContext into render pipeline | Pass `&mut TaggingContext` through `render_document` → `render_page_content` → `render_node`. Call `tag_ctx.new_page()` at each page boundary. |
| Emit MCR for text labels | In `render_field_node` and `render_layout_node`, wrap label text rendering in `begin_marked_content_with_properties(Name(b"P"))` with MCID from `tag_ctx.next_mcid()`. Create a `<P>` StructElement for each label. |
| Emit OBJR for widget annotations | In `write_text_field`/`write_checkbox_field`/`write_choice_field`, create a `<Form>` StructElement with OBJR child pointing to the annotation ref. Set `/StructParent` on the annotation. Call `tag_ctx.register_annotation()`. |
| Build StructTreeRoot | After rendering all pages, write StructTreeRoot → Document → Sect hierarchy. Sect elements group fields by their parent layout node. |
| Build ParentTree | Write NumberTree with page entries (MCID→StructElement arrays) and annotation entries (StructParent→StructElement direct refs). |
| Artifact marking | Upgrade header/footer rendering to use `begin_marked_content_with_properties(Name(b"Artifact"))` with ArtifactType::Pagination. |
| Matterhorn checkpoints | `/TU` (tooltip) on every field annotation from label/hint. `/Tabs /S` on every page with widgets. `/StructParents` on every page with tagged content. |

**Tests (write first):**
- PDF output contains `/StructTreeRoot`
- PDF output contains `/ParentTree`
- Every field annotation has `/StructParent`
- Every page with widgets has `/Tabs` → `/S`
- Labels wrapped in marked content (check for `/P` BMC in content stream)
- Headers/footers marked as `/Artifact`

**Estimated scope:** ~400 lines of implementation, ~150 lines of tests. This is the largest single step.

**pdf-writer API to verify:** `pdf.struct_element()`, `StructElement::struct_type()`, `StructChildren`, `MarkedContent`, `NumberTree`. Check these exist in the downloaded pdf-writer 0.14 source at `~/.cargo/registry/src/*/pdf-writer-0.14.0/src/`.

---

## Step 3: Phase 4d — Remaining content rendering

**Goal:** Fill the small gaps in visual content rendering.

**Files:** `crates/formspec-pdf/src/render.rs`

| Task | Details |
|------|---------|
| Divider rendering | When `node.component == "Divider"`, draw a horizontal line: `content.move_to(x, y)` → `content.line_to(x + width, y)` → `content.stroke()`. Height = 12pt (line + padding). |
| Section backgrounds | Optional — low value. Skip unless trivial. A subtle gray rectangle behind group content areas. |

**Tests:** Divider node → content stream contains line drawing operators (`m`/`l`/`S`).

**Estimated scope:** ~30 lines. Trivial.

---

## Step 4: Phase 4e — Response assembly + stream compression

**Goal:** Complete the XFDF round-trip story and add PDF stream compression.

**Files:** `crates/formspec-pdf/src/xfdf.rs`, `crates/formspec-pdf/src/render.rs`, `crates/formspec-pdf/Cargo.toml`

| Task | Details |
|------|---------|
| Response assembly | Add `assemble_response(xfdf_fields: &HashMap<String, Value>) -> Value` that unflattens dotted paths (`group[0].name` → nested JSON), handles repeat indices, and applies type coercion (string → number/boolean based on dataType). |
| Stream compression | Re-add `flate2` dependency. Compress page content streams and appearance XObjects with `flate2::write::DeflateEncoder`. Set `/Filter /FlateDecode` on compressed streams. This typically reduces PDF size 60-70%. |

**Tests:**
- `assemble_response` round-trip: flatten → unflatten → compare
- Repeat group paths: `items[0].name`, `items[1].name` → nested structure
- Compressed PDF still opens correctly (valid header + trailer)

**Estimated scope:** ~100 lines response assembly, ~30 lines compression wiring.

---

## Step 5: PyO3 bindings

**Goal:** Expose theme, plan, and pdf crates to Python for server-side usage.

**Files:** `crates/formspec-py/src/theme.rs` (new), `crates/formspec-py/src/plan.rs` (new), `crates/formspec-py/src/pdf.rs` (new), `crates/formspec-py/src/lib.rs`, `crates/formspec-py/Cargo.toml`

Follow the existing pattern in `fel.rs`/`document.rs` — each function takes JSON string args, calls Rust, returns JSON string result.

```
# New Python API surface (~6 functions):
formspec_rust.resolve_presentation(theme_json, item_json, tier1_json) -> str
formspec_rust.resolve_token(value, component_tokens_json, theme_tokens_json) -> str
formspec_rust.plan_component_tree(tree_json, context_json) -> str
formspec_rust.plan_definition_fallback(items_json, context_json) -> str
formspec_rust.render_pdf(definition_json, theme_json, comp_doc_json, response_json, options_json) -> bytes
formspec_rust.generate_xfdf(fields_json) -> str
formspec_rust.parse_xfdf(xfdf_xml) -> str
```

**Tests:** Python conformance tests in `tests/` that call the new functions.

**Estimated scope:** ~150 lines across 3 new module files + registration. Mechanical.

**Can run in parallel with Steps 1–4** — no shared files.

---

## Step 6: Phase 3 — TS migration preparation

**Goal:** Build the WASM bridge in TypeScript so formspec-layout calls Rust instead of its own TS code.

**Files:** `packages/formspec-layout/src/wasm-bridge.ts` (new), `packages/formspec-layout/src/index.ts`

| Task | Details |
|------|---------|
| Create `wasm-bridge.ts` | Import from `formspec-engine/fel-tools` (which exposes the WASM tools module). Wrap each WASM export (`resolvePresentation`, `planComponentTree`, etc.) in a TS function matching the existing API signatures. Handle JSON serialization/deserialization at the boundary. |
| Update `index.ts` | Re-export from `wasm-bridge.ts` instead of from `planner.ts`, `theme-resolver.ts`, etc. Keep `types.ts` exports unchanged. Keep `widget-vocabulary.ts` (used by webcomponent for component registration). |
| Keep TS files temporarily | Don't delete yet — keep `planner.ts`, `theme-resolver.ts`, etc. as dead code until conformance tests pass. |

**Key constraint:** `formspec-webcomponent` and `formspec-studio` import from `formspec-layout`. The API surface must not change — same function names, same types. The bridge is transparent.

**Tests:** Existing unit tests in `packages/formspec-layout/` should pass against the WASM bridge. Run `npm run test:unit` to verify.

**Estimated scope:** ~100 lines of bridge code, ~20 lines of index.ts changes.

---

## Step 7: Phase 3 — Cross-planner conformance run + E2E

**Goal:** Verify the WASM bridge produces identical output to the TS planner, then switch over.

**Files:** Conformance fixtures in `tests/conformance/layout/`, Playwright test files

| Task | Details |
|------|---------|
| Run conformance fixtures through TS | Write a Vitest test that loads each JSON fixture from `tests/conformance/layout/`, runs the TS planner with the input, and compares output against the Rust-generated expected values. Document any divergences. |
| Fix divergences | The Rust planner is spec-normative. Where TS diverges, update the TS test expectations (not the Rust output). Where differences are rendering-visible, add Playwright snapshot updates. |
| Run full E2E suite | `npm test` — all Playwright tests must pass with the WASM bridge active. |
| Delete TS planner files | Once conformance + E2E pass: delete `planner.ts`, `theme-resolver.ts`, `tokens.ts`, `responsive.ts`, `defaults.ts`, `params.ts`. Keep `types.ts` and `widget-vocabulary.ts`. |

**Risk:** This is the highest-risk step. The Rust planner intentionally fixes 6 spec divergences from the TS planner. Some of these will cause visible rendering changes in E2E tests. Budget time for snapshot updates and edge case investigation.

**Estimated scope:** Highly variable. 1-3 hours of debugging if divergences are simple; more if rendering changes cascade.

---

## Step 8: Custom font support (optional, lower priority)

**Goal:** Support non-ASCII text in PDFs via user-provided fonts.

**Files:** `crates/formspec-pdf/Cargo.toml`, `crates/formspec-pdf/src/fonts.rs`, `crates/formspec-pdf/src/render.rs`

| Task | Details |
|------|---------|
| Re-add `subsetter` + `skrifa` deps | `subsetter` for font subsetting, `skrifa` for reading metrics from OTF/TTF. |
| Font metrics from custom fonts | When font bytes provided, read `hhea`/`hmtx` tables via `skrifa` to get glyph widths, ascender, descender. Fall back to Helvetica metrics for unmapped glyphs. |
| Font subsetting | Before embedding, run through `subsetter` to strip to only used glyphs. Typically 30-60 KB vs 300-500 KB for full font. |
| Font embedding in PDF | Write embedded font as a CIDFont with ToUnicode CMap for correct text extraction. |
| WASM API extension | Add optional `fonts_json` parameter to `renderPDF` — JSON array of `{name, bytes}` where bytes are base64. |

**Estimated scope:** ~300 lines. Requires understanding CIDFont PDF structures. Defer unless non-ASCII support is needed soon.

---

## Execution Order

```
Step 1 (4b AcroForm)  ──┐
Step 2 (4c Tagged PDF) ──┤── Can run sequentially (shared files in render.rs)
Step 3 (4d Dividers)   ──┘

Step 4 (4e Response + compression) ── After Steps 1-3 (uses final field naming)

Step 5 (PyO3 bindings) ── Independent, can run in parallel with Steps 1-4

Step 6 (TS bridge)     ── After Steps 1-4 (WASM API must be stable)
Step 7 (Conformance)   ── After Step 6 (requires bridge to be built)

Step 8 (Custom fonts)  ── Optional, any time after Step 4
```

**Parallelism opportunities:**
- Steps 1+5 can run in parallel (different crates, no shared files)
- Steps 2+5 can run in parallel
- Steps 6+8 cannot run in parallel (both touch formspec-pdf)

## Agent Dispatch Guide

Each step is designed to be a single craftsman invocation. When dispatching:

1. **Always include:** "Read `thoughts/specs/2026-03-24-rust-layout-planner-and-pdf.md` for the full design spec. Read `thoughts/plans/2026-03-24-rust-layout-finish.md` Step N for your specific task."
2. **Always include:** "Follow red-green-refactor TDD. Write failing tests first. Commit at logical stopping points."
3. **For Step 2 (Tagged PDF):** Also include "Check pdf-writer 0.14 API at `~/.cargo/registry/src/*/pdf-writer-0.14.0/src/structure.rs` for StructElement/StructChildren/MarkedContent APIs before writing code."
4. **For Step 7 (Conformance):** Also include "The Rust planner is the reference. TS divergences should update TS expectations, not Rust output."
5. **After each step:** Launch a scout agent to review the work before proceeding to the next step.

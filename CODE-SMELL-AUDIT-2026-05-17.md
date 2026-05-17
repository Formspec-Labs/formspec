# Code Smell Audit — `formspec/`

**Date:** 2026-05-17  
**Methodology:** 9 parallel agents, full-length read of every source file  
**Scope:** All `.rs`, `.ts`, `.tsx`, `.py`, `.json` (schemas), `.md` (specs/docs), and config/build files

## Remediation log (2026-05-17)

**Tracked in:** `formspec/TODO.md` → epic `fs-kabu` (`tk`), scripts `scripts/create-formspec-smell-tickets.sh` + `batch2.sh`.

| Status | Items |
|--------|--------|
| **Fixed on HEAD** | Plane removed from `CLAUDE.md`; CI timeouts + setup caches + `rust-cache`; validate → `formspec/validate/` package; `execute_mapping` → `engine_helpers` + eval `evaluate()` only; hub typing (`fs-tz1m`, 1 prod `any` on `findItemByKey`); `default-field` / `node-renderer` splits; `helpers.ts` boundary types; `viewThemeDocument()` / zero `as unknown as` in `raw-project`; screener React typed; `SubmitResult` typed; E2E harness + clinical-intake / invoice / tribal-long (125 Playwright); spec dates; audit rows reconciled (`fs-qkud`) |
| **Already fixed before pass** | WASM `fel.rs` in-band eval envelope; `assembly_fel_rewrite` `Arc`; `formspec-py` `PyTypeError`; `Debug` on vector types |
| **Open (tk `fs-kabu`)** | `fs-prql` — ~76 `waitForTimeout` left in other E2E/component specs; `fs-gfqf` — `use-screener` extensions test after typing; `fs-mbiw` — `fel_rewrite_exact` / `fel_analysis`; `fs-2iwf` / `fs-l0c5` — schema (needs spec sign-off for ledger slots) |

Scout validation: section footers and some rows are stale — do not ticket from footer totals alone.

---

## Table of Contents

1. [Cross-Codebase Summary](#cross-codebase-summary)
2. [Rust Core Crates](#1-rust-core-crates)
3. [Rust Supporting Crates](#2-rust-supporting-crates)
4. [TypeScript — Engine, Layout, Types](#3-typescript--engine-layout-types)
5. [TypeScript — Core, Webcomponent, Adapters, Assist](#4-typescript--core-webcomponent-adapters-assist)
6. [TypeScript — React, Signature Packages](#5-typescript--react-signature-packages)
7. [Python Source + Tests](#6-python-source--tests)
8. [Test TypeScript Files + Storybook](#7-test-typescript-files--storybook)
9. [Schemas, Config, Build Files](#8-schemas-config-build-files)
10. [Specs, Docs, Examples](#9-specs-docs-examples)

---

## Cross-Codebase Summary

| Area | Critical | Major | Minor |
|------|----------|-------|-------|
| Rust core crates | 1 | 23 | 45 |
| Rust supporting crates | 3 | 12 | 10 |
| TS engine+layout+types | — | — | — |
| TS core+webcomponent+adapters+assist | 3 | 20+ | 26+ |
| TS react+signature | 4 | 57 | 74 |
| Python source+tests | — | 13 | 20+ |
| Tests + storybook | — | 11 | 20 |
| Schemas/config/build | 3 | 12 | 15 |
| Specs/docs/examples | — | 2 | 11 |

### Top 5 Priority Fixes

1. **Type the webcomponent public surface** — `element.ts`, `behaviors/types.ts`, and `rendering/emit-node.ts` propagate `any` to every consumer (~80+ instances)
2. **Split `default-field.tsx` (1400 lines) and `node-renderer.tsx` (1069 lines)** — extract per-component renderers into separate files
3. **Grant-app / grant-report E2E sleeps** — clinical-intake + invoice + tribal-long migrated; grant-app specs still use `waitForTimeout`
4. **Webcomponent screener listener cleanup** — `rendering/screener.ts` still adds listeners without teardown (see §4f)
5. **Rust `fel_analysis` / `execute_mapping` size** — largest functions in core crate (see §1 Major)

---

## 1. Rust Core Crates

**Scope:** `formspec-core`, `formspec-eval`, `formspec-lint`, `formspec-wasm`, `formspec-changeset` (~85 `.rs` files)

### Critical

| # | File | Line(s) | Category | Description |
|---|------|---------|----------|-------------|
| 1 | `formspec-wasm/src/fel.rs` | 61-63 | `unsafe_usage` | Thread-local `Cell<bool>` mutable global state for diagnostic side-channel. `consume_last_eval_error_diagnostics()` reads/resets, `eval_fel_inner()` sets. Hidden coupling between calls: any intervening call silently swallows the flag. Comment says "Safe because WASM is single-threaded" — fragile if threading assumptions change. |

### Major

| # | File | Line(s) | Category | Description |
|---|------|---------|----------|-------------|
| 2 | `formspec-core/src/assembler.rs` | 142, 257, 283, 316-320 | `unwrap_expect` | `.unwrap_or("")` on `.and_then(Value::as_str)` — silently replaces missing field with `""` |
| 3 | `formspec-core/src/assembler.rs` | 393 | `clone_inefficient` | `parsed_ref.version.clone().unwrap_or_else(\|\| { ... .to_string() })` — clones String then potentially discards it |
| 4 | `formspec-core/src/assembly_fel_rewrite.rs` | 102-121 | `clone_inefficient` | `AssemblyFelRewriteMap` cloned 3 times for closure captures instead of using `Arc` or references |
| 5 | `formspec-core/src/fel_analysis.rs` | 206-271 | `complex_function` | `infer_coarse_type` — large match with 8 branches and nested field-type lookups (30+ lines) |
| 6 | `formspec-core/src/fel_analysis.rs` | 396-541 | `large_function` | `check_parameter_types` is 145 lines with deep recursion and complex logic |
| 7 | `formspec-core/src/fel_analysis.rs` | 610-729 | `large_function` | `collect_info` is 119 lines — 20+ match arms, heavy duplication across expression types |
| 8 | `formspec-core/src/fel_analysis.rs` | 757-918 | `large_function` | `rewrite_expr` is 161 lines — massive recursive match on all Expr variants |
| 9 | `formspec-core/src/fel_analysis.rs` | 922-978 | `duplicate_code` | `parse_field_ref_from_path` and `parse_var_ref_from_path` are nearly identical — differ only in return expression type |
| 10 | `formspec-core/src/fel_analysis.rs` | 980-1093 | `large_function` | `collect_rewrite_targets` is 113 lines — duplicates `collect_info` pattern |
| 11 | `formspec-core/src/fel_rewrite_exact.rs` | 143-200+ | `large_function` | `ExactRewriteParser` is a single `impl` block ~550 lines with many recursive parsing methods — replicates a parser that already exists in `fel-core` |
| 12 | `formspec-core/src/response_migration.rs` | 93 | `unwrap_expect` | `parse().unwrap()` would panic on invalid expression |
| 13 | `formspec-core/src/response_migration.rs` | 9-10 | `dead_code` | `fn clone_json(value: &Value) -> Value { value.clone() }` — trivial wrapper function adds no value |
| 14 | `formspec-core/src/runtime_mapping/engine.rs` | 15-372 | `large_function` | `execute_mapping` is 357 lines — handles priority sorting, path resolution, condition checks, array mode dispatch, all transform types |
| 15 | `formspec-core/src/runtime_mapping/engine.rs` | 59-61 | `deep_nesting` | 5-6 levels of nesting in reverse direction path resolution |
| 16 | `formspec-core/src/runtime_mapping/engine.rs` | 78-139 | `duplicate_code` | `ArrayMode::Each` and `ArrayMode::Indexed` have nearly identical loop structure |
| 17 | `formspec-core/src/runtime_mapping/engine.rs` | 155-357 | `complex_function` | Main transform dispatch is ~200-line match over 8 transform variants |
| 18 | `formspec-core/src/runtime_mapping/types.rs` | 6,48,58,65,94,110,123,146,158,167 | `missing_docs` | Every type definition uses `#[allow(missing_docs)]` |
| 19 | `formspec-wasm/src/mapping.rs` | 66-90 | `duplicate_code` | Deprecated aliases (`executeMapping`, `executeMappingDoc`) are 100% identical wrappers — should have been removed |
| 20 | `formspec-changeset/src/graph.rs` | 48-76 | `duplicate_code` | `find()` and `union()` are standard Union-Find duplicated inline rather than using a library |
| 21 | `formspec-changeset/src/graph.rs` | 23-153 | `large_function` | `compute_dependency_groups` is 130 lines with inline DSU, HashMap building, and multiple closures |
| 22 | Cross-cutting (11 files) | — | `missing_docs` | 11 files suppress clippy doc warnings with `#![allow(clippy::missing_docs_in_private_items)]` |
| 23 | Cross-cutting (10+ types) | — | `missing_docs` | 10+ public types use `#[allow(missing_docs)]` while `lib.rs` declares `#![warn(missing_docs)]` |
| 24 | `formspec-core/src/assembly_fel_rewrite.rs` | — | `clone_inefficient` | 3+ places clone `AssemblyFelRewriteMap` entirely for closure captures instead of using `Arc` |

### Minor

| # | File | Line(s) | Category | Description |
|---|------|---------|----------|-------------|
| 25 | `assembler.rs` | 6, 944 | `missing_docs` | `#![allow(clippy::missing_docs_in_private_items)]` |
| 26 | `changelog.rs` | 7, 15-53 | `missing_docs` | All 6 public types use `#[allow(missing_docs)]` |
| 27 | `changelog.rs` | 57-67 | `type_complexity` | `Change` struct has 10 fields (many optional) |
| 28 | `definition_items.rs` | 67, 215 | `unwrap_expect` / `missing_docs` | `.unwrap_or("")` on key coercion |
| 29 | `extension_analysis.rs` | 6, 17-69 | `missing_docs` | All public types annotated with `#[allow(missing_docs)]` |
| 30 | `fel_analysis.rs` | 8, 181-186, 1204-1205 | `missing_docs` | Doc lint suppressed |
| 31 | `fel_analysis.rs` | 181-186 | `string_inefficient` | `LazyLock<HashMap<&'static str, FelType>>` — could use phf::Map |
| 32 | `fel_analysis.rs` | 21, 24 | `type_complexity` | `RewriteFn` / `RewriteFn2` type aliases use `Box<dyn Fn...>` |
| 33 | `fel_condition_group_lift.rs` | 4 | `commented_code` | Stale maintenance marker comment |
| 34 | `fel_rewrite_exact.rs` | 5, 75-82, 740-742 | `missing_docs` / `type_complexity` | Doc lint suppressed; `ExactRewriteParser` has 7 fields with lifetime |
| 35 | `json_artifacts.rs` | 4 | `missing_docs` | Doc lint suppressed |
| 36 | `option_sets.rs` | 12 | `clone_inefficient` | Clones entry then takes `.get("options")` |
| 37 | `path_utils.rs` | 228, 445 | `unwrap_expect` / `missing_docs` | `.expect("writing to String cannot fail")` |
| 38 | `schema_validator.rs` | 13, 303 | `missing_docs` | `DocumentType` enum without docs |
| 39 | `value_coerce.rs` | 56-57, 80-156 | `unwrap_expect` / `complex_function` | `.unwrap_or(Value::Null)`; `coerce_field_value` has 3 major branches |
| 40 | `wire_keys.rs` | 6-14, 83-91 | `type_complexity` / `missing_docs` | Returns 5-tuple of `&'static str` — could use struct |
| 41 | `registry_client/` (parse, types, registry, version, tests) | multiple | `missing_docs` | Every type uses `#[allow(missing_docs)]`; `parse_version` silently ignores non-numeric parts |
| 42 | `runtime_mapping/` (parse, transforms, tests) | multiple | `missing_docs` | Doc lint suppressed across all files |
| 43 | `runtime_mapping/env.rs` | 24-26 | `string_inefficient` | `source_fel.clone()` and `target_fel.clone()` — both cloned twice |
| 44 | `formspec-wasm/src/evaluate.rs` | 25-26 | `string_inefficient` | `.to_string()`/`.to_owned()` on Status fields |
| 45 | `formspec-wasm/src/fel.rs` | 12-35 | `unnecessary_alloc` | Conditional imports create dead_code risk when `fel-authoring` not enabled |
| 46 | `formspec-wasm/src/document.rs` | 102 | `deprecated` | `#[deprecated]` function wrapping new one |
| 47 | `formspec-wasm/src/split_abi.rs` | 15 | `todo_fixme` | "Magic" comment implies undocumented coupling |
| 48 | `formspec-changeset/src/extract.rs` | 52-53 | `string_inefficient` | `LazyLock<Regex>` with `.unwrap()` could panic at runtime |

**Rust core totals: 1 critical, 23 major, 45 minor (75 findings)**

---

## 2. Rust Supporting Crates

**Scope:** `formspec-signature-port`, `formspec-signature-cose`, `formspec-signature-adapter-ring`, `formspec-cross-stack-fixture-harness`, `formspec-py` (14 `.rs` files, ~3,800 lines)

### Critical

| # | File | Line(s) | Category | Description |
|---|------|---------|----------|-------------|
| 1 | `formspec-cross-stack-fixture-harness/src/canonicalization_vectors.rs` | 24-36 | `missing_derive` | `CanonicalizationVector` — public struct missing `Debug`, `Clone`, `PartialEq` derives |
| 2 | `formspec-signature-adapter-ring/src/lib.rs` | 47-49 | `missing_derive` | `RingVerifier` — public struct missing `Debug` derive |
| 3 | `formspec-signature-adapter-ring/src/lib.rs` | 121-123 | `missing_derive` | `InProcessReceiptSigner` — public struct missing `Debug` derive |

### Major

| # | File | Line(s) | Category | Description |
|---|------|---------|----------|-------------|
| 4 | `cross-stack-fixture-harness/tests/bundle_manifest_tests.rs` | 723, 822, 951, 1206 | `clone_inefficient` | `record.data.clone()` repeated 4× — clones entire JSON tree for deserialization. Should use `std::mem::take` |
| 5 | `cross-stack-fixture-harness/tests/bundle_manifest_tests.rs` | 222 | `clone_inefficient` | `response_json.clone()` to work around ownership |
| 6 | `cross-stack-fixture-harness/tests/bundle_manifest_tests.rs` | 590, 916 | `clone_inefficient` | `fixture.signed_bytes.clone()` — `VerifyRequest` could take `&[u8]` |
| 7 | `cross-stack-fixture-harness/src/canonicalization_vectors.rs` | 120-133 | `panicking` | `bundle_001_response()` — file I/O and panics in non-test production code. Any consumer of `vector_c_bundle_001()` or `all_vectors()` hits disk |
| 8 | `cross-stack-fixture-harness/tests/bundle_manifest_tests.rs` | 607, 623, 672, 761, 878, 1001, 1024, 1105, 1259, 1306 | `unwrap_expect` | 10× `.to_str().unwrap()` — panics on non-UTF8 paths |
| 9 | `cross-stack-fixture-harness/tests/bundle_manifest_tests.rs` | 51 | `dead_code` | `#[allow(dead_code)]` on `ResponseFixture` |
| 10 | `formspec-py/src/convert.rs` | 388, 390, 410, 420, 429, 433 | `clone_inefficient` | `normalize_wire_json_for_python` clones every non-matching node. Should take `JsonValue` by value |
| 11 | `formspec-py/src/convert.rs` | 181 | `poor_error_handling` | `unwrap_or_default()` on currency — silently accepts empty currency code |
| 12 | `formspec-py/src/convert.rs` | 234 | `silent_data_loss` | `python_to_fel` returns `Value::Null` for unrecognized Python types (sets, tuples, numpy arrays, etc.) — should return `PyTypeError` |
| 13 | `formspec-py/src/convert.rs` | 242-251 | `silent_precision_loss` | `fel_to_python` loses precision for non-i64-representable numbers — they become `None` |
| 14 | `cross-stack-fixture-harness/src/canonicalization_vectors.rs` | 120-129 | `fragile_path` | `bundle_001_response` walks up two parent directories — breaks on crate reorganization |
| 15 | `cross-stack-fixture-harness/tests/bundle_manifest_tests.rs` | 527-560 | `performance` | `validate_response_schema` reads+parses 3 JSON schemas from disk on every call — should be lazy-initialized |
| 16 | `cross-stack-fixture-harness/tests/bundle_manifest_tests.rs` | 716-754, 807-867, 936-996, 1195-1254 | `duplicate_code` | WOS provenance / Trellis event assertion logic duplicated across bundles 002, 003, 004, 006 (~40 lines × 4) |

### Minor

| # | File | Line(s) | Category | Description |
|---|------|---------|----------|-------------|
| 17 | `formspec-py/src/convert.rs` | 119 | `suppressed_lint` | `#[allow(clippy::only_used_in_recursion)]` on `python_to_fel` |
| 18 | `formspec-py/src/convert.rs` | 178 | `string_inefficient` | `unwrap_or_else(\|\| "0".to_string())` — heap allocation for default |
| 19 | `formspec-py/src/convert.rs` | 94-117 | `silent_defaults` | `pydict_to_field_map` / `pyany_to_mip_state` — extraction failures silently default instead of erroring |
| 20 | `formspec-py/src/fel.rs` | 140-142 | `silent_failure` | `parse_fel` returns bare `bool` — no error information for callers |
| 21 | `formspec-py/src/fel.rs` | 116-125 | `type_complexity` | `eval_fel_detailed` has 7 parameters |
| 22 | `formspec-py/src/document.rs` | 109-117 | `type_complexity` | `evaluate_def` has 7 parameters |
| 23 | `formspec-py/src/convert.rs` | 120-135 | `missing_docs` | Bool-before-int extraction order undocumented |
| 24 | `formspec-signature-cose/src/lib.rs` | 104, 106 | `error_flattening` | `error.to_string()` loses structured COSE error context |
| 25 | `formspec-signature-cose/src/lib.rs` | 38-74 | `error_chain` | `FormspecCoseError` doesn't implement `std::error::Error` with `#[source]` |
| 26 | `cross-stack-fixture-harness/tests/cbor_canonical_parity.rs` | 41-47 | `fragile_path` | Duplicated `formspec_root()` computation — should share with `bundle_manifest_tests.rs` |

**Rust supporting totals: 3 critical, 12 major, 10 minor (25 findings)**

---

## 3. TypeScript — Engine, Layout, Types

**Scope:** `formspec-types`, `formspec-engine`, `formspec-layout`

### Findings by Category

| # | File | Line(s) | Category | Severity | Description |
|---|------|---------|----------|----------|-------------|
| 1 | `formspec-engine/src/engine/FormEngine.ts` | — | `large_file` | Major | God class — initialization, evaluation, reactivity, state management, page resolution, validation, submission all in one class |
| 2 | `formspec-engine/src/engine/FormEngine.ts` | — | `any` type | Major | `FormItem` type gap — engine uses `any` for definition items where `formspec-types` should provide the canonical interface |
| 3 | `formspec-engine/src/engine/definition-setup.ts` | — | `any` type | Major | Definition ingestion uses `any` for raw JSON input instead of typed schema interfaces |
| 4 | `formspec-engine/src/reactivity/` | — | `any` type | Minor | Signal wrappers use `any` for signal value types |
| 5 | `formspec-engine/src/fel/` | — | `complex_function` | Major | FEL bridge functions handle error normalization with large switch statements |
| 6 | `formspec-engine/src/assembly/` | — | `any` type | Major | Assembly functions accept `any` for component/theme documents |
| 7 | `formspec-engine/src/mapping/` | — | `any` type | Major | Mapping engine uses `any` for mapping document input |
| 8 | `formspec-layout/src/planner*.ts` | — | `complex_function` | Minor | Layout planning has deeply nested conditional logic |
| 9 | `formspec-types/src/` | — | `missing_docs` | Minor | Generated type definitions lack JSDoc descriptions |
| 10 | `formspec-engine/src/wasm-bridge-runtime.ts` | — | `any` type | Major | WASM bridge uses `any` for imported WASM functions |

**TS engine+layout+types: ~10 major, ~3 minor findings**

---

## 4. TypeScript — Core, Webcomponent, Adapters, Assist

**Scope:** `formspec-core`, `formspec-webcomponent`, `formspec-adapters`, `formspec-assist` (~198 files)

### 4a. `any` Type Usage — Critical Structural Issue

| File | Lines | Count | Description |
|------|-------|-------|-------------|
| `webcomponent/src/element.ts` | 96, 97, 99, 133, 135, 140, 147-165, 193, 209, 217, 227, 235, 298, 363, 405, 412, 416, 431, 494, 504, 514, 522, 530, 537, 545, 550, 584, 618, 638, 651, 676 | ~35 | `FormspecRender` element uses `any` for nearly all public properties and internal state. `_definition: any`, `_componentDocument: any`, `_registryEntries: Map<string, any>`, etc. Main entry point — all downstream consumers lose type safety. |
| `webcomponent/src/behaviors/types.ts` | 14, 68-70, 74, 183, 186, 235, 262, 279, 285, 290-291, 293 | ~15 | Core behavior interfaces use `any` for `comp`, `compOverrides`, `setValue`, `resolveToken`, `findItemByKey`, `renderComponent`, `definition`, `registryEntries` |
| `webcomponent/src/rendering/emit-node.ts` | 25-26, 32-33, 35-36, 45, 47-50, 214, 247, 258, 347, 349, 357, 359, 370, 403, 405 | ~20 | `RenderHost` interface uses `any` for `_definition`, `_componentDocument`, `_themeDocument`, `_latestSubmitDetailSignal`, `resolveToken`, `applyStyle`, `submit` |
| `webcomponent/src/components/layout-plugin-builders.ts` | — | 12 | 9 nearly identical `buildXxxBehavior(comp: any, ctx: RenderContext)` functions |
| `webcomponent/src/rendering/screener.ts` | — | ~10 | Screener rendering with `any` for screener document, seed answers |
| `adapters/src/uswds/display-components.ts` | — | 8 | Display component rendering with `any` for money formatting, definition access |

### 4b. `as unknown as` Double Casts — **fixed in `raw-project.ts` / screener handlers**

**HEAD:** Zero `as unknown as` in `raw-project.ts` / screener handlers. Theme view uses `viewThemeDocument()` in `document-envelopes.ts` (one centralized bridge); component/mappings use single `as`. `themeStateFromDocument()` on import.

**Remaining (out of scope for P1-003):** `handlers/locale.ts`, `handlers/definition-variables.ts`, `queries/registry-queries.ts` still use `as unknown as Record<string, unknown>` for dynamic property writes.

### 4c. Non-null Assertions (`!`)

| File | Line(s) | Count | Description |
|------|---------|-------|-------------|
| `core/src/handlers/component-tree.ts` | 76, 168, 190, 198, 220, 236, 241, 264, 281, 336, 348, 363 | 13 | `stack.pop()!`, `result.parent.children!.splice(...)` — tree building assumes parent always exists |
| `core/src/queries/versioning.ts` | 84, 85, 102, 104, 109 | 5 | `baselineByPath.get(path)!` — assumes Map always contains key |
| `core/src/tree-reconciler.ts` | 293, 328, 342 | 3 | `stack.pop()!`, `found.parent.children!.splice(...)` |
| `core/src/handlers/mapping.ts` | 285, 299 | 2 | `rules[ruleIndex].innerRules!.splice(...)` |
| `webcomponent/src/adapters/signature-canvas.ts` | 36 | 1 | `canvas.getContext('2d')!` — can return null if canvas unsupported |

### 4d. `this as any` Pattern

| File | Lines | Count | Description |
|------|-------|-------|-------------|
| `webcomponent/src/element.ts` | 157, 168, 522, 530, 537, 545, 550, 584, 618, 638, 651 | 11 | `FormspecRender` casts `this as any` to satisfy `StylingHost`, `NavigationHost`, `RenderHost`, `ScreenerHost` interfaces. If any interface method is missing or has wrong signature, fails silently at runtime. |

### 4e. `innerHTML` Usage (XSS Risk)

| File | Line | Severity | Description |
|------|------|----------|-------------|
| `webcomponent/src/adapters/default/display-components.ts` | 48, 55 | Major | `el.innerHTML = renderMarkdown(String(v));` — if `renderMarkdown` doesn't sanitize, XSS risk with user-provided markdown |
| `adapters/src/uswds/display-components.ts` | 79, 86 | Major | Same `renderMarkdown` pattern |
| `webcomponent/src/adapters/default/layout.ts` | 402 | Major | `closeBtn.innerHTML = '<span aria-hidden="true">\u00d7</span>';` — hardcoded, safe but anti-pattern |
| `webcomponent/src/adapters/default/select.ts` | 40, 125 | Major | Same close button pattern — duplicated |
| `adapters/src/uswds/layout/modal.ts` | 60 | Minor | Same cross-file copy-paste |
| `adapters/src/tailwind/file-upload.ts` | 30 | Major | `iconWrapper.innerHTML = '<svg ...>'` — large inline SVG string |

### 4f. Event Listeners Not Cleaned Up

| File | Line(s) | Severity | Description |
|------|---------|----------|-------------|
| `webcomponent/src/adapters/signature-canvas.ts` | — | — | **Fixed** — listeners removed in `dispose()` |
| `webcomponent/src/rendering/screener.ts` | 245, 257, 273, 289, 310, 430 | Major | Screener adds `addEventListener` on dynamically created elements with no `removeEventListener` calls |

### 4g. Files > 500 Lines

| File | Lines | Severity |
|------|-------|----------|
| `webcomponent/src/element.ts` | 721 | Critical — monolithic class doing engine init, screener, rendering, navigation, styling |
| `assist/src/provider.ts` | 974 | Critical — single class with 13 tool handlers, schema validation, profile matching |
| `core/src/types.ts` | 704 | Major — type-only file, acceptable density |
| `core/src/raw-project.ts` | 637 | Major — central class with 35+ public methods |
| `core/src/handlers/definition-items.ts` | 606 | Major — 6 handler functions |
| `webcomponent/src/adapters/default/layout.ts` | 600 | Major — 10 layout render functions |

### 4h. Console Output in Production Code

| File | Line | Description |
|------|------|-------------|
| `webcomponent/src/element.ts` | 340, 348 | `console.error('Engine initialization failed', e)` — duplicate error handlers; error swallowed without re-throw or user notification |
| `webcomponent/src/element.ts` | 588, 594 | `console.warn(...)` — unsupported version and URL mismatch warnings |
| `webcomponent/src/behaviors/shared.ts` | 49 | `console.warn(...)` — incompatible component/dataType |
| `webcomponent/src/registry.ts` | 58 | `console.warn(...)` — adapter not registered |
| `webcomponent/src/rendering/emit-node.ts` | 252, 326 | `console.warn(...)` — unknown component type |

### 4i. Copy-Paste / Near-Duplicate Patterns

| Pattern | Files | Description |
|---------|-------|-------------|
| `innerHTML = '<span aria-hidden="true">\u00d7</span>'` | 4 files | Close button HTML duplicated across layout.ts, select.ts, modal.ts |
| `as unknown as` double-cast | 9 instances in `raw-project.ts` | Same pattern for each artifact getter |
| `buildXxxBehavior(comp: any, ctx: RenderContext)` | `layout-plugin-builders.ts` | 9 nearly identical function signatures |
| `isPageModeWizard` / `isPageModeTabs` | `emit-node.ts:344-362` | Differ only by `'wizard'` vs `'tabs'` — should be parameterized |
| `renderPageModeWizard` / `renderPageModeTabs` | `emit-node.ts:369-428` | Same structure, same orphan handling, differ in component type |
| Adapter render functions | `tailwind/*.ts` / `uswds/*.ts` | Near-identical structure per widget type with only CSS class names differing |

### 4j. Missing Async Error Handling

| File | Line | Description |
|------|------|-------------|
| `webcomponent/src/element.ts` | 344 | `void initFormspecEngine().then(...)` — no `.catch()` for pre-handler rejection |
| `webcomponent/src/element.ts` | 349 | Engine init error swallowed — no user-facing notification, element silently fails |

### 4k. `Math.random()` for ID Generation

| File | Line | Description |
|------|------|-------------|
| `core/src/raw-project.ts` | 219 | `Math.random().toString(36).slice(2, 10)` — not cryptographically random, acceptable for URN |
| `adapters/src/uswds/layout/collapsible.ts` | 10 | Same pattern — could collide under concurrent renders |

### 4l. Hardcoded Strings

| File | Line | String |
|------|------|--------|
| `core/src/raw-project.ts` | 219 | `'urn:formspec:'` — URL scheme |
| `core/src/raw-project.ts` | 319-323 | `'$formspecComponent'`, `'1.0'`, `'0.1.0'` — version strings |
| `webcomponent/src/element.ts` | 310 | `'Continue'` — button text |
| `webcomponent/src/rendering/screener.ts` | 233, 309, 429 | `'-- Select --'`, `'Continue'`, `'Back to screening'` |
| `adapters/src/uswds/layout/collapsible.ts` | 10 | `'collapsible-'` — prefix |

**TS core+wc+adapters+assist totals: 3 critical, 20+ major, 26+ minor (~80+ `any` instances)**

---

## 5. TypeScript — React, Signature Packages

**Scope:** `formspec-react`, `formspec-signature-port`, `formspec-signature-cose`, `formspec-signature-adapter-webcrypto`

### 5a. `any` Type Usage — Critical Structural Issue

**This is the most pervasive issue.** `any` is used for entire configuration documents, engine methods, and cross-cutting data where typed interfaces should exist.

| File | Line | Severity | Code | Description |
|------|------|----------|------|-------------|
| `context.tsx` | 20-21 | **Critical** | `response: any;` / `validationReport: any;` | `SubmitResult` — form output type erased |
| `context.tsx` | 29, 31, 43, 54, 56-64 | **Major** | `themeDocument?: any;` / `componentDocument?: any;` / `registryEntries: Map<string, any>;` / `definition?: any;` | Provider props all erased |
| `context.tsx` | 295, 320 | **Major** | `data: Record<string, any>` / `items: any[], key: string): any` | Helper functions with erased params/returns |
| `node-renderer.tsx` | 375, 599-610, 641-655, 681, 909, 960-966 | **Major** | `items: Array<any>` / `function formatMoney(value: any, locale)` / `fieldDef?: any` | Display node helpers all erased |
| `use-screener.ts` | — | — | **Fixed** — typed with `FormItem`, `ScreenerDocumentInput`, `DeterminationRecord`, `ScreenerAnswers` |
| `use-field.ts` | 22, 40, 50, 94 | **Minor** | `value: any;` / `setValue(value: any): void;` / `onChange: (e: { target: { value: any } }) => void;` | Field value and event types erased |
| `use-form.ts` | 20-21 | **Minor** | `submit(options?: SubmitOptions): any;` / `getResponse(meta?: Record<string, any>): any;` | Return types erased |
| `use-field-value.ts` | 9-10 | **Minor** | `value: any;` / `setValue(value: any): void;` | Field value erased |
| `use-replay.ts` | 8 | **Minor** | `{ type: 'setValue'; path: string; value: any }` | Replay event value erased |
| `default-field.tsx` | 26, 286-287, 529, 641 | **Major** | `const attrs: Record<string, any> = {};` / `extensionAttrs: Record<string, any>` / `common: Record<string, any>` / `fieldDef?: any` | All field prop types erased |
| `renderer.tsx` | 73, 77 | **Major** | `screenerDocument?: any;` / `screenerSeedAnswers?: Record<string, any>;` | Screener props erased |
| `screener/types.ts` | — | — | **Fixed** — `ScreenerDocument`, `ScreenerAnswers`, typed hook options/result |
| `screener/FormspecScreener.tsx` | — | — | **Fixed** — `FormspecScreenerProps` extends typed `UseScreenerOptions` |

### 5b. `as` Type Assertions

| File | Line | Severity | Code | Description |
|------|------|----------|------|-------------|
| `context.tsx` | 121 | **Major** | `componentDocument.breakpoints as Record<string, number \| { minWidth?: number }>` | Unsafe cast from `any` |
| `node-renderer.tsx` | 392 | **Minor** | `node.style as React.CSSProperties \| undefined` | LayoutNode style asserted |
| `node-renderer.tsx` | 641-654 | **Major** | `engine.getDefinition()?.optionSets?.[fieldDef.optionSet] as any` | Unsafe double cast |
| `default-field.tsx` | 88, 131, 160 | **Minor** | `node.style as React.CSSProperties \| undefined` | Repeated style casts |
| `default-field.tsx` | 501 | **Minor** | `as React.HTMLAttributes<HTMLInputElement>['inputMode']` | InputMode cast |
| `default-layout.tsx` | 20, 57, 80-82, 155 | **Minor** | Various layout prop casts | All props cast from unknown |
| `renderer.tsx` | 31 | **Minor** | `(effectiveTheme as { tokens?: Record<string, string \| number> }).tokens` | Theme tokens cast |
| `screener/FormspecScreener.tsx` | 101 | **Major** | `(screenerDocument as any)?.submitLabel` | Double cast to `any` |

### 5c. Functions > 50 Lines

| File | Function | Lines | Severity |
|------|----------|-------|----------|
| `default-field.tsx` | `ComboboxSelect` | 538-831 (293) | Major — inline state + keyboard nav |
| `default-field.tsx` | `renderControl` | 281-522 (241) | Major — giant switch with 10+ field-type branches |
| `default-field.tsx` | `DefaultField` | 15-181 (166) | Major — 3 logical branches |
| `default-field.tsx` | `FileUploadControl` | 1226-1392 (166) | Major — drag-drop, size validation, accumulation |
| `default-field.tsx` | `renderGroupControl` | 184-278 (94) | Minor |
| `node-renderer.tsx` | `DisplayNode` | 381-509 (128) | Minor |
| `node-renderer.tsx` | `RepeatAccordion` | 249-371 (122) | Minor |
| `node-renderer.tsx` | `RepeatGroup` | 156-247 (91) | Minor |
| `node-renderer.tsx` | `DataTableDisplay` | 792-892 (100) | Minor |
| `context.tsx` | `FormspecProvider` | 77-249 (172) | Minor — context setup |
| `default-layout.tsx` | `ModalLayout` | 349-483 (134) | Minor |
| `default-layout.tsx` | `AccordionLayout` | 226-316 (90) | Minor |
| `use-screener.ts` | `useScreener` | 93-227 (134) | Minor |

### 5d. Large Files

| File | Lines | Severity |
|------|-------|----------|
| `node-renderer.tsx` | 1069 | **Critical** — should be split. Contains: node renderer, submit button, when guard, repeat group, accordion, display node (12 sub-components), data table (5 sub-components), validation summary |
| `default-field.tsx` | 1400 | **Major** — should be split. Contains: ComboboxSelect, MoneyInputControl, SliderControl, RatingControl, SignatureControl, FileUploadControl |
| `default-layout.tsx` | 609 | **Major** — 10+ inline sub-components |

### 5e. Non-null Assertions

| File | Line | Severity | Code | Description |
|------|------|----------|------|-------------|
| `node-renderer.tsx` | 141 | **Major** | `node.when!, node.whenPrefix` | WhenGuard — non-null on `when` string |
| `node-renderer.tsx` | 158 | **Major** | `node.repeatPath!` | RepeatGroup — non-null on repeat path |
| `node-renderer.tsx` | 920 | **Major** | `node.bindPath!` | FieldNode — non-null on bind path |
| `node-renderer.tsx` | 949 | **Major** | `node.bindPath!` | RelevanceGatedLayout — non-null on bind path |

### 5f. React-Specific Smells

| File | Line | Severity | Description |
|------|------|----------|-------------|
| `node-renderer.tsx` | 140 | **Major** | `useMemo` runs unconditionally but comment says "MUST run before any early return" — hook order depends on comments not structure |
| `node-renderer.tsx` | 82-86 | **Critical** | `FormspecNode` has 6 early returns — adding a hook above first early return would break rules of hooks. Currently safe but brittle |
| `default-field.tsx` | 202, 256, 335, 716, 788 | **Major** | Inline arrows in `.map()` — re-creates functions on each render. Should extract to sub-components or use `useMemo` |
| `default-field.tsx` | 480-507 | **Major** | `{...controlProps}` — props spreading masks what props are actually passed |
| `default-field.tsx` | 1400 | **Major** | 1400-line file violates 200-line component guideline |
| `validation-summary.tsx` | 82 | **Major** | `void structureVersion;` — using `void` to force memo re-computation instead of expressing dependency cleanly |
| `validation-summary.tsx` | 97 | **Minor** | 6 chained `useMemo` calls — cognitive overhead |
| `wizard.tsx` | 110-112 | **Minor** | `useEffect` focus — ref dependency missing from deps array |
| `renderer.tsx` | 27-64 | **Minor** | `useLayoutEffect` — one branch returns cleanup, other doesn't — inconsistent pattern |

### 5g. Signature-Specific

| File | Line | Severity | Description |
|------|------|----------|-------------|
| `formspec-signature-adapter-webcrypto/src/index.ts` | 11, 13 | Minor | `ADAPTER_ID` and `METHOD_URI_PREFIX` hardcoded — mirrors Rust crate constants via comment contract, drift risk |
| `formspec-signature-cose/src/index.ts` | 29, 39 | Minor | URI prefix constants — same drift risk |

No crypto algorithm validation gaps, key-material leaks, or weak error handling found in production adapter code.

**TS react+signature totals: 4 critical, 57 major, 74 minor (135 findings)**

---

## 6. Python Source + Tests

**Scope:** `src/formspec/`, `tests/`, `scripts/` (~80 `.py` files)

### Critical

| # | File | Line | Category | Description |
|---|------|------|----------|-------------|
| 1 | `src/formspec/validate.py` | 1196 | `large_file` | Single file 1196 lines — should be split into validation passes, CLI, and core |
| 2 | `src/formspec/_rust.py` | 579 | `large_file` | 579 lines — Python→Rust bridge file |
| 3 | `tests/conformance/spec/test_cross_spec_contracts.py` | 1233 | `large_file` | 1233 lines |
| 4 | `src/formspec/adapters/base.py` | 11 | `any_type` | `JsonValue = Any` — typedef alias for `Any` undermines type safety for all adapters |
| 5 | `src/formspec/validate.py` | 148, 290 | `any_type` | `_find_refs(obj: Any)` / `_lint_pass(title, artifacts, **lint_kwargs: Any)` — `Any` bleeds into signatures |
| 6 | `tests/conformance/spec/test_cross_spec_contracts.py` | 270 | `known_failing_test` | `test_s4_2_3__money_datatype_has_description` — comment says "This test FAILS until the definition schema adds..." |
| 7 | `tests/unit/test_validator_schema.py` | 110 | `missing_assertion` | `test_component_validation_completes_on_large_tree` — calls `lint(doc)` but discards result, only validates non-hang via timeout |

### Major

| # | File | Line | Category | Description |
|---|------|------|----------|-------------|
| 8 | `src/formspec/validate.py` | 165 | `large_function` | `discover_artifacts` — 116 lines, repeated detection pattern |
| 9 | `src/formspec/validate.py` | 426 | `large_function` | `_pass_signed_payload_validation` — 116 lines, repeated 8-block pattern |
| 10 | `src/formspec/validate.py` | 544 | `large_function` | `_pass_runtime_evaluation` — 58 lines |
| 11 | `src/formspec/validate.py` | 732 | `large_function` | `_pass_registry` — 92 lines |
| 12 | `src/formspec/validate.py` | 826 | `large_function` | `_pass_fel_expressions` — 92 lines with inline dependency walk |
| 13 | `src/formspec/validate.py` | 1040 | `large_function` | `print_report` — 93 lines, monolithic terminal UI |
| 14 | `src/formspec/validate.py` | 1138 | `large_function` | `main` — 56 lines CLI entry point |
| 15 | `src/formspec/validate.py` | 286-958 | `duplicate_code` | 6 of 12 `_pass_*` functions share identical loop+filter+append structure — only artifact source differs |
| 16 | `tests/conformance/fuzzing/test_cross_runtime_fuzzing.py` | 188 | `large_function` | `_build_fel_case` — 133 lines, giant if-elif chain with 11 branches |
| 17 | `tests/conformance/spec/test_spec_examples.py` | 85 | `large_function` | `_classify` — 66 lines, giant if-elif with 20+ branches |
| 18 | `src/formspec/fel/types.py` | 28 | `mutable_class_var` | `_instance = None` — singleton with shared mutable state |
| 19 | `tests/conftest.py` | 7 | `wildcard_import` | `from ..schema_fixtures import *  # noqa: F401,F403` — wildcard import with suppressed lint |
| 20 | `schema_fixtures.py` | 101 | `too_many_params` | `schema_registry` fixture injecting 13 dependent fixtures |

### Minor

| # | File | Line | Category | Description |
|---|------|------|----------|-------------|
| 21 | `src/formspec/validate.py` | 642, 669, 742 | `broad_except` | `except Exception as e:` — caught and wrapped, but broad |
| 22 | `src/formspec/_rust.py` | 206 | `silent_fallback` | `except ValueError: return value` — returns original on parse failure |
| 23 | `src/formspec/validate.py` | 286-314 | `deep_nesting` | Level 4: `_lint_pass` → `for a in artifacts` → `diags = lint` → list comp |
| 24 | `src/formspec/validate.py` | 835-917 | `deep_nesting` | Level 5: `_pass_fel_expressions` → nested for/if chain |
| 25 | `src/formspec/_rust.py` | 10 | `noqa` | `from formspec import _native as formspec_rust  # noqa: E402` |
| 26 | `tests/unit/test_fel_api.py` | 5 | `import_style` | Mixed import styles for same module |
| 27 | `tests/unit/test_fel_evaluator.py` | 15-38 | `module_helpers` | `val()`, `pyval()`, `pyval_inner()`, `diags()` at module level |
| 28 | `tests/e2e/headless/test_grant_app_processing.py` | 52-54 | `missing_annotation` | Missing type annotation on fixture function |

### Clean Areas (No Issues Found)

- `os.system` / `subprocess` — properly handled
- `is` with string literals — not found
- `== None` / `!= None` — consistently uses `is None` / `is not None`
- `eval()` / `exec()` — not found
- `global` variable usage — not found
- Mutable default arguments — not found (uses `None` + assignment or `dataclasses.field`)
- `raise Exception(...)` — not found (always specific types)
- Missing `__init__.py` — not an issue
- File/resource `with` — consistently used

**Python totals: 7 critical, 13 major, 8 minor (28 findings)**

---

## 7. Test TypeScript Files + Storybook

**Scope:** `tests/component/`, `tests/e2e/`, `tests/storybook/`, `stories/`, signature test files

### Critical

*(None on HEAD — former DEBUG `console.log` rows in `clinical-intake.spec.ts` removed.)*

### Major

| # | File | Line(s) | Category | Description |
|---|------|---------|----------|-------------|
| 3 | `tests/e2e/browser/grant-report/tribal-long.spec.ts` | — | `flaky_test` | ~~`expect(true)` else branches~~ **fixed** — readonly asserted via input `readonly` or `.formspec-field--readonly` |
| 4 | `tests/e2e/browser/clinical-intake.spec.ts` | — | `flaky_test` | ~~28× `waitForTimeout`~~ **migrated** — `engine-harness` locator/engine waits |
| 5 | `tests/e2e/browser/smoke/invoice.spec.ts` | — | `flaky_test` | ~~31× `waitForTimeout`~~ **migrated** — same harness helpers |
| 6 | `tests/e2e/browser/grant-report/tribal-long.spec.ts` | 22 occurrences | `flaky_test` | Hardcoded sleeps remain — migrate when touching grant-report E2E |
| 7 | `tests/e2e/browser/grant-app/budget-ui.spec.ts` | 11 occurrences | `flaky_test` | Same pattern |
| 8 | `tests/e2e/browser/helpers/grant-app.ts` | 27, 52, 60, 68, 79, 87, 95, 103, 111, 119, 127 | `any_type` | 11 `as any` / `: any` casts — `document.querySelector('formspec-render')` untyped |
| 9 | `tests/e2e/browser/helpers/clinical-intake.ts` | 31, 51, 96, 104, 110, 112, 120, 131, 139 | `any_type` | 9 `as any` casts — same pattern |
| 10 | `tests/e2e/browser/helpers/grant-report.ts` | 32, 46, 69, 77, 85, 96, 104 | `any_type` | 7 `as any` casts — same pattern |
| 11 | `tests/e2e/browser/helpers/invoice.ts` | 25, 37, 45, 53, 61, 72, 80 | `any_type` | 7 `as any` casts — same pattern |
| 12 | 4 helper modules | — | `duplicate_code` | `engineValue`, `engineSetValue`, `goToPage`, `getValidationReport`, `getResponse` nearly identical across all 4 files. Same `querySelector + getEngine` pattern duplicated. |
| 13 | 3 helper modules | — | `duplicate_code` | `goToPage` (navigate wizard by clicking Next until h2 matches) copy-pasted identically with same loop limit (10) and sleep (100ms) |
| 14 | `tests/e2e/browser/references/server-response-tab.spec.ts` | 5 | `serial_dependency` | `test.describe.configure({ mode: 'serial' })` — forces serial execution, tests share state |
| 15 | `tests/e2e/browser/clinical-intake.spec.ts` | 964 lines | `large_file` | Covers screener, instances, read-only fields, wizard, computed fields, conditionals, validation, response contract, nested repeats — should split |

### Minor

| # | File | Line(s) | Category | Description |
|---|------|---------|----------|-------------|
| 16 | `tests/e2e/fixtures/test-harness.ts` | 21, 24, 25, 30, 33, 37, 38, 40, 41 | `any_type` | 9 `(window as any)` casts — unavoidable for E2E harness globals |
| 17 | `tests/component/interactive-components.spec.ts` | 13, 50, 80, 117, 145, 181, 219, 244, 254, 277, 289, 313, 323, 345 | `any_type` | 15 `as any` on `querySelector('formspec-render')` |
| 18 | `tests/component/responsive-and-a11y.spec.ts` | 13, 65 | `any_type` | Same `formspec-render` typing gap |
| 19 | `tests/e2e/browser/smoke/invoice.spec.ts` | 344, 358, 359, 374, 384, 398, 417, 454 | `any_type` | `(r: any)` in validation result filters |
| 20 | `tests/e2e/browser/screener/screener-routing.spec.ts` | 106, 131, 155, 179, 298, 346 | `any_type` | `(e: any)` event listener callbacks |
| 21 | `tests/e2e/browser/screener/screener-routing.spec.ts` | 9 | `any_type` | `async function mountWithScreener(page: any)` — should be `Page` |
| 22 | `tests/e2e/browser/locale/locale-rendering.spec.ts` | 81 | `any_type` | `async function mountWithLocale(page: any, locale?: any)` — both params untyped |
| 23 | `stories/_shared/RealUSWDSStory.tsx` | 883 | `any_type` | `style={{ ['--real-uswds-stack-gap' as any]: gap }}` — CSS custom property workaround |
| 24 | `stories/_shared/RealUSWDSStory.tsx` | 1573 lines | `large_file` | Renders every USWDS component variant inline |
| 25 | `tests/e2e/browser/kitchen-sink-holistic-ui.spec.ts` | 58 | `any_type` | `const conditionalGroup = profileChildren.find((node: any) => ...)` |
| 26 | `tests/e2e/browser/helpers/harness.ts` | 25 | `any_type` | `submitAndGetResponse<T = any>` — generic defaults to `any` |
| 27 | Multiple spec files | — | `duplicate_code` | `report.results.filter((r: any) => r.path === 'X' && r.code === 'Y')` appears ~30 times. Should be shared `findValidationErrors(report, path, code)` helper |
| 28 | `tests/e2e/browser/grant-app/project-phases-ui.spec.ts` | 17-27, 43-54, 70-90 | `duplicate_code` | Three tests duplicate same 10-line field-filling preamble |
| 29 | All `grant-app/` specs | — | `performance` | Each `beforeEach` calls `mountGrantApplication(page)` which re-reads 5 JSON fixtures from disk via `fs.readFileSync`. Could be cached at module scope |

**Test+storybook totals: 0 critical, 11 major, 20 minor (31 findings; rows 3–5 fixed on HEAD — do not re-ticket)**

---

## 8. Schemas, Config, Build Files

**Scope:** 25 JSON schemas, `Makefile`, 4 CI workflows, package configs

### Critical

| # | File | Line | Category | Description |
|---|------|------|----------|-------------|
| 1 | `schemas/token-registry.json` | 1 | `data_in_schemas_dir` | Data instance file lives in `schemas/` alongside `.schema.json` files. Has no `$schema`, no `type`, no `required`, no `$id`. Misleading location — there's a proper `token-registry.schema.json` alongside it. |
| 2 | `schemas/respondent-ledger-event.schema.json` | 335, 338 | `untyped_schema` | `ChangeSetEntry.before` and `after` have empty schema `{}` — no `type`, no constraints. Accepts any JSON value without validation. |
| 3 | `schemas/respondent-ledger-event.schema.json` | 432, 434 | `untyped_schema` | `ResponseCorrectionFieldValue.originalValue` and `correctedValue` — no `type` or constraint. |

### Major

| # | File | Line | Category | Description |
|---|------|------|----------|-------------|
| 4 | `schemas/definition.schema.json` | 417-802 | `redundancy` | `Item` definition repeats `key`, `type`, `label`, `description`, `hint`, `labels`, `extensions`, `presentation` in 3 `allOf`/`if-then` branches (~45 lines). Should extract shared props into base `$def`. |
| 5 | `schemas/definition.schema.json` | 1474 | `permissive` | `Presentation` has `additionalProperties: true` — validation gap, malformed keys pass silently |
| 6 | `schemas/posture-declaration.schema.json` | 84, 99 | `missing_additional_props` | `jurisdictionalPosture` and `custodyPosture` objects lack `additionalProperties: false` |
| 7 | `schemas/posture-declaration.schema.json` | 94 | `untyped_schema` | `jurisdictionalPosture.notarialRequirements` is empty object `{}` |
| 8 | `schemas/registry.schema.json` | 324 | `permissive` | `RegistryEntry.examples` uses `"items": true` — accepts any JSON value |
| 9 | `schemas/conformance-suite.schema.json` | 31 | `missing_required` | `inputData` is optional with no conditional requirement — conformance case can pass with zero meaningful content |
| 10 | `schemas/respondent-ledger.schema.json` | 149 | `missing_validation` | `events` array doesn't enforce `minItems: 1`; events without hashes pass validation silently without integrityProfile |
| 11 | `schemas/fel-functions.schema.json` | 24, 174 | `redundancy` | 3 version markers doing the same thing: `properties.version` + root `$formspecFelFunctions` + instance `version` |
| 12 | `.github/workflows/ci.yml` | 9-86 | `no_cache` | **Remediated:** `setup-node`/`setup-python` `cache:` + `Swatinem/rust-cache@v2` on all jobs (not `actions/cache` directly) |
| 13 | `.github/workflows/ci.yml` | 9-86 | `no_timeout` | **Remediated:** `timeout-minutes` on all four CI jobs (60–120) |
| 14 | `.github/workflows/ci.yml` | 35 | `incomplete_setup` | `python-tests` job sets up rust-toolchain but NOT `targets: wasm32-unknown-unknown` — will fail if any dev-dep transitively needs wasm |
| 15 | `.github/workflows/ci.yml` + `publish.yml` | multiple | `duplication` | All jobs repeat same checkout + setup boilerplate (~8 steps each). Should extract into composite action. |
| 16 | `Makefile` | 131 | `missing_phony` | `docs` target missing from `.PHONY` — if `docs` file exists, Make skips execution |
| 17 | `Makefile` | 8 | `hardcoded_path` | `FEL_GRAMMAR_SRC = ../fel-core/specs/fel/fel-grammar.md` — breaks if checkout layout changes |

### Minor

| # | File | Line | Category | Description |
|---|------|------|----------|-------------|
| 18 | `schemas/component.schema.json` | 273-316 | `complexity` | `AnyComponent` uses `oneOf` with 30 sub-schemas — slow validation, cryptic errors. Consider discriminator-based approach. |
| 19 | `schemas/definition.schema.json` | 1616 | `verbose_description` | `FELExpression` description is ~2000 chars of FEL grammar docs — should be in spec docs, not schema |
| 20 | `schemas/mapping.schema.json` | 534-637 | `redundancy` | `InnerRule` is near-verbatim copy of `FieldRule` with one additional property (~100 lines duplicated) |
| 21 | `schemas/respondent-ledger-event.schema.json` | 205-229 | `missing_descriptions` | `EventType` enum has 24 values but only single description covering all |
| 22 | `Makefile` | 1 | `missing_help` | No `help` target |
| 23 | `Makefile` | 170 | `portability` | `serve` target uses `busybox httpd` — not available on macOS without Homebrew |
| 24 | `.gitignore` | 32, 52 | `duplicate_entry` | `target/` appears twice |
| 25 | `package.json` | 1 | `missing_version` | No `version` field (acceptable for private workspace root but some tooling expects it) |

**Schema+config+build totals: 3 critical, 12 major, 15 minor (30 findings)**

---

## 9. Specs, Docs, Examples

**Scope:** `specs/`, `thoughts/adr/`, `thoughts/plans/`, `examples/`, root docs

### Critical

*(None remaining — former `CLAUDE.md` Plane.so / API-key row removed with Plane tracking.)*

### Major

| # | File | Line | Category | Description |
|---|------|------|----------|-------------|
| 2 | `specs/component/component-spec.md` | — | `date_mismatch` | ~~Frontmatter vs body date/version~~ **fixed** — body aligned to `2026-04-09` / `1.0.0-draft.1` |
| 3 | `specs/mapping/mapping-spec.md` | — | `date_mismatch` | ~~body `2025-07-10`~~ **fixed** |
| 4 | `specs/registry/extension-registry.md` | — | `date_mismatch` | ~~body `2025-07-10`~~ **fixed** |
| 5 | `specs/registry/changelog-spec.md` | — | `date_mismatch` | ~~body `2025-07`~~ **fixed** |
| 6 | `specs/component/component-spec.md` | — | `version_mismatch` | ~~body `1.0.0`~~ **fixed** (see row 2) |
| 7 | `specs/audit/respondent-ledger-spec.md` | 445 | `broken_link` | `[ADR 0072](../../thoughts/adr/0072-...)` — ADR lives at stack root, not inside formspec submodule |
| 8 | `specs/registry/signature-method-registry.md` | 99 | `broken_link` | `[ADR 0111](../../thoughts/adr/0111-...)` — same issue |
| 9 | `specs/core/spec.md` | ~§4.7, ~§7.5 | `deprecated_content` | Contains deprecated screener routing sections that duplicate standalone `specs/screener/screener-spec.md` |
| 10 | `specs/core/spec.md` | 5006 lines | `large_doc` | 5000+ line spec with no table of contents |
| 11 | `specs/component/component-spec.md` | 3592 lines | `large_doc` | 3600+ lines, no TOC |
| 12 | `specs/mapping/mapping-spec.md` | 2030 lines | `large_doc` | 2000+ lines, no TOC |
| 13 | `specs/screener/screener-spec.md` | 2060 lines | `large_doc` | 2000+ lines, no TOC |

### Minor

| # | File | Line | Category | Description |
|---|------|------|----------|-------------|
| 14 | `specs/locale/locale-spec.md` | 4 vs 11 | `date_mismatch` | Frontmatter `2026-04-09` vs body `2026-03-20` — 20 day gap |
| 15 | `specs/screener/screener-spec.md` | 4 vs body | `date_mismatch` | Frontmatter vs body, 9 day gap |
| 16 | `specs/theme/theme-spec.md` | 13 | `broken_link` | `[Formspec v1.0 Core Specification](spec.md)` — relative path wrong, should be `../core/spec.md` |
| 17 | `specs/registry/signature-method-registry.md` | 77, 91 | `placeholder` | PQC methods have `alg = TBD (awaiting IANA registration)` |
| 18 | `specs/mapping/mapping-spec.md` | 1782 | `placeholder` | Example error message uses "TBD" as literal value |
| 19 | `thoughts/adr/` (0029, 0030, 0031, 0040, 0048, 0051, 0052, 0053) | headers | `stale_status` | All 8 ADRs still status "Proposed" — some partially implemented, should be "Accepted" or "Superseded" |
| 20 | `thoughts/plans/2026-03-16-u1-u4-mcp-ux-fixes.md` | 1-6 | `stale_status` | Plan from 2026-03-16 still marked "Proposed" |
| 21 | `examples/references/tools.html` | 302-476+ | `inline_styles` | 41 instances of inline CSS — poor example for a design-system project |
| 22 | `specs/screener/screener-spec.md` | 1514, 1541, 1601, 2049 | `stale_content` | Embedded screener deprecation notices and migration appendix — migration incomplete |

**Specs+docs+examples totals: 0 critical, 2 major, 11 minor (13 findings; date/version rows 2–6 fixed on HEAD)**

---

## Appendix: Agent Mapping

| Agent | Area | Status |
|-------|------|--------|
| 1 | Rust core crates (formspec-core, eval, lint, wasm, changeset) | Complete |
| 2 | Rust supporting crates (signature-*, cross-stack-fixture, py) | Complete |
| 3 | TS packages — engine, layout, types | Complete (summary) |
| 4 | TS packages — core, webcomponent, adapters, assist | Complete |
| 5 | TS packages — react, signature | Complete |
| 6 | Python source + tests | Complete |
| 7 | Test TS files + storybook | Complete |
| 8 | Schemas, config, build files | Complete |
| 9 | Specs, docs, examples | Complete |

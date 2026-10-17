# Formspec Conformance Test Suite

Machine-readable test suite validating JSON documents against the Formspec
family of JSON Schemas (draft 2020-12) and exercising the reference
implementations.

## Layout

The suite is organized into five functional tiers as defined in **ADR 0035**:

- `tests/unit/` — Pure logic, memory-bound, fast. Python-specific engine tests.
- `tests/component/` — Isolated DOM tests for Web Components (Playwright).
- `tests/integration/` — Cross-module plumbing, CLI, and fixture integrity.
- `tests/e2e/` — Full-stack scenarios (Browser User Journeys and Headless).
- `tests/conformance/` — Standards integrity, schemas, and cross-runtime parity.

## Coverage (Python Suite)

| Category | Component | Test File | Tests |
|---|---|---|---|
| **Schemas** | `definition.schema.json` | `conformance/schemas/test_definition_schema.py` | 141 |
| | `response.schema.json` | `conformance/schemas/test_response_schema.py` | 48 |
| | `mapping.schema.json` | `conformance/schemas/test_mapping_schema.py` | 98 |
| | `registry.schema.json` | `conformance/schemas/test_registry_schema.py` | 78 |
| | `theme.schema.json` | `conformance/schemas/test_theme_schema.py` | 201 |
| | `component.schema.json` | `conformance/schemas/test_component_schema.py` | 115 |
| | Presentation Hints | `conformance/schemas/test_presentation_hints.py` | 111 |
| **Standards** | Spec Example Extraction | `conformance/spec/test_spec_examples.py` | 227 |
| | Cross-Spec Contract | `conformance/spec/test_cross_spec_contracts.py` | 177 |
| | Property-Based (Fuzzing) | `conformance/fuzzing/test_property_based.py` | 50 |
| | Cross-Runtime Fuzzing | `conformance/fuzzing/test_cross_runtime_fuzzing.py` | 2 |
| | Round-Trip fidelity | `conformance/roundtrip/test_roundtrip_contracts.py` | 11 |
| **Runtime** | FEL Parser | `unit/test_fel_parser.py` | 109 |
| | FEL Evaluator | `unit/test_fel_evaluator.py` | 110 |
| | FEL Functions | `unit/test_fel_functions.py` | 109 |
| | FEL API | `unit/test_fel_api.py` | 27 |
| | Mapping Engine | `unit/test_mapping_engine.py` | 50 |
| | Registry Logic | `unit/test_registry.py` | 35 |
| **Integration**| Fixture Integrity | `integration/fixtures/test_core_fixtures.py` | 26 |
| | FEL Pipeline | `integration/test_fel_pipeline.py` | 13 |
| | Validator CLI | `integration/cli/test_validator_cli.py` | 4 |
| **E2E** | Headless Processing | `e2e/headless/` | 27 |
| **Total** | | | **2088** |

## Monorepo Package Tests (TypeScript/JavaScript)

In addition to the root Python suite, implementation-specific unit tests reside within each package:

### 🧩 `packages/formspec-engine/tests/`

Tests the TypeScript reference implementation of the Formspec engine.

- **FEL Semantics:** Core logic for null handling, type discipline, and complex value semantics.
- **State Management:** Reactive calculation chains, validation triggers, and repeat group lifecycle.
- **Data Binding:** Path resolution, value coercion, and response pruning.
- **Conformance:** Shared-suite parity with the Rust evaluator via `tests/conformance/suite/*.json`: `shared-suite.test.mjs` here, `crates/formspec-eval/tests/integration/shared_suite.rs` there (every `ENGINE_PROCESSING` case's `expected.data` must survive a Rust re-evaluation unchanged).

### 🏗 `packages/formspec-webcomponent/tests/`

Tests the Web Component renderer and UI integration logic.

- **Component Plugins:** Isolated testing of individual widget rendering (TextInput, RadioGroup, etc.).
- **Theme Resolver:** Correct implementation of the Tier 2 selector cascade and token resolution.
- **Render Lifecycle:** Reactive DOM updates, focus management, and accessibility attribute injection.
- **Registry:** Plugin registration and component discovery logic.

## Test Layers

### Layer 1: Schema Conformance

Hand-written positive/negative test cases in `tests/conformance/schemas/`. One assertion per constraint.

### Layer 2: Spec Example Extraction

Automatically extracts every ` ```json ` block from every `.md` spec file, classifies it, and validates against the appropriate schema in `tests/conformance/spec/test_spec_examples.py`.

### Layer 3: Property-Based / Generative Testing

Uses Hypothesis in `tests/conformance/fuzzing/` to generate random valid documents and verify they pass validation, then applies targeted mutations to verify rejections. This directory also contains cross-runtime fuzzing that compares normalized Python and Node engine results for FEL evaluation and processing semantics.

### Layer 4: Cross-Spec Contract Tests

Verifies normative spec prose matches actual JSON schema structure in `tests/conformance/spec/test_cross_spec_contracts.py`.

### Layer 5: Reference Implementation Tests

Unit tests for the reference implementations. Python tests reside in `tests/unit/`, while TypeScript tests reside in `packages/*/tests/`.

### Layer 6: End-to-End (E2E)

Full-stack validation including browser-based user journeys (`tests/e2e/browser/`) and headless pipeline executions (`tests/e2e/headless/`).

## Prerequisites

```bash
pip install pytest jsonschema hypothesis
```

## Running

```bash
# Run the full Python suite:
python3 -m pytest tests/ -v

# Run JavaScript package tests (Monorepo):
npm run test:unit --workspace=formspec-engine
npm run test:unit --workspace=formspec-webcomponent

# Run Playwright E2E tests:
npm run test:e2e

# Targeted runs:
python3 -m pytest tests/unit/ -v
python3 -m pytest tests/conformance/schemas/ -v
python3 -m pytest tests/conformance/fuzzing/test_cross_runtime_fuzzing.py -v

# With coverage (Python):
python3 -m pytest tests/ --cov=src/formspec --cov-report=term
```

## Adding Tests

1. **Unit logic?** Add to `tests/unit/` (Python) or the respective package `tests/` directory (TS).
2. **New Schema constraint?** Add to `tests/conformance/schemas/`.
3. **Integration scenario?** Add to `tests/integration/`.
4. **User journey?** Add to `tests/e2e/browser/` as a Playwright spec.
5. **Cross-runtime parity rule?** Add a case under `tests/conformance/suite/` and run both native shared-suite runners.

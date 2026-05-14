# Changelog generation fails document-type detection

**Status:** Implemented
**Date:** 2026-04-17
**Raised by:** benchmark harness work (`benchmarks/tasks/grant-report/`)

## Problem

`generate_changelog(parent_def, child_def, child_url)` in `formspec._rust`
produces a document that `detect_document_type` cannot classify. When the
validator's changelog-generation pass (`src/formspec/validate.py:493
_pass_changelog_generation`) pipes the generated document through `lint()`
(same file, line 531), the linter's pass-1 document-type detection emits:

```
E100  $  Cannot determine document type
```

Reproducer: place the grant-report base + short + long definitions in a
single directory (`examples/grant-report/` does exactly this) and run
`python3 -m formspec.validate examples/grant-report/`. Each definition
validates fine in isolation; the generated changelog trips E100.

The benchmark harness worked around this by scoping
`benchmarks/tasks/grant-report/` to the short form only. That workaround is
being removed as part of this fix.

## Root cause (verified)

**The generator and the schema disagree about the document envelope.**

- `crates/formspec-lint/schemas/changelog.schema.json:7` requires
  `$formspecChangelog` as the first required field (schema:
  `"const": "1.0"`).
- `crates/formspec-core/src/schema_validator.rs:131-144` already maps
  `$formspecChangelog` to `DocumentType::Changelog` in `MARKER_FIELDS`;
  detection logic has **no gap**.
- `crates/formspec-core/src/json_artifacts.rs:67-88`
  (`changelog_to_json_value`) serialises only the body fields
  (`definitionUrl` / `fromVersion` / `toVersion` / `semverImpact` /
  `changes`). It **never emits `$formspecChangelog`**.

Because the marker is absent from the serialised JSON,
`detect_document_type` correctly returns `None` and pass-1 of the linter
emits E100. The root domino is **the serializer** — not the detector, not
the changeset dependency crate, and not the pass-1 heuristics.

## Why this escaped the test suite

The two tests that look like they verify output shape check the **body**
but not the **envelope**:

- `crates/formspec-wasm/src/wasm_tests.rs:346` (`generate_changelog_inner_output_shape`)
  asserts `definitionUrl`, `fromVersion`, `toVersion`, `semverImpact`,
  `changes[]` are present but never checks for `$formspecChangelog`.
- `crates/formspec-py/src/native_tests.rs:169, 184` follow the same
  pattern for `JsonWireStyle::PythonSnake` and `JsonWireStyle::JsCamel`.

A working changelog that feeds back into the linter cannot be validated
until both the envelope marker and a round-trip test exist.

## Fix

1. **Serializer** — In `crates/formspec-core/src/json_artifacts.rs`,
   `changelog_to_json_value` emits `$formspecChangelog: "1.0"` as the
   first key for both `JsonWireStyle::JsCamel` and
   `JsonWireStyle::PythonSnake`. The marker field name is identical
   across wire styles (it's a JSON-level envelope marker, never
   translated to `$formspec_changelog`).

2. **Wire keys** — `crates/formspec-core/src/wire_keys.rs` gains a
   `marker` field on `ChangelogRootKeys` + the schema-required
   `CHANGELOG_MARKER_VERSION` ("1.0"), centralising the string so
   future schema version bumps change one place.

3. **Envelope round-trip tests** — `wasm_tests.rs` and `native_tests.rs`
   both assert `$formspecChangelog == "1.0"` and additionally assert
   that `detect_document_type` returns `DocumentType::Changelog` for
   the generated output.

4. **Python round-trip — schema key translation** — In
   `src/formspec/validate.py::_pass_changelog_generation`, the generated
   snake-case dict is translated to camelCase before calling `lint()`.
   Rationale: JSON documents are canonically camelCase (the schemas are
   camelCase and `additionalProperties: false`). `generate_changelog`'s
   Python-facing snake-case API is preserved for backward compatibility
   with `tests/unit/test_changelog.py` and existing callers; the
   translation happens at the lint boundary only. Without this step,
   even with the marker present, the linter would emit E101 schema
   errors (unknown `definition_url`, `from_version`, etc.).

5. **Conformance test** — `tests/conformance/roundtrip/` gains
   `test_changelog_generation_roundtrip.py` — generates a changelog via
   Python, round-trips through `lint()`, asserts zero E100 / E101.

6. **Benchmark widening** — `benchmarks/tasks/grant-report/reference/`
   gains `tribal-base.definition.json` and `tribal-long.definition.json`
   alongside the existing short form. `requirement.md` is rewritten to
   cover all three variants. `tribal.changelog.json` already targets
   `tribal-long` so the pair becomes complete. `meta.json` `tiers_covered`
   now includes `derivedFrom`-driven inheritance.

## Out of scope

- Changing the `Change` / `Changelog` struct shape.
- Changing the snake-case Python API surface of `generate_changelog`
  itself. (Eventually the Python binding should return camelCase
  matching the schema, but that's a separate breaking change with
  downstream test churn.)
- Refactoring pass-1 detection heuristics.

## Affected files

- `crates/formspec-core/src/json_artifacts.rs` — emit marker.
- `crates/formspec-core/src/wire_keys.rs` — centralise marker constant.
- `crates/formspec-wasm/src/wasm_tests.rs` — envelope + round-trip
  assertions.
- `crates/formspec-py/src/native_tests.rs` — envelope assertions for
  both wire styles.
- `src/formspec/validate.py` — snake→camel translation before
  `lint(changelog)`.
- `tests/conformance/roundtrip/test_changelog_generation_roundtrip.py` —
  new conformance test.
- `benchmarks/tasks/grant-report/reference/tribal-base.definition.json`,
  `tribal-long.definition.json` — widened reference.
- `benchmarks/tasks/grant-report/requirement.md`,
  `benchmarks/tasks/grant-report/meta.json` — task scope update.

## References

- `crates/formspec-lint/schemas/changelog.schema.json:7` — schema requires
  `$formspecChangelog`.
- `crates/formspec-core/src/schema_validator.rs:131-144` — detector
  already knows about the marker.
- `crates/formspec-core/src/json_artifacts.rs:67-88` — **root domino**:
  serializer never wrote the marker.
- `src/formspec/validate.py:493-531` — pass that exposed the defect.

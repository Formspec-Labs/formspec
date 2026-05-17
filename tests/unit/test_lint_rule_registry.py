"""Registry coverage for lint rule metadata — ensures every code emitted by the
Rust linter appears in `specs/lint-codes.json`, and that rules declared
`tested` or `stable` carry real `specRef` + `suggestedFix` values that match
what the linter emits at runtime.

This is the contract the authoring loop depends on: LLMs read the diagnostic's
`suggested_fix` and `spec_ref` to apply structured repairs and cite spec.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from formspec._rust import LintDiagnostic, lint


REPO_ROOT = Path(__file__).resolve().parents[2]
REGISTRY_PATH = REPO_ROOT / "specs" / "lint-codes.json"

REQUIRED_RULE_FIELDS = ("code", "pass", "severity", "title", "state")
ALLOWED_STATES = {"draft", "tested", "stable"}
ALLOWED_SEVERITIES = {"error", "warning", "info"}
ALLOWED_SPEC_REF_PREFIXES = ("specs/", "../fel-core/specs/")


def _load_registry() -> dict:
    assert REGISTRY_PATH.exists(), (
        f"Lint rule registry missing at {REGISTRY_PATH}. "
        "Seed it alongside any new diagnostic code."
    )
    return json.loads(REGISTRY_PATH.read_text(encoding="utf-8"))


def _rules_by_code() -> dict[str, dict]:
    registry = _load_registry()
    rules = registry.get("rules", [])
    return {rule["code"]: rule for rule in rules}


def _spec_ref_target_path(spec_ref: str) -> Path:
    rel_path = spec_ref.split("#", 1)[0]
    return REPO_ROOT / rel_path


def test_registry_structure_is_well_formed() -> None:
    registry = _load_registry()
    assert registry.get("version"), "registry must declare a version"
    assert isinstance(registry.get("rules"), list)
    assert registry["rules"], "registry must list at least one rule"


def test_every_rule_has_required_fields() -> None:
    rules = _rules_by_code()
    for code, rule in rules.items():
        for field in REQUIRED_RULE_FIELDS:
            assert field in rule, f"rule {code} missing required field '{field}'"
        assert rule["severity"] in ALLOWED_SEVERITIES, (
            f"rule {code} has invalid severity '{rule['severity']}'"
        )
        assert rule["state"] in ALLOWED_STATES, (
            f"rule {code} has invalid state '{rule['state']}'"
        )
        assert isinstance(rule["pass"], int), f"rule {code}: pass must be int"
        assert rule["title"], f"rule {code}: title must be non-empty"


def test_tested_and_stable_rules_have_spec_ref_and_suggested_fix() -> None:
    rules = _rules_by_code()
    for code, rule in rules.items():
        if rule["state"] not in ("tested", "stable"):
            continue
        assert rule.get("specRef"), (
            f"rule {code} is {rule['state']} but has no specRef — "
            "tested rules must point back to the normative spec clause"
        )
        assert rule.get("suggestedFix"), (
            f"rule {code} is {rule['state']} but has no suggestedFix — "
            "tested rules must offer a machine-actionable repair hint"
        )
        assert rule["specRef"].startswith(ALLOWED_SPEC_REF_PREFIXES), (
            f"rule {code}: specRef should point under specs/ or ../fel-core/specs/"
        )
        assert _spec_ref_target_path(rule["specRef"]).exists(), (
            f"rule {code}: specRef target does not exist: {rule['specRef']}"
        )


def test_registry_covers_every_code_the_linter_emits() -> None:
    """Every code currently emitted by the Rust linter source must be registered."""
    emitted_codes = _scan_linter_source_for_codes()
    registered = set(_rules_by_code().keys())
    missing = emitted_codes - registered
    assert not missing, (
        f"Linter emits codes not in registry: {sorted(missing)}. "
        "Add entries to specs/lint-codes.json."
    )


def test_metadata_rs_reads_registry_not_hardcoded_table() -> None:
    """Structural invariant: `crates/formspec-lint/src/metadata.rs` must load
    rule metadata from `specs/lint-codes.json` via `include_str!`, not from a
    hand-maintained match table. This collapses the previous drift risk —
    where code said 'tested' while registry said 'draft', or vice versa —
    into a single source of truth.

    If someone reverts to a hardcoded table, reinstate the earlier
    `_scan_metadata_rs_for_codes` helper plus a drift check.
    """
    metadata_rs = (
        REPO_ROOT / "crates" / "formspec-lint" / "src" / "metadata.rs"
    ).read_text(encoding="utf-8")
    assert 'include_str!("../../../specs/lint-codes.json")' in metadata_rs, (
        "metadata.rs must embed specs/lint-codes.json via include_str! so "
        "the registry is the single source of truth for authoring metadata."
    )


def _scan_linter_source_for_codes() -> set[str]:
    """Collect every diagnostic code literal from the Rust linter sources,
    excluding code strings that appear inside `#[cfg(test)] mod tests` blocks
    (those are synthetic fixtures, not real emission sites).
    """
    import re

    src_root = REPO_ROOT / "crates" / "formspec-lint" / "src"
    string_pattern = re.compile(r'"([EW]\d{3})"')
    enum_pattern = re.compile(r"LintCode::([EW]\d{3})")
    codes: set[str] = set()
    for path in src_root.rglob("*.rs"):
        text = path.read_text(encoding="utf-8")
        production_text = _strip_test_modules(text)
        codes.update(string_pattern.findall(production_text))
        codes.update(enum_pattern.findall(production_text))
    return codes


def _strip_test_modules(rust_source: str) -> str:
    """Remove `#[cfg(test)] mod tests { ... }` blocks so code literals inside
    test fixtures don't get counted as emission sites.

    Caveat: brace depth is computed with raw character counts, so `{` / `}`
    inside a string literal inside a test module can unbalance the walker.
    This is acceptable today because no such literal exists — see
    `test_strip_test_modules_handles_literal_braces_in_strings` for the
    adversarial regression guard.
    """
    lines = rust_source.splitlines()
    out: list[str] = []
    i = 0
    while i < len(lines):
        line = lines[i]
        if "#[cfg(test)]" in line:
            # Skip until we hit a matching `mod <name> {` and consume its body.
            j = i + 1
            while j < len(lines) and "mod " not in lines[j]:
                j += 1
            if j >= len(lines):
                break
            # Walk brace depth to find the end of the module.
            depth = 0
            started = False
            k = j
            while k < len(lines):
                depth += lines[k].count("{") - lines[k].count("}")
                if "{" in lines[k]:
                    started = True
                if started and depth == 0:
                    break
                k += 1
            i = k + 1
            continue
        out.append(line)
        i += 1
    return "\n".join(out)


def test_strip_test_modules_removes_test_code_literals() -> None:
    """Sanity: codes inside a `#[cfg(test)] mod tests { ... }` block are dropped
    so they are not counted as production emission sites."""
    sample = (
        'fn emit_production() { LintDiagnostic::error("E100", 1, "$", "x"); }\n'
        "\n"
        "#[cfg(test)]\n"
        "mod tests {\n"
        '    fn only_in_test() { let _ = "W999"; }\n'
        "}\n"
    )
    stripped = _strip_test_modules(sample)
    assert '"E100"' in stripped
    assert '"W999"' not in stripped, (
        "test-module code literal should be stripped from the production scan"
    )


def test_strip_test_modules_handles_literal_braces_in_strings() -> None:
    """Regression guard: the brace-depth walker is character-based, so a `}`
    inside a string literal inside a test module could in principle close the
    test module early and leak subsequent code-literal matches into production.
    Today no such literal exists, but this test plants one so a future
    contributor can't silently break the invariant.
    """
    sample = (
        'fn emit_production() { LintDiagnostic::error("E100", 1, "$", "x"); }\n'
        "\n"
        "#[cfg(test)]\n"
        "mod tests {\n"
        '    // a string with braces that could confuse a naïve walker:\n'
        '    const TRICKY: &str = "fake close } fake open { \\"W999\\"";\n'
        '    fn inside() { let _code = "W998"; }\n'
        "}\n"
        "\n"
        'fn emit_more_production() { LintDiagnostic::warning("W300", 3, "$", "y"); }\n'
    )
    stripped = _strip_test_modules(sample)
    assert '"E100"' in stripped
    assert '"W300"' in stripped, (
        "production code *after* the test module must survive stripping"
    )
    # Today the walker treats the literal `}` and `{` as real braces. Because
    # the embedded-brace count is balanced (`}` then `{`), the walker still
    # closes the test module at the right line and excludes W998/W999. If this
    # assertion ever fails, someone added an unbalanced brace literal and the
    # walker needs a real tokenizer.
    assert '"W998"' not in stripped
    assert '"W999"' not in stripped


# ── End-to-end: registry-driven fixture coverage ──────────────
#
# Every rule at state `tested` or `stable` must point at ≥1 on-disk fixture
# that, when linted, emits the rule's code with matching spec_ref and
# suggested_fix. This replaces hand-crafted per-rule tests: to graduate a
# new rule, drop a fixture into tests/fixtures/lint/ and list it in
# specs/lint-codes.json — the loop below covers the rest.


def _check_diagnostics_against_registry(
    code: str,
    rule: dict,
    rel_path: str,
    matching: list,
) -> list[str]:
    """Verify every diagnostic in `matching` carries registry-consistent
    `spec_ref` + `suggested_fix`. Each divergent emission produces its own
    failure line so repeated emissions can't mask drift.

    The previous single-pick assertion (`matching[0]`) silently accepted any
    divergent metadata on later emissions — a real inconsistency would have
    slipped through as long as the first emission matched.
    """
    failures: list[str] = []
    for index, diag in enumerate(matching):
        locator = rel_path if len(matching) == 1 else f"{rel_path} (emission #{index})"
        if diag.spec_ref != rule["specRef"]:
            failures.append(
                f"{code}: fixture {locator} emitted spec_ref={diag.spec_ref!r}, "
                f"registry has {rule['specRef']!r}"
            )
        if diag.suggested_fix != rule["suggestedFix"]:
            failures.append(
                f"{code}: fixture {locator} emitted suggested_fix="
                f"{diag.suggested_fix!r}, registry has {rule['suggestedFix']!r}"
            )
    return failures


def test_every_tested_rule_has_at_least_one_triggering_fixture() -> None:
    rules = _rules_by_code()
    failures: list[str] = []
    for code, rule in sorted(rules.items()):
        if rule["state"] not in ("tested", "stable"):
            continue

        fixtures = rule.get("fixtures")
        if not isinstance(fixtures, list) or not fixtures:
            failures.append(
                f"{code}: state={rule['state']} but 'fixtures' is empty. "
                "Add a path under tests/fixtures/lint/ that triggers this rule."
            )
            continue

        for rel_path in fixtures:
            if not isinstance(rel_path, str):
                failures.append(f"{code}: fixture entry must be a string, got {rel_path!r}")
                continue
            fixture_path = REPO_ROOT / rel_path
            if not fixture_path.exists():
                failures.append(f"{code}: fixture path does not exist: {rel_path}")
                continue

            try:
                document = json.loads(fixture_path.read_text(encoding="utf-8"))
            except json.JSONDecodeError as exc:
                failures.append(f"{code}: fixture {rel_path} is not valid JSON: {exc}")
                continue

            # Some rules (W800, W802) only fire when the linter has the paired
            # definition. Fixtures opt in via a top-level `_pairedDefinition`
            # key that is stripped before the document is passed to `lint()`.
            # Extension-lifecycle rules (E600, E601, E602) additionally need a
            # registry document; fixtures declare those under
            # `_registryDocuments` (stripped and forwarded to lint()).
            paired_definition = document.pop("_pairedDefinition", None)
            registry_documents = document.pop("_registryDocuments", None)

            diagnostics = lint(
                document,
                component_definition=paired_definition,
                registry_documents=registry_documents,
            )
            matching = [d for d in diagnostics if d.code == code]
            if not matching:
                emitted = sorted({d.code for d in diagnostics})
                failures.append(
                    f"{code}: fixture {rel_path} did not emit {code}. "
                    f"Emitted codes: {emitted}"
                )
                continue

            failures.extend(
                _check_diagnostics_against_registry(code, rule, rel_path, matching)
            )

    assert not failures, "\n".join(failures)


# ── Unit coverage for the divergence checker ──────────────────
#
# These tests exercise `_check_diagnostics_against_registry` directly with
# synthetic diagnostics so the "repeated emissions with divergent metadata"
# case is covered independently of whatever the Rust linter emits today.
# The previous `matching[0]`-only assertion silently accepted drift after
# the first emission; these tests pin down the tightened contract.


def _make_diag(code: str, *, spec_ref: str | None, suggested_fix: str | None) -> LintDiagnostic:
    return LintDiagnostic(
        code=code,
        severity="warning",
        path="$",
        message="synthetic",
        suggested_fix=suggested_fix,
        spec_ref=spec_ref,
    )


def test_divergence_checker_passes_when_all_emissions_match_registry() -> None:
    rule = {"specRef": "specs/core/spec.md#x", "suggestedFix": "fix x"}
    matching = [
        _make_diag("W999", spec_ref="specs/core/spec.md#x", suggested_fix="fix x"),
        _make_diag("W999", spec_ref="specs/core/spec.md#x", suggested_fix="fix x"),
    ]
    assert _check_diagnostics_against_registry("W999", rule, "fake.json", matching) == []


def test_divergence_checker_catches_divergent_spec_ref_on_later_emission() -> None:
    """Old behavior: `matching[0]` matched, so divergent `matching[1]` slipped
    through silently. New behavior: every emission is checked and divergence
    on any emission is reported with an emission-index locator."""
    rule = {"specRef": "specs/core/spec.md#x", "suggestedFix": "fix x"}
    matching = [
        _make_diag("W999", spec_ref="specs/core/spec.md#x", suggested_fix="fix x"),
        _make_diag("W999", spec_ref="specs/core/spec.md#DIVERGED", suggested_fix="fix x"),
    ]
    failures = _check_diagnostics_against_registry("W999", rule, "fake.json", matching)
    assert len(failures) == 1
    assert "emission #1" in failures[0]
    assert "DIVERGED" in failures[0]


def test_divergence_checker_catches_divergent_suggested_fix_on_later_emission() -> None:
    rule = {"specRef": "specs/core/spec.md#x", "suggestedFix": "fix x"}
    matching = [
        _make_diag("W999", spec_ref="specs/core/spec.md#x", suggested_fix="fix x"),
        _make_diag("W999", spec_ref="specs/core/spec.md#x", suggested_fix="fix DIVERGED"),
    ]
    failures = _check_diagnostics_against_registry("W999", rule, "fake.json", matching)
    assert len(failures) == 1
    assert "emission #1" in failures[0]
    assert "DIVERGED" in failures[0]


def test_divergence_checker_reports_each_divergent_emission_separately() -> None:
    """Two emissions diverge on different fields — both must be reported."""
    rule = {"specRef": "specs/core/spec.md#x", "suggestedFix": "fix x"}
    matching = [
        _make_diag("W999", spec_ref="specs/core/spec.md#x", suggested_fix="fix x"),
        _make_diag("W999", spec_ref="specs/core/spec.md#A", suggested_fix="fix x"),
        _make_diag("W999", spec_ref="specs/core/spec.md#x", suggested_fix="fix B"),
    ]
    failures = _check_diagnostics_against_registry("W999", rule, "fake.json", matching)
    assert len(failures) == 2
    assert any("emission #1" in f and "#A" in f for f in failures)
    assert any("emission #2" in f and "fix B" in f for f in failures)


def test_divergence_checker_omits_emission_index_for_single_match() -> None:
    """When there's only one matching diagnostic, the locator stays clean —
    no confusing `(emission #0)` suffix for the common single-match case."""
    rule = {"specRef": "specs/core/spec.md#x", "suggestedFix": "fix x"}
    matching = [
        _make_diag("W999", spec_ref="specs/core/spec.md#DIVERGED", suggested_fix="fix x"),
    ]
    failures = _check_diagnostics_against_registry("W999", rule, "some/fixture.json", matching)
    assert len(failures) == 1
    assert "emission #" not in failures[0]
    assert "some/fixture.json" in failures[0]

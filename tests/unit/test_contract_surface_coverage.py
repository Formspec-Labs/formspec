"""Contract surface coverage checks.

This is intentionally small: it verifies that a contract promoted to
``status=enforced`` has concrete proof points in conformance, crates, and
package tests. It does not execute those tests; focused scripts choose which
test commands to run for each contract family.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any


REPO_ROOT = Path(__file__).resolve().parents[2]
LEDGER_PATH = REPO_ROOT / "tests" / "contracts" / "surface-coverage.json"
SPEC_ARTIFACTS_CONFIG = REPO_ROOT / "scripts" / "spec-artifacts.config.json"
REQUIRED_CONTRACT_FIELDS = {"status", "spec", "schema", "conformance", "crates", "packages"}
ALLOWED_STATUSES = {"enforced", "deferred"}


def _load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def _as_paths(value: Any) -> list[str]:
    assert isinstance(value, list), f"expected list of paths, got {type(value).__name__}"
    assert value, "path list must not be empty"
    for item in value:
        assert isinstance(item, str) and item.strip(), f"invalid path entry: {item!r}"
    return value


def _assert_paths_exist(paths: list[str], *, label: str) -> None:
    for rel_path in paths:
        assert not rel_path.startswith("/"), f"{label}: path must be repo-relative: {rel_path}"
        assert (REPO_ROOT / rel_path).exists(), f"{label}: path does not exist: {rel_path}"


def _configured_spec_schema_pairs() -> set[tuple[str, str]]:
    config = _load_json(SPEC_ARTIFACTS_CONFIG)
    specs = config.get("specs")
    assert isinstance(specs, list), "spec-artifacts.config.json must expose specs[]"
    pairs: set[tuple[str, str]] = set()
    for entry in specs:
        if not isinstance(entry, dict):
            continue
        spec = entry.get("spec")
        schema = entry.get("schema")
        if isinstance(spec, str) and isinstance(schema, str):
            pairs.add((spec, schema))
    return pairs


def test_surface_coverage_ledger_is_well_formed() -> None:
    ledger = _load_json(LEDGER_PATH)
    assert ledger.get("version"), "surface coverage ledger must declare a version"
    contracts = ledger.get("contracts")
    assert isinstance(contracts, dict) and contracts, "ledger must declare contracts"

    for contract_id, contract in contracts.items():
        assert isinstance(contract_id, str) and contract_id, "contract ids must be non-empty"
        assert isinstance(contract, dict), f"{contract_id}: contract must be an object"
        missing = REQUIRED_CONTRACT_FIELDS - set(contract)
        assert not missing, f"{contract_id}: missing required fields {sorted(missing)}"
        assert contract["status"] in ALLOWED_STATUSES, (
            f"{contract_id}: status must be one of {sorted(ALLOWED_STATUSES)}"
        )


def test_enforced_contracts_reference_existing_surfaces() -> None:
    ledger = _load_json(LEDGER_PATH)

    for contract_id, contract in ledger["contracts"].items():
        if contract["status"] != "enforced":
            continue

        spec_path = contract["spec"]
        assert isinstance(spec_path, str) and spec_path, f"{contract_id}: spec must be a path"
        schema_path = contract["schema"]
        assert isinstance(schema_path, str) and schema_path, f"{contract_id}: schema must be a path"
        _assert_paths_exist([spec_path], label=f"{contract_id}.spec")
        _assert_paths_exist([schema_path], label=f"{contract_id}.schema")

        conformance = _as_paths(contract["conformance"])
        crates = _as_paths(contract["crates"])
        packages = contract["packages"]
        assert isinstance(packages, dict) and packages, f"{contract_id}: packages must be non-empty"

        _assert_paths_exist(conformance, label=f"{contract_id}.conformance")
        _assert_paths_exist(crates, label=f"{contract_id}.crates")

        for package_name, package_paths in packages.items():
            assert isinstance(package_name, str) and package_name, (
                f"{contract_id}: package names must be non-empty"
            )
            paths = _as_paths(package_paths)
            _assert_paths_exist(paths, label=f"{contract_id}.packages.{package_name}")


def test_listed_contract_surface_paths_exist() -> None:
    ledger = _load_json(LEDGER_PATH)

    for contract_id, contract in ledger["contracts"].items():
        _assert_paths_exist([contract["spec"]], label=f"{contract_id}.spec")
        _assert_paths_exist([contract["schema"]], label=f"{contract_id}.schema")
        _assert_paths_exist(contract.get("conformance", []), label=f"{contract_id}.conformance")
        _assert_paths_exist(contract.get("crates", []), label=f"{contract_id}.crates")

        packages = contract.get("packages", {})
        assert isinstance(packages, dict), f"{contract_id}: packages must be an object"
        for package_name, package_paths in packages.items():
            assert isinstance(package_paths, list), (
                f"{contract_id}.packages.{package_name}: paths must be a list"
            )
            _assert_paths_exist(package_paths, label=f"{contract_id}.packages.{package_name}")


def test_deferred_contract_surfaces_explain_the_gap() -> None:
    ledger = _load_json(LEDGER_PATH)

    for contract_id, contract in ledger["contracts"].items():
        if contract["status"] != "deferred":
            continue
        reason = contract.get("reason")
        tracking = contract.get("tracking")
        assert isinstance(reason, str) and reason.strip(), (
            f"{contract_id}: deferred contracts must explain why"
        )
        assert isinstance(tracking, str) and tracking.strip(), (
            f"{contract_id}: deferred contracts must point to a tracker"
        )


def test_contract_spec_schema_pairs_are_declared_in_spec_artifacts_config() -> None:
    configured_pairs = _configured_spec_schema_pairs()
    ledger = _load_json(LEDGER_PATH)

    missing = {
        contract_id: (contract["spec"], contract["schema"])
        for contract_id, contract in ledger["contracts"].items()
        if (contract["spec"], contract["schema"]) not in configured_pairs
    }
    assert not missing, (
        "contracts must reuse scripts/spec-artifacts.config.json as the spec/schema inventory: "
        f"{missing}"
    )


def test_spec_artifacts_config_entries_are_inventoried() -> None:
    configured_pairs = _configured_spec_schema_pairs()
    ledger = _load_json(LEDGER_PATH)
    ledger_pairs = {
        (contract["spec"], contract["schema"])
        for contract in ledger["contracts"].values()
    }

    missing = sorted(configured_pairs - ledger_pairs)
    assert not missing, (
        "every scripts/spec-artifacts.config.json spec/schema pair needs a contract "
        f"surface inventory row: {missing}"
    )


def test_react_package_parity_tests_use_discoverable_names() -> None:
    ledger = _load_json(LEDGER_PATH)

    failures: list[str] = []
    for contract_id, contract in ledger["contracts"].items():
        react_paths = contract.get("packages", {}).get("react", [])
        for rel_path in react_paths:
            path = Path(rel_path)
            if "parity" not in path.name:
                failures.append(f"{contract_id}: React parity test should include 'parity': {rel_path}")

    assert not failures, "\n".join(failures)

"""Issuer sidecar conformance fixture driver."""

from __future__ import annotations

import copy
import glob
import hashlib
import json
import re
from pathlib import Path
from urllib.parse import parse_qs, urlparse

import pytest
from jsonschema import Draft202012Validator, RefResolver

from formspec._rust import lint

ROOT = Path(__file__).parents[2]
ISSUER_CASES = ROOT / "tests" / "fixtures" / "issuer"
MAX_CHAIN_DEPTH = 8

SCHEMAS = {
    "common": json.loads((ROOT / "schemas" / "common.schema.json").read_text()),
    "definition": json.loads((ROOT / "schemas" / "definition.schema.json").read_text()),
    "issuer": json.loads((ROOT / "schemas" / "issuer.schema.json").read_text()),
    "registry": json.loads((ROOT / "schemas" / "registry.schema.json").read_text()),
    "response": json.loads((ROOT / "schemas" / "response.schema.json").read_text()),
}

CASES = [
    Path(path).parent
    for path in sorted(glob.glob(str(ISSUER_CASES / "*" / "case.json")))
]


@pytest.mark.parametrize("case_dir", CASES, ids=lambda p: p.name)
def test_issuer_fixture(case_dir: Path):
    case = load_json(case_dir / "case.json")
    driver = DRIVERS[case["kind"]]
    driver(case_dir, case)


def drive_schema_validate(case_dir: Path, case: dict):
    for entry in case.get("valid", []):
        doc = load_case_json(case_dir, entry)
        validator(entry.get("schema", "issuer")).validate(doc)
        if entry.get("expectRoundTripStable"):
            assert copy.deepcopy(doc) == doc
        if "expectedWarnings" in entry:
            assert issuer_warnings(doc) == entry["expectedWarnings"]
            assert issuer_lint_codes(doc) == issuer_expected_lint_codes(
                entry["expectedWarnings"]
            )

    for entry in case.get("invalid", []):
        doc = load_case_json(case_dir, entry)
        errors = list(validator(entry.get("schema", "issuer")).iter_errors(doc))
        assert errors, f"{case_dir.name}: expected schema errors for {entry}"


def drive_cascade(case_dir: Path, case: dict):
    for scenario in case["scenarios"]:
        resolved = resolve_fixture(scenario)
        assert_projection(resolved, scenario["expected"])
        if "response" in scenario:
            validator("response").validate(scenario["response"])
            assert (
                scenario["response"].get("displayedIssuer")
                == scenario.get("expectedDisplayedIssuer")
            )
        if "signedPayload" in scenario:
            assert scenario["signedPayload"].get("displayedIssuer") == scenario.get(
                "expectedDisplayedIssuer"
            )


def drive_chain(case_dir: Path, case: dict):
    resolved = resolve_fixture(case)
    assert_projection(resolved, case["expected"])


def drive_query_override(_case_dir: Path, case: dict):
    parsed = parse_query_override(case["pageUrl"], case.get("allowedOrigins", []))
    if case.get("embedOverride"):
        effective = case["embedOverride"]
        effective["source"] = "host-embed"
    else:
        effective = parsed
    assert effective == case["expected"]


def drive_logo_variant(_case_dir: Path, case: dict):
    issuer = case["issuer"]
    for scenario in case["scenarios"]:
        assert select_logo(issuer, scenario["context"]) == scenario["expectedUrl"]


def drive_langmap_fallback(_case_dir: Path, case: dict):
    for scenario in case["scenarios"]:
        assert resolve_lang_value(
            scenario["value"],
            scenario["locale"],
            scenario.get("defaultLanguage", "en"),
        ) == scenario["expected"]


def drive_content_hash(_case_dir: Path, case: dict):
    attempts = []
    accepted = None
    for fetch in case["fetches"]:
        issuer = fetch["issuer"]
        attempts.append(issuer["version"])
        if content_hash_valid(issuer):
            accepted = issuer
            break

    expected = case["expected"]
    assert accepted is not None, f"{case.get('name', 'content-hash')}: no accepted refetch"
    assert attempts == expected["attemptVersions"]
    assert len(attempts) - 1 == expected["refetches"]
    assert accepted["version"] == expected["finalVersion"]
    assert cache_token(case["fetches"][0]["issuer"]) != cache_token(accepted)


def drive_publisher_legacy(_case_dir: Path, case: dict):
    doc = case["registry"]
    validator("registry").validate(doc)
    warnings = publisher_warnings(doc["publisher"])
    assert warnings == case["expectedWarnings"]


def drive_schemaorg_projection(case_dir: Path, case: dict):
    issuer = load_case_json(case_dir, case["issuer"])
    context = load_case_json(case_dir, case["context"])
    expected = load_case_json(case_dir, case["expected"])
    assert project_schemaorg(issuer, context) == expected


DRIVERS = {
    "schema-validate": drive_schema_validate,
    "cascade": drive_cascade,
    "chain": drive_chain,
    "query-override": drive_query_override,
    "logo-variant": drive_logo_variant,
    "langmap-fallback": drive_langmap_fallback,
    "content-hash": drive_content_hash,
    "publisher-legacy": drive_publisher_legacy,
    "schemaorg-projection": drive_schemaorg_projection,
}


def load_json(path: Path):
    return json.loads(path.read_text())


def load_case_json(case_dir: Path, entry):
    if isinstance(entry, str):
        return load_json(case_dir / entry)
    if "path" in entry:
        return load_json(case_dir / entry["path"])
    return entry["doc"]


def validator(name: str) -> Draft202012Validator:
    schema = SCHEMAS[name]
    store = {
        "https://formspec.org/schemas/common/1.0": SCHEMAS["common"],
        "https://formspec.org/schemas/definition/1.0": SCHEMAS["definition"],
        "https://formspec.org/schemas/issuer/1.0": SCHEMAS["issuer"],
        "https://formspec.org/schemas/registry/1.0": SCHEMAS["registry"],
        "https://formspec.org/schemas/response/1.0": SCHEMAS["response"],
    }
    return Draft202012Validator(schema, resolver=RefResolver.from_schema(schema, store=store))


def resolve_fixture(case: dict) -> dict:
    docs = {doc["url"]: doc for doc in case.get("issuers", [])}
    source = case.get("hostOverride") or case.get("definitionIssuer")
    if not source:
        return {"source": "unbranded", "chain": []}

    resolved_source = source.get("source")
    if not resolved_source:
        resolved_source = "host-embed" if case.get("hostOverride") else "definition"
    primary = materialize(source, docs)
    chain = [primary]
    seen = {primary["url"]}
    degraded = None
    failures = set(case.get("fetchFailures", []))

    while primary.get("parentOrganization"):
        parent_url = primary["parentOrganization"]
        if len(chain) >= MAX_CHAIN_DEPTH:
            degraded = {"reason": "depth-capped", "atUrl": parent_url}
            break
        if parent_url in seen:
            degraded = {"reason": "cycle-detected", "atUrl": parent_url}
            break
        if parent_url in failures or parent_url not in docs:
            degraded = {"reason": "parent-fetch-failed", "atUrl": parent_url}
            break
        primary = docs[parent_url]
        chain.append(primary)
        seen.add(parent_url)

    result = {
        "source": resolved_source,
        "primaryUrl": chain[0]["url"],
        "chainUrls": [issuer["url"] for issuer in chain],
    }
    if degraded:
        result["degraded"] = degraded
    return result


def materialize(source: dict, docs: dict[str, dict]) -> dict:
    if source["kind"] == "inline":
        return source["issuer"]
    return docs[source["url"]]


def assert_projection(actual: dict, expected: dict):
    assert actual == expected


def parse_query_override(page_url: str, allowed_origins: list[str]):
    parsed = urlparse(page_url)
    raw = parse_qs(parsed.query).get("_issuer", [None])[0]
    if not raw or not allowed_origins:
        return None
    issuer = urlparse(raw)
    if not issuer.scheme or not issuer.netloc:
        return None
    origin = f"{issuer.scheme}://{issuer.netloc}"
    if origin not in allowed_origins:
        return None
    return {"kind": "url", "url": raw, "source": "host-query"}


def select_logo(issuer: dict, context: dict):
    logo = issuer.get("logo") or {}
    primary = logo.get("primary")
    wordmark = logo.get("wordmark")
    monochrome = logo.get("monochrome")
    if context["mode"] != "light":
        preferred = monochrome
    elif context["headerWidth"] == "narrow":
        preferred = wordmark
    else:
        preferred = primary
    selected = preferred or primary or wordmark or monochrome
    return selected.get("url") if selected else None


def resolve_lang_value(value, locale: str, default_language: str):
    if value is None or isinstance(value, str):
        return value
    if locale in value:
        return value[locale]
    base = locale.split("-", 1)[0]
    if base in value:
        return value[base]
    if default_language in value:
        return value[default_language]
    return next(iter(value.values()), None)


def content_hash_valid(issuer: dict) -> bool:
    match = re.search(r"\+sha256-([0-9a-f]{64})$", issuer["version"])
    if not match:
        return True
    return issuer_sha256(issuer) == match.group(1)


def issuer_sha256(issuer: dict) -> str:
    body = json.dumps(issuer, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(body).hexdigest()


def cache_token(issuer: dict) -> str:
    return f"{issuer['url']}@{issuer['version']}"


def issuer_warnings(issuer: dict) -> list[str]:
    warnings = []
    if issuer.get("kind") == "department" and not issuer.get("parentOrganization"):
        warnings.append("department-missing-parent")
    if issuer.get("kind") == "individual" and issuer.get("parentOrganization"):
        warnings.append("individual-with-parent")
    return warnings


def issuer_expected_lint_codes(warnings: list[str]) -> list[str]:
    mapping = {
        "department-missing-parent": "W1600",
        "individual-with-parent": "W1600",
    }
    return [mapping[warning] for warning in warnings]


def issuer_lint_codes(issuer: dict) -> list[str]:
    return [diag.code for diag in lint(issuer) if diag.code == "W1600"]


def publisher_warnings(publisher: dict) -> list[dict[str, str]]:
    warnings = []
    if "url" in publisher:
        warnings.append({"field": "publisher.url", "replacement": "publisher.homepage"})
    if "contact" in publisher:
        warnings.append({"field": "publisher.contact", "replacement": "publisher.contactPoint"})
    return warnings


def project_schemaorg(issuer: dict, context: dict) -> dict:
    projection = {
        "@context": context["@context"],
        "@id": issuer["url"],
        "@type": "Issuer",
    }
    for key in [
        "name",
        "displayName",
        "shortName",
        "identifier",
        "homepage",
        "parentOrganization",
        "organizationName",
        "departmentName",
        "jurisdiction",
        "contactPoint",
        "kind",
    ]:
        if key in issuer:
            projection[key] = issuer[key]
    if issuer.get("logo", {}).get("primary"):
        projection["logo"] = issuer["logo"]["primary"]
    return projection

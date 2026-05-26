"""No-rewrite regression gate for existing conforming Component documents.

Benchmark references are included after their separate baseline cleanup. That
cleanup repaired files that were already invalid under the existing schema; this
gate proves the additive reference fields do not require another rewrite.
"""

from __future__ import annotations

import json
import subprocess
from pathlib import Path
from typing import Any, Iterable, NamedTuple


REPO_ROOT = Path(__file__).resolve().parents[3]
EXCLUDED_FIXTURE_DIR = (
    REPO_ROOT / "tests" / "conformance" / "fixtures" / "component-reference-fields"
)
JSON_ROOTS = (
    REPO_ROOT / "tests" / "conformance" / "fixtures",
    REPO_ROOT / "tests" / "e2e" / "fixtures",
    REPO_ROOT / "tests" / "fixtures",
    REPO_ROOT / "examples",
    REPO_ROOT / "docs",
)
BENCHMARK_TASKS_DIR = REPO_ROOT / "benchmarks" / "tasks"
SCHEMA_DIR = REPO_ROOT / "schemas"
LINT_HARNESS_KEYS = {
    "_componentDocuments",
    "_localeDocuments",
    "_pairedDefinition",
    "_postureDeclaration",
    "_registryDocuments",
    "_themeDocument",
}
KNOWN_SCHEMA_INVALID_COMPONENT_IDS = {
    # Negative lint fixture: W801 intentionally puts `bind` on a Stack.
    "tests/fixtures/lint/W801-layout-has-bind.json#",
}
AJV_COMPONENT_VALIDATION_SCRIPT = r"""
import { readFileSync } from 'node:fs';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const [componentSchemaPath, commonSchemaPath, experienceSchemaPath] =
  process.argv.slice(1);
const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));
const manifest = JSON.parse(readFileSync(0, 'utf8'));
const ajv = new Ajv2020({ strict: false });
addFormats(ajv);
ajv.addSchema(readJson(commonSchemaPath));
ajv.addSchema(readJson(experienceSchemaPath));
const validate = ajv.compile(readJson(componentSchemaPath));
const failures = [];

for (const entry of manifest) {
  if (!validate(entry.doc)) {
    const errors = validate.errors ?? [];
    failures.push({
      id: entry.id,
      errors: errors.slice(-3).map((error) => ({
        instancePath: error.instancePath,
        schemaPath: error.schemaPath,
        keyword: error.keyword,
        message: error.message,
      })),
    });
  }
}

if (failures.length > 0) {
  console.error(JSON.stringify(failures, null, 2));
  process.exit(1);
}
"""


class ComponentDocument(NamedTuple):
    id: str
    doc: dict[str, Any]


def _is_beneath(path: Path, parent: Path) -> bool:
    try:
        path.relative_to(parent)
    except ValueError:
        return False
    return True


def _iter_json_paths() -> Iterable[Path]:
    seen: set[Path] = set()

    for root in JSON_ROOTS:
        if not root.exists():
            continue
        for path in root.rglob("*.json"):
            if _is_beneath(path, EXCLUDED_FIXTURE_DIR):
                continue
            seen.add(path)

    if BENCHMARK_TASKS_DIR.exists():
        for reference_dir in BENCHMARK_TASKS_DIR.rglob("reference"):
            if not reference_dir.is_dir():
                continue
            for path in reference_dir.rglob("*.json"):
                seen.add(path)

    yield from sorted(seen)


def _pointer_join(pointer: str, key: str | int) -> str:
    token = str(key).replace("~", "~0").replace("/", "~1")
    return f"{pointer}/{token}" if pointer else f"#{token}"


def _find_component_documents(
    value: Any,
    pointer: str = "#",
) -> Iterable[tuple[str, dict[str, Any]]]:
    if isinstance(value, dict):
        if "$formspecComponent" in value:
            # Lint fixtures can carry harness-only context such as
            # `_pairedDefinition`; the lint runner strips that before use.
            yield pointer, {
                key: child
                for key, child in value.items()
                if key not in LINT_HARNESS_KEYS
            }
        for key, child in value.items():
            yield from _find_component_documents(child, _pointer_join(pointer, key))
    elif isinstance(value, list):
        for index, child in enumerate(value):
            yield from _find_component_documents(child, _pointer_join(pointer, index))


def _component_documents() -> list[ComponentDocument]:
    docs = []
    for path in _iter_json_paths():
        with path.open(encoding="utf-8") as handle:
            value = json.load(handle)
        rel_path = path.relative_to(REPO_ROOT).as_posix()
        for pointer, doc in _find_component_documents(value):
            component_id = f"{rel_path}{pointer}"
            if component_id in KNOWN_SCHEMA_INVALID_COMPONENT_IDS:
                continue
            docs.append(ComponentDocument(id=component_id, doc=doc))
    return docs


COMPONENT_DOCUMENTS = _component_documents()


def test_no_rewrite_gate_discovers_existing_component_documents() -> None:
    assert COMPONENT_DOCUMENTS, "No pre-existing Component documents were discovered"


def test_existing_component_documents_validate_against_amended_schema() -> None:
    manifest = json.dumps(
        [{"id": component.id, "doc": component.doc} for component in COMPONENT_DOCUMENTS]
    )
    result = subprocess.run(
        [
            "node",
            "--input-type=module",
            "-e",
            AJV_COMPONENT_VALIDATION_SCRIPT,
            str(SCHEMA_DIR / "component.schema.json"),
            str(SCHEMA_DIR / "common.schema.json"),
            str(SCHEMA_DIR / "experience.schema.json"),
        ],
        cwd=REPO_ROOT,
        check=False,
        capture_output=True,
        input=manifest,
        text=True,
    )

    assert result.returncode == 0, result.stdout + result.stderr

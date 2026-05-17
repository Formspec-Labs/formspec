"""FEL expression parsing and dependency resolution pass."""
from __future__ import annotations

import re

from formspec._rust import canonical_item_path, extract_dependencies
from formspec.fel.errors import FelSyntaxError

from formspec.validate.lint_common import walk_definition_items
from formspec.validate.models import DiscoveredArtifacts, PassItemResult, PassResult


def _collect_full_paths(items: list, prefix: str, paths: set[str]) -> None:
    """Build full dotted paths for all items (e.g. 'expenditures.employment')."""
    for item in items:
        key = item.get("key")
        if not key:
            continue
        full = f"{prefix}{key}" if prefix else key
        paths.add(full)
        children = item.get("children", [])
        if children:
            _collect_full_paths(children, f"{full}.", paths)


def _normalize_dep_path(path: str) -> str:
    """Normalize path for dep matching by removing root markers and wildcard/indices."""
    normalized = canonical_item_path(path)
    normalized = re.sub(r"\[\*]|\[\d+]", "", normalized)
    return normalized


def _location_bind_path(location: str) -> str | None:
    """Extract bind path from a location label like `bind:path.prop`."""
    if not location.startswith("bind:"):
        return None
    payload = location[len("bind:") :]
    dot = payload.rfind(".")
    return payload[:dot] if dot != -1 else payload


def _is_dependency_resolved(dep_field: str, location: str, known_paths: set[str]) -> bool:
    """Resolve absolute and context-relative FEL field deps against known definition paths."""
    dep = _normalize_dep_path(dep_field)
    if dep in known_paths:
        return True

    bind_path = _location_bind_path(location)
    if bind_path is None:
        return False

    bind_norm = _normalize_dep_path(bind_path)
    parts = bind_norm.split(".")
    if parts:
        parts = parts[:-1]

    for i in range(len(parts), -1, -1):
        candidate = ".".join([*parts[:i], dep]) if dep else ".".join(parts[:i])
        if candidate in known_paths:
            return True

    return False


def pass_fel_expressions(arts: DiscoveredArtifacts) -> PassResult:
    all_defs = list(arts.definitions.values()) + list(arts.fragments.values())
    if not all_defs:
        return PassResult(
            title="FEL expression parsing & dependency resolution", empty=True
        )

    pr = PassResult(title="FEL expression parsing & dependency resolution")

    for da in all_defs:
        items = da.doc.get("items", [])
        binds = da.doc.get("binds", [])
        shapes = da.doc.get("shapes", [])

        known_paths: set[str] = set()
        for item in walk_definition_items(items):
            key = item.get("key")
            if key:
                known_paths.add(key)
        _collect_full_paths(items, "", known_paths)
        known_paths_norm = {_normalize_dep_path(p) for p in known_paths}

        fel_exprs: list[tuple[str, str]] = []
        for bind in binds:
            path = bind.get("path", "?")
            for prop in ("calculate", "constraint", "relevant", "readonly", "required"):
                expr = bind.get(prop)
                if isinstance(expr, str) and expr not in ("true", "false"):
                    fel_exprs.append((f"bind:{path}.{prop}", expr))
            default = bind.get("default")
            if isinstance(default, str) and default.startswith("="):
                fel_exprs.append((f"bind:{path}.default", default[1:]))
            cm = bind.get("constraintMessage")
            if isinstance(cm, str) and "{{" in cm:
                for m in re.finditer(r"\{\{(.+?)\}\}", cm):
                    fel_exprs.append((f"bind:{path}.constraintMessage", m.group(1)))

        for shape in shapes:
            sid = shape.get("id", "?")
            for prop in ("constraint", "activeWhen"):
                expr = shape.get(prop)
                if isinstance(expr, str):
                    fel_exprs.append((f"shape:{sid}.{prop}", expr))
            msg = shape.get("message", "")
            if "{{" in msg:
                for m in re.finditer(r"\{\{(.+?)\}\}", msg):
                    fel_exprs.append((f"shape:{sid}.message", m.group(1)))

        parse_errors = 0
        dep_warnings = 0
        for location, expr in fel_exprs:
            try:
                deps = extract_dependencies(expr)
            except FelSyntaxError:
                parse_errors += 1
                continue

            for dep_field in deps.fields:
                if not _is_dependency_resolved(dep_field, location, known_paths_norm):
                    dep_warnings += 1

        expr_count = len(fel_exprs)
        if parse_errors:
            pr.items.append(
                PassItemResult(
                    label=da.path.name,
                    error_count=parse_errors,
                    runtime_results=[
                        {
                            "severity": "error",
                            "message": f"{parse_errors} parse error(s) in {expr_count} expressions",
                            "path": "",
                        }
                    ],
                )
            )
        else:
            pr.items.append(
                PassItemResult(
                    label=da.path.name,
                    runtime_results=[
                        {
                            "severity": "info",
                            "message": f"{expr_count} FEL expressions parsed, {dep_warnings} unresolved dep(s)",
                            "path": "",
                        }
                    ],
                )
            )
    return pr

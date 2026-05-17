"""Extension registry facade — documented import path over the Rust bridge."""

from __future__ import annotations

from typing import Any

from formspec._rust import (
    RegistryInfo,
    find_registry_entry,
    parse_registry,
    validate_lifecycle_transition,
    well_known_registry_url,
)

WELL_KNOWN_PATH = "/.well-known/formspec-extensions"


def _semver_sort_key(version: str) -> tuple[int, int, int, str]:
    """Match formspec-core registry_client::parse_version ordering."""
    parts: list[int] = []
    for part in version.split("."):
        try:
            parts.append(int(part))
        except ValueError:
            parts.append(0)
    while len(parts) < 3:
        parts.append(0)
    return (parts[0], parts[1], parts[2], version)


__all__ = [
    "Registry",
    "RegistryInfo",
    "WELL_KNOWN_PATH",
    "validate_lifecycle_transition",
    "well_known_registry_url",
]


class Registry:
    """Thin wrapper around a parsed registry document."""

    def __init__(self, doc: dict[str, Any]) -> None:
        self._doc = doc
        self._info: RegistryInfo = parse_registry(doc)

    @classmethod
    def load(cls, doc: dict[str, Any]) -> Registry:
        return cls(doc)

    @property
    def publisher(self) -> dict[str, Any]:
        return dict(self._info.publisher)

    @property
    def published(self) -> str:
        return self._info.published

    @property
    def entry_count(self) -> int:
        return self._info.entry_count

    def find_one(
        self,
        name: str,
        *,
        version: str | None = None,
        status: str | None = None,
        category: str | None = None,
    ) -> dict[str, Any] | None:
        entry = find_registry_entry(self._doc, name, version)
        if entry is None:
            return None
        if status is not None and entry.get("status") != status:
            return None
        if category is not None and entry.get("category") != category:
            return None
        return entry

    def find(
        self,
        name: str,
        *,
        version: str | None = None,
        status: str | None = None,
        category: str | None = None,
    ) -> list[dict[str, Any]]:
        if version:
            entry = self.find_one(name, version=version, status=status, category=category)
            return [entry] if entry else []

        matches = [
            e
            for e in self._doc.get("entries", [])
            if e.get("name") == name
            and (status is None or e.get("status") == status)
            and (category is None or e.get("category") == category)
        ]
        return sorted(
            matches,
            key=lambda e: _semver_sort_key(e.get("version", "0.0.0")),
            reverse=True,
        )

    def list_by_category(self, category: str) -> list[dict[str, Any]]:
        return [e for e in self._doc.get("entries", []) if e.get("category") == category]

    def validate(self) -> list[str]:
        return list(self._info.validation_issues)

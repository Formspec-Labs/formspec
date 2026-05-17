"""CLI entry for directory-based artifact validation."""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from formspec.validate.discovery import discover_artifacts
from formspec.validate.orchestrator import validate_all
from formspec.validate.reporting import print_report, report_to_json


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="formspec-validate",
        description="Auto-discover and validate all Formspec JSON artifacts in a directory.",
    )
    parser.add_argument(
        "directory",
        type=Path,
        help="Directory containing Formspec JSON artifacts",
    )
    parser.add_argument(
        "--registry",
        type=Path,
        action="append",
        default=[],
        help="Additional registry JSON file(s) to include (repeatable)",
    )
    parser.add_argument(
        "--fixtures",
        action="append",
        default=[],
        help="Subdirectory name(s) to scan for fixtures (default: 'fixtures')",
    )
    parser.add_argument(
        "--title",
        help="Title shown in the report header",
    )
    parser.add_argument(
        "--json",
        action="store_true",
        help="Emit a structured JSON report to stdout instead of the human-readable summary. "
        "Intended for LLM consumers and CI pipelines — diagnostics include suggestedFix and specRef fields.",
    )
    args = parser.parse_args(argv)

    directory = args.directory.resolve()
    if not directory.is_dir():
        print(f"Error: {args.directory} is not a directory", file=sys.stderr)
        return 2

    fixture_subdirs = tuple(args.fixtures) if args.fixtures else ("fixtures",)
    registry_paths = tuple(p.resolve() for p in args.registry)

    artifacts = discover_artifacts(
        directory,
        fixture_subdirs=fixture_subdirs,
        registry_paths=registry_paths,
    )
    title = args.title or directory.name
    report = validate_all(artifacts)
    if args.json:
        payload = report_to_json(report, title=title)
        print(json.dumps(payload, indent=2))
        return 0 if payload["totalErrors"] == 0 else 1
    return print_report(report, title=title)

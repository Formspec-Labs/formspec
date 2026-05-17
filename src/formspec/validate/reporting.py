"""Human-readable and JSON validation report output."""
from __future__ import annotations

from formspec._rust import LintDiagnostic

from formspec.validate.models import PassItemResult, ValidationReport


def _diagnostic_to_json(d: LintDiagnostic) -> dict:
    """Serialize a LintDiagnostic with a stable, camelCase shape for LLM consumers."""
    return {
        "code": d.code,
        "severity": d.severity,
        "path": d.path,
        "message": d.message,
        "suggestedFix": d.suggested_fix,
        "specRef": d.spec_ref,
    }


def _item_to_json(item: PassItemResult) -> dict:
    return {
        "label": item.label,
        "errorCount": item.error_count,
        "warningCount": item.warning_count,
        "diagnostics": [_diagnostic_to_json(d) for d in item.diagnostics],
        "runtimeResults": list(item.runtime_results),
    }


def report_to_json(report: ValidationReport, *, title: str | None = None) -> dict:
    """Project a ValidationReport into a JSON-serializable dict for `--json` output."""
    total_errors = 0
    passes_json: list[dict] = []
    for i, pr in enumerate(report.passes, start=1):
        for item in pr.items:
            total_errors += item.error_count
        passes_json.append(
            {
                "index": i,
                "title": pr.title,
                "empty": pr.empty,
                "items": [_item_to_json(item) for item in pr.items],
            }
        )
    return {
        "title": title or "",
        "valid": total_errors == 0,
        "totalErrors": total_errors,
        "passes": passes_json,
    }


def print_report(report: ValidationReport, *, title: str | None = None) -> int:
    """Print colored terminal output. Returns total error count (0 = success)."""
    header = title or "Artifact Validation"
    print(f"\033[1m═══ {header} ═══\033[0m")

    total_errors = 0
    for i, pr in enumerate(report.passes, start=1):
        print(f"\n\033[1m{i}. {pr.title}\033[0m")

        if pr.empty:
            print("  (no artifacts)")
            continue

        for item in pr.items:
            total_errors += item.error_count
            pad = "  "

            if item.diagnostics:
                marker = (
                    "\033[31m✗\033[0m"
                    if item.error_count
                    else "\033[33m!\033[0m"
                )
                print(
                    f"{pad}{marker} {item.label}: "
                    f"{item.error_count} error(s), {item.warning_count} warning(s)"
                )
                for d in item.diagnostics:
                    color = "\033[31m" if d.severity == "error" else "\033[33m"
                    print(
                        f"{pad}  {color}{d.severity.upper()}\033[0m "
                        f"{d.code} {d.path}: {d.message}"
                    )
            elif item.runtime_results:
                has_errors = any(
                    r["severity"] == "error" for r in item.runtime_results
                )
                if has_errors:
                    marker = "\033[31m✗\033[0m"
                elif any(
                    r["severity"] == "warning" for r in item.runtime_results
                ):
                    marker = "\033[33m!\033[0m"
                else:
                    marker = "\033[32m✓\033[0m"

                if (
                    len(item.runtime_results) == 1
                    and item.runtime_results[0]["severity"] == "info"
                ):
                    msg = item.runtime_results[0]["message"]
                    print(f"{pad}{marker} {item.label} — {msg}")
                else:
                    errors = [
                        r for r in item.runtime_results if r["severity"] == "error"
                    ]
                    warnings = [
                        r
                        for r in item.runtime_results
                        if r["severity"] == "warning"
                    ]
                    print(
                        f"{pad}{marker} {item.label}: "
                        f"valid={'false' if errors else 'true'}, "
                        f"{len(errors)} error(s), {len(warnings)} warning(s)"
                    )
                    for r in item.runtime_results:
                        color = (
                            "\033[31m"
                            if r["severity"] == "error"
                            else "\033[33m"
                        )
                        code = r.get("code", "?")
                        print(
                            f"{pad}  {color}{r['severity'].upper()}\033[0m "
                            f"{code} {r['path']}: {r['message']}"
                        )
            else:
                print(f"{pad}\033[32m✓\033[0m {item.label}: 0 diagnostics")

    print()
    if total_errors == 0:
        print("\033[32;1m✓ All artifacts clean — 0 errors\033[0m")
    else:
        print(f"\033[31;1m✗ {total_errors} total error(s)\033[0m")
    return 1 if total_errors else 0

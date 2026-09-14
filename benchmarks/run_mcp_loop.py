#!/usr/bin/env python3
"""MCP-driven convergence loop — drives an LLM through the Formspec MCP until
its candidate validates clean (or `max_rounds` expires), then scores the
final artifact set with the same `score_task` used by `run_benchmark.py`.

The runner is the *quantitative* counterpart to `.claude-plugin/commands/chaos-test.md`:
chaos-test measures qualitative UX friction; this runner measures whether model
X can converge on a valid Formspec from a prose requirement in N rounds.

CLI
---
    python3 benchmarks/run_mcp_loop.py invoice --model sonnet
    python3 benchmarks/run_mcp_loop.py --all --model claude-sonnet-4-6 --max-rounds 5
    python3 benchmarks/run_mcp_loop.py invoice grant-report --model sonnet

Agent invocation (captured here for reproducibility — edit with care)
---------------------------------------------------------------------
The loop shells out to `claude --print` with a strict tool-allowlist so the
agent can ONLY call `mcp__formspec-mcp__formspec_*` tools (no Read/Write/Bash).
Transcript is captured as JSON. The exact command shape:

    claude \\
        --print \\
        --output-format json \\
        --model <model> \\
        --mcp-config <absolute path to a Forms-MCP .mcp.json> \\
        --allowedTools "mcp__formspec-mcp__formspec_create \\
                        mcp__formspec-mcp__formspec_audit \\
                        mcp__formspec-mcp__formspec_publish \\
                        ...all formspec_* tools..." \\
        --no-session-persistence \\
        --dangerously-skip-permissions \\
        <prompt via stdin>

The prompt instructs the agent to call `formspec_create` to get a project_id,
author the definition in-memory (via `formspec_set_*` / `formspec_audit`), then
call `formspec_publish(project_id, version='0.1.0', path='<scratch>')` which
writes the artifact set to disk for the grader.

Scoring uses `run_benchmark.score_task(task_id, scratch_dir, registry)`
unchanged — see that file for the scoring formula.
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
import time
from pathlib import Path
from typing import Any

BENCHMARKS_DIR = Path(__file__).resolve().parent
REPO_ROOT = BENCHMARKS_DIR.parent
TASKS_DIR = BENCHMARKS_DIR / "tasks"
DEFAULT_RUNS_DIR = BENCHMARKS_DIR / "runs"

# Reuse the existing scoring harness without modifying it.
sys.path.insert(0, str(BENCHMARKS_DIR))
from run_benchmark import (  # noqa: E402
    DEFAULT_REGISTRY,
    MAX_DIAGNOSTICS_RETURNED,
    iter_task_ids,
    score_task,
)

# Tools the agent is permitted to call. Filesystem/edit tools are excluded —
# the only way for the agent to write anything to disk is through
# `formspec_publish(path=...)`, which runs validated artifact serialization.
MCP_TOOL_ALLOWLIST = [
    "mcp__formspec-mcp__formspec_create",
    "mcp__formspec-mcp__formspec_draft",
    "mcp__formspec-mcp__formspec_load",
    "mcp__formspec-mcp__formspec_open",
    "mcp__formspec-mcp__formspec_save",
    "mcp__formspec-mcp__formspec_list",
    "mcp__formspec-mcp__formspec_publish",
    "mcp__formspec-mcp__formspec_audit",
    "mcp__formspec-mcp__formspec_describe",
    "mcp__formspec-mcp__formspec_set_field",
    "mcp__formspec-mcp__formspec_set_content",
    "mcp__formspec-mcp__formspec_set_group",
    "mcp__formspec-mcp__formspec_set_repeat",
    "mcp__formspec-mcp__formspec_set_bind",
    "mcp__formspec-mcp__formspec_set_validation",
    "mcp__formspec-mcp__formspec_set_option_set",
    "mcp__formspec-mcp__formspec_set_page",
    "mcp__formspec-mcp__formspec_set_mapping",
    "mcp__formspec-mcp__formspec_set_theme",
    "mcp__formspec-mcp__formspec_set_component",
    "mcp__formspec-mcp__formspec_remove",
    "mcp__formspec-mcp__formspec_move",
    "mcp__formspec-mcp__formspec_rename",
    "mcp__formspec-mcp__formspec_statistics",
    "mcp__formspec-mcp__formspec_fel",
    "mcp__formspec-mcp__formspec_sample_data",
    "mcp__formspec-mcp__formspec_export",
]


def load_requirement(task_id: str) -> str:
    """Return the prose requirement verbatim, including its title header."""
    path = TASKS_DIR / task_id / "requirement.md"
    if not path.is_file():
        raise SystemExit(f"missing requirement for task {task_id!r}: {path}")
    return path.read_text().strip()


def build_initial_prompt(task_id: str, requirement: str, candidate_dir: Path) -> str:
    """First-round prompt — hand the agent the full prose + the target path."""
    return (
        f"You are implementing a Formspec project for the following requirement.\n\n"
        f"=== REQUIREMENT ({task_id}) ===\n{requirement}\n=== END REQUIREMENT ===\n\n"
        f"Workflow (MCP tools only — no Read/Write/Bash):\n"
        f"1. Call `formspec_create` (no args) to get a `project_id`.\n"
        f"2. Author the definition, theme, and component documents by repeatedly calling\n"
        f"   `formspec_set_field`, `formspec_set_bind`, `formspec_set_validation`,\n"
        f"   `formspec_set_repeat`, `formspec_set_page`, `formspec_set_mapping`, etc.\n"
        f"3. Call `formspec_audit` periodically — it returns lint/validation diagnostics.\n"
        f"   Fix anything it flags before publishing.\n"
        f"4. When the audit is clean, call:\n"
        f"     formspec_publish(project_id=<id>, version='0.1.0', path='{candidate_dir}')\n"
        f"   This writes the artifact files to disk for the grader. STOP after publish.\n\n"
        f"A grader will run the Python validator over that directory and score you — "
        f"you do NOT need to report back in prose. Publish the best Formspec you can build.\n"
    )


def build_followup_prompt(
    task_id: str, requirement: str, candidate_dir: Path, diagnostics: list[dict]
) -> str:
    """Subsequent-round prompt — feed prior diagnostics back for repair."""
    diag_blob = "\n".join(
        f"- [{d.get('code', '?')}] {d.get('message', '(no message)')}"
        for d in diagnostics[:MAX_DIAGNOSTICS_RETURNED]
    ) or "(no diagnostics captured)"
    return (
        f"Your previous Formspec for task `{task_id}` did not validate clean. The Python "
        f"validator reported these errors:\n\n{diag_blob}\n\n"
        f"Fix them and re-publish. Reminder of the requirement:\n\n"
        f"=== REQUIREMENT ===\n{requirement}\n=== END ===\n\n"
        f"Use `formspec_create` to start fresh (or open the existing project), fix every "
        f"diagnostic above, run `formspec_audit` until clean, then call:\n"
        f"  formspec_publish(project_id=<id>, version='0.1.0', path='{candidate_dir}')\n"
        f"Stop after publish."
    )


def dispatch_agent(
    *,
    prompt: str,
    model: str,
    candidate_dir: Path,
    mcp_config: Path,
    timeout_sec: int = 1200,
) -> str:
    """Run `claude --print` with the prompt piped on stdin. Return stdout as a
    string (JSON transcript per `--output-format json`). Raises on non-zero
    exit so a broken CLI doesn't silently produce empty rounds.

    `candidate_dir` is created so the agent's `formspec_publish(path=...)` call
    has a destination to write into.
    """
    candidate_dir.mkdir(parents=True, exist_ok=True)
    cmd = [
        "claude",
        "--print",
        "--output-format", "json",
        "--model", model,
        "--mcp-config", str(mcp_config),
        "--allowedTools", *MCP_TOOL_ALLOWLIST,
        "--no-session-persistence",
        "--dangerously-skip-permissions",
        "--add-dir", str(candidate_dir),
    ]
    result = subprocess.run(
        cmd,
        input=prompt,
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
        timeout=timeout_sec,
        check=False,
    )
    if result.returncode != 0:
        raise RuntimeError(
            f"claude CLI exited {result.returncode}: {result.stderr.strip()[:500]}"
        )
    return result.stdout or ""


def run_task(
    task_id: str,
    model: str,
    max_rounds: int,
    run_root: Path,
    registry: Path,
    mcp_config: Path,
) -> dict[str, Any]:
    """Drive one (task, model) pair through up to `max_rounds` iterations.

    Returns the result dict (also written to `<run_root>/<task>/<model>/result.json`).
    Per-round forensic artifacts are preserved under `round-NN/`.
    """
    requirement = load_requirement(task_id)
    task_root = run_root / task_id / model
    task_root.mkdir(parents=True, exist_ok=True)

    started = time.monotonic()
    first_report: dict | None = None
    last_report: dict | None = None
    rounds_run = 0

    for round_n in range(1, max_rounds + 1):
        round_dir = task_root / f"round-{round_n:02d}"
        candidate_dir = round_dir / "candidate"
        round_dir.mkdir(parents=True, exist_ok=True)

        if round_n == 1:
            prompt = build_initial_prompt(task_id, requirement, candidate_dir)
        else:
            prior_diags = (last_report or {}).get("diagnostics", [])
            prompt = build_followup_prompt(task_id, requirement, candidate_dir, prior_diags)
        (round_dir / "prompt.txt").write_text(prompt)

        transcript = dispatch_agent(
            prompt=prompt,
            model=model,
            candidate_dir=candidate_dir,
            mcp_config=mcp_config,
        )
        (round_dir / "agent-transcript.json").write_text(transcript or "")

        report = score_task(task_id, candidate_dir, registry)
        (round_dir / "diagnostics.json").write_text(json.dumps(report, indent=2))

        rounds_run = round_n
        if first_report is None:
            first_report = report
        last_report = report

        if report.get("validates"):
            break

    wall_time = round(time.monotonic() - started, 2)
    assert first_report is not None and last_report is not None  # max_rounds >= 1
    result = {
        "taskId": task_id,
        "model": model,
        "rounds": rounds_run,
        "score": last_report["score"],
        "validates": last_report["validates"],
        "firstRoundDiags": first_report.get("diagnostics", []),
        "lastRoundDiags": last_report.get("diagnostics", []),
        "totalErrorsFirst": first_report.get("totalErrors", 0),
        "totalErrorsLast": last_report.get("totalErrors", 0),
        "wallTimeSec": wall_time,
    }
    (task_root / "result.json").write_text(json.dumps(result, indent=2))
    return result


def write_summary(run_root: Path, results: list[dict]) -> Path:
    """Aggregate per-task results + a human-readable table into `summary.json`."""
    run_root.mkdir(parents=True, exist_ok=True)
    summary = {
        "results": results,
        "table": _format_table(results),
    }
    path = run_root / "summary.json"
    path.write_text(json.dumps(summary, indent=2))
    return path


def _format_table(results: list[dict]) -> list[str]:
    """Return a list of lines forming an aligned `task | model | rounds | score | validates` table."""
    if not results:
        return []
    header = f"{'task':<22} {'model':<22} {'rounds':>6} {'score':>6} {'validates':>10}"
    sep = "-" * len(header)
    rows = [header, sep]
    for r in sorted(results, key=lambda x: (x["taskId"], x["model"])):
        rows.append(
            f"{r['taskId']:<22} {r['model']:<22} {r['rounds']:>6} "
            f"{r['score']:>6.2f} {str(r['validates']):>10}"
        )
    return rows


def _iso_date() -> str:
    return time.strftime("%Y-%m-%d")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="run_mcp_loop",
        description="Drive the Formspec MCP with an LLM until it converges on a clean spec.",
    )
    parser.add_argument(
        "task_ids",
        nargs="*",
        help="Task ids to run. Omit with --all to run every registered task.",
    )
    parser.add_argument(
        "--all", action="store_true",
        help="Run every task under benchmarks/tasks/.",
    )
    parser.add_argument(
        "--model", required=True,
        help="Claude model alias or full name (e.g. 'sonnet', 'claude-sonnet-4-6').",
    )
    parser.add_argument("--max-rounds", type=int, default=5)
    parser.add_argument(
        "--runs-dir", type=Path, default=DEFAULT_RUNS_DIR,
        help=f"Parent directory for run artifacts (default: {DEFAULT_RUNS_DIR}).",
    )
    parser.add_argument(
        "--registry", type=Path, default=DEFAULT_REGISTRY,
        help=f"Registry JSON path (default: {DEFAULT_REGISTRY}).",
    )
    parser.add_argument(
        "--mcp-config", type=Path, required=True,
        help="MCP config that launches Forms-MCP (it lives in formspec-studio); no repo-local default.",
    )
    args = parser.parse_args(argv)
    if not args.mcp_config.is_file():
        parser.error(f"--mcp-config {args.mcp_config} does not exist")
    # The agent runs with cwd=REPO_ROOT, so pin the caller's path before dispatch.
    args.mcp_config = args.mcp_config.resolve()

    known = iter_task_ids()
    if args.all:
        task_ids = known
    else:
        task_ids = args.task_ids
        if not task_ids:
            parser.error("either pass one or more task ids or use --all")
    unknown = [t for t in task_ids if t not in known]
    if unknown:
        parser.error(f"unknown task id(s): {unknown}. Known: {known}")

    run_root = args.runs_dir / _iso_date()
    results: list[dict] = []
    for task_id in task_ids:
        print(f"=== running {task_id} / {args.model} (up to {args.max_rounds} rounds) ===",
              file=sys.stderr)
        try:
            result = run_task(
                task_id=task_id,
                model=args.model,
                max_rounds=args.max_rounds,
                run_root=run_root,
                registry=args.registry,
                mcp_config=args.mcp_config,
            )
        except Exception as exc:  # noqa: BLE001 — surface any dispatch/score failure per-task
            print(f"!! {task_id}: {exc}", file=sys.stderr)
            continue
        results.append(result)
        print(
            f"   rounds={result['rounds']} score={result['score']:.2f} "
            f"validates={result['validates']} wall={result['wallTimeSec']}s",
            file=sys.stderr,
        )

    summary_path = write_summary(run_root, results)
    print(f"\nWrote summary to {summary_path}", file=sys.stderr)
    for line in _format_table(results):
        print(line)
    return 0 if results else 1


if __name__ == "__main__":
    raise SystemExit(main())

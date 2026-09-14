"""Tests for the MCP-driven convergence loop runner.

These tests mock the agent subprocess so the runner can be exercised without
actually spinning up the Claude CLI. They cover three things:
1. Scoring integration — the loop calls `score_task` from `run_benchmark` and
   stores its output unchanged in the per-round diagnostics file.
2. Output shape — `result.json` contains every required key and the per-round
   directories preserve agent transcript + candidate + diagnostics.
3. Loop termination — the loop breaks early on a clean round, otherwise runs
   exactly `max_rounds` times.
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from unittest.mock import patch

import pytest

BENCHMARKS_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(BENCHMARKS_DIR))

import run_mcp_loop  # noqa: E402

# The Forms MCP lives in the sibling formspec-studio repo (formspec-stack layout).
FORMS_MCP_SRC = BENCHMARKS_DIR.parents[1] / "formspec-studio" / "packages" / "formspec-mcp" / "src"
ALLOWLIST_PREFIX = "mcp__formspec-mcp__"


RESULT_KEYS = {
    "taskId",
    "model",
    "rounds",
    "score",
    "validates",
    "firstRoundDiags",
    "lastRoundDiags",
    "totalErrorsFirst",
    "totalErrorsLast",
    "wallTimeSec",
}


def _fake_transcript(summary: str = "(stub)") -> str:
    """Stand-in for a `claude --print --output-format=json` transcript blob."""
    return json.dumps({"type": "result", "result": summary})


def _populate_candidate(candidate_dir: Path) -> None:
    """Mimic what the agent would do — drop *something* so the directory exists."""
    candidate_dir.mkdir(parents=True, exist_ok=True)
    (candidate_dir / "definition.json").write_text('{"stub": true}')


@pytest.fixture
def fake_score_dirty():
    """score_task returns a failing report every call."""
    def _score(task_id, candidate_dir, registry):
        return {
            "taskId": task_id,
            "validates": False,
            "totalErrors": 3,
            "hasDefinition": True,
            "diagnostics": [{"code": "E001", "message": "missing field"}],
            "score": 0.7,
        }
    return _score


@pytest.fixture
def fake_score_clean_on_round_two():
    """First call dirty, second call clean — proves early break."""
    calls = {"n": 0}
    def _score(task_id, candidate_dir, registry):
        calls["n"] += 1
        if calls["n"] == 1:
            return {
                "taskId": task_id,
                "validates": False,
                "totalErrors": 2,
                "hasDefinition": True,
                "diagnostics": [{"code": "E001", "message": "err"}],
                "score": 0.8,
            }
        return {
            "taskId": task_id,
            "validates": True,
            "totalErrors": 0,
            "hasDefinition": True,
            "diagnostics": [],
            "score": 1.0,
        }
    return _score


def test_run_task_writes_result_with_all_required_keys(tmp_path, fake_score_dirty):
    """Smoke — one round, dirty score, ensure result.json has every key."""
    with patch.object(run_mcp_loop, "dispatch_agent",
                      side_effect=lambda *a, **kw: (_populate_candidate(kw["candidate_dir"]), _fake_transcript())[1]), \
         patch.object(run_mcp_loop, "score_task", side_effect=fake_score_dirty):
        result = run_mcp_loop.run_task(
            task_id="invoice",
            model="claude-sonnet-4-6",
            max_rounds=1,
            run_root=tmp_path,
            registry=Path("/tmp/registry.json"),
            mcp_config=tmp_path / "mcp.json",
        )

    missing = RESULT_KEYS - set(result.keys())
    assert not missing, f"result.json missing keys: {missing}"
    assert result["taskId"] == "invoice"
    assert result["model"] == "claude-sonnet-4-6"
    assert result["rounds"] == 1
    assert result["validates"] is False
    assert result["totalErrorsFirst"] == 3
    assert result["totalErrorsLast"] == 3

    # Per-round forensic artifacts exist.
    round_dir = tmp_path / "invoice" / "claude-sonnet-4-6" / "round-01"
    assert (round_dir / "agent-transcript.json").is_file()
    assert (round_dir / "diagnostics.json").is_file()
    assert (round_dir / "candidate").is_dir()

    # Top-level result.json exists and parses.
    result_path = tmp_path / "invoice" / "claude-sonnet-4-6" / "result.json"
    on_disk = json.loads(result_path.read_text())
    assert on_disk["rounds"] == 1


def test_run_task_breaks_early_when_clean(tmp_path, fake_score_clean_on_round_two):
    """Second round clean → loop stops after round 2, not round 5."""
    with patch.object(run_mcp_loop, "dispatch_agent",
                      side_effect=lambda *a, **kw: (_populate_candidate(kw["candidate_dir"]), _fake_transcript())[1]), \
         patch.object(run_mcp_loop, "score_task", side_effect=fake_score_clean_on_round_two):
        result = run_mcp_loop.run_task(
            task_id="invoice",
            model="sonnet",
            max_rounds=5,
            run_root=tmp_path,
            registry=Path("/tmp/registry.json"),
            mcp_config=tmp_path / "mcp.json",
        )

    assert result["rounds"] == 2, "loop should terminate as soon as validates=True"
    assert result["validates"] is True
    assert result["score"] == 1.0
    assert result["totalErrorsFirst"] == 2
    assert result["totalErrorsLast"] == 0
    # First-round diags preserved even though a later round cleaned up.
    assert result["firstRoundDiags"] and result["firstRoundDiags"][0]["code"] == "E001"
    assert result["lastRoundDiags"] == []


def test_run_task_runs_exactly_max_rounds_when_never_clean(tmp_path, fake_score_dirty):
    """Loop must NOT over- or under-shoot max_rounds."""
    with patch.object(run_mcp_loop, "dispatch_agent",
                      side_effect=lambda *a, **kw: (_populate_candidate(kw["candidate_dir"]), _fake_transcript())[1]), \
         patch.object(run_mcp_loop, "score_task", side_effect=fake_score_dirty):
        result = run_mcp_loop.run_task(
            task_id="invoice",
            model="sonnet",
            max_rounds=3,
            run_root=tmp_path,
            registry=Path("/tmp/registry.json"),
            mcp_config=tmp_path / "mcp.json",
        )

    assert result["rounds"] == 3
    assert result["validates"] is False
    # Every round's forensic dir materialised.
    for r in (1, 2, 3):
        rd = tmp_path / "invoice" / "sonnet" / f"round-{r:02d}"
        assert (rd / "diagnostics.json").is_file(), f"round-{r:02d} missing diagnostics"


def test_followup_prompt_includes_diagnostics(tmp_path, fake_score_dirty):
    """Round ≥ 2 must feed previous-round diagnostics back to the agent."""
    captured_prompts: list[str] = []

    def _capture(*args, **kwargs):
        captured_prompts.append(kwargs["prompt"])
        _populate_candidate(kwargs["candidate_dir"])
        return _fake_transcript()

    with patch.object(run_mcp_loop, "dispatch_agent", side_effect=_capture), \
         patch.object(run_mcp_loop, "score_task", side_effect=fake_score_dirty):
        run_mcp_loop.run_task(
            task_id="invoice",
            model="sonnet",
            max_rounds=2,
            run_root=tmp_path,
            registry=Path("/tmp/registry.json"),
            mcp_config=tmp_path / "mcp.json",
        )

    assert len(captured_prompts) == 2
    # Round 1 prompt contains the prose requirement (first paragraph or heading).
    assert "invoice" in captured_prompts[0].lower()
    # Round 2 prompt carries forward the diagnostics error code.
    assert "E001" in captured_prompts[1] or "missing field" in captured_prompts[1]


def test_summary_aggregates_all_task_model_pairs(tmp_path, fake_score_dirty):
    """The aggregate writer emits `summary.json` keyed by (task, model)."""
    with patch.object(run_mcp_loop, "dispatch_agent",
                      side_effect=lambda *a, **kw: (_populate_candidate(kw["candidate_dir"]), _fake_transcript())[1]), \
         patch.object(run_mcp_loop, "score_task", side_effect=fake_score_dirty):
        results = [
            run_mcp_loop.run_task("invoice", "sonnet", 1, tmp_path, Path("/tmp/r.json"), tmp_path / "mcp.json"),
            run_mcp_loop.run_task("grant-application", "sonnet", 1, tmp_path, Path("/tmp/r.json"), tmp_path / "mcp.json"),
        ]

    summary_path = run_mcp_loop.write_summary(tmp_path, results)
    assert summary_path.is_file()
    summary = json.loads(summary_path.read_text())
    assert len(summary["results"]) == 2
    ids = {(r["taskId"], r["model"]) for r in summary["results"]}
    assert ("invoice", "sonnet") in ids
    assert ("grant-application", "sonnet") in ids


def test_main_requires_an_explicit_mcp_config(capsys):
    """No repo-local default: the Forms-MCP config lives beside the package in formspec-studio."""
    with pytest.raises(SystemExit) as exit_info:
        run_mcp_loop.main(["invoice", "--model", "sonnet"])
    assert exit_info.value.code == 2
    assert "--mcp-config" in capsys.readouterr().err


def test_main_rejects_a_missing_mcp_config(tmp_path, capsys):
    missing = tmp_path / "absent.mcp.json"
    with pytest.raises(SystemExit) as exit_info:
        run_mcp_loop.main(["invoice", "--model", "sonnet", "--mcp-config", str(missing)])
    assert exit_info.value.code == 2
    assert "does not exist" in capsys.readouterr().err


def test_main_hands_the_agent_an_absolute_mcp_config(tmp_path, monkeypatch):
    """The agent runs with cwd=REPO_ROOT, so a caller-relative config path must be resolved first."""
    server_entry = tmp_path / "dist" / "index.js"
    (tmp_path / "studio.mcp.json").write_text(json.dumps({
        "mcpServers": {"formspec-mcp": {"command": "node", "args": [str(server_entry)]}},
    }))
    monkeypatch.chdir(tmp_path)
    seen: dict[str, Path] = {}

    def _run_task(**kwargs):
        seen["mcp_config"] = kwargs["mcp_config"]
        return {
            "taskId": kwargs["task_id"], "model": kwargs["model"], "rounds": 1, "score": 1.0,
            "validates": True, "firstRoundDiags": [], "lastRoundDiags": [],
            "totalErrorsFirst": 0, "totalErrorsLast": 0, "wallTimeSec": 0,
        }

    with patch.object(run_mcp_loop, "run_task", side_effect=_run_task), \
         patch.object(run_mcp_loop, "write_summary", return_value=None, create=True):
        run_mcp_loop.main([
            "invoice", "--model", "sonnet",
            "--mcp-config", "studio.mcp.json",
            "--runs-dir", str(tmp_path / "runs"),
        ])

    assert seen["mcp_config"] == tmp_path.resolve() / "studio.mcp.json"


@pytest.mark.parametrize("server", [
    {"command": "node", "args": ["packages/formspec-mcp/dist/index.js"]},
    {"command": "./bin/formspec-mcp"},
    {"command": "node", "args": ["--require=../preload.js", "/abs/dist/index.js"]},
])
def test_main_rejects_relative_server_paths_the_agent_cwd_cannot_resolve(tmp_path, capsys, server):
    """formspec-studio/.mcp.json uses studio-relative args; under cwd=REPO_ROOT they die as "Connection closed"."""
    config = tmp_path / "studio.mcp.json"
    config.write_text(json.dumps({"mcpServers": {"formspec-mcp": server}}))

    with patch.object(run_mcp_loop, "run_task", side_effect=AssertionError("dispatched")), \
         pytest.raises(SystemExit) as exit_info:
        run_mcp_loop.main(["invoice", "--model", "sonnet", "--mcp-config", str(config)])

    assert exit_info.value.code == 2
    err = capsys.readouterr().err
    assert "formspec-mcp" in err
    assert "relative path" in err
    assert "absolute" in err


def _forms_mcp_tool_names() -> set[str]:
    """Tool names the Forms MCP server registers: product verbs plus node tools."""
    if not FORMS_MCP_SRC.is_dir():
        pytest.skip(f"Forms MCP source not checked out at {FORMS_MCP_SRC}")
    product = (FORMS_MCP_SRC / "product-tools.ts").read_text()
    verbs = re.search(r"PRODUCT_TOOL_NAMES = \[(.*?)\] as const", product, re.S)
    assert verbs, "product-tools.ts no longer declares PRODUCT_TOOL_NAMES"
    node = (FORMS_MCP_SRC / "node-tools.ts").read_text()
    node_tools = node[node.index("export function registerNodeTools"):]
    names = set(re.findall(r"'(formspec_\w+)'", verbs.group(1)))
    names |= set(re.findall(r"registerTool\('(formspec_\w+)'", node_tools))
    assert {"formspec_bootstrap_form", "formspec_publish"} <= names, names
    return names


def test_allowlist_matches_the_forms_mcp_tool_surface():
    allowed = {name.removeprefix(ALLOWLIST_PREFIX) for name in run_mcp_loop.MCP_TOOL_ALLOWLIST}
    assert all(name.startswith(ALLOWLIST_PREFIX) for name in run_mcp_loop.MCP_TOOL_ALLOWLIST)
    tools = _forms_mcp_tool_names()
    assert sorted(allowed - tools) == [], "allowlist names tools the Forms MCP no longer registers"
    assert sorted(tools - allowed) == [], "Forms MCP registers tools the allowlist omits"


def test_runner_only_names_tools_the_forms_mcp_registers(tmp_path):
    tools = _forms_mcp_tool_names()
    text = "\n".join([
        Path(run_mcp_loop.__file__).read_text(),
        run_mcp_loop.build_initial_prompt("invoice", "req", tmp_path),
        run_mcp_loop.build_followup_prompt("invoice", "req", tmp_path, []),
    ])
    named = set(re.findall(r"(?<![A-Za-z0-9])formspec_[a-z_]*[a-z]", text))
    assert sorted(named - tools) == []

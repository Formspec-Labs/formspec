"""Runtime ownership boundary checks for ADR 0153 gate 7."""

from __future__ import annotations

from pathlib import Path


ROOT = Path(__file__).parents[3]


def read_spec(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def compact(text: str) -> str:
    return " ".join(text.split())


def test_surface_owns_route_state_but_not_response_or_invocation_state() -> None:
    content = compact(read_spec("specs/surface/surface-spec.md"))

    assert "Surface owns the route graph contract" in content
    assert "runtime route state MUST be keyed by Surface identity plus" in content
    assert "Surface route state is separate from session, Response, and Response Actions state" in content
    assert "ambiguous submit/navigation behavior is invalid" in content


def test_core_response_owns_response_instances_independent_of_route_state() -> None:
    content = compact(read_spec("specs/core/spec.md"))

    assert "A live Response instance is owned by the Core Response contract" in content
    assert "MUST NOT rewrite the pinned Definition tuple" in content
    assert "draft persistence is not route state" in content
    assert "graph policy validation alone is not a Response status transition" in content


def test_app_manifest_session_index_is_not_runtime_route_state() -> None:
    content = compact(read_spec("specs/bundle/app-manifest-spec.md"))

    assert "`sessions[]` is a durable session identity anchor, not runtime route state" in content
    assert "Host session boundaries own issued tokens, actor/collaborator context" in content
    assert "Surface runtime routers own active route and navigation history" in content
    assert "MUST NOT synthesize route navigation, Response instances, or action invocations" in content


def test_response_actions_owns_invocation_effect_state_only() -> None:
    content = compact(read_spec("specs/response-actions/response-actions-spec.md"))

    assert "Response Actions owns action invocation state" in content
    assert "Invocation state is not route state, session state, or Response identity" in content
    assert "Core Response processors own data/status mutation only through the resolved VM persistence policy" in content
    assert "MUST NOT infer the Response instance from Definition URL alone" in content


def test_app_graph_validator_does_not_promote_runtime_plan() -> None:
    content = compact(read_spec("specs/app-graph/app-graph-validator-spec.md"))

    assert "It also does not own runtime state" in content
    assert "MUST NOT synthesize a Runtime Plan" in content
    assert "choose the active route" in content
    assert "execute actions" in content
    assert "infer hidden-state rejection behavior" in content

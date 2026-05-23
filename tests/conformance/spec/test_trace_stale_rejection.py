"""Stale-rejection invariant for Trace predicates (§7).

Spec invariant: predicate execution MUST verify all `sources[]` digests
against the supplied artifacts BEFORE returning any result. On mismatch,
raise `TraceStaleError`. Rejection is UNCONDITIONAL — no partial results
for any of the 16 v1 predicates (§7.3).

Four rejection reasons pinned here (§7.2):
  - source-missing       — TraceIndex entry with no supplied artifact
  - digest-mismatch      — supplied artifact mutated since build
  - extra-source-present — supplied artifact has no TraceIndex entry
  - duplicate-source-entry — TraceIndex repeats a (kind, identity) source key

This pytest pins all four reasons across all sixteen predicates plus
the `whatDependsOn` JOIN. It uses a synthetic in-memory source set so it
does not depend on the parallel fixtures-authoring agent.
"""

from __future__ import annotations

import json
from typing import Callable

import pytest

from tests.conformance.spec.test_trace_predicates import (
    PREDICATES,
    TraceStaleError,
    _build_edges,
    _digest,
    _identity,
    action_for_trigger,
    actors_for_task,
    component_nodes_for_item,
    concepts_for_item,
    concepts_for_node,
    dependencies_of,
    dependents_on,
    items_for_action,
    items_for_component,
    items_for_concept,
    items_for_unit,
    tasks_for_actor,
    tasks_for_unit,
    triggers_for_action,
    units_for_item,
    units_for_task,
    what_depends_on,
)


# ---------------------------------------------------------------------------
# Synthetic source set — exercises every source kind and every edge kind
# ---------------------------------------------------------------------------


def _synthetic_sources() -> dict[str, dict]:
    """In-memory source set with every kind populated so all 16 predicates
    have at least one matching edge to chew on."""
    return {
        "definition": {
            "$formspec": "1.0",
            "url": "https://example.test/stale",
            "version": "1.0.0",
            "items": [
                {"key": "a", "type": "field", "dataType": "number"},
                {"key": "b", "type": "field", "dataType": "number"},
                {"key": "c", "type": "field", "dataType": "number"},
            ],
            "binds": [
                {"path": "a"},
                {"path": "b", "calculate": "$a"},
                {"path": "c", "calculate": "$b"},
            ],
            "_bind_dependencies": {"b": ["a"], "c": ["b"]},
        },
        "experience": {
            "$formspecExperience": "1.0",
            "name": "stale",
            "version": "1.0.0",
            "targetDefinition": {
                "url": "https://example.test/stale",
                "compatibleVersions": ">=1.0.0",
            },
            "tasks": [{"id": "t1", "actorRefs": ["actor1"]}],
            "units": [{
                "id": "u1",
                "kind": "data-entry",
                "taskRefs": ["t1"],
                "itemRefs": [{"path": "a"}, {"path": "b"}, {"path": "c"}],
            }],
        },
        "responseActions": {
            "$formspecResponseActions": "1.0",
            "version": "1.0.0",
            "targetDefinition": {
                "url": "https://example.test/stale",
                "compatibleVersions": ">=1.0.0",
            },
            "actions": [{
                "id": "submit",
                "intent": "submit",
                "effects": [{"type": "hostEvent", "eventName": "submit"}],
                "preconditions": [{"id": "p1", "expression": "true"}],
            }],
        },
        "component": {
            "$formspecComponent": "1.1",
            "url": "https://example.test/stale/components/main",
            "version": "1.0.0",
            "targetDefinition": {
                "url": "https://example.test/stale",
                "compatibleVersions": ">=1.0.0",
            },
            "tree": {
                "id": "root",
                "component": "Section",
                "unitRef": "u1",
                "children": [
                    {"id": "ai", "component": "TextInput", "bind": "a"},
                    {"id": "bi", "component": "TextInput", "bind": "b"},
                    {
                        "id": "ci",
                        "component": "TextInput",
                        "bind": "c",
                        "conceptRefs": [{"id": "Schema/Income"}],
                    },
                    {"id": "sb", "component": "ActionButton", "actionRef": "submit"},
                ],
            },
            "_when_dependencies": {"/tree/children/1": ["a"]},
        },
        "ontology": {
            "$formspecOntology": "1.0",
            "version": "1.0.0",
            "targetDefinition": {
                "url": "https://example.test/stale",
                "compatibleVersions": ">=1.0.0",
            },
            "concepts": {
                "a": "Schema/Person",
                "b": "Schema/Income",
            },
        },
    }


def _build_fresh_index() -> tuple[dict, dict[str, dict]]:
    srcs = _synthetic_sources()
    sources_meta = []
    for kind, doc in srcs.items():
        sources_meta.append({
            "kind": kind,
            "identity": _identity(kind, doc),
            "digest": _digest(doc),
        })
    sources_meta.sort(key=lambda s: (
        s["kind"],
        json.dumps(s["identity"], sort_keys=True, ensure_ascii=False),
    ))
    index = {
        "$formspecTrace": "1.0",
        "sources": sources_meta,
        "edges": _build_edges(srcs),
    }
    return index, srcs


# ---------------------------------------------------------------------------
# Predicate invocation catalogue — every predicate gets a representative call
# ---------------------------------------------------------------------------

# Each entry: (name, callable(index, srcs)) covering all 16 predicates plus
# the whatDependsOn JOIN. Arg values are chosen to hit non-empty results in
# the fresh case — so when the test mutates the index/srcs into a stale
# state, the predicate would otherwise return a non-empty result; the
# stale-rejection invariant MUST short-circuit instead.

ALL_PREDICATE_CALLS: list[tuple[str, Callable[[dict, dict], object]]] = [
    ("componentNodesForItem", lambda i, s: component_nodes_for_item(i, s, "a")),
    ("itemsForComponent",     lambda i, s: items_for_component(i, s, "/tree/children/0")),
    ("unitsForItem",          lambda i, s: units_for_item(i, s, "a")),
    ("itemsForUnit",          lambda i, s: items_for_unit(i, s, "u1")),
    ("tasksForUnit",          lambda i, s: tasks_for_unit(i, s, "u1")),
    ("unitsForTask",          lambda i, s: units_for_task(i, s, "t1")),
    ("actorsForTask",         lambda i, s: actors_for_task(i, s, "t1")),
    ("tasksForActor",         lambda i, s: tasks_for_actor(i, s, "actor1")),
    ("actionForTrigger",      lambda i, s: action_for_trigger(i, s, "/tree/children/3")),
    ("triggersForAction",     lambda i, s: triggers_for_action(i, s, "submit")),
    ("itemsForAction",        lambda i, s: items_for_action(i, s, "submit")),
    ("dependenciesOf",        lambda i, s: dependencies_of(i, s, "b")),
    ("dependentsOn",          lambda i, s: dependents_on(i, s, "a")),
    ("conceptsForItem",       lambda i, s: concepts_for_item(i, s, "a")),
    ("itemsForConcept",       lambda i, s: items_for_concept(i, s, "Schema/Person")),
    ("conceptsForNode",       lambda i, s: concepts_for_node(i, s, "/tree/children/2")),
    ("whatDependsOn",         lambda i, s: what_depends_on(i, s, "a")),
]


def test_predicate_catalogue_covers_full_v1_vocabulary() -> None:
    """Sanity: this file MUST exercise every predicate in the v1 registry."""
    catalogued = {name for name, _ in ALL_PREDICATE_CALLS}
    assert catalogued == set(PREDICATES.keys()), (
        f"stale-rejection catalogue drift: missing="
        f"{set(PREDICATES.keys()) - catalogued}, "
        f"extra={catalogued - set(PREDICATES.keys())}"
    )


# ---------------------------------------------------------------------------
# Sanity: fresh index does not raise
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("name,call", ALL_PREDICATE_CALLS, ids=[n for n, _ in ALL_PREDICATE_CALLS])
def test_fresh_index_does_not_raise(name: str, call) -> None:
    """Every predicate runs cleanly against an unmodified index/srcs pair."""
    index, srcs = _build_fresh_index()
    call(index, srcs)  # No exception expected.


# ---------------------------------------------------------------------------
# digest-mismatch — every predicate must raise
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("name,call", ALL_PREDICATE_CALLS, ids=[n for n, _ in ALL_PREDICATE_CALLS])
def test_digest_mismatch_rejects_every_predicate(name: str, call) -> None:
    """Mutating any source artifact's bytes MUST cause every predicate to raise
    TraceStaleError with reason `digest-mismatch`."""
    index, srcs = _build_fresh_index()
    # Mutate the definition (a load-bearing source for many edges).
    srcs["definition"]["items"].append({
        "key": "_injected",
        "type": "field",
        "dataType": "string",
    })
    with pytest.raises(TraceStaleError) as exc:
        call(index, srcs)
    assert exc.value.reason == "digest-mismatch", (
        f"{name}: expected digest-mismatch, got {exc.value.reason}"
    )


# ---------------------------------------------------------------------------
# source-missing — every predicate must raise
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("name,call", ALL_PREDICATE_CALLS, ids=[n for n, _ in ALL_PREDICATE_CALLS])
def test_source_missing_rejects_every_predicate(name: str, call) -> None:
    """If the TraceIndex declares a source the caller did NOT supply, every
    predicate MUST raise TraceStaleError with reason `source-missing`."""
    index, srcs = _build_fresh_index()
    # Caller drops the ontology source from supplied srcs; the index still
    # declares it -> the index references a source the caller can't supply.
    del srcs["ontology"]
    with pytest.raises(TraceStaleError) as exc:
        call(index, srcs)
    assert exc.value.reason == "source-missing", (
        f"{name}: expected source-missing, got {exc.value.reason}"
    )


# ---------------------------------------------------------------------------
# extra-source-present — every predicate must raise
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("name,call", ALL_PREDICATE_CALLS, ids=[n for n, _ in ALL_PREDICATE_CALLS])
def test_extra_source_present_rejects_every_predicate(name: str, call) -> None:
    """If the caller supplies a source the TraceIndex does NOT declare, every
    predicate MUST raise TraceStaleError with reason `extra-source-present`.

    The caller would otherwise expect that source's edges in the answer; the
    fact that the index never inspected it means staleness."""
    index, srcs = _build_fresh_index()
    # Drop the ontology entry from the index but KEEP the supplied source —
    # caller intends to query over ontology but index doesn't carry its edges.
    index = json.loads(json.dumps(index))
    index["sources"] = [s for s in index["sources"] if s["kind"] != "ontology"]
    with pytest.raises(TraceStaleError) as exc:
        call(index, srcs)
    assert exc.value.reason == "extra-source-present", (
        f"{name}: expected extra-source-present, got {exc.value.reason}"
    )


# ---------------------------------------------------------------------------
# duplicate-source-entry — every predicate must raise
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("name,call", ALL_PREDICATE_CALLS, ids=[n for n, _ in ALL_PREDICATE_CALLS])
def test_duplicate_source_entry_rejects_every_predicate(name: str, call) -> None:
    """A TraceIndex MUST NOT silently overwrite duplicate source keys.

    Duplicate `(kind, identity)` entries make freshness ambiguous, so every
    predicate MUST raise before returning.
    """
    index, srcs = _build_fresh_index()
    index = json.loads(json.dumps(index))
    index["sources"].append(json.loads(json.dumps(index["sources"][0])))
    with pytest.raises(TraceStaleError) as exc:
        call(index, srcs)
    assert exc.value.reason == "duplicate-source-entry", (
        f"{name}: expected duplicate-source-entry, got {exc.value.reason}"
    )


# ---------------------------------------------------------------------------
# §7.3 — No partial results, no repair path
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("name,call", ALL_PREDICATE_CALLS, ids=[n for n, _ in ALL_PREDICATE_CALLS])
def test_no_partial_results_on_stale_for_any_predicate(name: str, call) -> None:
    """A stale TraceIndex MUST raise — predicate MUST NOT return a best-effort
    partial answer for any v1 predicate (§7.3 no repair path)."""
    index, srcs = _build_fresh_index()
    # Mutate the component tree's children: every edge kind that walks the
    # component tree (renders, trigger, visibility, conceptRefs) is now wrong,
    # but the predicate MUST raise rather than serve a partial result.
    srcs["component"]["tree"]["children"].pop()
    with pytest.raises(TraceStaleError):
        call(index, srcs)


# ---------------------------------------------------------------------------
# Stale rejection is unconditional — does not depend on whether the predicate
# would otherwise return a result
# ---------------------------------------------------------------------------


def test_stale_rejection_fires_even_for_empty_result_predicates() -> None:
    """Predicates that would otherwise return an empty list MUST still raise
    on a stale index. The freshness check happens BEFORE any edge inspection."""
    index, srcs = _build_fresh_index()
    srcs["definition"]["items"].append({"key": "_x", "type": "field"})
    # `componentNodesForItem("nonexistent")` would return [] on a fresh index,
    # but on a stale index it MUST raise.
    with pytest.raises(TraceStaleError):
        component_nodes_for_item(index, srcs, "nonexistent-item")


def test_stale_error_carries_diagnostic_payload() -> None:
    """§7.2: the error MUST identify which source caused the rejection."""
    index, srcs = _build_fresh_index()
    srcs["definition"]["items"].append({"key": "_x", "type": "field"})
    with pytest.raises(TraceStaleError) as exc:
        component_nodes_for_item(index, srcs, "a")
    payload = exc.value.source
    assert payload["kind"] == "definition"
    assert "identity" in payload
    assert payload["identity"]["url"] == "https://example.test/stale"


def test_action_for_trigger_special_case_also_rejects_stale() -> None:
    """`actionForTrigger` is the one predicate that can raise ValueError on a
    malformed index (multiple matches). Stale rejection must fire BEFORE
    that check — staleness is the more fundamental failure mode."""
    index, srcs = _build_fresh_index()
    # Inject a duplicate trigger edge (would normally cause ValueError) AND
    # mutate the source (causes stale). Stale must win.
    index = json.loads(json.dumps(index))
    index["edges"].append({
        "kind": "trigger-invokes-action",
        "endpoints": ["componentNodePath:/tree/children/3", "action:other"],
    })
    srcs["definition"]["items"].append({"key": "_x", "type": "field"})
    with pytest.raises(TraceStaleError):
        action_for_trigger(index, srcs, "/tree/children/3")

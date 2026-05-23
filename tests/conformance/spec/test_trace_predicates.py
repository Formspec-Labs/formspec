"""Trace predicate conformance (maximal v1 — 11 edge kinds, 17 callables).

The inline reference builder and predicate harness in this file is the
**conformance oracle** named by `thoughts/plans/2026-05-22-trace-spec.md`
Task 15. Engine implementations (Rust crates, TypeScript packages, Python
tooling) re-implement against the same fixture corpus under
`tests/conformance/fixtures/trace/`.

Per the plan's note on FEL dependency extraction without a WASM bridge:
the Python harness does NOT re-implement `getFELDependencies`. Instead,
fixtures encode Definition dependency hints in their source artifacts as
`_bind_dependencies` (Definition bind walk, per item path). Component `when`
fixtures use schema-valid `when` expressions for the simple `$item` subset
this oracle can scan, and may use `_when_dependencies` hints for complex
cases. The Trace spec specifies the OUTPUT — `item-depends-on-item` and
`node-visibility-references-item` edges — not the extraction mechanism.
Engine implementations call their FEL parser; the conformance oracle reads
fixture hints or the fixture-subset `when` expression. Both produce
byte-identical edge sets.

Edge kinds (closed, 11):
    component-renders-item, unit-collects-item, trigger-invokes-action,
    item-depends-on-item, unit-serves-task, task-involves-actor,
    action-emits-effect, action-has-precondition, concept-refs-item,
    concept-refs-component-node, node-visibility-references-item.

Source kinds (closed, 5):
    definition, experience, responseActions, component, ontology.

Predicates (17 callables: 16 simple predicates plus one join):
    componentNodesForItem, itemsForComponent, unitsForItem, itemsForUnit,
    tasksForUnit, unitsForTask, actorsForTask, tasksForActor,
    actionForTrigger, triggersForAction, itemsForAction, dependenciesOf,
    dependentsOn, conceptsForItem, itemsForConcept, conceptsForNode,
    plus the whatDependsOn JOIN -> ImpactReport.

Predicates v1.0 are PURE FUNCTIONS over (TraceIndex, supplied sources,
args). They MUST verify all `sources[]` digests against the supplied
artifacts before returning. Stale -> raise TraceStaleError. No partial
results.
"""

from __future__ import annotations

import hashlib
import json
import re
from collections import deque
from pathlib import Path
from typing import Iterable, Optional

import pytest

REPO = Path(__file__).resolve().parents[3]
FIXTURE_ROOT = REPO / "tests" / "conformance" / "fixtures" / "trace"


# ---------------------------------------------------------------------------
# Canonical bytes + digest (§4)
# ---------------------------------------------------------------------------

def _canonical_bytes(doc: dict) -> bytes:
    """Fixture-subset canonical JSON bytes: sort keys, no whitespace, UTF-8.

    Trace's production digest profile is RFC 8785 JCS. The conformance
    fixtures intentionally stay in the JCS-equivalent subset for this helper:
    no floating-point numbers and no non-finite values. Fixture-only extraction
    hints remain part of the source artifact digest so changing a hint cannot
    bypass stale rejection.
    """
    return json.dumps(
        doc,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
    ).encode("utf-8")


def _digest(doc: dict) -> str:
    return "sha256:" + hashlib.sha256(_canonical_bytes(doc)).hexdigest()


def _load(p: Path) -> dict:
    return json.loads(p.read_text())


# ---------------------------------------------------------------------------
# Stale-rejection error type (§7)
# ---------------------------------------------------------------------------


class TraceStaleError(RuntimeError):
    def __init__(self, reason: str, source: dict):
        super().__init__(f"trace stale: {reason} for {source}")
        self.reason = reason
        self.source = source


# ---------------------------------------------------------------------------
# Source identity (§3.3)
# ---------------------------------------------------------------------------

_KIND_BY_FILE: dict[str, str] = {
    "definition.json": "definition",
    "experience.json": "experience",
    "response-actions.json": "responseActions",
    "component.json": "component",
    "ontology.json": "ontology",
}


def _source_ref_for_kind(kind: str) -> str:
    for fname, mapped_kind in _KIND_BY_FILE.items():
        if mapped_kind == kind:
            return fname
    raise KeyError(kind)


_FEL_ITEM_REF = re.compile(
    r"\$([A-Za-z_][A-Za-z0-9_]*(?:\[\*\])?(?:\.[A-Za-z_][A-Za-z0-9_]*(?:\[\*\])?)*)"
)


def _extract_fixture_fel_dependencies(expr: object) -> list[str]:
    """Return item refs for the fixture FEL subset used in Component `when`.

    Production builders use the FEL dependency extractor. The oracle only
    handles the simple variable-reference subset needed by checked-in fixtures;
    fixture authors can still supply `_when_dependencies` for complex FEL.
    """
    if not isinstance(expr, str):
        return []
    return sorted(set(_FEL_ITEM_REF.findall(expr)))


def _identity(kind: str, doc: dict, source_ref: Optional[str] = None) -> dict:
    if kind == "definition":
        return {"url": doc["url"], "version": doc["version"]}
    source_ref = source_ref or _source_ref_for_kind(kind)
    ident = {
        "sourceRef": source_ref,
        "targetDefinitionUrl": doc["targetDefinition"]["url"],
        "version": doc["version"],
    }
    if kind == "component" and "url" in doc:
        ident["url"] = doc["url"]
    return ident


# ---------------------------------------------------------------------------
# Reference builder (§5.3) — nine walks over five source kinds
# ---------------------------------------------------------------------------


def _walk_component_tree(
    node: dict,
    path: str,
    edges: list[dict],
    when_hints: dict[str, list[str]],
) -> None:
    """Walks 1, 2, 7, 8 — bind, ActionButton trigger, `when`, conceptRefs."""

    # Walk 1: component-renders-item (one per `bind`)
    if "bind" in node:
        edges.append({
            "kind": "component-renders-item",
            "endpoints": [f"componentNodePath:{path}", f"item:{node['bind']}"],
        })

    # Walk 2: trigger-invokes-action (one per ActionButton.actionRef)
    if node.get("component") == "ActionButton" and "actionRef" in node:
        edges.append({
            "kind": "trigger-invokes-action",
            "endpoints": [f"componentNodePath:{path}", f"action:{node['actionRef']}"],
        })

    # Walk 7: node-visibility-references-item (one per item in `when` FEL deps)
    # Engine implementations call getFELDependencies(node['when']); this oracle
    # scans the simple fixture subset and accepts explicit hints for complex FEL.
    when_deps = set(when_hints.get(path, []) or [])
    when_deps.update(_extract_fixture_fel_dependencies(node.get("when")))
    for dep_item in sorted(when_deps):
        edges.append({
            "kind": "node-visibility-references-item",
            "endpoints": [f"componentNodePath:{path}", f"item:{dep_item}"],
        })

    # Walk 8: concept-refs-component-node (one per ConceptRef.id on a node)
    for cref in node.get("conceptRefs", []) or []:
        if isinstance(cref, dict) and "id" in cref:
            cid = cref["id"]
        else:
            cid = cref
        edges.append({
            "kind": "concept-refs-component-node",
            "endpoints": [f"concept:{cid}", f"componentNodePath:{path}"],
        })

    for i, child in enumerate(node.get("children", []) or []):
        _walk_component_tree(child, f"{path}/children/{i}", edges, when_hints)


def _emit_definition_bind_edges(
    definition: dict, edges: list[dict]
) -> None:
    """Walk 4 — item-depends-on-item from Definition binds.

    Reads the fixture's `_bind_dependencies` hint (map: item path -> [dep
    item paths]) instead of running a FEL parser. Engine implementations
    call getFELDependencies on each of (calculate, relevant, required,
    constraint, readonly) and de-duplicate by (dependent, dependency).
    """
    hints = definition.get("_bind_dependencies", {}) or {}
    seen: set[tuple[str, str]] = set()
    # Sort to keep emission deterministic regardless of dict iteration order.
    for dependent in sorted(hints.keys()):
        for dependency in hints[dependent] or []:
            key = (dependent, dependency)
            if key in seen:
                continue
            seen.add(key)
            edges.append({
                "kind": "item-depends-on-item",
                "endpoints": [f"item:{dependent}", f"item:{dependency}"],
            })


def _emit_experience_hierarchy_edges(
    experience: dict, edges: list[dict]
) -> None:
    """Walks 3, 5 — unit-collects-item, unit-serves-task, task-involves-actor."""

    # Walk 3: unit-collects-item
    for unit in experience.get("units", []) or []:
        unit_id = unit.get("id")
        for item_ref in unit.get("itemRefs", []) or []:
            edges.append({
                "kind": "unit-collects-item",
                "endpoints": [f"unit:{unit_id}", f"item:{item_ref['path']}"],
            })

        # Walk 5a: unit-serves-task
        for task_ref in unit.get("taskRefs", []) or []:
            edges.append({
                "kind": "unit-serves-task",
                "endpoints": [f"unit:{unit_id}", f"task:{task_ref}"],
            })

    # Walk 5b: task-involves-actor
    for task in experience.get("tasks", []) or []:
        task_id = task.get("id")
        for actor_ref in task.get("actorRefs", []) or []:
            edges.append({
                "kind": "task-involves-actor",
                "endpoints": [f"task:{task_id}", f"actor:{actor_ref}"],
            })


def _emit_response_actions_edges(
    response_actions: dict, edges: list[dict]
) -> None:
    """Walk 6 — action-emits-effect, action-has-precondition."""
    for action in response_actions.get("actions", []) or []:
        action_id = action.get("id")
        for idx, _effect in enumerate(action.get("effects", []) or []):
            edges.append({
                "kind": "action-emits-effect",
                "endpoints": [
                    f"action:{action_id}",
                    f"effect:{action_id}:{idx}",
                ],
            })
        for precondition in action.get("preconditions", []) or []:
            pre_id = precondition["id"]
            edges.append({
                "kind": "action-has-precondition",
                "endpoints": [
                    f"action:{action_id}",
                    f"precondition:{action_id}:{pre_id}",
                ],
            })


def _emit_ontology_edges(ontology: dict, edges: list[dict]) -> None:
    """Walk 9 — concept-refs-item from Ontology concepts map.

    Per `specs/ontology/ontology-spec.md` §3, `concepts` is a map keyed by
    item path; each value is a Concept Binding object with REQUIRED `concept`
    field carrying the IRI. The plain-string shorthand (value is the IRI
    directly) is also accepted for fixture ergonomics — engines reading the
    spec MUST handle both because the Concept Binding object is the
    normative form.
    """
    concepts = ontology.get("concepts", {}) or {}
    for item_path in sorted(concepts.keys()):
        val = concepts[item_path]
        if isinstance(val, str):
            iris: Iterable[str] = [val]
        elif isinstance(val, dict) and "concept" in val:
            iris = [val["concept"]]
        elif isinstance(val, list):
            iris = [
                v if isinstance(v, str) else v.get("concept")
                for v in val
            ]
            iris = [i for i in iris if i is not None]
        else:
            iris = []
        for iri in iris:
            edges.append({
                "kind": "concept-refs-item",
                "endpoints": [f"concept:{iri}", f"item:{item_path}"],
            })


def _build_edges(srcs: dict[str, dict]) -> list[dict]:
    edges: list[dict] = []

    component = srcs.get("component")
    if component is not None:
        when_hints = component.get("_when_dependencies", {}) or {}
        # `_when_dependencies` keys are node JSON-pointer paths (e.g. "/tree/children/0").
        _walk_component_tree(component["tree"], "/tree", edges, when_hints)

    experience = srcs.get("experience")
    if experience is not None:
        _emit_experience_hierarchy_edges(experience, edges)

    response_actions = srcs.get("responseActions")
    if response_actions is not None:
        _emit_response_actions_edges(response_actions, edges)

    definition = srcs.get("definition")
    if definition is not None:
        _emit_definition_bind_edges(definition, edges)

    ontology = srcs.get("ontology")
    if ontology is not None:
        _emit_ontology_edges(ontology, edges)

    # §5.5: ascending by (kind, canonical-json(endpoints))
    edges.sort(key=lambda e: (
        e["kind"],
        json.dumps(e["endpoints"], sort_keys=True, ensure_ascii=False),
    ))

    # Deduplicate byte-equal entries (§5.3).
    deduped: list[dict] = []
    seen: set[str] = set()
    for e in edges:
        key = json.dumps(e, sort_keys=True, ensure_ascii=False)
        if key in seen:
            continue
        seen.add(key)
        deduped.append(e)
    return deduped


def _build_index(fixture_dir: Path) -> tuple[dict, dict[str, dict]]:
    srcs: dict[str, dict] = {}
    sources_meta: list[dict] = []
    for fname, kind in _KIND_BY_FILE.items():
        path = fixture_dir / fname
        if not path.exists():
            continue
        doc = _load(path)
        srcs[kind] = doc
        sources_meta.append({
            "kind": kind,
            "identity": _identity(kind, doc, fname),
            "digest": _digest(doc),
        })

    sources_meta.sort(key=lambda s: (
        s["kind"],
        json.dumps(s["identity"], sort_keys=True, ensure_ascii=False),
    ))
    edges = _build_edges(srcs)
    index = {"$formspecTrace": "1.0", "sources": sources_meta, "edges": edges}
    return index, srcs


# ---------------------------------------------------------------------------
# Freshness verification (§7) — every predicate calls this first
# ---------------------------------------------------------------------------


def _identity_key(kind: str, identity: dict) -> tuple[str, str]:
    return (kind, json.dumps(identity, sort_keys=True, ensure_ascii=False))


def _verify_fresh(index: dict, srcs: dict[str, dict]) -> None:
    """Re-verify all sources[] digests against the supplied artifacts.

    On any divergence, raise TraceStaleError. Predicates MUST NOT return
    partial results past this gate (§7.2).

    Order of checks (deterministic, surface first divergence):
      1. extra-source-present — supplied artifact has no index entry.
      2. source-missing       — index entry has no supplied artifact.
      3. digest-mismatch      — supplied artifact mutated since build.
    """
    by_key: dict[tuple[str, str], dict] = {}
    for entry in index["sources"]:
        key = _identity_key(entry["kind"], entry["identity"])
        if key in by_key:
            raise TraceStaleError(
                "duplicate-source-entry",
                {"kind": entry["kind"], "identity": entry["identity"]},
            )
        by_key[key] = entry

    supplied_keys: set[tuple[str, str]] = set()
    for kind, doc in srcs.items():
        ident = _identity(kind, doc)
        supplied_keys.add(_identity_key(kind, ident))

    # extra-source-present — supplied artifact the index didn't know about.
    for kind, doc in srcs.items():
        ident = _identity(kind, doc)
        key = _identity_key(kind, ident)
        if key not in by_key:
            raise TraceStaleError(
                "extra-source-present", {"kind": kind, "identity": ident}
            )

    # source-missing — index entry without a supplied artifact.
    for key, entry in by_key.items():
        if key not in supplied_keys:
            raise TraceStaleError(
                "source-missing",
                {"kind": entry["kind"], "identity": entry["identity"]},
            )

    # digest-mismatch — supplied artifact bytes changed since build.
    for kind, doc in srcs.items():
        ident = _identity(kind, doc)
        entry = by_key[_identity_key(kind, ident)]
        if entry["digest"] != _digest(doc):
            raise TraceStaleError(
                "digest-mismatch", {"kind": kind, "identity": ident}
            )


# ---------------------------------------------------------------------------
# Edge-list helpers
# ---------------------------------------------------------------------------


def _edges_of(index: dict, kind: str) -> list[dict]:
    return [e for e in index["edges"] if e["kind"] == kind]


def _strip_prefix(value: str, prefix: str) -> str:
    return value[len(prefix):] if value.startswith(prefix) else value


# ---------------------------------------------------------------------------
# Predicates (§6.1) — 16 simple predicates + the whatDependsOn JOIN
# ---------------------------------------------------------------------------


def component_nodes_for_item(
    index: dict, srcs: dict[str, dict], item_path: str
) -> list[str]:
    _verify_fresh(index, srcs)
    target = f"item:{item_path}"
    out: list[str] = [
        e["endpoints"][0]
        for e in _edges_of(index, "component-renders-item")
        if e["endpoints"][1] == target
    ]
    return sorted(out)


def items_for_component(
    index: dict, srcs: dict[str, dict], component_node_path: str
) -> list[str]:
    _verify_fresh(index, srcs)
    target = f"componentNodePath:{component_node_path}"
    out: set[str] = set()
    for e in _edges_of(index, "component-renders-item"):
        if e["endpoints"][0] == target:
            out.add(_strip_prefix(e["endpoints"][1], "item:"))
    return sorted(out)


def units_for_item(
    index: dict, srcs: dict[str, dict], item_path: str
) -> list[str]:
    _verify_fresh(index, srcs)
    target = f"item:{item_path}"
    out: set[str] = set()
    for e in _edges_of(index, "unit-collects-item"):
        if e["endpoints"][1] == target:
            out.add(_strip_prefix(e["endpoints"][0], "unit:"))
    return sorted(out)


def items_for_unit(
    index: dict, srcs: dict[str, dict], unit_id: str
) -> list[str]:
    _verify_fresh(index, srcs)
    target = f"unit:{unit_id}"
    out: set[str] = set()
    for e in _edges_of(index, "unit-collects-item"):
        if e["endpoints"][0] == target:
            out.add(_strip_prefix(e["endpoints"][1], "item:"))
    return sorted(out)


def tasks_for_unit(
    index: dict, srcs: dict[str, dict], unit_id: str
) -> list[str]:
    _verify_fresh(index, srcs)
    target = f"unit:{unit_id}"
    out: set[str] = set()
    for e in _edges_of(index, "unit-serves-task"):
        if e["endpoints"][0] == target:
            out.add(_strip_prefix(e["endpoints"][1], "task:"))
    return sorted(out)


def units_for_task(
    index: dict, srcs: dict[str, dict], task_id: str
) -> list[str]:
    _verify_fresh(index, srcs)
    target = f"task:{task_id}"
    out: set[str] = set()
    for e in _edges_of(index, "unit-serves-task"):
        if e["endpoints"][1] == target:
            out.add(_strip_prefix(e["endpoints"][0], "unit:"))
    return sorted(out)


def actors_for_task(
    index: dict, srcs: dict[str, dict], task_id: str
) -> list[str]:
    _verify_fresh(index, srcs)
    target = f"task:{task_id}"
    out: set[str] = set()
    for e in _edges_of(index, "task-involves-actor"):
        if e["endpoints"][0] == target:
            out.add(_strip_prefix(e["endpoints"][1], "actor:"))
    return sorted(out)


def tasks_for_actor(
    index: dict, srcs: dict[str, dict], actor_id: str
) -> list[str]:
    _verify_fresh(index, srcs)
    target = f"actor:{actor_id}"
    out: set[str] = set()
    for e in _edges_of(index, "task-involves-actor"):
        if e["endpoints"][1] == target:
            out.add(_strip_prefix(e["endpoints"][0], "task:"))
    return sorted(out)


def action_for_trigger(
    index: dict, srcs: dict[str, dict], component_node_path: str
) -> Optional[str]:
    _verify_fresh(index, srcs)
    target = f"componentNodePath:{component_node_path}"
    matches = [
        _strip_prefix(e["endpoints"][1], "action:")
        for e in _edges_of(index, "trigger-invokes-action")
        if e["endpoints"][0] == target
    ]
    if not matches:
        return None
    if len(matches) > 1:
        raise ValueError(
            "malformed TraceIndex: multiple trigger-invokes-action edges "
            f"for componentNodePath:{component_node_path}"
        )
    return matches[0]


def triggers_for_action(
    index: dict, srcs: dict[str, dict], action_id: str
) -> list[str]:
    _verify_fresh(index, srcs)
    target = f"action:{action_id}"
    out: list[str] = [
        e["endpoints"][0]
        for e in _edges_of(index, "trigger-invokes-action")
        if e["endpoints"][1] == target
    ]
    return sorted(out)


def items_for_action(
    index: dict, srcs: dict[str, dict], action_id: str
) -> list[str]:
    """Two-hop JOIN: triggersForAction -> itemsForComponent -> union."""
    _verify_fresh(index, srcs)
    trigger_endpoints = triggers_for_action(index, srcs, action_id)
    out: set[str] = set()
    for trigger_endpoint in trigger_endpoints:
        node_path = _strip_prefix(trigger_endpoint, "componentNodePath:")
        for item in items_for_component(index, srcs, node_path):
            out.add(item)
    return sorted(out)


def dependencies_of(
    index: dict, srcs: dict[str, dict], item_path: str
) -> list[str]:
    """item-depends-on-item where endpoints[0] = subject -> endpoints[1] items."""
    _verify_fresh(index, srcs)
    target = f"item:{item_path}"
    out: set[str] = set()
    for e in _edges_of(index, "item-depends-on-item"):
        if e["endpoints"][0] == target:
            out.add(_strip_prefix(e["endpoints"][1], "item:"))
    return sorted(out)


def dependents_on(
    index: dict, srcs: dict[str, dict], item_path: str
) -> list[str]:
    """item-depends-on-item where endpoints[1] = subject -> endpoints[0] items."""
    _verify_fresh(index, srcs)
    target = f"item:{item_path}"
    out: set[str] = set()
    for e in _edges_of(index, "item-depends-on-item"):
        if e["endpoints"][1] == target:
            out.add(_strip_prefix(e["endpoints"][0], "item:"))
    return sorted(out)


def concepts_for_item(
    index: dict, srcs: dict[str, dict], item_path: str
) -> list[str]:
    _verify_fresh(index, srcs)
    target = f"item:{item_path}"
    out: set[str] = set()
    for e in _edges_of(index, "concept-refs-item"):
        if e["endpoints"][1] == target:
            out.add(_strip_prefix(e["endpoints"][0], "concept:"))
    return sorted(out)


def items_for_concept(
    index: dict, srcs: dict[str, dict], concept_id: str
) -> list[str]:
    _verify_fresh(index, srcs)
    target = f"concept:{concept_id}"
    out: set[str] = set()
    for e in _edges_of(index, "concept-refs-item"):
        if e["endpoints"][0] == target:
            out.add(_strip_prefix(e["endpoints"][1], "item:"))
    return sorted(out)


def concepts_for_node(
    index: dict, srcs: dict[str, dict], component_node_path: str
) -> list[str]:
    _verify_fresh(index, srcs)
    target = f"componentNodePath:{component_node_path}"
    out: set[str] = set()
    for e in _edges_of(index, "concept-refs-component-node"):
        if e["endpoints"][1] == target:
            out.add(_strip_prefix(e["endpoints"][0], "concept:"))
    return sorted(out)


# ---------------------------------------------------------------------------
# whatDependsOn JOIN (§6.2) — ImpactReport with transitive closure
# ---------------------------------------------------------------------------


def _transitive_dependents(
    index: dict, subject_item: str
) -> tuple[list[str], list[str]]:
    """BFS from subject through `item-depends-on-item` reverse edges.

    Returns (direct, transitive) where:
      - direct: items whose bind directly references the subject
                (sorted ascending).
      - transitive: items reachable through one OR MORE additional hops
                    from any item in `direct`, EXCLUDING the subject and
                    EXCLUDING items already in `direct`. Sorted ascending.

    Cycle-safe: tracks visited set. BFS at each level sorts the frontier
    so traversal order is deterministic.

    Reverse edges: an edge (dependent -> dependency) means `dependent`'s
    bind FEL reads `dependency`. To find what depends on `subject`, we
    take edges where endpoints[1] == subject; those endpoints[0] values
    are the direct dependents. Then we recurse from each of those.
    """
    reverse: dict[str, list[str]] = {}
    for e in _edges_of(index, "item-depends-on-item"):
        dependent = _strip_prefix(e["endpoints"][0], "item:")
        dependency = _strip_prefix(e["endpoints"][1], "item:")
        reverse.setdefault(dependency, []).append(dependent)

    direct = sorted(set(reverse.get(subject_item, [])))
    direct_set = set(direct)

    visited: set[str] = {subject_item} | direct_set
    transitive: set[str] = set()

    frontier: deque[str] = deque(direct)
    while frontier:
        current = frontier.popleft()
        next_level = sorted(set(reverse.get(current, [])))
        for nxt in next_level:
            if nxt in visited:
                continue
            visited.add(nxt)
            transitive.add(nxt)
            frontier.append(nxt)

    return direct, sorted(transitive)


def what_depends_on(
    index: dict, srcs: dict[str, dict], item_path: str
) -> dict:
    """J3 refactor-with-confidence — full ImpactReport (§6.2).

    Returns a dict with this exact shape (typed-string endpoints, sorted lists):

        {
          "subjectItem":             "item:<path>",
          "directDependentItems":    ["item:<path>", ...],
          "transitiveDependentItems":["item:<path>", ...],
          "renderingNodes":          ["componentNodePath:...", ...],
          "collectingUnits":         ["unit:<id>", ...],
          "visibilityNodes":         ["componentNodePath:...", ...],
          "actionPreconditions":     [],   # reserved-empty in v1.0
          "conceptBindings":         ["concept:<id>", ...]
        }
    """
    _verify_fresh(index, srcs)

    direct_paths, transitive_paths = _transitive_dependents(index, item_path)

    rendering_nodes = sorted({
        e["endpoints"][0]
        for e in _edges_of(index, "component-renders-item")
        if e["endpoints"][1] == f"item:{item_path}"
    })

    collecting_units = sorted({
        e["endpoints"][0]
        for e in _edges_of(index, "unit-collects-item")
        if e["endpoints"][1] == f"item:{item_path}"
    })

    visibility_nodes = sorted({
        e["endpoints"][0]
        for e in _edges_of(index, "node-visibility-references-item")
        if e["endpoints"][1] == f"item:{item_path}"
    })

    concept_bindings = sorted({
        e["endpoints"][0]
        for e in _edges_of(index, "concept-refs-item")
        if e["endpoints"][1] == f"item:{item_path}"
    })

    return {
        "subjectItem": f"item:{item_path}",
        "directDependentItems": [f"item:{p}" for p in direct_paths],
        "transitiveDependentItems": [f"item:{p}" for p in transitive_paths],
        "renderingNodes": rendering_nodes,
        "collectingUnits": collecting_units,
        "visibilityNodes": visibility_nodes,
        "actionPreconditions": [],  # §6.6 — reserved, v1.1
        "conceptBindings": concept_bindings,
    }


# Predicate registry used by fixture-driven harness below to dispatch
# expected-predicates.json entries to the right Python callable.
PREDICATES = {
    "componentNodesForItem": component_nodes_for_item,
    "itemsForComponent": items_for_component,
    "unitsForItem": units_for_item,
    "itemsForUnit": items_for_unit,
    "tasksForUnit": tasks_for_unit,
    "unitsForTask": units_for_task,
    "actorsForTask": actors_for_task,
    "tasksForActor": tasks_for_actor,
    "actionForTrigger": action_for_trigger,
    "triggersForAction": triggers_for_action,
    "itemsForAction": items_for_action,
    "dependenciesOf": dependencies_of,
    "dependentsOn": dependents_on,
    "conceptsForItem": concepts_for_item,
    "itemsForConcept": items_for_concept,
    "conceptsForNode": concepts_for_node,
    "whatDependsOn": what_depends_on,
}


# ---------------------------------------------------------------------------
# Fixture-driven conformance harness
# ---------------------------------------------------------------------------


def _fixture_dirs() -> list[Path]:
    if not FIXTURE_ROOT.exists():
        return []
    return sorted(p for p in FIXTURE_ROOT.iterdir() if p.is_dir())


def _substitute_computed_digests(
    expected_index: dict, srcs: dict[str, dict]
) -> dict:
    """Replace `"<computed>"` digest placeholders with real source digests.

    Fixtures store the structural shape of expected-index.json with digest
    placeholders because canonical bytes are runtime-determined (the JSON
    formatting of the source file is the host's, but the canonical bytes
    Trace digests are normalized).
    """
    sub = json.loads(json.dumps(expected_index))
    for entry in sub["sources"]:
        if entry["digest"] == "<computed>":
            kind = entry["kind"]
            if kind in srcs:
                entry["digest"] = _digest(srcs[kind])
    return sub


_NO_FIXTURES = not _fixture_dirs()
_skip_if_no_fixtures = pytest.mark.skipif(
    _NO_FIXTURES,
    reason=(
        "No fixtures present under tests/conformance/fixtures/trace/ — "
        "the fixtures-authoring agent has not yet landed them. Test will "
        "collect but skip until fixtures exist."
    ),
)


@_skip_if_no_fixtures
@pytest.mark.parametrize(
    "fixture_dir", _fixture_dirs() or [None], ids=lambda p: p.name if p else "no-fixtures"
)
def test_builder_matches_expected_index(fixture_dir: Path) -> None:
    index, srcs = _build_index(fixture_dir)
    expected_raw = _load(fixture_dir / "expected-index.json")
    expected = _substitute_computed_digests(expected_raw, srcs)
    assert index == expected, (
        f"{fixture_dir.name}: builder output diverges from expected-index.json"
    )


@_skip_if_no_fixtures
@pytest.mark.parametrize(
    "fixture_dir", _fixture_dirs() or [None], ids=lambda p: p.name if p else "no-fixtures"
)
def test_builder_is_deterministic(fixture_dir: Path) -> None:
    a, _ = _build_index(fixture_dir)
    b, _ = _build_index(fixture_dir)
    assert _canonical_bytes(a) == _canonical_bytes(b), (
        f"{fixture_dir.name}: builder output is not byte-deterministic across runs"
    )


@_skip_if_no_fixtures
@pytest.mark.parametrize(
    "fixture_dir", _fixture_dirs() or [None], ids=lambda p: p.name if p else "no-fixtures"
)
def test_predicates_match_expected(fixture_dir: Path) -> None:
    """Drive every fixture's expected-predicates.json through the harness."""
    expected_path = fixture_dir / "expected-predicates.json"
    if not expected_path.exists():
        pytest.skip(f"{fixture_dir.name}: no expected-predicates.json")
    index, srcs = _build_index(fixture_dir)
    expected = _load(expected_path)

    for predicate_name, cases in expected.items():
        assert predicate_name in PREDICATES, (
            f"{fixture_dir.name}: expected-predicates.json names unknown "
            f"predicate {predicate_name!r}; fixture is malformed"
        )
        predicate = PREDICATES[predicate_name]
        for arg, expected_value in cases.items():
            actual = predicate(index, srcs, arg)
            assert actual == expected_value, (
                f"{fixture_dir.name}: {predicate_name}({arg!r}) = "
                f"{actual!r}, expected {expected_value!r}"
            )


@_skip_if_no_fixtures
@pytest.mark.parametrize(
    "fixture_dir", _fixture_dirs() or [None], ids=lambda p: p.name if p else "no-fixtures"
)
def test_edges_are_sorted_and_unique(fixture_dir: Path) -> None:
    """§5.5 — `edges[]` MUST be sorted ascending by (kind, canonical endpoints).
    §5.3 — byte-equal entries are forbidden."""
    index, _ = _build_index(fixture_dir)
    keys = [
        (e["kind"], json.dumps(e["endpoints"], sort_keys=True, ensure_ascii=False))
        for e in index["edges"]
    ]
    assert keys == sorted(keys), f"{fixture_dir.name}: edges not in sorted order"
    serialized = [
        json.dumps(e, sort_keys=True, ensure_ascii=False) for e in index["edges"]
    ]
    assert len(serialized) == len(set(serialized)), (
        f"{fixture_dir.name}: duplicate byte-equal edges present"
    )


@_skip_if_no_fixtures
@pytest.mark.parametrize(
    "fixture_dir", _fixture_dirs() or [None], ids=lambda p: p.name if p else "no-fixtures"
)
def test_sources_are_sorted_and_unique(fixture_dir: Path) -> None:
    """§3.4 — duplicate (kind, identity) forbidden. §3.5 — ordered ascending."""
    index, _ = _build_index(fixture_dir)
    keys = [
        (s["kind"], json.dumps(s["identity"], sort_keys=True, ensure_ascii=False))
        for s in index["sources"]
    ]
    assert keys == sorted(keys), f"{fixture_dir.name}: sources not in sorted order"
    assert len(keys) == len(set(keys)), (
        f"{fixture_dir.name}: duplicate (kind, identity) source entries"
    )


# ---------------------------------------------------------------------------
# Smoke tests on the predicate harness itself (no fixture required)
# ---------------------------------------------------------------------------


def _hand_authored_index_for_smoke() -> tuple[dict, dict[str, dict]]:
    """Synthetic in-memory TraceIndex + matching srcs for harness smoke tests.

    Hand-authored TraceIndex is non-conforming for production per §1.4 but
    permitted for fixtures and tests. These smoke tests exercise predicate
    logic without depending on the parallel fixtures-authoring agent.
    """
    definition = {
        "$formspec": "1.0",
        "url": "https://example.test/smoke",
        "version": "1.0.0",
        "items": [
            {"key": "a", "type": "field", "dataType": "number"},
            {"key": "b", "type": "field", "dataType": "number"},
            {"key": "c", "type": "field", "dataType": "number"},
        ],
        "binds": [
            {"path": "a"},
            {"path": "b", "calculate": "$a + 1"},
            {"path": "c", "calculate": "$b * 2"},
        ],
        # Harness hint — engine implementations parse the FEL above instead.
        "_bind_dependencies": {"b": ["a"], "c": ["b"]},
    }
    srcs = {"definition": definition}
    index, srcs_built = _build_index_in_memory(srcs)
    return index, srcs_built


def _build_index_in_memory(srcs: dict[str, dict]) -> tuple[dict, dict[str, dict]]:
    sources_meta: list[dict] = []
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
    edges = _build_edges(srcs)
    return {"$formspecTrace": "1.0", "sources": sources_meta, "edges": edges}, srcs


def test_what_depends_on_transitive_chain() -> None:
    """a -> b -> c chain: whatDependsOn(a) returns direct=[b], transitive=[c]."""
    index, srcs = _hand_authored_index_for_smoke()
    report = what_depends_on(index, srcs, "a")
    assert report["subjectItem"] == "item:a"
    assert report["directDependentItems"] == ["item:b"]
    assert report["transitiveDependentItems"] == ["item:c"]
    assert report["actionPreconditions"] == []  # §6.6 reserved


def test_what_depends_on_cycle_safe() -> None:
    """Mutual dependency a <-> b: traversal must terminate without StackOverflow.

    Both items appear (`a` depends on `b` and `b` depends on `a`). Per
    §6.2, the transitive set excludes the subject; the cycle is detected
    via the visited set and traversal stops cleanly.
    """
    definition = {
        "$formspec": "1.0",
        "url": "https://example.test/cycle",
        "version": "1.0.0",
        "items": [
            {"key": "a", "type": "field", "dataType": "number"},
            {"key": "b", "type": "field", "dataType": "number"},
        ],
        "binds": [
            {"path": "a", "calculate": "$b + 1"},
            {"path": "b", "calculate": "$a + 1"},
        ],
        "_bind_dependencies": {"a": ["b"], "b": ["a"]},
    }
    index, srcs = _build_index_in_memory({"definition": definition})
    report = what_depends_on(index, srcs, "a")
    assert report["subjectItem"] == "item:a"
    # `b` directly depends on `a` (reads it in its calculate); subject `a`
    # is excluded from transitive even though it appears in the cycle.
    assert report["directDependentItems"] == ["item:b"]
    assert report["transitiveDependentItems"] == []


def test_what_depends_on_no_dependents_returns_empty_lists() -> None:
    """A leaf item with no dependents returns all-empty lists."""
    definition = {
        "$formspec": "1.0",
        "url": "https://example.test/leaf",
        "version": "1.0.0",
        "items": [{"key": "isolated", "type": "field", "dataType": "string"}],
        "binds": [{"path": "isolated"}],
        "_bind_dependencies": {},
    }
    index, srcs = _build_index_in_memory({"definition": definition})
    report = what_depends_on(index, srcs, "isolated")
    assert report == {
        "subjectItem": "item:isolated",
        "directDependentItems": [],
        "transitiveDependentItems": [],
        "renderingNodes": [],
        "collectingUnits": [],
        "visibilityNodes": [],
        "actionPreconditions": [],
        "conceptBindings": [],
    }


def test_action_for_trigger_returns_null_when_no_match() -> None:
    """Predicate convention: actionForTrigger returns None on no match."""
    index, srcs = _hand_authored_index_for_smoke()
    assert action_for_trigger(index, srcs, "/tree/nonexistent") is None


def test_action_for_trigger_raises_on_duplicate_edges() -> None:
    """A malformed TraceIndex with two trigger edges for one node MUST error."""
    index, srcs = _hand_authored_index_for_smoke()
    # Inject duplicates by hand (post-build mutation simulates a buggy builder).
    index = json.loads(json.dumps(index))
    index["edges"].extend([
        {
            "kind": "trigger-invokes-action",
            "endpoints": ["componentNodePath:/tree/children/0", "action:a"],
        },
        {
            "kind": "trigger-invokes-action",
            "endpoints": ["componentNodePath:/tree/children/0", "action:b"],
        },
    ])
    with pytest.raises(ValueError, match="multiple trigger-invokes-action edges"):
        action_for_trigger(index, srcs, "/tree/children/0")


def test_predicate_registry_covers_all_callables() -> None:
    """Pin the closed v1 callable predicate vocabulary.

    Adding or removing a predicate is a spec change. This test fails on
    accidental drift.
    """
    expected = {
        "componentNodesForItem", "itemsForComponent",
        "unitsForItem", "itemsForUnit",
        "tasksForUnit", "unitsForTask",
        "actorsForTask", "tasksForActor",
        "actionForTrigger", "triggersForAction", "itemsForAction",
        "dependenciesOf", "dependentsOn",
        "conceptsForItem", "itemsForConcept", "conceptsForNode",
        "whatDependsOn",
    }
    assert set(PREDICATES.keys()) == expected


def test_edge_kind_vocabulary_pinned() -> None:
    """Closed enum of 11 edge kinds — adding/removing requires a spec change."""
    expected = {
        "component-renders-item", "unit-collects-item", "trigger-invokes-action",
        "item-depends-on-item", "unit-serves-task", "task-involves-actor",
        "action-emits-effect", "action-has-precondition",
        "concept-refs-item", "concept-refs-component-node",
        "node-visibility-references-item",
    }
    # The vocabulary is built into the builder helpers; sanity-check the
    # smoke fixture's edge list intersects only the expected set.
    index, _ = _hand_authored_index_for_smoke()
    seen = {e["kind"] for e in index["edges"]}
    assert seen.issubset(expected), f"unknown edge kinds emitted: {seen - expected}"


def test_source_kind_vocabulary_pinned() -> None:
    """Closed enum of 5 source kinds."""
    expected = {"definition", "experience", "responseActions", "component", "ontology"}
    assert set(_KIND_BY_FILE.values()) == expected

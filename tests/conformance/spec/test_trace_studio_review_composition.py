"""Composition contract pytest (§8) — Trace + review-record stream + EXP-COVERAGE.

Per §8.2 Trace owns NO findings. A Studio review surface composes three
streams via documented joins:

  | Stream                           | Owner                           | Joined to Trace by                                    |
  | -------------------------------- | ------------------------------- | ----------------------------------------------------- |
  | Regeneration-review records      | Route-owned (RegenMerge or MCP) | `subject.componentNodePath` <-> Trace componentNodePath endpoint |
  | Reference-resolution findings    | CRF §6 resolver                 | finding's componentNodePath <-> Trace componentNodePath endpoint |
  | Coverage findings (EXP-COVERAGE) | EXP §8.2 resolver               | finding's `path` -> Trace `item:` -> componentNodePath (two-hop)  |

This pytest pins three invariants of that composition:

  1. **No double-counting (§8.4)**: each finding/record has exactly one
     originating stream; Trace edges are reference data, not a finding stream.
  2. **No information loss**: every record/finding that goes in comes out
     attached to a node bucket OR to the explicit `uncoveredItems` bucket.
  3. **Trace carries no findings of its own**: the TraceIndex MUST NOT contain
     `severity`, `code`, `reason`, or other finding-shaped members on edges.

The composition harness uses an abstract synthetic review-record stream
defined inline. It does NOT couple to the RegenMerge report shape, the
ProposalManager command-stream shape, or any other concrete route.
"""

from __future__ import annotations

import json
from typing import Any, Callable

import pytest

from tests.conformance.spec.test_trace_predicates import (
    _build_edges,
    _digest,
    _identity,
    component_nodes_for_item,
)


# ---------------------------------------------------------------------------
# Synthetic source set — composition does not require a real fixture
# ---------------------------------------------------------------------------


def _composition_sources() -> dict[str, dict]:
    return {
        "definition": {
            "$formspec": "1.0",
            "url": "https://example.test/composition",
            "version": "1.0.0",
            "items": [
                {"key": "applicantName", "type": "field", "dataType": "string"},
                {"key": "dateOfBirth", "type": "field", "dataType": "date"},
                {"key": "consentToTerms", "type": "field", "dataType": "boolean"},
            ],
            "binds": [
                {"path": "applicantName", "required": "true"},
                {"path": "dateOfBirth", "required": "true"},
                {"path": "consentToTerms", "required": "true"},
            ],
        },
        "experience": {
            "$formspecExperience": "1.0",
            "name": "intake",
            "version": "1.0.0",
            "targetDefinition": {
                "url": "https://example.test/composition",
                "compatibleVersions": ">=1.0.0",
            },
            "tasks": [{"id": "identifyApplicant"}],
            "units": [{
                "id": "identity",
                "kind": "data-entry",
                "taskRefs": ["identifyApplicant"],
                "itemRefs": [
                    {"path": "applicantName"},
                    {"path": "dateOfBirth"},
                ],
            }],
        },
        "responseActions": {
            "$formspecResponseActions": "1.0",
            "version": "1.0.0",
            "targetDefinition": {
                "url": "https://example.test/composition",
                "compatibleVersions": ">=1.0.0",
            },
            "actions": [{
                "id": "submitApplication",
                "intent": "submit",
                "effects": [{"type": "hostEvent", "eventName": "submit"}],
            }],
        },
        "component": {
            "$formspecComponent": "1.1",
            "url": "https://example.test/composition/components/main",
            "version": "1.0.0",
            "targetDefinition": {
                "url": "https://example.test/composition",
                "compatibleVersions": ">=1.0.0",
            },
            "tree": {
                "id": "root",
                "component": "Section",
                "unitRef": "identity",
                "children": [
                    {"id": "n", "component": "TextInput", "bind": "applicantName"},
                    {"id": "d", "component": "DatePicker", "bind": "dateOfBirth"},
                    {"id": "submit", "component": "ActionButton", "actionRef": "submitApplication"},
                ],
            },
        },
    }


def _build_index() -> tuple[dict, dict[str, dict]]:
    srcs = _composition_sources()
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
    return {
        "$formspecTrace": "1.0",
        "sources": sources_meta,
        "edges": _build_edges(srcs),
    }, srcs


# ---------------------------------------------------------------------------
# Abstract review-record stream (route-owned) — §8.1
# ---------------------------------------------------------------------------


def _synthetic_review_records() -> list[dict]:
    """Route-owned review records with the stable subject handle §8.3 requires.

    Schema (abstract, route-agnostic):
      {
        "id":       <stable record id>,
        "subject":  { "componentNodePath": <JSON-pointer> },
        "anchors":  [ "item:<path>", ... ],          # optional
        "code":     <route-specific finding code>,
        "severity": "info" | "warning" | "error",
        "reason":   <human-readable explanation>
      }

    The pytest does NOT pin this shape as normative; the composition rule
    only requires the `subject.componentNodePath` join handle. Any route
    that exposes that handle satisfies §8.3.
    """
    return [
        {
            "id": "review-name-regenerated",
            "subject": {"componentNodePath": "/tree/children/0"},
            "anchors": ["item:applicantName"],
            "code": "COMP-REGENERATION-REGENERATED",
            "severity": "info",
            "reason": "Node regenerated from new-generated; no surviving designer delta.",
        },
        {
            "id": "review-dob-pending",
            "subject": {"componentNodePath": "/tree/children/1"},
            "anchors": ["item:dateOfBirth"],
            "code": "COMP-REGENERATION-PENDING-REVIEW",
            "severity": "info",
            "reason": "Newly generated node not present in old or designer.",
        },
        {
            "id": "review-submit-survived",
            "subject": {"componentNodePath": "/tree/children/2"},
            "anchors": [],
            "code": "COMP-REGENERATION-DESIGNER-SURVIVED",
            "severity": "info",
            "reason": "ActionButton survived regeneration.",
        },
    ]


def _synthetic_reference_resolution_findings() -> list[dict]:
    """CRF §6 resolver-shaped findings, joined by componentNodePath."""
    return [
        {
            "code": "COMP-REFERENTIAL-INTEGRITY",
            "severity": "warning",
            "componentNodePath": "/tree/children/2",
            "reason": "ActionRef resolved successfully (illustrative).",
        }
    ]


def _synthetic_coverage_findings_partial() -> list[dict]:
    """EXP §8.2 coverage findings — one covered, one not."""
    return [
        {
            "code": "EXP-COVERAGE-UNCOVERED-REQUIRED-ITEM",
            "severity": "warning",
            "path": "consentToTerms",  # required but no unit collects it
            "reason": "Required item is not in any unit.",
        }
    ]


# ---------------------------------------------------------------------------
# Reference composition harness (§8.3)
# ---------------------------------------------------------------------------


def _node_bucket(review: dict, component_node_path: str) -> dict:
    return review["nodes"].setdefault(
        component_node_path,
        {"reviewRecords": [], "edges": [], "resolverFindings": [], "coverageFindings": []},
    )


def _compose_review(
    index: dict,
    srcs: dict[str, dict],
    review_records: list[dict],
    resolver_findings: list[dict],
    coverage_findings: list[dict],
) -> dict:
    """Reference composition per §8.3.

    Output shape (NOT normative for v1; the spec only pins the join rules):
      {
        "nodes": { "<componentNodePath>": {
          "reviewRecords": [...],
          "edges":         [...],   # Trace edges referencing this node
          "resolverFindings": [...],
          "coverageFindings": [...],
        }},
        "uncoveredItems": [ <coverage finding with no covering node> ]
      }

    Three streams, three joins:
      1. Review records  -> bucket by record.subject.componentNodePath
      2. Resolver findings -> bucket by finding.componentNodePath
      3. Coverage findings -> two-hop via item: endpoint, fall through to
         `uncoveredItems` if no component node renders the item
      4. Trace edges     -> contextual decoration on every bucket whose
         componentNodePath appears as an edge endpoint
    """
    review: dict[str, Any] = {"nodes": {}, "uncoveredItems": []}

    # Stream 1: route-owned review records
    for record in review_records:
        bucket = _node_bucket(review, record["subject"]["componentNodePath"])
        bucket["reviewRecords"].append(record)

    # Stream 2: CRF resolver findings
    for finding in resolver_findings:
        bucket = _node_bucket(review, finding["componentNodePath"])
        bucket["resolverFindings"].append(finding)

    # Stream 3: EXP coverage findings via two-hop join
    for finding in coverage_findings:
        rendering_nodes = component_nodes_for_item(index, srcs, finding["path"])
        if not rendering_nodes:
            review["uncoveredItems"].append(finding)
            continue
        for endpoint in rendering_nodes:
            node_path = endpoint.removeprefix("componentNodePath:")
            bucket = _node_bucket(review, node_path)
            bucket["coverageFindings"].append(finding)

    # Stream 4: Trace edges as contextual decoration
    for edge in index["edges"]:
        for endpoint in edge["endpoints"]:
            if endpoint.startswith("componentNodePath:"):
                node_path = endpoint.removeprefix("componentNodePath:")
                bucket = _node_bucket(review, node_path)
                bucket["edges"].append(edge)

    return review


# ---------------------------------------------------------------------------
# §8.2 — Trace owns no findings
# ---------------------------------------------------------------------------


def test_trace_index_carries_only_relationship_shape() -> None:
    """A TraceIndex MUST NOT carry findings of its own (§8.2).

    Structural assertion: only `$formspecTrace`, `sources`, `edges` at top
    level; edges only have `kind` and `endpoints`. No severity/code/reason
    member is permitted on any edge.
    """
    index, _ = _build_index()
    assert set(index.keys()) == {"$formspecTrace", "sources", "edges"}
    for edge in index["edges"]:
        assert set(edge.keys()) == {"kind", "endpoints"}, (
            f"edge carries finding-shaped fields: {set(edge.keys())}"
        )
        for forbidden in ("severity", "code", "reason", "anchors", "subject"):
            assert forbidden not in edge


# ---------------------------------------------------------------------------
# §8.4 — No double-counting
# ---------------------------------------------------------------------------


def test_no_double_counting_review_records() -> None:
    """Each review record appears in exactly ONE node bucket."""
    index, srcs = _build_index()
    records = _synthetic_review_records()
    review = _compose_review(index, srcs, records, [], [])

    seen_ids: list[str] = []
    for node in review["nodes"].values():
        for record in node["reviewRecords"]:
            seen_ids.append(record["id"])
    assert sorted(seen_ids) == sorted({r["id"] for r in records}), (
        "review records double-counted or lost"
    )
    assert len(seen_ids) == len(set(seen_ids)), (
        f"a review record appears in multiple buckets: {seen_ids}"
    )


def test_no_double_counting_resolver_findings() -> None:
    index, srcs = _build_index()
    findings = _synthetic_reference_resolution_findings()
    review = _compose_review(index, srcs, [], findings, [])

    seen: list[dict] = []
    for node in review["nodes"].values():
        seen.extend(node["resolverFindings"])
    assert len(seen) == len(findings), "resolver findings double-counted or lost"


def test_no_double_counting_coverage_findings() -> None:
    """Coverage findings appear EITHER in a node bucket OR in `uncoveredItems`
    — never both, never duplicated."""
    index, srcs = _build_index()
    coverage = _synthetic_coverage_findings_partial()
    review = _compose_review(index, srcs, [], [], coverage)

    in_nodes = sum(len(n["coverageFindings"]) for n in review["nodes"].values())
    in_uncovered = len(review["uncoveredItems"])
    assert in_nodes + in_uncovered == len(coverage), (
        f"coverage findings lost or duplicated: "
        f"in_nodes={in_nodes}, in_uncovered={in_uncovered}, expected={len(coverage)}"
    )


def test_no_double_counting_when_trace_edges_decorate_node() -> None:
    """Trace edges added as decoration to a node bucket MUST NOT cause the
    co-resident review records to be counted twice."""
    index, srcs = _build_index()
    records = _synthetic_review_records()
    review = _compose_review(index, srcs, records, [], [])

    total_records = sum(len(n["reviewRecords"]) for n in review["nodes"].values())
    assert total_records == len(records), (
        "co-resident Trace edges multiplied review record counts"
    )


# ---------------------------------------------------------------------------
# Information preservation
# ---------------------------------------------------------------------------


def test_composition_preserves_all_information() -> None:
    """Every record/finding that goes in comes out attached somewhere."""
    index, srcs = _build_index()
    records = _synthetic_review_records()
    resolver = _synthetic_reference_resolution_findings()
    coverage = _synthetic_coverage_findings_partial()
    review = _compose_review(index, srcs, records, resolver, coverage)

    composed_records = sum(len(n["reviewRecords"]) for n in review["nodes"].values())
    composed_resolver = sum(
        len(n["resolverFindings"]) for n in review["nodes"].values()
    )
    composed_coverage = (
        sum(len(n["coverageFindings"]) for n in review["nodes"].values())
        + len(review["uncoveredItems"])
    )

    assert composed_records == len(records), "review records lost"
    assert composed_resolver == len(resolver), "resolver findings lost"
    assert composed_coverage == len(coverage), "coverage findings lost"


def test_uncovered_item_with_no_rendering_node_routes_to_uncovered_bucket() -> None:
    """When a coverage finding's `path` matches NO `item:` endpoint in any
    `component-renders-item` edge, the finding routes to `uncoveredItems`.

    Here `consentToTerms` is required (per the synthetic Definition) but the
    Component tree does NOT render it. The two-hop join finds no node ->
    finding falls to `uncoveredItems`.
    """
    index, srcs = _build_index()
    review = _compose_review(
        index, srcs, [], [], _synthetic_coverage_findings_partial()
    )
    assert len(review["uncoveredItems"]) == 1
    assert review["uncoveredItems"][0]["path"] == "consentToTerms"


def test_covered_item_routes_to_node_via_two_hop_join() -> None:
    """When the coverage finding's `path` matches an `item:` endpoint with a
    rendering node, the finding attaches to that node bucket (§8.3 row 3)."""
    index, srcs = _build_index()
    coverage = [{
        "code": "EXP-COVERAGE-UNCOVERED-REQUIRED-ITEM",
        "severity": "warning",
        "path": "applicantName",
        "reason": "(stand-in test fixture)",
    }]
    review = _compose_review(index, srcs, [], [], coverage)
    assert review["uncoveredItems"] == [], (
        "applicantName is rendered by /tree/children/0; coverage finding "
        "must NOT fall through to uncoveredItems"
    )
    matching_buckets = [
        node_path for node_path, bucket in review["nodes"].items()
        if any(f["path"] == "applicantName" for f in bucket["coverageFindings"])
    ]
    assert matching_buckets == ["/tree/children/0"]


def test_review_record_attached_to_correct_node_via_subject_handle() -> None:
    """§8.3 row 1: review records join via subject.componentNodePath."""
    index, srcs = _build_index()
    records = _synthetic_review_records()
    review = _compose_review(index, srcs, records, [], [])
    by_node = {
        "/tree/children/0": "review-name-regenerated",
        "/tree/children/1": "review-dob-pending",
        "/tree/children/2": "review-submit-survived",
    }
    for node_path, record_id in by_node.items():
        bucket = review["nodes"][node_path]
        record_ids = [r["id"] for r in bucket["reviewRecords"]]
        assert record_id in record_ids, (
            f"record {record_id!r} did not attach to node {node_path!r}; "
            f"bucket: {record_ids}"
        )


# ---------------------------------------------------------------------------
# Trace edges are decoration, not findings
# ---------------------------------------------------------------------------


def test_trace_edges_appear_only_as_decoration() -> None:
    """Trace edges populate the `edges` slot of every bucket whose
    componentNodePath appears in the edge. They do NOT contribute to the
    finding count or the review-record count (§8.4)."""
    index, srcs = _build_index()
    review = _compose_review(index, srcs, [], [], [])
    # No findings supplied -> finding totals are zero.
    for bucket in review["nodes"].values():
        assert bucket["reviewRecords"] == []
        assert bucket["resolverFindings"] == []
        assert bucket["coverageFindings"] == []
    # ... but Trace edges still decorate the buckets.
    total_edge_decorations = sum(len(n["edges"]) for n in review["nodes"].values())
    assert total_edge_decorations > 0, (
        "Trace edges should appear as decoration on node buckets"
    )


def test_robust_to_merge_route_change_via_subject_handle() -> None:
    """§8.5: the composition rule binds to `subject.componentNodePath`, not
    to any specific merge-report shape. A different route emitting different
    fields (but the same subject handle) MUST compose just as cleanly."""
    index, srcs = _build_index()

    # Pretend a different route emits records with extra fields and a
    # different code vocabulary — composition still works because the join
    # key is `subject.componentNodePath`, not the record shape.
    alt_route_records = [
        {
            "id": "proposal-1",
            "subject": {"componentNodePath": "/tree/children/0"},
            "code": "MCP-PROPOSAL-PENDING",
            "severity": "info",
            "reason": "Pending MCP proposal accept/reject.",
            "proposalId": "abc-123",  # extra, route-specific
            "anchors": ["item:applicantName"],
        },
    ]
    review = _compose_review(index, srcs, alt_route_records, [], [])
    bucket = review["nodes"]["/tree/children/0"]
    assert len(bucket["reviewRecords"]) == 1
    assert bucket["reviewRecords"][0]["proposalId"] == "abc-123", (
        "route-specific fields are preserved by composition"
    )


# ---------------------------------------------------------------------------
# Empty / boundary cases
# ---------------------------------------------------------------------------


def test_composition_with_no_streams_returns_decoration_only() -> None:
    """Empty findings + empty review records -> only Trace edge decoration."""
    index, srcs = _build_index()
    review = _compose_review(index, srcs, [], [], [])
    assert review["uncoveredItems"] == []
    finding_total = sum(
        len(b["reviewRecords"]) + len(b["resolverFindings"]) + len(b["coverageFindings"])
        for b in review["nodes"].values()
    )
    assert finding_total == 0


def test_composition_does_not_mutate_inputs() -> None:
    """§2.4 — TraceIndex is immutable after build. The composition harness
    MUST NOT mutate the index, srcs, or supplied finding lists in place."""
    index, srcs = _build_index()
    records = _synthetic_review_records()
    resolver = _synthetic_reference_resolution_findings()
    coverage = _synthetic_coverage_findings_partial()

    index_snapshot = json.dumps(index, sort_keys=True)
    records_snapshot = json.dumps(records, sort_keys=True)
    resolver_snapshot = json.dumps(resolver, sort_keys=True)
    coverage_snapshot = json.dumps(coverage, sort_keys=True)

    _compose_review(index, srcs, records, resolver, coverage)

    assert json.dumps(index, sort_keys=True) == index_snapshot, "index mutated"
    assert json.dumps(records, sort_keys=True) == records_snapshot, "records mutated"
    assert json.dumps(resolver, sort_keys=True) == resolver_snapshot, "resolver findings mutated"
    assert json.dumps(coverage, sort_keys=True) == coverage_snapshot, "coverage findings mutated"

#!/usr/bin/env python3
"""COMP-BUNDLE-ID audit v3 — uses permissive deep walk to catch every `id` field
regardless of nesting key, eliminating the v2 walker's false-negative on
hand-authored fixtures whose nodes nest under arbitrary keys.
"""
from __future__ import annotations
import json, argparse
from pathlib import Path
from collections import defaultdict

ROOT = Path("/Users/mikewolfd/Work/formspec-stack/formspec")
SCOPE_DIRS = [
    "tests/fixtures", "tests/conformance", "tests/e2e/fixtures",
    "examples", "reconstructed-examples", "thoughts/chaos-test",
]
EXCLUDED_TREES = {
    "tests/conformance/fixtures/regeneration-merge":
        "Three-way merge fixtures: each scenario dir contains 4 revisions of ONE Component"
        " (old/new/designer-edited/expected-merged). Cross-revision id reuse is the design;"
        " these are not bundle siblings. See ADR 0150 §242 + paused plan"
        " 2026-05-22-regeneration-merge.md.",
}

def is_component_doc(data):
    return isinstance(data, dict) and "$formspecComponent" in data

def load_json(p):
    try: return json.loads(p.read_text())
    except Exception as e: return ("__ERROR__", str(e))

def walk_deep(node, path, out):
    """Permissive deep walk — records every `id` string field at any depth.
    Path is JSON-ish dot/index notation."""
    if isinstance(node, dict):
        nid = node.get("id")
        if isinstance(nid, str):
            out.append((path or "<root>", nid))
        for k, v in node.items():
            walk_deep(v, f"{path}.{k}" if path else k, out)
    elif isinstance(node, list):
        for i, item in enumerate(node):
            walk_deep(item, f"{path}[{i}]", out)

def extract_ids(doc):
    """Walk under tree/root if present; else walk the whole doc minus envelope."""
    out = []
    if "tree" in doc:
        walk_deep(doc["tree"], "tree", out)
    elif "root" in doc:
        walk_deep(doc["root"], "root", out)
    else:
        skip = {"$formspecComponent", "version", "targetDefinition", "x-generation"}
        for k, v in doc.items():
            if k in skip: continue
            walk_deep(v, k, out)
    return out

def is_excluded(rel):
    for tree, why in EXCLUDED_TREES.items():
        if rel == tree or rel.startswith(tree + "/"):
            return why
    return None

def bundle_scope_for(p):
    parent = p.parent
    for cand in (parent, parent.parent):
        for name in ("bundle-manifest.json", "bundle.json", "manifest.json", "app-manifest.json"):
            if (cand / name).exists():
                return str(cand.relative_to(ROOT))
    return str(parent.relative_to(ROOT))

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--json-out", default=None)
    args = ap.parse_args()

    candidates = set()
    for sd in SCOPE_DIRS:
        sdp = ROOT / sd
        if not sdp.exists(): continue
        for p in sdp.rglob("*.json"):
            if "node_modules" in p.parts: continue
            try: head = p.read_text(errors="replace")[:2000]
            except: continue
            if '"$formspecComponent"' in head:
                candidates.add(p)
            if p.name == "component.json" or p.name.endswith(".component.json"):
                candidates.add(p)

    components_all, excluded, unparseable, skipped = [], [], [], []
    for p in sorted(candidates):
        data = load_json(p)
        if isinstance(data, tuple) and data[0] == "__ERROR__":
            unparseable.append((str(p.relative_to(ROOT)), data[1]))
            continue
        if not is_component_doc(data):
            if not isinstance(data, dict) or not (data.get("tree") or data.get("root")):
                skipped.append(str(p.relative_to(ROOT)))
                continue
        rel = str(p.relative_to(ROOT))
        if (why := is_excluded(rel)):
            excluded.append((rel, why))
            continue
        components_all.append((p, data))

    by_bundle = defaultdict(list)
    for p, d in components_all:
        by_bundle[bundle_scope_for(p)].append((p, d))

    collisions = []
    for bundle, docs in by_bundle.items():
        per_id = defaultdict(list)
        for doc_path, doc_data in docs:
            doc_rel = str(doc_path.relative_to(ROOT))
            for nodePath, nid in extract_ids(doc_data):
                per_id[nid].append((doc_rel, nodePath))
        for nid, occ in per_id.items():
            if len({d for d, _ in occ}) > 1:
                collisions.append({"bundle": bundle, "id": nid,
                                   "occurrences": [{"doc": d, "nodePath": np} for d, np in occ]})

    print(f"=== Audit v3 — permissive deep walk ===")
    print(f"Candidates: {len(candidates)}")
    print(f"In-scope Components: {len(components_all)}")
    print(f"Excluded: {len(excluded)}")
    print(f"Unparseable: {len(unparseable)}")
    print(f"Skipped: {len(skipped)}")
    print(f"In-scope bundles: {len(by_bundle)}")
    print(f"Multi-doc bundles: {sum(1 for d in by_bundle.values() if len(d) > 1)}")
    print()
    print(f"=== Cross-document collisions: {len(collisions)} ===")
    for c in collisions:
        print(f"  bundle={c['bundle']}  id={c['id']!r}")
        for o in c['occurrences']:
            print(f"    - {o['doc']} :: {o['nodePath']}")

    print()
    print(f"=== Multi-doc bundles with id-stamped nodes ===")
    for b, docs in sorted(by_bundle.items()):
        if len(docs) <= 1: continue
        per_doc = []
        for p, d in docs:
            ids = extract_ids(d)
            per_doc.append((str(p.relative_to(ROOT)), len(ids), ids))
        print(f"  {b}  [{len(docs)} docs]")
        for rel, n, ids in per_doc:
            print(f"    - {rel}  id-count={n}")
            if n: print(f"        ids: {sorted({i for _, i in ids})}")

    print()
    print(f"=== Per-doc id counts (all in-scope) ===")
    counts = [(len(extract_ids(d)), str(p.relative_to(ROOT))) for p, d in components_all]
    counts.sort(reverse=True)
    for n, rel in counts:
        print(f"  {n:5d}  {rel}")

    if args.json_out:
        sidecar = {
            "scope_dirs": SCOPE_DIRS,
            "candidate_count": len(candidates),
            "in_scope_components": [str(p.relative_to(ROOT)) for p, _ in components_all],
            "excluded": [{"path": p, "rationale": w} for p, w in excluded],
            "unparseable": [{"path": p, "error": e} for p, e in unparseable],
            "skipped": skipped,
            "bundles": {b: [str(p.relative_to(ROOT)) for p, _ in docs]
                        for b, docs in sorted(by_bundle.items())},
            "multi_doc_bundles": [b for b, docs in by_bundle.items() if len(docs) > 1],
            "collisions": collisions,
        }
        Path(args.json_out).write_text(json.dumps(sidecar, indent=2))
        print(f"\nJSON sidecar: {args.json_out}")

if __name__ == "__main__":
    main()

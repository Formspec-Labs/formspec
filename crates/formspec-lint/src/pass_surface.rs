//! Pass 8: Surface semantic hardening — route-graph reachability + slot binding validity.
//!
//! Surface documents (per ADR 0150 §6) name routes and bind slots. The schema
//! validates per-slot shape; this pass walks the surface-level semantics:
//!
//! - **E606 / `SURFACE-ROUTE-UNREACHABLE`**: every declared route is reachable
//!   from the surface's `entry` route by walking transitions[].to and
//!   embed-route slot bindings (binding.routeRef). Unreachable routes are
//!   dead code in the surface — they can never be navigated to.
//! - **E607 / `SURFACE-SLOT-BINDING-UNRESOLVED`**: every slot's binding
//!   refers to an in-document target where applicable. For `embed-route`
//!   slots: binding.routeRef MUST resolve to a route in this surface's
//!   routes[]. For `definition-form` / `experience-unit`: cross-document
//!   refs (definitionRef, unitRef) are checked against the bundle by the
//!   existing pass_modules / bundle-graph lints; pass_surface only
//!   guarantees the intra-surface refs.
//!
//! Pass number 8 matches the bundle-graph family (per spec lint-codes.json
//! convention; E605 lives at pass 3 today but the directive's "bundle-graph"
//! family was reserved for future expansion — Surface is the first true
//! bundle-graph-walk pass).

#![allow(clippy::missing_docs_in_private_items)]

use std::collections::{HashSet, VecDeque};

use serde_json::Value;

use crate::types::LintDiagnostic;

pub(crate) const PASS: u8 = 8;

pub(crate) fn lint_surface(doc: &Value) -> Vec<LintDiagnostic> {
    let mut diagnostics = Vec::new();

    let routes = doc.get("routes").and_then(Value::as_array);
    let Some(routes) = routes else {
        // Schema validation handles missing/wrong-shape routes; nothing semantic to add.
        return diagnostics;
    };

    let route_ids: HashSet<String> = routes
        .iter()
        .filter_map(|r| r.get("id").and_then(Value::as_str).map(String::from))
        .collect();

    let entry = doc.get("entry").and_then(Value::as_str);

    check_slot_binding_resolution(routes, &route_ids, &mut diagnostics);
    if let Some(entry_id) = entry {
        check_route_reachability(routes, entry_id, &route_ids, &mut diagnostics);
    }

    diagnostics
}

/// E607: every embed-route slot binding's routeRef MUST resolve to an in-surface route.
fn check_slot_binding_resolution(
    routes: &[Value],
    route_ids: &HashSet<String>,
    diagnostics: &mut Vec<LintDiagnostic>,
) {
    for (route_idx, route) in routes.iter().enumerate() {
        let Some(route_id) = route.get("id").and_then(Value::as_str) else {
            continue;
        };
        let Some(slots) = route.get("slots").and_then(Value::as_array) else {
            continue;
        };
        for (slot_idx, slot) in slots.iter().enumerate() {
            if slot.get("slotType").and_then(Value::as_str) != Some("embed-route") {
                continue;
            }
            let target = slot
                .get("binding")
                .and_then(|b| b.get("routeRef"))
                .and_then(Value::as_str);
            let Some(target) = target else {
                continue; // schema-level check catches missing routeRef
            };
            if !route_ids.contains(target) {
                let slot_id = slot
                    .get("id")
                    .and_then(Value::as_str)
                    .unwrap_or("<unknown>");
                diagnostics.push(crate::metadata::with_metadata(LintDiagnostic::error(
                    crate::LintCode::E607,
                    PASS,
                    &format!(
                        "$.routes[{route_idx}].slots[{slot_idx}].binding.routeRef"
                    ),
                    &format!(
                        "Slot {slot_id:?} on route {route_id:?} embeds route {target:?}, but no route with that id exists in this surface (SURFACE-SLOT-BINDING-UNRESOLVED)."
                    ),
                )));
            }
        }
    }
}

/// E606: every route MUST be reachable from `entry` via transitions[].to or embed-route bindings.
fn check_route_reachability(
    routes: &[Value],
    entry_id: &str,
    route_ids: &HashSet<String>,
    diagnostics: &mut Vec<LintDiagnostic>,
) {
    if !route_ids.contains(entry_id) {
        diagnostics.push(crate::metadata::with_metadata(LintDiagnostic::error(
            crate::LintCode::E606,
            PASS,
            "$.entry",
            format!(
                "Surface entry route {entry_id:?} does not resolve to any routes[].id \
                 (SURFACE-ROUTE-UNREACHABLE)."
            ),
        )));
        return;
    }

    // BFS reachability from entry, following transitions + embed-route bindings.
    let mut visited: HashSet<String> = HashSet::new();
    let mut queue: VecDeque<String> = VecDeque::new();
    queue.push_back(entry_id.to_string());
    visited.insert(entry_id.to_string());

    while let Some(cur) = queue.pop_front() {
        let Some(route) = routes
            .iter()
            .find(|r| r.get("id").and_then(Value::as_str) == Some(cur.as_str()))
        else {
            continue;
        };

        // Edges via transitions[].to
        if let Some(transitions) = route.get("transitions").and_then(Value::as_array) {
            for t in transitions {
                if let Some(target) = t.get("to").and_then(Value::as_str) {
                    if route_ids.contains(target) && visited.insert(target.to_string()) {
                        queue.push_back(target.to_string());
                    }
                }
            }
        }

        // Edges via embed-route slots
        if let Some(slots) = route.get("slots").and_then(Value::as_array) {
            for s in slots {
                if s.get("slotType").and_then(Value::as_str) != Some("embed-route") {
                    continue;
                }
                if let Some(target) = s
                    .get("binding")
                    .and_then(|b| b.get("routeRef"))
                    .and_then(Value::as_str)
                {
                    if route_ids.contains(target) && visited.insert(target.to_string()) {
                        queue.push_back(target.to_string());
                    }
                }
            }
        }
    }

    // Anything in route_ids but not in visited is unreachable.
    for (route_idx, route) in routes.iter().enumerate() {
        let Some(route_id) = route.get("id").and_then(Value::as_str) else {
            continue;
        };
        if !visited.contains(route_id) {
            diagnostics.push(crate::metadata::with_metadata(LintDiagnostic::error(
                crate::LintCode::E606,
                PASS,
                &format!("$.routes[{route_idx}]"),
                &format!(
                    "Route {route_id:?} is not reachable from the surface's entry route {entry_id:?} via any transitions[].to or embed-route slot bindings (SURFACE-ROUTE-UNREACHABLE)."
                ),
            )));
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::lint;

    const E606_FIXTURE: &str =
        include_str!("../../../tests/fixtures/lint/E606-surface-route-unreachable.json");
    const E607_FIXTURE: &str =
        include_str!("../../../tests/fixtures/lint/E607-surface-slot-binding-unresolved.json");

    fn diag_codes(diags: &[LintDiagnostic]) -> Vec<&'static str> {
        diags.iter().map(|d| d.code.as_wire_str()).collect()
    }

    #[test]
    fn e606_fires_on_unreachable_route() {
        let doc: Value = serde_json::from_str(E606_FIXTURE).unwrap();
        let result = lint(&doc);
        let codes = diag_codes(&result.diagnostics);
        assert!(
            codes.contains(&"E606"),
            "expected E606 SURFACE-ROUTE-UNREACHABLE; got {codes:?}"
        );
    }

    #[test]
    fn e606_fires_on_dangling_entry_route() {
        let doc: Value = serde_json::json!({
            "$formspecSurface": "0.1",
            "id": "caseDashboard",
            "entry": "missingRoute",
            "routes": [
                {
                    "id": "home",
                    "path": "/",
                    "slots": [
                        {
                            "id": "intro",
                            "slotType": "static-content",
                            "binding": {
                                "kind": "text",
                                "content": "Home"
                            }
                        }
                    ]
                }
            ]
        });
        let result = lint(&doc);
        let e606: Vec<_> = result
            .diagnostics
            .iter()
            .filter(|d| d.code == crate::LintCode::E606)
            .collect();
        assert_eq!(
            e606.len(),
            1,
            "expected dangling entry E606; got {result:?}"
        );
        assert_eq!(e606[0].path, "$.entry");
    }

    #[test]
    fn e607_fires_on_dangling_embed_route_binding() {
        let doc: Value = serde_json::from_str(E607_FIXTURE).unwrap();
        let result = lint(&doc);
        let codes = diag_codes(&result.diagnostics);
        assert!(
            codes.contains(&"E607"),
            "expected E607 SURFACE-SLOT-BINDING-UNRESOLVED; got {codes:?}"
        );
    }

    #[test]
    fn clean_surface_emits_no_e606_or_e607() {
        let doc: Value = serde_json::from_str(include_str!(
            "../../../tests/conformance/fixtures/modules/x-formspec-surface/legal-workspace-surface.json"
        ))
        .unwrap();
        let result = lint(&doc);
        let codes = diag_codes(&result.diagnostics);
        assert!(
            !codes.contains(&"E606"),
            "clean fixture should not emit E606; got {codes:?}"
        );
        assert!(
            !codes.contains(&"E607"),
            "clean fixture should not emit E607; got {codes:?}"
        );
    }
}

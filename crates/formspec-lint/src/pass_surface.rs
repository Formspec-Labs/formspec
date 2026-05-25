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
//! - **E610 / `SURFACE-ROUTE-PARAM-MISSING`**: every Surface-local edge into a
//!   route with `params[]` supplies all declared route parameters.
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
    check_route_param_completeness(routes, &mut diagnostics);
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

/// E610: every route edge into a param-bearing route supplies all target params.
fn check_route_param_completeness(routes: &[Value], diagnostics: &mut Vec<LintDiagnostic>) {
    for (route_idx, route) in routes.iter().enumerate() {
        check_route_param_declarations(route_idx, route, diagnostics);
        check_transition_params(routes, route_idx, route, diagnostics);
        check_embed_route_params(routes, route_idx, route, diagnostics);
    }
}

fn check_route_param_declarations(
    route_idx: usize,
    route: &Value,
    diagnostics: &mut Vec<LintDiagnostic>,
) {
    let declared = declared_route_params(route);
    let Some(path) = route.get("path").and_then(Value::as_str) else {
        return;
    };
    let markers = path_param_markers(path);
    for marker in &markers {
        match marker {
            PathParamMarker::Simple(name) => {
                if !declared.iter().any(|declared| *declared == name.as_str()) {
                    diagnostics.push(route_param_declaration_diag(
                        route_idx,
                        format!(
                            "Route path declares parameter {name:?}, but routes[{route_idx}].params[] does not declare it (SURFACE-ROUTE-PARAM-MISSING)."
                        ),
                    ));
                }
            }
            PathParamMarker::Unsupported(raw) => {
                diagnostics.push(route_param_declaration_diag(
                    route_idx,
                    format!(
                        "Route path contains unsupported parameter marker {{{raw}}}; Surface v0.1 admits only simple {{name}} markers (SURFACE-ROUTE-PARAM-MISSING)."
                    ),
                ));
            }
        }
    }

    for name in declared {
        let count = markers
            .iter()
            .filter(|marker| matches!(marker, PathParamMarker::Simple(marker_name) if marker_name == name))
            .count();
        if count == 1 {
            continue;
        }
        diagnostics.push(route_param_declaration_diag(
            route_idx,
            format!(
                "Route parameter {name:?} must appear exactly once as {{{name}}} in routes[{route_idx}].path (SURFACE-ROUTE-PARAM-MISSING)."
            ),
        ));
    }
}

fn route_param_declaration_diag(route_idx: usize, message: String) -> LintDiagnostic {
    crate::metadata::with_metadata(LintDiagnostic::error(
        crate::LintCode::E610,
        PASS,
        &format!("$.routes[{route_idx}].params"),
        message,
    ))
}

fn check_transition_params(
    routes: &[Value],
    route_idx: usize,
    route: &Value,
    diagnostics: &mut Vec<LintDiagnostic>,
) {
    let Some(transitions) = route.get("transitions").and_then(Value::as_array) else {
        return;
    };

    for (transition_idx, transition) in transitions.iter().enumerate() {
        let Some(target_id) = transition.get("to").and_then(Value::as_str) else {
            continue;
        };
        let Some(target_route) = route_by_id(routes, target_id) else {
            continue;
        };
        let supplied = transition.get("params").and_then(Value::as_object);
        let missing = missing_route_params(target_route, supplied);
        if missing.is_empty() {
            continue;
        }
        diagnostics.push(crate::metadata::with_metadata(LintDiagnostic::error(
            crate::LintCode::E610,
            PASS,
            &format!("$.routes[{route_idx}].transitions[{transition_idx}].params"),
            &format!(
                "Transition to route {target_id:?} is missing required route params: {} (SURFACE-ROUTE-PARAM-MISSING).",
                missing.join(", ")
            ),
        )));
    }
}

fn check_embed_route_params(
    routes: &[Value],
    route_idx: usize,
    route: &Value,
    diagnostics: &mut Vec<LintDiagnostic>,
) {
    let Some(slots) = route.get("slots").and_then(Value::as_array) else {
        return;
    };

    for (slot_idx, slot) in slots.iter().enumerate() {
        if slot.get("slotType").and_then(Value::as_str) != Some("embed-route") {
            continue;
        }
        let binding = slot.get("binding");
        let Some(target_id) = binding
            .and_then(|b| b.get("routeRef"))
            .and_then(Value::as_str)
        else {
            continue;
        };
        let Some(target_route) = route_by_id(routes, target_id) else {
            continue;
        };
        let supplied = binding
            .and_then(|b| b.get("params"))
            .and_then(Value::as_object);
        let missing = missing_route_params(target_route, supplied);
        if missing.is_empty() {
            continue;
        }
        diagnostics.push(crate::metadata::with_metadata(LintDiagnostic::error(
            crate::LintCode::E610,
            PASS,
            &format!("$.routes[{route_idx}].slots[{slot_idx}].binding.params"),
            &format!(
                "Embed-route slot targeting {target_id:?} is missing required route params: {} (SURFACE-ROUTE-PARAM-MISSING).",
                missing.join(", ")
            ),
        )));
    }
}

fn route_by_id<'a>(routes: &'a [Value], route_id: &str) -> Option<&'a Value> {
    routes
        .iter()
        .find(|route| route.get("id").and_then(Value::as_str) == Some(route_id))
}

fn missing_route_params(
    route: &Value,
    supplied: Option<&serde_json::Map<String, Value>>,
) -> Vec<String> {
    declared_route_params(route)
        .into_iter()
        .filter(|name| match supplied {
            Some(supplied) => !supplied.contains_key(*name),
            None => true,
        })
        .map(str::to_string)
        .collect()
}

fn declared_route_params(route: &Value) -> Vec<&str> {
    let Some(params) = route.get("params").and_then(Value::as_array) else {
        return Vec::new();
    };
    params
        .iter()
        .filter_map(|param| param.get("name").and_then(Value::as_str))
        .collect()
}

enum PathParamMarker {
    Simple(String),
    Unsupported(String),
}

fn path_param_markers(path: &str) -> Vec<PathParamMarker> {
    let mut markers = Vec::new();
    let mut rest = path;
    while let Some(open) = rest.find('{') {
        let after_open = &rest[open + 1..];
        let Some(close) = after_open.find('}') else {
            markers.push(PathParamMarker::Unsupported(after_open.to_string()));
            break;
        };
        let raw = &after_open[..close];
        if is_route_param_name(raw) {
            markers.push(PathParamMarker::Simple(raw.to_string()));
        } else {
            markers.push(PathParamMarker::Unsupported(raw.to_string()));
        }
        rest = &after_open[close + 1..];
    }
    markers
}

fn is_route_param_name(name: &str) -> bool {
    let mut chars = name.chars();
    let Some(first) = chars.next() else {
        return false;
    };
    if !first.is_ascii_alphabetic() {
        return false;
    }
    chars.all(|ch| ch.is_ascii_alphanumeric() || ch == '_' || ch == '-')
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
    const E610_FIXTURE: &str =
        include_str!("../../../tests/fixtures/lint/E610-surface-route-param-missing.json");

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
    fn e610_fires_on_missing_transition_route_param() {
        let doc: Value = serde_json::from_str(E610_FIXTURE).unwrap();
        let result = lint(&doc);
        let codes = diag_codes(&result.diagnostics);
        assert!(
            codes.contains(&"E610"),
            "expected E610 SURFACE-ROUTE-PARAM-MISSING; got {codes:?}"
        );
    }

    #[test]
    fn e610_fires_on_missing_embed_route_param() {
        let doc: Value = serde_json::json!({
            "$formspecSurface": "0.1",
            "id": "caseDashboard",
            "entry": "home",
            "routes": [
                {
                    "id": "home",
                    "path": "/",
                    "slots": [
                        {
                            "id": "detailsPanel",
                            "slotType": "embed-route",
                            "binding": { "routeRef": "details" }
                        }
                    ]
                },
                {
                    "id": "details",
                    "path": "/details/{caseId}",
                    "params": [{ "name": "caseId", "type": "string" }],
                    "slots": [
                        {
                            "id": "detailsText",
                            "slotType": "static-content",
                            "binding": {
                                "kind": "text",
                                "content": "Details"
                            }
                        }
                    ]
                }
            ]
        });
        let result = lint(&doc);
        let codes = diag_codes(&result.diagnostics);
        assert!(
            codes.contains(&"E610"),
            "expected E610 SURFACE-ROUTE-PARAM-MISSING; got {codes:?}"
        );
    }

    #[test]
    fn e610_fires_when_declared_param_is_absent_from_path() {
        let doc: Value = serde_json::json!({
            "$formspecSurface": "0.1",
            "id": "caseDashboard",
            "entry": "case",
            "routes": [
                {
                    "id": "case",
                    "path": "/cases",
                    "params": [{ "name": "caseId", "type": "string" }],
                    "slots": [
                        {
                            "id": "summary",
                            "slotType": "static-content",
                            "binding": {
                                "kind": "text",
                                "content": "Case summary"
                            }
                        }
                    ]
                }
            ]
        });
        let result = lint(&doc);
        let codes = diag_codes(&result.diagnostics);
        assert!(
            codes.contains(&"E610"),
            "expected E610 SURFACE-ROUTE-PARAM-MISSING; got {codes:?}"
        );
    }

    #[test]
    fn e610_fires_when_path_marker_is_undeclared() {
        let doc: Value = serde_json::json!({
            "$formspecSurface": "0.1",
            "id": "caseDashboard",
            "entry": "case",
            "routes": [
                {
                    "id": "case",
                    "path": "/cases/{caseId}",
                    "slots": [
                        {
                            "id": "summary",
                            "slotType": "static-content",
                            "binding": {
                                "kind": "text",
                                "content": "Case summary"
                            }
                        }
                    ]
                }
            ]
        });
        let result = lint(&doc);
        let codes = diag_codes(&result.diagnostics);
        assert!(
            codes.contains(&"E610"),
            "expected E610 SURFACE-ROUTE-PARAM-MISSING; got {codes:?}"
        );
    }

    #[test]
    fn clean_surface_emits_no_surface_route_graph_errors() {
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
        assert!(
            !codes.contains(&"E610"),
            "clean fixture should not emit E610; got {codes:?}"
        );
    }
}

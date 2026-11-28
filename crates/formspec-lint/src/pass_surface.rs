//! Pass 8: Surface semantic hardening — route-graph reachability + slot binding validity.
//!
//! Surface documents (per ADR 0150 §6) name routes and bind slots. The schema
//! validates per-slot shape; this pass walks the surface-level semantics:
//!
//! - **E606 / `SURFACE-ROUTE-UNREACHABLE`**: every declared route is reachable
//!   from the surface's `entry` route by walking transitions[].to and
//!   embed-route slot bindings (binding.routeRef), and native 0.3 Screener
//!   allowedTargets and native 0.4 form-status destinations. Unreachable routes are
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
    let dialect = doc.get("$formspecSurface").and_then(Value::as_str);
    let native_screeners = matches!(dialect, Some("0.3" | "0.4"));
    if native_screeners {
        check_screener_route_params(routes, entry, &mut diagnostics);
    }
    if dialect == Some("0.4") {
        check_form_status_route_params(routes, &mut diagnostics);
    }
    if let Some(entry_id) = entry {
        check_route_reachability(routes, entry_id, &route_ids, dialect, &mut diagnostics);
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

/// Read local Surface target IDs without resolving cross-document membership.
fn screener_targets(slot: &Value) -> impl Iterator<Item = (usize, &str)> {
    let targets = (slot.get("slotType").and_then(Value::as_str) == Some("screener"))
        .then(|| slot.get("binding")?.get("allowedTargets")?.as_array())
        .flatten();
    targets
        .into_iter()
        .flatten()
        .enumerate()
        .filter_map(|(index, target)| {
            target
                .as_str()?
                .strip_prefix("surface:")
                .map(|id| (index, id))
        })
}

/// Check direct Screener destinations against the route's declared parameters.
fn check_screener_route_params(
    routes: &[Value],
    entry: Option<&str>,
    diagnostics: &mut Vec<LintDiagnostic>,
) {
    // Embedded Screeners use the outer host's parameters. Runtime checks that
    // actual context; the embedded route's declarations cannot prove supply.
    let embedded: HashSet<&str> = routes
        .iter()
        .flat_map(|route| {
            route
                .get("slots")
                .and_then(Value::as_array)
                .into_iter()
                .flatten()
        })
        .filter(|slot| slot.get("slotType").and_then(Value::as_str) == Some("embed-route"))
        .filter_map(|slot| slot.get("binding")?.get("routeRef")?.as_str())
        .collect();
    // A route can be embedded and directly navigated. Only embedded-only routes
    // defer to the actual outer host; any authored direct entry stays checked.
    let mut direct: HashSet<&str> = entry.into_iter().collect();
    for route in routes {
        direct.extend(
            route
                .get("transitions")
                .and_then(Value::as_array)
                .into_iter()
                .flatten()
                .filter_map(|transition| transition.get("to")?.as_str()),
        );
        for slot in route
            .get("slots")
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
        {
            direct.extend(screener_targets(slot).map(|(_, target)| target));
        }
    }
    for (route_idx, route) in routes.iter().enumerate() {
        if route
            .get("id")
            .and_then(Value::as_str)
            .is_some_and(|id| embedded.contains(id) && !direct.contains(id))
        {
            continue;
        }
        let supplied = declared_route_params(route);
        for (slot_idx, slot) in route
            .get("slots")
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
            .enumerate()
        {
            for (target_idx, target_id) in screener_targets(slot) {
                let Some(target_route) = route_by_id(routes, target_id) else {
                    continue;
                };
                let missing: Vec<&str> = declared_route_params(target_route)
                    .into_iter()
                    .filter(|name| !supplied.contains(name))
                    .collect();
                if missing.is_empty() {
                    continue;
                }
                diagnostics.push(crate::metadata::with_metadata(LintDiagnostic::error(
                    crate::LintCode::E610, PASS,
                    &format!("$.routes[{route_idx}].slots[{slot_idx}].binding.allowedTargets[{target_idx}]"),
                    &format!("Screener target {target_id:?} requires route params absent from its direct host: {} (SURFACE-ROUTE-PARAM-MISSING).", missing.join(", ")),
                )));
            }
        }
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

fn is_form_status_band(slot: &Value) -> bool {
    slot["slotType"] == "form-status" && slot["binding"]["placement"] == "band"
}

fn resolve_unique_definition_slot<'a>(
    routes: &'a [Value],
    route_id: &str,
    slot_id: &str,
) -> Option<(&'a Value, &'a Value)> {
    let mut matched_routes = routes
        .iter()
        .filter(|route| route.get("id").and_then(Value::as_str) == Some(route_id));
    let target_route = matched_routes.next()?;
    if matched_routes.next().is_some() {
        return None;
    }
    let slots = target_route.get("slots").and_then(Value::as_array)?;
    let mut matched_slots = slots
        .iter()
        .filter(|slot| slot.get("id").and_then(Value::as_str) == Some(slot_id));
    let target_slot = matched_slots.next()?;
    if matched_slots.next().is_some()
        || target_slot.get("slotType").and_then(Value::as_str) != Some("definition-form")
    {
        return None;
    }
    Some((target_route, target_slot))
}

fn form_status_entry_param_sources(entry: &Value) -> impl Iterator<Item = &Value> {
    let param_sources = entry
        .get("params")
        .and_then(Value::as_object)
        .into_iter()
        .flat_map(|params| params.values());
    let subject_sources = entry
        .get("subject")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(|predicate| predicate.get("from"));
    param_sources.chain(subject_sources)
}

fn form_status_entry_target_issue(
    target_route: &Value,
    target_slot: &Value,
    entry: &Value,
) -> Option<(String, String)> {
    let target_id = target_route
        .get("id")
        .and_then(Value::as_str)
        .unwrap_or("<unknown>");
    let target_params = declared_route_params(target_route);
    let supplied = entry.get("params").and_then(Value::as_object);

    if let Some(supplied) = supplied {
        let undeclared: Vec<&str> = supplied
            .keys()
            .map(String::as_str)
            .filter(|name| !target_params.contains(name))
            .collect();
        if !undeclared.is_empty() {
            return Some((
                String::new(),
                format!(
                    "Form-status entry targeting route {target_id:?} supplies undeclared target route params: {} (SURFACE-ROUTE-PARAM-MISSING).",
                    undeclared.join(", ")
                ),
            ));
        }
    }

    let Some(predicates) = entry.get("subject").and_then(Value::as_array) else {
        let missing = missing_route_params(target_route, supplied);
        if missing.is_empty() {
            return None;
        }
        return Some((
            String::new(),
            format!(
                "Form-status entry targeting route {target_id:?} is missing required route params: {} (SURFACE-ROUTE-PARAM-MISSING).",
                missing.join(", ")
            ),
        ));
    };

    let Some(subject_keys) = target_slot
        .get("binding")
        .and_then(|b| b.get("subjectKeys"))
        .and_then(Value::as_object)
        .filter(|keys| !keys.is_empty())
    else {
        return Some((
            ".subject".to_string(),
            format!(
                "Form-status entry targeting route {target_id:?} declares subject predicates, but target slot has no non-empty subjectKeys binding (SURFACE-ROUTE-PARAM-MISSING)."
            ),
        ));
    };

    for (pred_idx, predicate) in predicates.iter().enumerate() {
        let Some(key) = predicate.get("key").and_then(Value::as_str) else {
            continue;
        };
        let Some(mapped_param) = subject_keys.get(key).and_then(Value::as_str) else {
            return Some((
                format!(".subject[{pred_idx}]"),
                format!(
                    "Form-status entry targeting route {target_id:?} references subject key {key:?} not bound in target slot subjectKeys (SURFACE-ROUTE-PARAM-MISSING)."
                ),
            ));
        };
        if supplied.is_some_and(|params| params.contains_key(mapped_param)) {
            return Some((
                format!(".subject[{pred_idx}]"),
                format!(
                    "Form-status entry targeting route {target_id:?} cannot bind subject key {key:?} in both params[{mapped_param:?}] and subject[] (SURFACE-ROUTE-PARAM-MISSING)."
                ),
            ));
        }
    }

    let mut derived_params: HashSet<&str> = HashSet::new();
    for (key, param_val) in subject_keys {
        let Some(param_name) = param_val.as_str() else {
            return Some((
                ".subject".to_string(),
                format!(
                    "Form-status entry targeting route {target_id:?} relies on invalid subjectKeys[{key:?}] binding (SURFACE-ROUTE-PARAM-MISSING)."
                ),
            ));
        };
        if supplied.is_some_and(|params| params.contains_key(param_name)) {
            continue;
        }
        if !target_params.contains(&param_name) || !derived_params.insert(param_name) {
            return Some((
                ".subject".to_string(),
                format!(
                    "Form-status entry targeting route {target_id:?} requires subjectKeys[{key:?}] to map to a distinct parameter declared on {target_id:?} (SURFACE-ROUTE-PARAM-MISSING)."
                ),
            ));
        }
    }

    let missing: Vec<&str> = target_params
        .into_iter()
        .filter(|name| {
            !derived_params.contains(name) && !supplied.is_some_and(|params| params.contains_key(*name))
        })
        .collect();
    if !missing.is_empty() {
        return Some((
            String::new(),
            format!(
                "Form-status entry targeting route {target_id:?} is missing required non-subject route params: {} (SURFACE-ROUTE-PARAM-MISSING).",
                missing.join(", ")
            ),
        ));
    }
    None
}

fn check_form_status_route_params(routes: &[Value], diagnostics: &mut Vec<LintDiagnostic>) {
    for (route_idx, route) in routes.iter().enumerate() {
        let host_params = declared_route_params(route);
        let Some(slots) = route.get("slots").and_then(Value::as_array) else {
            continue;
        };
        for (slot_idx, slot) in slots.iter().enumerate() {
            if slot.get("slotType").and_then(Value::as_str) != Some("form-status") {
                continue;
            }
            let Some(groups) = slot
                .get("binding")
                .and_then(|b| b.get("groups"))
                .and_then(Value::as_array)
            else {
                continue;
            };
            for (group_idx, group) in groups.iter().enumerate() {
                let has_repeat = group.get("repeat").is_some();
                let Some(forms) = group.get("forms").and_then(Value::as_array) else {
                    continue;
                };
                for (entry_idx, entry) in forms.iter().enumerate() {
                    let entry_path = format!(
                        "$.routes[{route_idx}].slots[{slot_idx}].binding.groups[{group_idx}].forms[{entry_idx}]"
                    );
                    if let Some(params) = entry.get("params").and_then(Value::as_object) {
                        for (param_key, source) in params {
                            let param_path = format!("{entry_path}.params.{param_key}");
                            if let Some(param) = source.get("routeParam").and_then(Value::as_str) {
                                if !host_params.contains(&param) {
                                    diagnostics.push(crate::metadata::with_metadata(
                                        LintDiagnostic::error(
                                            crate::LintCode::E610,
                                            PASS,
                                            &param_path,
                                            format!(
                                                "Form-status entry references undeclared host routeParam {param:?} (SURFACE-ROUTE-PARAM-MISSING)."
                                            ),
                                        ),
                                    ));
                                }
                            }
                            if source.get("rowField").is_some() && !has_repeat {
                                diagnostics.push(crate::metadata::with_metadata(
                                    LintDiagnostic::error(
                                        crate::LintCode::E610,
                                        PASS,
                                        &param_path,
                                        "Form-status entry uses rowField outside a repeated group (SURFACE-ROUTE-PARAM-MISSING).",
                                    ),
                                ));
                            }
                        }
                    }
                    if let Some(predicates) = entry.get("subject").and_then(Value::as_array) {
                        for (pred_idx, predicate) in predicates.iter().enumerate() {
                            let Some(source) = predicate.get("from") else {
                                continue;
                            };
                            let pred_key = predicate
                                .get("key")
                                .and_then(Value::as_str)
                                .unwrap_or("<unknown>");
                            let pred_path = format!("{entry_path}.subject[{pred_idx}]");
                            if let Some(param) = source.get("routeParam").and_then(Value::as_str) {
                                if !host_params.contains(&param) {
                                    diagnostics.push(crate::metadata::with_metadata(
                                        LintDiagnostic::error(
                                            crate::LintCode::E610,
                                            PASS,
                                            &pred_path,
                                            format!(
                                                "Form-status predicate on key {pred_key:?} references undeclared host routeParam {param:?} (SURFACE-ROUTE-PARAM-MISSING)."
                                            ),
                                        ),
                                    ));
                                }
                            }
                            if source.get("rowField").is_some() && !has_repeat {
                                diagnostics.push(crate::metadata::with_metadata(
                                    LintDiagnostic::error(
                                        crate::LintCode::E610,
                                        PASS,
                                        &pred_path,
                                        format!(
                                            "Form-status predicate on key {pred_key:?} uses rowField outside a repeated group (SURFACE-ROUTE-PARAM-MISSING)."
                                        ),
                                    ),
                                ));
                            }
                        }
                    }
                    let (Some(route_ref), Some(slot_ref)) = (
                        entry.get("routeRef").and_then(Value::as_str),
                        entry.get("slotRef").and_then(Value::as_str),
                    ) else {
                        continue;
                    };
                    let Some((target_route, target_slot)) =
                        resolve_unique_definition_slot(routes, route_ref, slot_ref)
                    else {
                        continue;
                    };
                    if let Some((suffix, issue)) =
                        form_status_entry_target_issue(target_route, target_slot, entry)
                    {
                        diagnostics.push(crate::metadata::with_metadata(LintDiagnostic::error(
                            crate::LintCode::E610,
                            PASS,
                            &format!("{entry_path}{suffix}"),
                            issue,
                        )));
                    }
                }
            }
        }
    }
}

fn form_status_targets<'a, 'b>(
    routes: &'a [Value],
    slot: &'a Value,
    declaring_params: &'b [&'b str],
    host_params: &'b [&'b str],
) -> impl Iterator<Item = &'a str> + use<'a, 'b> {
    slot["binding"]["groups"]
        .as_array()
        .into_iter()
        .flatten()
        .flat_map(|group| {
            let has_repeat = group.get("repeat").is_some();
            group["forms"]
                .as_array()
                .into_iter()
                .flatten()
                .map(move |entry| (has_repeat, entry))
        })
        .filter(move |(has_repeat, entry)| {
            form_status_entry_param_sources(entry).all(|source| {
                source
                    .get("routeParam")
                    .and_then(Value::as_str)
                    .is_none_or(|param| {
                        declaring_params.contains(&param) && host_params.contains(&param)
                    })
                    && (*has_repeat || source.get("rowField").is_none())
            }) && entry
                .get("routeRef")
                .and_then(Value::as_str)
                .zip(entry.get("slotRef").and_then(Value::as_str))
                .and_then(|(route_ref, slot_ref)| {
                    resolve_unique_definition_slot(routes, route_ref, slot_ref)
                })
                .is_some_and(|(target_route, target_slot)| {
                    form_status_entry_target_issue(target_route, target_slot, entry).is_none()
                })
        })
        .filter_map(|(_, entry)| entry["routeRef"].as_str())
}

/// Check reachability through declared local route edges.
fn check_route_reachability(
    routes: &[Value],
    entry_id: &str,
    route_ids: &HashSet<String>,
    dialect: Option<&str>,
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

    // Walk all local edges admitted by the Surface dialect.
    let mut visited: HashSet<String> = HashSet::new();
    let mut queue: VecDeque<String> = VecDeque::new();
    queue.push_back(entry_id.to_string());
    visited.insert(entry_id.to_string());

    let bands: Vec<(Vec<&str>, &Value)> = if dialect == Some("0.4") {
        routes
            .iter()
            .flat_map(|route| {
                let declaring_params = declared_route_params(route);
                route["slots"]
                    .as_array()
                    .into_iter()
                    .flatten()
                    .filter(|slot| is_form_status_band(slot))
                    .map(move |slot| (declaring_params.clone(), slot))
            })
            .collect()
    } else {
        Vec::new()
    };

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

        let host_params = declared_route_params(route);
        for slot in route
            .get("slots")
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
            .filter(|slot| !is_form_status_band(slot))
        {
            let targets = match slot.get("slotType").and_then(Value::as_str) {
                Some("embed-route") => slot["binding"]["routeRef"].as_str().into_iter().collect(),
                Some("screener") if matches!(dialect, Some("0.3" | "0.4")) => {
                    screener_targets(slot).map(|(_, target)| target).collect()
                }
                Some("draft-start") if dialect == Some("0.4") => {
                    slot["binding"]["routeRef"].as_str().into_iter().collect()
                }
                Some("form-status") if dialect == Some("0.4") => {
                    form_status_targets(routes, slot, &host_params, &host_params).collect()
                }
                _ => Vec::new(),
            };
            for target in targets {
                if route_ids.contains(target) && visited.insert(target.to_string()) {
                    queue.push_back(target.to_string());
                }
            }
        }
        for (declaring_params, band_slot) in &bands {
            for target in form_status_targets(routes, band_slot, declaring_params, &host_params) {
                if route_ids.contains(target) && visited.insert(target.to_string()) {
                    queue.push_back(target.to_string());
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
                    "Route {route_id:?} is not reachable from the surface's entry route {entry_id:?} via transitions[].to, embed-route bindings, native Screener allowedTargets, or form-status links (SURFACE-ROUTE-UNREACHABLE)."
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

    fn screener_surface() -> Value {
        serde_json::json!({
            "$formspecSurface": "0.3", "id": "app", "entry": "screen",
            "routes": [
                { "id": "screen", "path": "/screen", "slots": [
                    { "id": "gate", "slotType": "screener", "binding": {
                        "screenerRef": "urn:gate", "allowedTargets": ["surface:apply", "surface:paper"]
                    }}
                ]},
                { "id": "apply", "path": "/apply", "slots": [{ "id": "text", "slotType": "static-content", "binding": { "kind": "text", "content": "Apply" }}]},
                { "id": "paper", "path": "/paper", "slots": [{ "id": "text", "slotType": "static-content", "binding": { "kind": "text", "content": "Paper" }}]}
            ]
        })
    }

    #[test]
    fn form_status_reaches_the_form_only_in_surface_0_4() {
        let mut surface = serde_json::json!({
            "$formspecSurface": "0.4", "id": "app", "entry": "home",
            "routes": [
                { "id": "home", "path": "/", "slots": [
                    { "id": "tracker", "slotType": "form-status", "binding": {
                        "groups": [{ "id": "annual", "label": "Annual forms", "forms": [
                            { "routeRef": "apply", "slotRef": "form" }
                        ]}]
                    }}
                ] },
                { "id": "apply", "path": "/apply", "slots": [
                    { "id": "form", "slotType": "definition-form", "binding": {
                        "definitionRef": "urn:apply"
                    }}
                ] }
            ]
        });
        assert!(lint_surface(&surface).is_empty());
        surface["$formspecSurface"] = serde_json::json!("0.3");
        assert!(
            lint_surface(&surface)
                .iter()
                .any(|item| item.code == crate::LintCode::E606)
        );
    }

    #[test]
    fn tracker_band_destinations_are_reachable_from_entry() {
        let mut doc = serde_json::json!({
            "$formspecSurface": "0.4", "id": "app", "entry": "home",
            "routes": [
                {"id": "home", "path": "/", "slots": []},
                {"id": "overview", "path": "/overview", "slots": [
                    {"id": "form", "slotType": "definition-form", "binding": {"definitionRef": "urn:form"}},
                    {"id": "tracker", "slotType": "form-status", "binding": {
                        "placement": "band",
                        "groups": [{"id": "annual", "label": "Forms", "forms": [{"routeRef": "overview", "slotRef": "form"}]}]
                    }}
                ]}
            ]
        });
        let reachable = |doc: &Value| {
            !lint_surface(doc)
                .iter()
                .any(|d| d.code == crate::LintCode::E606)
        };
        assert!(reachable(&doc));
        doc["routes"][1]["slots"][1]["binding"]
            .as_object_mut()
            .unwrap()
            .remove("placement");
        assert!(!reachable(&doc));
    }

    #[test]
    fn tracker_band_cannot_supply_a_parameter_from_an_unreachable_route() {
        let mut doc = serde_json::json!({
            "$formspecSurface": "0.4", "id": "app", "entry": "home",
            "routes": [
                {"id": "home", "path": "/", "slots": []},
                {"id": "overview", "path": "/overview/{member}", "params": [{"name": "member", "type": "string"}],
                 "slots": [{"id": "tracker", "slotType": "form-status", "binding": {
                    "placement": "band", "groups": [{"id": "annual", "label": "Forms", "forms": [
                        {"routeRef": "form", "slotRef": "editor", "params": {"member": {"routeParam": "member"}}}
                    ]}]
                 }}]},
                {"id": "form", "path": "/form/{member}", "params": [{"name": "member", "type": "string"}],
                 "slots": [{"id": "editor", "slotType": "definition-form", "binding": {"definitionRef": "urn:form"}}]}
            ]
        });
        let unreachable = |doc: &Value| {
            lint_surface(doc)
                .iter()
                .filter(|d| d.code == crate::LintCode::E606)
                .count()
        };
        assert_eq!(unreachable(&doc), 2);
        doc["routes"][0]["transitions"] =
            serde_json::json!([{"to": "overview", "params": {"member": "north"}}]);
        assert_eq!(unreachable(&doc), 0);
    }

    #[test]
    fn form_status_subject_predicates_reach_multi_key_routes_and_check_route_params() {
        let mut doc = serde_json::json!({
            "$formspecSurface": "0.4", "id": "app", "entry": "overview",
            "routes": [
                {
                    "id": "overview", "path": "/periods/{period}",
                    "params": [{"name": "period", "type": "string"}],
                    "slots": [{"id": "tracker", "slotType": "form-status", "binding": {
                        "groups": [{"id": "period", "label": "Period plan", "forms": [{
                            "routeRef": "plan", "slotRef": "form",
                            "subject": [
                                {"key": "first_period", "op": "le", "from": {"routeParam": "period"}},
                                {"key": "last_period", "op": "ge", "from": {"routeParam": "period"}}
                            ]
                        }]}]
                    }}]
                },
                {
                    "id": "plan", "path": "/plans/{first_period}/{last_period}",
                    "params": [
                        {"name": "first_period", "type": "string"},
                        {"name": "last_period", "type": "string"}
                    ],
                    "slots": [{"id": "form", "slotType": "definition-form", "binding": {
                        "definitionRef": "urn:plan",
                        "subjectKeys": {"first_period": "first_period", "last_period": "last_period"}
                    }}]
                }
            ]
        });
        assert!(lint(&doc).diagnostics.is_empty(), "{:?}", lint(&doc).diagnostics);

        // Missing host routeParam in subject predicate emits E610 and withholds reachability (E606).
        doc["routes"][0]["slots"][0]["binding"]["groups"][0]["forms"][0]["subject"][0]["from"] =
            serde_json::json!({"routeParam": "missing_param"});
        let missing_host = lint_surface(&doc);
        assert!(missing_host.iter().any(|d| d.code == crate::LintCode::E610));
        assert!(missing_host.iter().any(|d| d.code == crate::LintCode::E606));

        // Restore valid host param, then add an extra non-subject target route param unsupplied by params.
        doc["routes"][0]["slots"][0]["binding"]["groups"][0]["forms"][0]["subject"][0]["from"] =
            serde_json::json!({"routeParam": "period"});
        doc["routes"][1]["path"] = serde_json::json!("/plans/{region}/{first_period}/{last_period}");
        doc["routes"][1]["params"].as_array_mut().unwrap().push(
            serde_json::json!({"name": "region", "type": "string"}),
        );
        let missing_target = lint_surface(&doc);
        assert!(missing_target.iter().any(|d| d.code == crate::LintCode::E610));

        // Restore valid target route, then verify safe-integer offset bounds in schema validation.
        doc["routes"][1]["path"] = serde_json::json!("/plans/{first_period}/{last_period}");
        doc["routes"][1]["params"].as_array_mut().unwrap().pop();
        for safe_offset in [-9_007_199_254_740_991_i64, 9_007_199_254_740_991_i64] {
            doc["routes"][0]["slots"][0]["binding"]["groups"][0]["forms"][0]["subject"][0]["offset"] =
                serde_json::json!(safe_offset);
            assert!(lint(&doc).diagnostics.is_empty(), "{:?}", lint(&doc).diagnostics);
        }
        for unsafe_offset in [-9_007_199_254_740_992_i64, 9_007_199_254_740_992_i64] {
            doc["routes"][0]["slots"][0]["binding"]["groups"][0]["forms"][0]["subject"][0]["offset"] =
                serde_json::json!(unsafe_offset);
            assert!(lint(&doc).diagnostics.iter().any(|d| d.code == crate::LintCode::E101));
        }

        // A band whose declaring route lacks the source routeParam must not grant reachability via another route.
        let band_doc = serde_json::json!({
            "$formspecSurface": "0.4", "id": "app", "entry": "overview",
            "routes": [
                {
                    "id": "overview", "path": "/periods/{period}",
                    "params": [{"name": "period", "type": "string"}],
                    "transitions": [{"trigger": "next", "to": "settings"}],
                    "slots": [{"id": "homeform", "slotType": "definition-form", "binding": {"definitionRef": "urn:home"}}]
                },
                {
                    "id": "plan", "path": "/plans/{first_period}/{last_period}",
                    "params": [{"name": "first_period", "type": "string"}, {"name": "last_period", "type": "string"}],
                    "slots": [{"id": "form", "slotType": "definition-form", "binding": {
                        "definitionRef": "urn:plan",
                        "subjectKeys": {"first_period": "first_period", "last_period": "last_period"}
                    }}]
                },
                {
                    "id": "settings", "path": "/settings",
                    "slots": [{"id": "tracker", "slotType": "form-status", "binding": {
                        "placement": "band",
                        "groups": [{"id": "period", "label": "Period plan", "forms": [{
                            "routeRef": "plan", "slotRef": "form",
                            "subject": [
                                {"key": "first_period", "op": "le", "from": {"routeParam": "period"}},
                                {"key": "last_period", "op": "ge", "from": {"routeParam": "period"}}
                            ]
                        }]}]
                    }}]
                }
            ]
        });
        let band_diags = lint_surface(&band_doc);
        assert!(band_diags.iter().any(|d| d.code == crate::LintCode::E610), "{band_diags:?}");
        assert!(band_diags.iter().any(|d| d.code == crate::LintCode::E606), "{band_diags:?}");
    }

    #[test]
    fn screener_destinations_are_local_reachability_edges_only_in_0_3() {
        let mut doc = screener_surface();
        assert!(lint_surface(&doc).is_empty());
        assert!(
            lint(&doc)
                .diagnostics
                .iter()
                .all(|d| d.severity != crate::LintSeverity::Error)
        );
        doc["$formspecSurface"] = serde_json::json!("0.2");
        assert!(
            lint_surface(&doc)
                .iter()
                .any(|d| d.code == crate::LintCode::E606)
        );
    }

    #[test]
    fn direct_screener_destination_requires_inherited_parameters() {
        let mut doc = screener_surface();
        doc["routes"][1]["path"] = serde_json::json!("/apply/{matterId}");
        doc["routes"][1]["params"] = serde_json::json!([{ "name": "matterId", "type": "string" }]);
        assert!(
            lint_surface(&doc)
                .iter()
                .any(|d| d.code == crate::LintCode::E610)
        );
        doc["routes"][0]["path"] = serde_json::json!("/screen/{matterId}");
        doc["routes"][0]["params"] = serde_json::json!([{ "name": "matterId", "type": "string" }]);
        assert!(lint_surface(&doc).is_empty());
    }

    #[test]
    fn embedded_screener_does_not_use_its_own_params_as_host_evidence() {
        let mut doc = screener_surface();
        doc["routes"][1]["path"] = serde_json::json!("/apply/{matterId}");
        doc["routes"][1]["params"] = serde_json::json!([{ "name": "matterId", "type": "string" }]);
        doc["routes"].as_array_mut().unwrap().push(serde_json::json!({
            "id": "host", "path": "/host", "slots": [{ "id": "nested", "slotType": "embed-route", "binding": { "routeRef": "screen" }}]
        }));
        doc["entry"] = serde_json::json!("host");
        assert!(lint_surface(&doc).is_empty());
    }

    #[test]
    fn mixed_embedded_and_direct_screener_keeps_parameter_check() {
        for mode in ["entry", "transition", "screener"] {
            let mut doc = screener_surface();
            doc["routes"][1]["path"] = serde_json::json!("/apply/{matterId}");
            doc["routes"][1]["params"] =
                serde_json::json!([{ "name": "matterId", "type": "string" }]);
            let mut host = serde_json::json!({
                "id": "host", "path": "/host", "slots": [{ "id": "nested", "slotType": "embed-route", "binding": { "routeRef": "screen" }}]
            });
            match mode {
                "entry" => {}
                "transition" => {
                    doc["entry"] = serde_json::json!("host");
                    host["transitions"] = serde_json::json!([{ "on": "go", "to": "screen" }]);
                }
                "screener" => {
                    doc["entry"] = serde_json::json!("host");
                    host["slots"].as_array_mut().unwrap().push(serde_json::json!({
                        "id": "gate", "slotType": "screener", "binding": { "screenerRef": "urn:gate", "allowedTargets": ["surface:screen"] }
                    }));
                }
                _ => unreachable!(),
            }
            doc["routes"].as_array_mut().unwrap().push(host);
            assert!(
                lint_surface(&doc)
                    .iter()
                    .any(|d| d.code == crate::LintCode::E610),
                "direct {mode} must remain checked"
            );
        }
    }

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
            "$formspecSurface": "0.2",
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
            "$formspecSurface": "0.2",
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
            "$formspecSurface": "0.2",
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
            "$formspecSurface": "0.2",
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

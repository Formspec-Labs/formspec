//! Pass 9: Response Actions semantic checks.
#![expect(
    clippy::missing_docs_in_private_items,
    reason = "This private lint pass is documented through its diagnostics and tests."
)]
// Rust guideline compliant 2026-02-21

use std::collections::{HashMap, HashSet};

use formspec_core::visit_component_subtree;
use serde_json::Value;

use crate::semantic_helpers::{
    compatible_version_satisfied, definition_url, definition_version, error, json_path_member,
    target_definition_compatible_versions, target_definition_url, warning,
};
use crate::types::LintDiagnostic;

pub(crate) const PASS: u8 = 9;

pub(crate) fn lint_response_actions(
    doc: &Value,
    definition: Option<&Value>,
    component_documents: &[Value],
) -> Vec<LintDiagnostic> {
    let mut analyzer = Analyzer {
        doc,
        definition,
        component_documents,
        action_ids: collect_action_ids(doc),
        diagnostics: Vec::new(),
    };
    analyzer.check_target_definition();
    analyzer.check_duplicate_action_ids();
    analyzer.check_invalid_validation_overrides();
    analyzer.check_duplicate_durable_effect_idempotency_keys();
    analyzer.check_static_idempotency_keys();
    analyzer.check_service_requests();
    analyzer.check_component_action_refs();
    analyzer.diagnostics
}

/// VM §6.3 permitted-tuple predicate.
///
/// Returns `Some(rationale)` when the (profile, blocking, persistence) tuple
/// fails one of the four VM §6.2 prohibitions. Returns `None` when the tuple
/// is permitted OR when an axis is missing (schema validation owns shape
/// errors; this predicate only judges fully-shaped tuples).
fn vmap_override_violation(
    profile: Option<&str>,
    blocking: Option<&str>,
    persistence: Option<&str>,
) -> Option<&'static str> {
    let (profile, blocking, persistence) = (profile?, blocking?, persistence?);
    if persistence == "complete-response" && blocking != "block-on-error" {
        return Some(
            "complete-response persistence requires block-on-error blocking \
             (VM §6.2 #2 — would let error-severity findings reach completed)",
        );
    }
    if persistence == "complete-response" && profile != "on-submit" {
        return Some(
            "complete-response persistence requires on-submit profile \
             (VM §6.2 #3 — partial report could allow completion)",
        );
    }
    if blocking == "block-on-error" && persistence != "complete-response" {
        return Some(
            "block-on-error blocking requires complete-response persistence \
             (VM §6.2 #5 — blocked draft checkpoints violate VE-05)",
        );
    }
    if profile == "off" && blocking == "block-on-error" {
        return Some(
            "off profile with block-on-error blocking is forbidden \
             (VM §6.2 #4 — no report under off, nothing to block on)",
        );
    }
    None
}

struct Analyzer<'a> {
    doc: &'a Value,
    definition: Option<&'a Value>,
    component_documents: &'a [Value],
    action_ids: HashSet<String>,
    diagnostics: Vec<LintDiagnostic>,
}

impl Analyzer<'_> {
    fn check_target_definition(&mut self) {
        if is_app_scope(self.doc) {
            return;
        }
        let Some(definition) = self.definition else {
            return;
        };
        if let (Some(target_url), Some(def_url)) =
            (target_definition_url(self.doc), definition_url(definition))
            && target_url != def_url
        {
            self.diagnostics.push(error(
                crate::LintCode::E1800,
                PASS,
                "$.targetDefinition.url",
                format!(
                    "Response Actions targetDefinition.url ({target_url:?}) does not match paired Definition url ({def_url:?})"
                ),
            ));
        }
        if let (Some(range), Some(version)) = (
            target_definition_compatible_versions(self.doc),
            definition_version(definition),
        ) && compatible_version_satisfied(range, version) != Some(true)
        {
            self.diagnostics.push(warning(
                crate::LintCode::W1800,
                PASS,
                "$.targetDefinition.compatibleVersions",
                format!(
                    "Response Actions compatibleVersions ({range:?}) does not confidently include paired Definition version ({version:?})"
                ),
            ));
        }
    }

    fn check_duplicate_action_ids(&mut self) {
        let Some(actions) = self.doc.get("actions").and_then(Value::as_array) else {
            return;
        };
        let mut first_paths = HashMap::<String, String>::new();
        for (index, action) in actions.iter().enumerate() {
            let Some(id) = action.get("id").and_then(Value::as_str) else {
                continue;
            };
            let path = format!("$.actions[{index}].id");
            if let Some(first_path) = first_paths.get(id) {
                self.diagnostics.push(error(
                    crate::LintCode::E1801,
                    PASS,
                    path,
                    format!(
                        "Response Actions action id {id:?} duplicates an earlier action at {first_path}"
                    ),
                ));
            } else {
                first_paths.insert(id.to_string(), path);
            }
        }
    }

    fn check_invalid_validation_overrides(&mut self) {
        let Some(actions) = self.doc.get("actions").and_then(Value::as_array) else {
            return;
        };
        for (index, action) in actions.iter().enumerate() {
            if is_app_scope(self.doc) {
                let validation = action.get("validation").and_then(Value::as_object);
                let profile = validation
                    .and_then(|value| value.get("profile"))
                    .and_then(Value::as_str);
                let blocking = validation
                    .and_then(|value| value.get("blocking"))
                    .and_then(Value::as_str);
                let persistence = validation
                    .and_then(|value| value.get("persistence"))
                    .and_then(Value::as_str);
                if (profile, blocking, persistence)
                    != (Some("off"), Some("non-blocking"), Some("none"))
                {
                    let id = action
                        .get("id")
                        .and_then(Value::as_str)
                        .unwrap_or("<unknown>");
                    self.diagnostics.push(error(
                        crate::LintCode::E1803,
                        PASS,
                        format!("$.actions[{index}].validation"),
                        format!(
                            "VMAP-INVALID-OVERRIDE: App Action {id:?} must use \
                             profile=off, blocking=non-blocking, persistence=none \
                             because app scope has no Response to validate or persist"
                        ),
                    ));
                }
                continue;
            }
            let Some(validation) = action.get("validation").and_then(Value::as_object) else {
                continue;
            };
            let profile = validation.get("profile").and_then(Value::as_str);
            let blocking = validation.get("blocking").and_then(Value::as_str);
            let persistence = validation.get("persistence").and_then(Value::as_str);
            if let Some(rationale) = vmap_override_violation(profile, blocking, persistence) {
                let id = action
                    .get("id")
                    .and_then(Value::as_str)
                    .unwrap_or("<unknown>");
                self.diagnostics.push(error(
                    crate::LintCode::E1803,
                    PASS,
                    format!("$.actions[{index}].validation"),
                    format!(
                        "VMAP-INVALID-OVERRIDE: Action {id:?} validation override \
                         (profile={profile:?}, blocking={blocking:?}, persistence={persistence:?}) \
                         violates the VM §6.3 permitted-tuple predicate: {rationale}"
                    ),
                ));
            }
        }
    }

    fn check_duplicate_durable_effect_idempotency_keys(&mut self) {
        let Some(actions) = self.doc.get("actions").and_then(Value::as_array) else {
            return;
        };
        for (action_index, action) in actions.iter().enumerate() {
            let Some(effects) = action.get("effects").and_then(Value::as_array) else {
                continue;
            };
            let id = action
                .get("id")
                .and_then(Value::as_str)
                .unwrap_or("<unknown>");
            let mut first_paths = HashMap::<String, String>::new();
            for (effect_index, effect) in effects.iter().enumerate() {
                if !is_durable_effect(effect) {
                    continue;
                }
                let Some(key) = effect.get("idempotencyKey").and_then(Value::as_str) else {
                    continue;
                };
                let path =
                    format!("$.actions[{action_index}].effects[{effect_index}].idempotencyKey");
                if let Some(first_path) = first_paths.get(key) {
                    self.diagnostics.push(error(
                        crate::LintCode::E1804,
                        PASS,
                        path,
                        format!(
                            "Response Action {id:?} durable effect[{effect_index}] idempotencyKey {key:?} \
                             duplicates an earlier durable effect at {first_path}; durable effects in one \
                             action must not alias the same idempotent execution record."
                        ),
                    ));
                } else {
                    first_paths.insert(key.to_owned(), path);
                }
            }
        }
    }

    fn check_static_idempotency_keys(&mut self) {
        let Some(actions) = self.doc.get("actions").and_then(Value::as_array) else {
            return;
        };
        for (action_index, action) in actions.iter().enumerate() {
            let Some(effects) = action.get("effects").and_then(Value::as_array) else {
                continue;
            };
            for (effect_index, effect) in effects.iter().enumerate() {
                let Some(key) = effect.get("idempotencyKey").and_then(Value::as_str) else {
                    continue;
                };
                if key.contains('@') {
                    continue;
                }
                let id = action
                    .get("id")
                    .and_then(Value::as_str)
                    .unwrap_or("<unknown>");
                self.diagnostics.push(warning(
                    crate::LintCode::W1802,
                    PASS,
                    format!(
                        "$.actions[{action_index}].effects[{effect_index}].idempotencyKey"
                    ),
                    format!(
                        "Response Action {id:?} effect[{effect_index}] idempotencyKey {key:?} \
                         contains no @-binding; a literal-string key produces the same value for every \
                         invocation, silently defeating idempotency. Use a FEL expression like \
                         \"@invocation.id & '/<effect-name>'\" so the key varies per invocation."
                    ),
                ));
            }
        }
    }

    fn check_service_requests(&mut self) {
        self.diagnostics
            .extend(service_request_diagnostics(self.doc));
    }

    fn check_component_action_refs(&mut self) {
        if self.component_documents.is_empty() {
            return;
        }
        for (doc_index, component_doc) in self.component_documents.iter().enumerate() {
            if let Some(tree) = component_doc.get("tree") {
                self.check_component_tree(tree, &format!("$.componentDocuments[{doc_index}].tree"));
            }
            if let Some(components) = component_doc.get("components").and_then(Value::as_object) {
                for (name, component) in components {
                    if let Some(tree) = component.get("tree") {
                        let base = json_path_member(
                            &format!("$.componentDocuments[{doc_index}].components"),
                            name,
                        );
                        self.check_component_tree(tree, &format!("{base}.tree"));
                    }
                }
            }
        }
    }

    fn check_component_tree(&mut self, tree: &Value, base_path: &str) {
        let child_seg = |parent: &str, index: usize| format!("{parent}.children[{index}]");
        visit_component_subtree(tree, base_path, &child_seg, &mut |node, path| {
            if node.get("component").and_then(Value::as_str) != Some("ActionButton") {
                return;
            }
            let Some(action_ref) = node.get("actionRef").and_then(Value::as_str) else {
                return;
            };
            if !self.action_ids.contains(action_ref) {
                self.diagnostics.push(error(
                    crate::LintCode::E1802,
                    PASS,
                    format!("{path}.actionRef"),
                    format!(
                        "ActionButton actionRef {action_ref:?} does not resolve to any Response Actions actions[].id"
                    ),
                ));
            }
        });
    }
}

fn is_durable_effect(effect: &Value) -> bool {
    matches!(
        effect.get("type").and_then(Value::as_str),
        Some(
            "mappingExecution"
                | "ledgerAppend"
                | "handoffAssembly"
                | "evidenceRequest"
                | "serviceRequest"
        )
    )
}

fn service_request_diagnostics(doc: &Value) -> Vec<LintDiagnostic> {
    let mut diagnostics = Vec::new();
    let requests = doc
        .get("x-formspec-runtime")
        .and_then(|runtime| runtime.get("requests"))
        .and_then(Value::as_array);
    let mut requests_by_id = HashMap::<String, Vec<usize>>::new();

    if let Some(requests) = requests {
        for (request_index, request) in requests.iter().enumerate() {
            let Some(id) = request.get("id").and_then(Value::as_str) else {
                continue;
            };
            let prior = requests_by_id.entry(id.to_owned()).or_default();
            if let Some(first_index) = prior.first() {
                diagnostics.push(service_request_error(
                    format!("$.x-formspec-runtime.requests[{request_index}].id"),
                    format!(
                        "Runtime request id {id:?} duplicates the request at \
                         $.x-formspec-runtime.requests[{first_index}].id; request ids must be unique."
                    ),
                ));
            }
            prior.push(request_index);
            check_runtime_request(request, request_index, &mut diagnostics);
        }
    }

    if let Some(actions) = doc.get("actions").and_then(Value::as_array) {
        for (action_index, action) in actions.iter().enumerate() {
            let Some(effects) = action.get("effects").and_then(Value::as_array) else {
                continue;
            };
            for (effect_index, effect) in effects.iter().enumerate() {
                if effect.get("type").and_then(Value::as_str) != Some("serviceRequest") {
                    continue;
                }
                let path = format!("$.actions[{action_index}].effects[{effect_index}].requestRef");
                let Some(request_ref) = effect.get("requestRef").and_then(Value::as_str) else {
                    diagnostics.push(service_request_error(
                        path,
                        "serviceRequest effect has no requestRef.".to_owned(),
                    ));
                    continue;
                };
                match requests_by_id.get(request_ref).map(Vec::len) {
                    Some(1) => {}
                    Some(count) => diagnostics.push(service_request_error(
                        path,
                        format!(
                            "serviceRequest requestRef {request_ref:?} is ambiguous because the runtime catalog publishes {count} requests with that id."
                        ),
                    )),
                    None => diagnostics.push(service_request_error(
                        path,
                        format!(
                            "serviceRequest requestRef {request_ref:?} does not resolve to one x-formspec-runtime.requests[].id."
                        ),
                    )),
                }
            }
        }
    }

    diagnostics
}

fn service_request_error(path: String, message: String) -> LintDiagnostic {
    error(crate::LintCode::E1805, PASS, path, message)
}

fn check_runtime_request(
    request: &Value,
    request_index: usize,
    diagnostics: &mut Vec<LintDiagnostic>,
) {
    let base = format!("$.x-formspec-runtime.requests[{request_index}]");
    if request.get("adapter").and_then(Value::as_str) != Some("http-json") {
        diagnostics.push(service_request_error(
            format!("{base}.adapter"),
            "Runtime requests must use the closed http-json adapter.".to_owned(),
        ));
    }

    let Some(http) = request.get("request").and_then(Value::as_object) else {
        diagnostics.push(service_request_error(
            format!("{base}.request"),
            "Runtime request has no structured HTTP request.".to_owned(),
        ));
        return;
    };
    let http_base = format!("{base}.request");
    let method = http.get("method").and_then(Value::as_str);
    if !matches!(method, Some("POST" | "PUT" | "PATCH" | "DELETE")) {
        diagnostics.push(service_request_error(
            format!("{http_base}.method"),
            format!(
                "HTTP method {method:?} is not a supported mutation method; use POST, PUT, PATCH, or DELETE."
            ),
        ));
    }

    let path_template = http.get("pathTemplate").and_then(Value::as_str);
    let placeholders = match path_template {
        Some(path) if safe_request_path(path) => match path_placeholders(path) {
            Ok(placeholders) => Some(placeholders),
            Err(reason) => {
                diagnostics.push(service_request_error(
                    format!("{http_base}.pathTemplate"),
                    format!("HTTP pathTemplate is malformed: {reason}."),
                ));
                None
            }
        },
        Some(path) => {
            diagnostics.push(service_request_error(
                format!("{http_base}.pathTemplate"),
                format!(
                    "HTTP pathTemplate {path:?} is unsafe; use one same-origin absolute path without query, fragment, backslash, repeated slash, or dot-segment escapes."
                ),
            ));
            None
        }
        None => {
            diagnostics.push(service_request_error(
                format!("{http_base}.pathTemplate"),
                "Runtime request has no pathTemplate.".to_owned(),
            ));
            None
        }
    };

    let path_bindings = http.get("pathBindings").and_then(Value::as_object);
    if let Some(placeholders) = placeholders {
        let bound = path_bindings
            .map(|bindings| bindings.keys().cloned().collect::<HashSet<_>>())
            .unwrap_or_default();
        let mut missing = placeholders.difference(&bound).cloned().collect::<Vec<_>>();
        let mut extra = bound.difference(&placeholders).cloned().collect::<Vec<_>>();
        missing.sort();
        extra.sort();
        if !missing.is_empty() || !extra.is_empty() {
            diagnostics.push(service_request_error(
                format!("{http_base}.pathBindings"),
                format!(
                    "pathBindings must match pathTemplate placeholders exactly; missing={missing:?}, extra={extra:?}."
                ),
            ));
        }
    }

    for member in ["pathBindings", "queryBindings", "bodyBindings"] {
        check_selector_map(
            http.get(member),
            &format!("{http_base}.{member}"),
            diagnostics,
        );
    }

    if let Some(headers) = http.get("headerBindings").and_then(Value::as_object) {
        let mut normalized_names = HashMap::<String, String>::new();
        for (name, selector) in headers {
            let path = json_path_member(&format!("{http_base}.headerBindings"), name);
            let normalized = name.to_ascii_lowercase();
            if let Some(prior) = normalized_names.insert(normalized, name.clone()) {
                diagnostics.push(service_request_error(
                    path.clone(),
                    format!(
                        "Authored header {name:?} duplicates {prior:?} after case-insensitive HTTP header normalization."
                    ),
                ));
            }
            if !safe_authored_header(name) {
                diagnostics.push(service_request_error(
                    path.clone(),
                    format!(
                        "Authored header {name:?} is unsafe or host-owned; credentials, scope, idempotency, representation, and hop-by-hop headers cannot come from artifact data."
                    ),
                ));
            }
            check_selector(selector, &path, diagnostics);
        }
    } else if http.get("headerBindings").is_some() {
        diagnostics.push(service_request_error(
            format!("{http_base}.headerBindings"),
            "headerBindings must be an object.".to_owned(),
        ));
    }

    if let Some(bindings) = http.get("bodyBindings").and_then(Value::as_object) {
        for pointer in bindings.keys() {
            if !safe_json_pointer(pointer) {
                diagnostics.push(service_request_error(
                    json_path_member(&format!("{http_base}.bodyBindings"), pointer),
                    format!("Body target {pointer:?} is not a safe non-root JSON Pointer."),
                ));
            }
        }
    }

    if let Some(outputs) = request.get("outputs").and_then(Value::as_object) {
        for (name, output) in outputs {
            let path = json_path_member(&format!("{base}.outputs"), name);
            if !binding_name(name) {
                diagnostics.push(service_request_error(
                    path.clone(),
                    format!("Runtime output name {name:?} is not a safe binding name."),
                ));
            }
            let Some(output) = output.as_object() else {
                diagnostics.push(service_request_error(
                    path,
                    "Runtime output must be an object.".to_owned(),
                ));
                continue;
            };
            match output.get("path").and_then(Value::as_str) {
                Some(pointer) if safe_json_pointer(pointer) => {}
                Some(pointer) => diagnostics.push(service_request_error(
                    format!("{path}.path"),
                    format!("Runtime output path {pointer:?} is not a safe non-root JSON Pointer."),
                )),
                None => diagnostics.push(service_request_error(
                    format!("{path}.path"),
                    "Runtime output has no response JSON Pointer.".to_owned(),
                )),
            }
            if !matches!(
                output.get("exposure").and_then(Value::as_str),
                None | Some("internal" | "transition" | "session")
            ) {
                diagnostics.push(service_request_error(
                    format!("{path}.exposure"),
                    "Runtime output exposure must be internal, transition, or session.".to_owned(),
                ));
            }
        }
    } else if request.get("outputs").is_some() {
        diagnostics.push(service_request_error(
            format!("{base}.outputs"),
            "Runtime request outputs must be an object.".to_owned(),
        ));
    }
}

fn check_selector_map(value: Option<&Value>, base: &str, diagnostics: &mut Vec<LintDiagnostic>) {
    let Some(value) = value else {
        return;
    };
    let Some(bindings) = value.as_object() else {
        diagnostics.push(service_request_error(
            base.to_owned(),
            "Runtime bindings must be an object.".to_owned(),
        ));
        return;
    };
    for (name, selector) in bindings {
        check_selector(selector, &json_path_member(base, name), diagnostics);
    }
}

fn check_selector(selector: &Value, path: &str, diagnostics: &mut Vec<LintDiagnostic>) {
    let Some(selector) = selector.as_object() else {
        diagnostics.push(service_request_error(
            path.to_owned(),
            "Runtime selector must be an object.".to_owned(),
        ));
        return;
    };
    let source = selector.get("from").and_then(Value::as_str);
    if source == Some("literal") {
        if !selector.contains_key("value") || selector.contains_key("path") {
            diagnostics.push(service_request_error(
                path.to_owned(),
                "Literal selectors require value and must omit path.".to_owned(),
            ));
        }
        return;
    }
    if !matches!(source, Some("input" | "route" | "session" | "result")) {
        diagnostics.push(service_request_error(
            format!("{path}.from"),
            format!("Runtime selector source {source:?} is not in the closed source catalog."),
        ));
        return;
    }
    if selector.contains_key("value") {
        diagnostics.push(service_request_error(
            path.to_owned(),
            "Non-literal selectors must omit value.".to_owned(),
        ));
    }
    match selector.get("path").and_then(Value::as_str) {
        Some(candidate) if safe_own_path(candidate) => {}
        Some(candidate) => diagnostics.push(service_request_error(
            format!("{path}.path"),
            format!("Runtime selector path {candidate:?} is not a safe own-property path."),
        )),
        None => diagnostics.push(service_request_error(
            format!("{path}.path"),
            "Non-literal selector has no path.".to_owned(),
        )),
    }
}

fn binding_name(value: &str) -> bool {
    let mut characters = value.chars();
    matches!(characters.next(), Some(first) if first.is_ascii_alphabetic())
        && characters
            .all(|character| character.is_ascii_alphanumeric() || matches!(character, '_' | '-'))
}

fn path_binding_name(value: &str) -> bool {
    let mut characters = value.chars();
    matches!(characters.next(), Some(first) if first.is_ascii_alphabetic())
        && characters.all(|character| character.is_ascii_alphanumeric() || character == '_')
}

fn safe_own_path(path: &str) -> bool {
    !path.is_empty() && path.split('.').all(|segment| {
        segment != "__proto__" && segment != "prototype" && segment != "constructor" && {
            let mut characters = segment.chars();
            matches!(characters.next(), Some(first) if first.is_ascii_alphabetic() || first == '_')
                && characters.all(|character| {
                    character.is_ascii_alphanumeric() || matches!(character, '_' | '-')
                })
        }
    })
}

fn safe_request_path(path: &str) -> bool {
    if !path.starts_with('/')
        || path.starts_with("//")
        || path.contains("//")
        || path.contains(['?', '#', '\\'])
        || path.chars().any(char::is_control)
    {
        return false;
    }
    let lower = path.to_ascii_lowercase();
    if lower.contains("%2e") || lower.contains("%2f") || lower.contains("%5c") {
        return false;
    }
    !path.split('/').any(|segment| matches!(segment, "." | ".."))
}

fn path_placeholders(path: &str) -> Result<HashSet<String>, &'static str> {
    let mut placeholders = HashSet::new();
    let mut characters = path.chars().peekable();
    while let Some(character) = characters.next() {
        match character {
            '{' => {
                let mut name = String::new();
                loop {
                    match characters.next() {
                        Some('}') => break,
                        Some('{') => return Err("nested opening brace"),
                        Some(next) => name.push(next),
                        None => return Err("unclosed opening brace"),
                    }
                }
                if !path_binding_name(&name) {
                    return Err("placeholder name is not a safe path-binding name");
                }
                placeholders.insert(name);
            }
            '}' => return Err("closing brace has no opening brace"),
            _ => {}
        }
    }
    Ok(placeholders)
}

fn safe_authored_header(name: &str) -> bool {
    if name.is_empty()
        || !name.chars().all(|character| {
            character.is_ascii_alphanumeric()
                || matches!(
                    character,
                    '!' | '#'
                        | '$'
                        | '%'
                        | '&'
                        | '\''
                        | '*'
                        | '+'
                        | '-'
                        | '.'
                        | '^'
                        | '_'
                        | '`'
                        | '|'
                        | '~'
                )
        })
    {
        return false;
    }
    let normalized = name.to_ascii_lowercase();
    !matches!(
        normalized.as_str(),
        "accept"
            | "authorization"
            | "connection"
            | "content-length"
            | "content-type"
            | "cookie"
            | "host"
            | "idempotency-key"
            | "origin"
            | "proxy-authorization"
            | "referer"
            | "te"
            | "trailer"
            | "transfer-encoding"
            | "upgrade"
            | "user-agent"
    ) && !normalized.starts_with("proxy-")
        && !normalized.starts_with("sec-")
        && !normalized.starts_with("x-formspec-")
}

fn safe_json_pointer(pointer: &str) -> bool {
    if !pointer.starts_with('/') || pointer.len() == 1 {
        return false;
    }
    pointer.split('/').skip(1).all(|segment| {
        let mut decoded = String::new();
        let mut characters = segment.chars();
        while let Some(character) = characters.next() {
            if character != '~' {
                decoded.push(character);
                continue;
            }
            match characters.next() {
                Some('0') => decoded.push('~'),
                Some('1') => decoded.push('/'),
                _ => return false,
            }
        }
        !matches!(decoded.as_str(), "__proto__" | "prototype" | "constructor")
    })
}

fn is_app_scope(doc: &Value) -> bool {
    doc.get("scope").and_then(Value::as_str) == Some("app")
}

fn collect_action_ids(doc: &Value) -> HashSet<String> {
    doc.get("actions")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(|action| action.get("id").and_then(Value::as_str))
        .map(ToOwned::to_owned)
        .collect()
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::lint_response_actions;

    fn response_actions() -> serde_json::Value {
        json!({
            "$formspecResponseActions": "1.0",
            "version": "1.0.0",
            "targetDefinition": {
                "url": "https://example.gov/forms/intake",
                "compatibleVersions": ">=1.0.0 <2.0.0"
            },
            "actions": [
                {
                    "id": "send-application",
                    "intent": "submit",
                    "effects": [
                        { "type": "hostEvent", "eventName": "formspec-submit" }
                    ]
                }
            ]
        })
    }

    fn definition() -> serde_json::Value {
        json!({
            "$formspec": "1.0",
            "url": "https://example.gov/forms/intake",
            "version": "1.2.0",
            "title": "Intake",
            "items": []
        })
    }

    #[test]
    fn matching_definition_and_component_refs_produce_no_diagnostics() {
        let component = json!({
            "$formspecComponent": "1.0",
            "version": "1.0.0",
            "targetDefinition": { "url": "https://example.gov/forms/intake" },
            "tree": {
                "component": "Stack",
                "children": [
                    { "component": "ActionButton", "actionRef": "send-application" }
                ]
            }
        });

        let diags = lint_response_actions(&response_actions(), Some(&definition()), &[component]);

        assert!(diags.is_empty(), "{diags:#?}");
    }

    #[test]
    fn target_definition_mismatch_emits_e1800() {
        let def = json!({
            "$formspec": "1.0",
            "url": "https://example.gov/forms/other",
            "version": "1.2.0",
            "title": "Other",
            "items": []
        });

        let diags = lint_response_actions(&response_actions(), Some(&def), &[]);

        assert!(diags.iter().any(|diag| diag.code == crate::LintCode::E1800));
    }

    #[test]
    fn compatible_versions_mismatch_emits_w1800() {
        let def = json!({
            "$formspec": "1.0",
            "url": "https://example.gov/forms/intake",
            "version": "2.0.0",
            "title": "Intake",
            "items": []
        });

        let diags = lint_response_actions(&response_actions(), Some(&def), &[]);

        assert!(diags.iter().any(|diag| diag.code == crate::LintCode::W1800));
    }

    #[test]
    fn app_scope_skips_definition_pairing_and_accepts_the_no_response_tuple() {
        let app_actions = json!({
            "$formspecResponseActions": "1.0",
            "version": "1.0.0",
            "scope": "app",
            "actions": [{
                "id": "open-resource",
                "intent": "x-open-resource",
                "validation": {
                    "profile": "off",
                    "blocking": "non-blocking",
                    "persistence": "none"
                },
                "effects": [{
                    "type": "browserResource",
                    "operation": "open",
                    "resourceRef": "resource"
                }]
            }]
        });
        let other_definition = json!({
            "$formspec": "1.0",
            "url": "https://example.gov/forms/unrelated",
            "version": "9.0.0",
            "title": "Unrelated",
            "items": []
        });

        let diags = lint_response_actions(&app_actions, Some(&other_definition), &[]);

        assert!(diags.is_empty(), "{diags:#?}");
    }

    #[test]
    fn app_scope_rejects_response_validation_or_persistence() {
        let app_actions = json!({
            "$formspecResponseActions": "1.0",
            "version": "1.0.0",
            "scope": "app",
            "actions": [{
                "id": "mis-scoped-review",
                "intent": "review",
                "effects": [{ "type": "hostEvent", "eventName": "review" }]
            }]
        });

        let diags = lint_response_actions(&app_actions, None, &[]);

        assert!(diags.iter().any(|diag| diag.code == crate::LintCode::E1803));
    }

    #[test]
    fn duplicate_action_ids_emit_e1801() {
        let mut actions = response_actions();
        actions["actions"].as_array_mut().unwrap().push(json!({
            "id": "send-application",
            "intent": "save-draft",
            "effects": [
                { "type": "hostEvent", "eventName": "formspec-submit" }
            ]
        }));

        let diags = lint_response_actions(&actions, None, &[]);

        assert!(diags.iter().any(|diag| diag.code == crate::LintCode::E1801));
    }

    #[test]
    fn duplicate_durable_effect_idempotency_keys_emit_e1804() {
        let mut doc = response_actions();
        doc["actions"][0]["effects"] = json!([
            {
                "type": "mappingExecution",
                "mappingRef": "applicationPayload",
                "idempotencyKey": "@invocation.id & '/durable'"
            },
            {
                "type": "hostEvent",
                "eventName": "formspec-submit"
            },
            {
                "type": "ledgerAppend",
                "eventKind": "response.submit-attempted",
                "idempotencyKey": "@invocation.id & '/durable'"
            }
        ]);

        let diags = lint_response_actions(&doc, None, &[]);

        let duplicate_key_diag = diags
            .iter()
            .find(|diag| diag.code == crate::LintCode::E1804)
            .expect("E1804 not emitted");
        assert_eq!(
            duplicate_key_diag.path,
            "$.actions[0].effects[2].idempotencyKey"
        );
        assert_eq!(
            duplicate_key_diag.severity,
            crate::types::LintSeverity::Error
        );
    }

    #[test]
    fn valid_service_request_contract_emits_no_e1805() {
        let doc = json!({
            "$formspecResponseActions": "1.0",
            "version": "1.0.0",
            "scope": "app",
            "actions": [{
                "id": "create-form",
                "intent": "x-create-form",
                "validation": {
                    "profile": "off",
                    "blocking": "non-blocking",
                    "persistence": "none"
                },
                "effects": [{
                    "type": "serviceRequest",
                    "requestRef": "create-form-request",
                    "idempotencyKey": "@invocation.id & '/create-form'"
                }]
            }],
            "x-formspec-runtime": {
                "version": "1.0",
                "requests": [{
                    "id": "create-form-request",
                    "adapter": "http-json",
                    "request": {
                        "method": "POST",
                        "pathTemplate": "/forms/{formId}",
                        "pathBindings": {
                            "formId": { "from": "route", "path": "formId" }
                        },
                        "headerBindings": {
                            "if-match": { "from": "input", "path": "etag" }
                        },
                        "bodyDefaults": { "published": false },
                        "bodyBindings": {
                            "/slug": { "from": "input", "path": "data.slug" },
                            "/actor/id": { "from": "session", "path": "principalId" }
                        }
                    },
                    "outputs": {
                        "createdFormId": {
                            "path": "/form_id",
                            "exposure": "transition"
                        },
                        "audit": {
                            "path": "/audit",
                            "exposure": "internal"
                        },
                        "draftSession": {
                            "path": "/session_token",
                            "exposure": "session"
                        }
                    }
                }]
            }
        });

        let diagnostics = lint_response_actions(&doc, None, &[]);

        assert!(
            !diagnostics
                .iter()
                .any(|diagnostic| diagnostic.code == crate::LintCode::E1805),
            "valid service request produced E1805: {diagnostics:#?}"
        );
    }

    #[test]
    fn duplicate_and_unresolved_service_requests_emit_e1805() {
        let doc: serde_json::Value = serde_json::from_str(include_str!(
            "../../../tests/fixtures/lint/E1805-response-actions-service-request-invalid.json"
        ))
        .expect("E1805 fixture must be valid JSON");

        let diagnostics = lint_response_actions(&doc, None, &[]);
        let service_diagnostics = diagnostics
            .iter()
            .filter(|diagnostic| diagnostic.code == crate::LintCode::E1805)
            .collect::<Vec<_>>();

        assert!(
            service_diagnostics
                .iter()
                .any(|diagnostic| diagnostic.path.ends_with("requests[1].id")),
            "duplicate request id was not reported: {service_diagnostics:#?}"
        );
        assert!(
            service_diagnostics
                .iter()
                .any(|diagnostic| diagnostic.path.ends_with("requestRef")),
            "unresolved requestRef was not reported: {service_diagnostics:#?}"
        );
    }

    #[test]
    fn unsafe_request_transport_and_placeholder_mismatch_emit_e1805() {
        let mut doc = response_actions();
        doc["actions"][0]["effects"] = json!([{
            "type": "serviceRequest",
            "requestRef": "unsafe-request",
            "idempotencyKey": "@invocation.id & '/unsafe'"
        }]);
        doc["x-formspec-runtime"] = json!({
            "version": "1.0",
            "requests": [
                {
                    "id": "unsafe-request",
                    "adapter": "http-json",
                    "request": {
                        "method": "GET",
                        "pathTemplate": "//outside.example/../responses",
                        "headerBindings": {
                            "If-Match": { "from": "input", "path": "etag" },
                            "if-match": { "from": "input", "path": "etag" },
                            "Authorization": { "from": "session", "path": "accessToken" },
                            "X-Formspec-Tenant": { "from": "session", "path": "tenantId" }
                        }
                    }
                },
                {
                    "id": "placeholder-mismatch",
                    "adapter": "http-json",
                    "request": {
                        "method": "POST",
                        "pathTemplate": "/forms/{formId}",
                        "pathBindings": {
                            "wrongId": { "from": "route", "path": "formId" }
                        }
                    }
                }
            ]
        });

        let diagnostics = lint_response_actions(&doc, None, &[]);
        let messages = diagnostics
            .iter()
            .filter(|diagnostic| diagnostic.code == crate::LintCode::E1805)
            .map(|diagnostic| diagnostic.message.as_str())
            .collect::<Vec<_>>();

        assert!(
            messages
                .iter()
                .any(|message| message.contains("mutation method"))
        );
        assert!(messages.iter().any(|message| message.contains("unsafe")));
        assert!(
            messages
                .iter()
                .any(|message| message.contains("case-insensitive"))
        );
        assert!(
            messages
                .iter()
                .any(|message| message.contains("pathBindings must match"))
        );
        assert!(
            messages
                .iter()
                .filter(|message| message.contains("host-owned"))
                .count()
                >= 2
        );
    }

    #[test]
    fn invalid_selectors_body_targets_and_output_exposure_emit_e1805() {
        let mut doc = response_actions();
        doc["actions"][0]["effects"] = json!([{
            "type": "serviceRequest",
            "requestRef": "bad-bindings",
            "idempotencyKey": "@invocation.id & '/bad-bindings'"
        }]);
        doc["x-formspec-runtime"] = json!({
            "version": "1.0",
            "requests": [{
                "id": "bad-bindings",
                "adapter": "http-json",
                "request": {
                    "method": "POST",
                    "pathTemplate": "/forms",
                    "bodyBindings": {
                        "/__proto__/polluted": {
                            "from": "input",
                            "path": "data.__proto__.value"
                        },
                        "/literal": {
                            "from": "literal",
                            "path": "not-allowed"
                        }
                    }
                },
                "outputs": {
                    "responseId": {
                        "path": "/constructor/id",
                        "exposure": "route"
                    }
                }
            }]
        });

        let diagnostics = lint_response_actions(&doc, None, &[]);
        let paths = diagnostics
            .iter()
            .filter(|diagnostic| diagnostic.code == crate::LintCode::E1805)
            .map(|diagnostic| diagnostic.path.as_str())
            .collect::<Vec<_>>();

        assert!(paths.iter().any(|path| path.ends_with(".path")));
        assert!(paths.iter().any(|path| path.contains("bodyBindings")));
        assert!(paths.iter().any(|path| path.ends_with(".exposure")));
    }

    #[test]
    fn unresolved_component_action_ref_emits_e1802_at_error_severity() {
        // Component spec §5.19 Resolver Invariants mandate error severity for
        // unresolved actionRef. A warning would let broken docs sneak past
        // `lint --deny error` gates, defeating the trust contract that the
        // ActionButton resolver never silently degrades.
        let component = json!({
            "$formspecComponent": "1.0",
            "version": "1.0.0",
            "targetDefinition": { "url": "https://example.gov/forms/intake" },
            "tree": {
                "component": "Stack",
                "children": [
                    { "component": "ActionButton", "actionRef": "missing-action" }
                ]
            }
        });

        let diags = lint_response_actions(&response_actions(), None, &[component]);

        let actionref_diag = diags
            .iter()
            .find(|diag| diag.code == crate::LintCode::E1802)
            .expect("E1802 not emitted");
        assert_eq!(
            actionref_diag.severity,
            crate::types::LintSeverity::Error,
            "E1802 MUST be error severity per Component §5.19 Resolver Invariants"
        );
    }

    #[test]
    fn invalid_validation_override_emits_e1803_vmap_invalid_override() {
        // VM §6.2 prohibition #5: block-on-error with non-complete-response
        // persistence creates an incoherent blocked-draft state. Processors
        // MUST reject with VMAP-INVALID-OVERRIDE per §8.1.2.
        let mut doc = response_actions();
        doc["actions"][0]["validation"] = json!({
            "profile": "live",
            "blocking": "block-on-error",
            "persistence": "draft-checkpoint"
        });

        let diags = lint_response_actions(&doc, None, &[]);

        let vmap_diag = diags
            .iter()
            .find(|d| d.code == crate::LintCode::E1803)
            .expect("E1803 not emitted for VMAP-INVALID-OVERRIDE tuple");
        assert_eq!(vmap_diag.severity, crate::types::LintSeverity::Error);
        assert!(
            vmap_diag.message.contains("VMAP-INVALID-OVERRIDE"),
            "diagnostic message must carry the spec-mandated VMAP-INVALID-OVERRIDE string \
             code so TS runtime + Rust lint emit the same surface: {:?}",
            vmap_diag.message
        );
    }

    #[test]
    fn valid_master_table_override_emits_no_e1803() {
        // The submit master-table row is a permitted tuple. An override that
        // restates it MUST NOT trip the predicate.
        let mut doc = response_actions();
        doc["actions"][0]["validation"] = json!({
            "profile": "on-submit",
            "blocking": "block-on-error",
            "persistence": "complete-response"
        });

        let diags = lint_response_actions(&doc, None, &[]);

        assert!(
            !diags.iter().any(|d| d.code == crate::LintCode::E1803),
            "permitted-tuple override must not emit E1803: {diags:#?}"
        );
    }
}

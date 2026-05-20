//! Shared helpers for companion-document semantic lint passes.
#![allow(clippy::missing_docs_in_private_items)]

use std::collections::{HashMap, HashSet};

use formspec_core::visit_component_subtree;
use serde_json::Value;

use crate::metadata;
use crate::tree::{ItemRef, ItemTreeIndex};
use crate::types::LintDiagnostic;

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) enum StrictPathSegment {
    Root,
    Exact(String),
    Wildcard,
    Indexed(usize),
    Special(String),
}

impl StrictPathSegment {
    pub(crate) fn normalized(&self) -> Option<String> {
        match self {
            StrictPathSegment::Root => Some("#".to_string()),
            StrictPathSegment::Exact(value) | StrictPathSegment::Special(value) => {
                Some(value.clone())
            }
            StrictPathSegment::Wildcard => Some("[*]".to_string()),
            StrictPathSegment::Indexed(index) => Some(format!("[{index}]")),
        }
    }
}

pub(crate) fn error(
    code: crate::LintCode,
    pass: u8,
    path: impl Into<String>,
    message: impl Into<String>,
) -> LintDiagnostic {
    metadata::with_metadata(LintDiagnostic::error(code, pass, path, message))
}

pub(crate) fn warning(
    code: crate::LintCode,
    pass: u8,
    path: impl Into<String>,
    message: impl Into<String>,
) -> LintDiagnostic {
    metadata::with_metadata(LintDiagnostic::warning(code, pass, path, message))
}

pub(crate) fn parse_form_path(
    path: &str,
    allow_root: bool,
) -> Result<Vec<StrictPathSegment>, String> {
    if allow_root && path == "#" {
        return Ok(vec![StrictPathSegment::Root]);
    }
    parse_strict_path(path, PathFlavor::Form)
}

pub(crate) fn parse_mapping_target_path(
    path: &str,
    target_format: &str,
) -> Result<Vec<StrictPathSegment>, String> {
    match target_format {
        "csv" => parse_csv_path(path),
        "json" => parse_strict_path(path, PathFlavor::Json),
        "xml" => parse_strict_path(path, PathFlavor::Xml),
        custom if custom.starts_with("x-") => {
            if path.trim().is_empty() {
                Err("custom target path must not be empty".to_string())
            } else {
                Ok(vec![StrictPathSegment::Exact(path.to_string())])
            }
        }
        _ => parse_strict_path(path, PathFlavor::Json),
    }
}

#[derive(Debug, Clone, Copy)]
enum PathFlavor {
    Form,
    Json,
    Xml,
}

fn parse_csv_path(path: &str) -> Result<Vec<StrictPathSegment>, String> {
    if path.is_empty() {
        return Err("CSV target path must not be empty".to_string());
    }
    if path.contains('.') || path.contains('[') || path.contains(']') {
        return Err("CSV target paths must be simple column identifiers".to_string());
    }
    if path.chars().any(char::is_whitespace) {
        return Err("CSV target paths must not contain whitespace".to_string());
    }
    Ok(vec![StrictPathSegment::Exact(path.to_string())])
}

fn parse_strict_path(path: &str, flavor: PathFlavor) -> Result<Vec<StrictPathSegment>, String> {
    if path.is_empty() {
        return Err("path must not be empty".to_string());
    }
    if path.starts_with('.') || path.ends_with('.') || path.contains("..") {
        return Err(format!("invalid dotted path syntax: '{path}'"));
    }

    let chars: Vec<char> = path.chars().collect();
    let mut segments = Vec::new();
    let mut current = String::new();
    let mut i = 0;
    let mut previous_was_dot = true;

    while i < chars.len() {
        match chars[i] {
            '.' => {
                if current.is_empty() {
                    return Err(format!("invalid dotted path syntax: '{path}'"));
                }
                validate_exact_segment(&current, flavor)?;
                segments.push(StrictPathSegment::Exact(std::mem::take(&mut current)));
                previous_was_dot = true;
                i += 1;
            }
            '[' => {
                if !current.is_empty() {
                    validate_exact_segment(&current, flavor)?;
                    segments.push(StrictPathSegment::Exact(std::mem::take(&mut current)));
                } else if previous_was_dot {
                    return Err(format!(
                        "bracket segment cannot start a path component: '{path}'"
                    ));
                }

                let start = i + 1;
                let mut end = start;
                while end < chars.len() && chars[end] != ']' {
                    end += 1;
                }
                if end >= chars.len() {
                    return Err(format!("unclosed bracket in path: '{path}'"));
                }
                if start == end {
                    return Err(format!("empty bracket segment in path: '{path}'"));
                }

                let content: String = chars[start..end].iter().collect();
                if content == "*" {
                    segments.push(StrictPathSegment::Wildcard);
                } else if let Ok(index) = content.parse::<usize>() {
                    segments.push(StrictPathSegment::Indexed(index));
                } else if content.chars().any(char::is_whitespace) {
                    return Err(format!("bracket segment contains whitespace: '{path}'"));
                } else {
                    segments.push(StrictPathSegment::Special(content));
                }

                i = end + 1;
                previous_was_dot = false;
            }
            ']' => return Err(format!("unmatched closing bracket in path: '{path}'")),
            ch => {
                if ch.is_whitespace() {
                    return Err(format!("path segment contains whitespace: '{path}'"));
                }
                current.push(ch);
                previous_was_dot = false;
                i += 1;
            }
        }
    }

    if !current.is_empty() {
        validate_exact_segment(&current, flavor)?;
        segments.push(StrictPathSegment::Exact(current));
    }
    if segments.is_empty() {
        return Err("path must contain at least one segment".to_string());
    }
    Ok(segments)
}

fn validate_exact_segment(segment: &str, flavor: PathFlavor) -> Result<(), String> {
    if segment.is_empty() {
        return Err("path segment must not be empty".to_string());
    }
    if segment.contains('[') || segment.contains(']') {
        return Err(format!("malformed bracket syntax in segment '{segment}'"));
    }
    if matches!(flavor, PathFlavor::Form | PathFlavor::Json) && segment.starts_with('@') {
        return Err(format!(
            "attribute segment '{segment}' is only valid for XML targets"
        ));
    }
    Ok(())
}

pub(crate) fn normalized_segments(segments: &[StrictPathSegment]) -> Vec<String> {
    segments
        .iter()
        .filter_map(StrictPathSegment::normalized)
        .collect()
}

pub(crate) fn resolve_item_path<'a>(
    path: &str,
    index: &'a ItemTreeIndex,
    allow_root: bool,
) -> Result<Option<&'a ItemRef>, String> {
    let segments = parse_form_path(path, allow_root)?;
    if matches!(segments.as_slice(), [StrictPathSegment::Root]) {
        return Ok(None);
    }

    let exacts: Vec<&str> = segments
        .iter()
        .filter_map(|segment| match segment {
            StrictPathSegment::Exact(value) | StrictPathSegment::Special(value) => {
                Some(value.as_str())
            }
            _ => None,
        })
        .collect();
    if exacts.is_empty() {
        return Err(format!("path does not identify an item: {path}"));
    }

    let mut current_path = String::new();
    let mut current: Option<&ItemRef> = None;
    let mut last_exact_index = 0;
    for (index_in_path, segment) in segments.iter().enumerate() {
        match segment {
            StrictPathSegment::Exact(value) | StrictPathSegment::Special(value) => {
                if current_path.is_empty() {
                    current_path = value.clone();
                    current = index.by_full_path.get(&current_path).or_else(|| {
                        index.by_key.get(value).filter(|item_ref| {
                            !index.ambiguous_keys.contains(value)
                                && item_ref.parent_full_path.is_none()
                        })
                    });
                } else {
                    current_path.push('.');
                    current_path.push_str(value);
                    current = index.by_full_path.get(&current_path);
                }
                if current.is_none() {
                    return Ok(None);
                }
                last_exact_index = index_in_path;
            }
            StrictPathSegment::Wildcard | StrictPathSegment::Indexed(_) => {
                let Some(item_ref) = current else {
                    return Ok(None);
                };
                if !item_ref.is_repeatable {
                    return Err(format!(
                        "path uses an index or wildcard on non-repeatable item: {path}"
                    ));
                }
            }
            StrictPathSegment::Root => unreachable!("root was handled above"),
        }
    }

    if last_exact_index >= segments.len() {
        return Ok(None);
    }
    Ok(current)
}

pub(crate) fn target_definition_url<'a>(doc: &'a Value) -> Option<&'a str> {
    doc.get("targetDefinition")
        .and_then(|v| v.get("url"))
        .and_then(Value::as_str)
}

pub(crate) fn target_definition_compatible_versions<'a>(doc: &'a Value) -> Option<&'a str> {
    doc.get("targetDefinition")
        .and_then(|v| v.get("compatibleVersions"))
        .and_then(Value::as_str)
}

pub(crate) fn definition_url(definition: &Value) -> Option<&str> {
    definition.get("url").and_then(Value::as_str)
}

pub(crate) fn definition_version(definition: &Value) -> Option<&str> {
    definition.get("version").and_then(Value::as_str)
}

pub(crate) fn compatible_version_satisfied(range: &str, version: &str) -> Option<bool> {
    range
        .split("||")
        .map(str::trim)
        .filter(|part| !part.is_empty())
        .try_fold(false, |matched, part| {
            if matched {
                Some(true)
            } else {
                simple_range_satisfies(part, version)
            }
        })
}

fn simple_range_satisfies(range: &str, version: &str) -> Option<bool> {
    if range.contains(' ') {
        return range.split_whitespace().try_fold(true, |ok, part| {
            comparator_or_wildcard_satisfies(part, version).map(|v| ok && v)
        });
    }
    if let Some(rest) = range.strip_prefix('^') {
        let base = parse_version(rest)?;
        let version = parse_version(version)?;
        return Some(version >= base && version.0 == base.0);
    }
    if let Some(rest) = range.strip_prefix('~') {
        let base = parse_version(rest)?;
        let version = parse_version(version)?;
        return Some(version >= base && version.0 == base.0 && version.1 == base.1);
    }
    comparator_or_wildcard_satisfies(range, version)
}

fn comparator_or_wildcard_satisfies(range: &str, version: &str) -> Option<bool> {
    if range.contains('x') || range.contains('X') || range.contains('*') {
        return wildcard_satisfies(range, version);
    }

    let (op, wanted) = if let Some(rest) = range.strip_prefix(">=") {
        (">=", rest)
    } else if let Some(rest) = range.strip_prefix("<=") {
        ("<=", rest)
    } else if let Some(rest) = range.strip_prefix('>') {
        (">", rest)
    } else if let Some(rest) = range.strip_prefix('<') {
        ("<", rest)
    } else if let Some(rest) = range.strip_prefix('=') {
        ("=", rest)
    } else {
        ("=", range)
    };

    let version = parse_version(version)?;
    let wanted = parse_version(wanted)?;
    Some(match op {
        ">=" => version >= wanted,
        "<=" => version <= wanted,
        ">" => version > wanted,
        "<" => version < wanted,
        _ => version == wanted,
    })
}

fn wildcard_satisfies(range: &str, version: &str) -> Option<bool> {
    let version_parts = version.split('.').collect::<Vec<_>>();
    if version_parts.len() < 3 {
        return None;
    }
    for (i, wanted) in range.split('.').enumerate() {
        if i >= version_parts.len() {
            return None;
        }
        let token = wanted.trim_start_matches('=');
        if matches!(token, "x" | "X" | "*") {
            return Some(true);
        }
        if token != version_parts[i] {
            return Some(false);
        }
    }
    Some(true)
}

fn parse_version(version: &str) -> Option<(u64, u64, u64)> {
    let core = version.split_once('-').map_or(version, |(core, _)| core);
    let parts = core.split('.').collect::<Vec<_>>();
    if parts.is_empty() || parts.len() > 3 {
        return None;
    }
    let major = parts.first()?.parse::<u64>().ok()?;
    let minor = parts
        .get(1)
        .map_or(Some(0), |part| part.parse::<u64>().ok())?;
    let patch = parts
        .get(2)
        .map_or(Some(0), |part| part.parse::<u64>().ok())?;
    Some((major, minor, patch))
}

pub(crate) fn option_set_values(definition: &Value) -> HashMap<String, HashSet<String>> {
    let mut out = HashMap::new();
    let Some(option_sets) = definition.get("optionSets").and_then(Value::as_object) else {
        return out;
    };
    for (name, entry) in option_sets {
        out.insert(name.clone(), collect_option_values(entry));
    }
    out
}

pub(crate) fn item_option_values(definition: &Value) -> HashMap<String, HashSet<String>> {
    let option_sets = option_set_values(definition);
    let mut out = HashMap::new();
    formspec_core::visit_definition_items_from_document(definition, &mut |ctx| {
        let mut values = HashSet::new();
        if let Some(options) = ctx.item.get("options") {
            values.extend(collect_option_values(options));
        }
        if let Some(option_set) = ctx.item.get("optionSet").and_then(Value::as_str)
            && let Some(set_values) = option_sets.get(option_set)
        {
            values.extend(set_values.iter().cloned());
        }
        if !values.is_empty() {
            out.insert(ctx.dotted_path.clone(), values);
        }
    });
    out
}

fn collect_option_values(entry: &Value) -> HashSet<String> {
    let options = match entry {
        Value::Array(values) => Some(values),
        Value::Object(map) => map.get("options").and_then(Value::as_array),
        _ => None,
    };

    options
        .into_iter()
        .flatten()
        .filter_map(|option| option.get("value"))
        .map(value_to_key)
        .collect()
}

pub(crate) fn value_to_key(value: &Value) -> String {
    match value {
        Value::String(s) => s.clone(),
        Value::Number(n) => n.to_string(),
        Value::Bool(b) => b.to_string(),
        Value::Null => "null".to_string(),
        _ => value.to_string(),
    }
}

pub(crate) fn required_item_paths(definition: &Value) -> HashSet<String> {
    definition
        .get("binds")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(|bind| {
            let path = bind.get("path").and_then(Value::as_str)?;
            let required = bind.get("required")?;
            let is_required = required
                .as_bool()
                .or_else(|| required.as_str().map(|s| s.trim() == "true"))
                .unwrap_or(false);
            is_required.then(|| path.to_string())
        })
        .collect()
}

pub(crate) fn definition_shape_ids(definition: &Value) -> HashSet<String> {
    definition
        .get("shapes")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(|shape| shape.get("id").and_then(Value::as_str))
        .map(ToOwned::to_owned)
        .collect()
}

pub(crate) fn theme_page_ids(theme: &Value) -> HashSet<String> {
    theme
        .get("pages")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(|page| page.get("id").and_then(Value::as_str))
        .map(ToOwned::to_owned)
        .collect()
}

pub(crate) fn component_node_ids(documents: &[Value]) -> HashSet<String> {
    let mut ids = HashSet::new();
    for document in documents {
        if let Some(tree) = document.get("tree") {
            collect_component_node_ids_from_tree(tree, &mut ids);
        }
        if let Some(components) = document.get("components").and_then(Value::as_object) {
            for definition in components.values() {
                if let Some(tree) = definition.get("tree") {
                    collect_component_node_ids_from_tree(tree, &mut ids);
                }
            }
        }
    }
    ids
}

fn collect_component_node_ids_from_tree(tree: &Value, ids: &mut HashSet<String>) {
    let child_seg = |parent: &str, i: usize| format!("{parent}.children[{i}]");
    visit_component_subtree(tree, "$", &child_seg, &mut |node, _path| {
        if let Some(id) = node.get("id").and_then(Value::as_str) {
            ids.insert(id.to_string());
        }
    });
}

pub(crate) fn looks_like_fel(value: &str) -> bool {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return false;
    }
    if trimmed.starts_with("{{") || trimmed.contains("{{") {
        return true;
    }
    if trimmed.starts_with('$') || trimmed.starts_with('@') || trimmed.starts_with('=') {
        return true;
    }

    false
}

pub(crate) fn scan_interpolations(
    value: &str,
    path: &str,
    code: crate::LintCode,
    pass: u8,
    label: &str,
    diags: &mut Vec<LintDiagnostic>,
) {
    let bytes = value.as_bytes();
    let mut i = 0;
    while i + 1 < bytes.len() {
        if bytes[i] == b'\\' && i + 2 < bytes.len() && bytes[i + 1] == b'{' && bytes[i + 2] == b'{'
        {
            i += 3;
            continue;
        }
        if bytes[i] == b'{' && bytes[i + 1] == b'{' {
            let start = i + 2;
            let Some(relative_end) = value[start..].find("}}") else {
                diags.push(error(
                    code,
                    pass,
                    path,
                    format!("{label} interpolation is missing a closing '}}' delimiter"),
                ));
                return;
            };
            let end = start + relative_end;
            let expression = value[start..end].trim();
            if expression.is_empty() {
                diags.push(error(
                    code,
                    pass,
                    path,
                    format!("{label} interpolation must contain a FEL expression"),
                ));
            } else if let Err(err) = fel_core::parse(expression) {
                diags.push(error(
                    code,
                    pass,
                    path,
                    format!("{label} interpolation FEL parse error: {err}"),
                ));
            }
            i = end + 2;
        } else {
            i += 1;
        }
    }
}

pub(crate) fn json_path_member(base: &str, key: &str) -> String {
    if key
        .chars()
        .all(|ch| ch.is_ascii_alphanumeric() || ch == '_' || ch == '$')
    {
        format!("{base}.{key}")
    } else {
        format!(
            "{base}[{}]",
            serde_json::to_string(key).unwrap_or_else(|_| "\"?\"".to_string())
        )
    }
}

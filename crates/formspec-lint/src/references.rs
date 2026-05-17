//! Pass 3: Reference validation — checks bind paths and shape targets resolve against the item tree.
//!
//! Uses [`ItemTreeIndex`] from pass 2 for path resolution. Emits:
//! - **E300**: Bind path references an unknown item
//! - **E301**: Shape target references an unknown item
//! - **E302**: Item's `optionSet` references an undefined option set
//! - **W300**: Item's `dataType` is incompatible with `optionSet`
//!
//! Private helpers validate bind paths, shapes, and option sets against the item index.
#![allow(clippy::missing_docs_in_private_items)]

use std::collections::HashSet;

use formspec_core::visit_definition_items_json;
use serde_json::Value;

use crate::tree::ItemTreeIndex;
use crate::types::LintDiagnostic;

/// Data types compatible with optionSets.
const OPTION_SET_COMPATIBLE_TYPES: &[&str] =
    &["string", "integer", "decimal", "choice", "multiChoice"];

/// Run pass 3 reference checks against an already-built item tree index.
pub fn check_references(document: &Value, index: &ItemTreeIndex) -> Vec<LintDiagnostic> {
    let mut diagnostics = Vec::new();

    check_bind_paths(document, index, &mut diagnostics);
    check_shape_targets(document, index, &mut diagnostics);
    check_option_sets(document, index, &mut diagnostics);

    diagnostics
}

// ── Bind paths (E300) ──────────────────────────────────────────

fn check_bind_paths(
    document: &Value,
    index: &ItemTreeIndex,
    diagnostics: &mut Vec<LintDiagnostic>,
) {
    let binds_val = document.get("binds");

    // Schema-canonical: `binds` is an array; each element has a `path` property.
    if let Some(binds_arr) = binds_val.and_then(|v| v.as_array()) {
        for (i, bind) in binds_arr.iter().enumerate() {
            if let Some(path) = bind.get("path").and_then(|v| v.as_str()) {
                let json_path = format!("$.binds[{i}].path");
                if let Some(diag) = validate_path(path, &json_path, "Bind", "E300", index) {
                    diagnostics.push(diag);
                }
            }
        }
    }
}

// ── Shape targets (E301) ──────────────────────────────────────

fn check_shape_targets(
    document: &Value,
    index: &ItemTreeIndex,
    diagnostics: &mut Vec<LintDiagnostic>,
) {
    let shapes = match document.get("shapes").and_then(|v| v.as_array()) {
        Some(s) => s,
        None => return,
    };

    for (i, shape) in shapes.iter().enumerate() {
        let target = match shape.get("target").and_then(|v| v.as_str()) {
            Some(t) => t,
            None => continue,
        };

        // "#" is the form root — always valid
        if target == "#" {
            continue;
        }

        let json_path = format!("$.shapes[{i}].target");
        if let Some(diag) = validate_path(target, &json_path, "Shape target", "E301", index) {
            diagnostics.push(diag);
        }
    }
}

// ── OptionSet references (E302 / W300) ────────────────────────

fn check_option_sets(
    document: &Value,
    _index: &ItemTreeIndex,
    diagnostics: &mut Vec<LintDiagnostic>,
) {
    let defined_sets = collect_defined_option_sets(document);

    // Walk raw items to read optionSet — the index stores dataType but not optionSet.
    let items = match document.get("items").and_then(|v| v.as_array()) {
        Some(arr) => arr,
        None => return,
    };

    walk_items_for_option_sets(items, &defined_sets, "$.items", diagnostics);
}

fn walk_items_for_option_sets(
    items: &[Value],
    defined_sets: &HashSet<String>,
    json_prefix: &str,
    diagnostics: &mut Vec<LintDiagnostic>,
) {
    visit_definition_items_json(items, json_prefix, None, &mut |ctx| {
        if let Some(option_set_ref) = ctx.item.get("optionSet").and_then(|v| v.as_str()) {
            if !defined_sets.contains(option_set_ref) {
                diagnostics.push(crate::metadata::with_metadata(LintDiagnostic::error(
                    "E302",
                    3,
                    format!("{}.optionSet", ctx.json_path),
                    format!("optionSet references undefined set: {option_set_ref}"),
                )));
            }

            if let Some(data_type) = ctx.item.get("dataType").and_then(|v| v.as_str())
                && !OPTION_SET_COMPATIBLE_TYPES.contains(&data_type)
            {
                diagnostics.push(crate::metadata::with_metadata(LintDiagnostic::warning(
                    "W300",
                    3,
                    format!("{}.dataType", ctx.json_path),
                    format!(
                        "dataType '{data_type}' is not compatible with optionSet \
                             (expected one of: {})",
                        OPTION_SET_COMPATIBLE_TYPES.join(", ")
                    ),
                )));
            }
        }
    });
}

fn collect_defined_option_sets(document: &Value) -> HashSet<String> {
    let mut names = HashSet::new();
    if let Some(obj) = document.get("optionSets").and_then(|v| v.as_object()) {
        for key in obj.keys() {
            names.insert(key.clone());
        }
    }
    names
}

// ── Path resolution ───────────────────────────────────────────

/// Validate a single path (bind key or shape target) against the item tree index.
/// Returns `Some(diagnostic)` if the path is invalid, `None` if it resolves.
fn validate_path(
    path: &str,
    json_path: &str,
    label: &str,
    error_code: &str,
    index: &ItemTreeIndex,
) -> Option<LintDiagnostic> {
    match resolve_path(path, label, index) {
        Ok(()) => None,
        Err(message) => Some(crate::metadata::with_metadata(LintDiagnostic::error(
            error_code, 3, json_path, message,
        ))),
    }
}

/// Simple key: look up in `by_key` (unless ambiguous) or `by_full_path`.
fn validate_simple_key(
    key: &str,
    json_path: &str,
    label: &str,
    error_code: &str,
    index: &ItemTreeIndex,
) -> Option<LintDiagnostic> {
    if index.by_full_path.contains_key(key) {
        return None;
    }
    if !index.ambiguous_keys.contains(key) && index.by_key.contains_key(key) {
        return None;
    }
    Some(crate::metadata::with_metadata(LintDiagnostic::error(
        error_code,
        3,
        json_path,
        format!("{label} references unknown item: {key}"),
    )))
}

use formspec_core::path_utils::{Path, PathSegment};

fn resolve_path(path: &str, label: &str, index: &ItemTreeIndex) -> Result<(), String> {
    let p = Path::parse(path);
    if p.segments.is_empty() {
        return Ok(());
    }

    if p.segments.len() == 1 {
        if let PathSegment::Exact(key) = &p.segments[0] {
            return validate_simple_key(key, "$", label, "E300", index)
                .map_or(Ok(()), |diag| Err(diag.message));
        }
    }

    let mut current = resolve_root_segment(path, &p.segments[0], label, index)?;

    for seg in &p.segments[1..] {
        current = resolve_child_segment(path, label, current, seg, index)?;
    }

    Ok(())
}

fn resolve_root_segment<'a>(
    path: &str,
    segment: &PathSegment,
    label: &str,
    index: &'a ItemTreeIndex,
) -> Result<&'a crate::tree::ItemRef, String> {
    let key = match segment {
        PathSegment::Exact(k) => k,
        PathSegment::Wildcard => return Err(format!("{label} references unknown item: {path}")),
        PathSegment::Indexed(_) => return Err(format!("{label} references unknown item: {path}")),
        PathSegment::Special(k) => k,
    };

    let current = index
        .by_full_path
        .get(key)
        .or_else(|| {
            index.by_key.get(key).filter(|item_ref| {
                !index.ambiguous_keys.contains(key) && item_ref.parent_full_path.is_none()
            })
        })
        .ok_or_else(|| format!("{label} references unknown item: {path}"))?;

    ensure_repeatable_if_needed(label, current.full_path.as_str(), current, segment)?;
    Ok(current)
}

fn resolve_child_segment<'a>(
    path: &str,
    label: &str,
    parent: &'a crate::tree::ItemRef,
    segment: &PathSegment,
    index: &'a ItemTreeIndex,
) -> Result<&'a crate::tree::ItemRef, String> {
    // If current segment is Index/Wildcard, it doesn't resolve to a NEW item,
    // but rather validates the current item is repeatable.
    if matches!(segment, PathSegment::Wildcard | PathSegment::Indexed(_)) {
        ensure_repeatable_if_needed(label, &parent.full_path, parent, segment)?;
        return Ok(parent);
    }

    let child_key = match segment {
        PathSegment::Exact(k) => k,
        PathSegment::Special(k) => k,
        _ => unreachable!(),
    };

    let child_path = format!("{}.{}", parent.full_path, child_key);
    let child = index
        .by_full_path
        .get(&child_path)
        .ok_or_else(|| format!("{label} references unknown item: {path}"))?;
    ensure_repeatable_if_needed(label, &child_path, child, segment)?;
    Ok(child)
}

fn ensure_repeatable_if_needed(
    label: &str,
    path: &str,
    item_ref: &crate::tree::ItemRef,
    segment: &PathSegment,
) -> Result<(), String> {
    if matches!(segment, PathSegment::Wildcard | PathSegment::Indexed(_))
        && !item_ref.is_repeatable
    {
        return Err(format!(
            "{label} uses wildcard on non-repeatable group: {path}"
        ));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    #![allow(clippy::missing_docs_in_private_items)]
    use super::*;
    use crate::tree::build_item_index;
    use serde_json::json;

    // Helper: build index + run check_references
    fn lint(doc: &Value) -> Vec<LintDiagnostic> {
        let index = build_item_index(doc);
        check_references(doc, &index)
    }

    fn codes(diags: &[LintDiagnostic]) -> Vec<&str> {
        diags.iter().map(|d| d.code.as_str()).collect()
    }

    // ── 1. Valid simple bind path — no E300 ───────────────────

    #[test]
    fn valid_simple_bind_path_no_e300() {
        let doc = json!({
            "items": [{ "key": "name", "dataType": "string" }],
            "binds": [{ "path": "name", "required": "true" }]
        });
        let diags = lint(&doc);
        assert!(
            !codes(&diags).contains(&"E300"),
            "Valid bind path should not emit E300"
        );
    }

    // ── 2. Unresolved bind path — E300 ────────────────────────

    #[test]
    fn unresolved_bind_path_emits_e300() {
        let doc = json!({
            "items": [{ "key": "name", "dataType": "string" }],
            "binds": [{ "path": "nonexistent", "required": "true" }]
        });
        let diags = lint(&doc);
        let e300: Vec<_> = diags.iter().filter(|d| d.code == "E300").collect();
        assert_eq!(e300.len(), 1);
        assert!(e300[0].message.contains("nonexistent"));
        assert_eq!(e300[0].path, "$.binds[0].path");
    }

    // ── 3. Valid dotted path — no E300 ────────────────────────

    #[test]
    fn valid_dotted_bind_path_no_e300() {
        let doc = json!({
            "items": [{
                "key": "address",
                "children": [{ "key": "street", "dataType": "string" }]
            }],
            "binds": [{ "path": "address.street", "required": "true" }]
        });
        let diags = lint(&doc);
        assert!(
            !codes(&diags).contains(&"E300"),
            "Valid dotted path should not emit E300"
        );
    }

    // ── 4. Valid wildcard path on repeatable group — no E300 ──

    #[test]
    fn valid_wildcard_on_repeatable_group_no_e300() {
        let doc = json!({
            "items": [{
                "key": "lines",
                "repeatable": true,
                "children": [{ "key": "amount", "dataType": "decimal" }]
            }],
            "binds": [{ "path": "lines[*].amount", "required": "true" }]
        });
        let diags = lint(&doc);
        assert!(
            !codes(&diags).contains(&"E300"),
            "Wildcard on repeatable group with valid child should not emit E300"
        );
    }

    #[test]
    fn valid_nested_wildcard_path_no_e300() {
        let doc = json!({
            "items": [{
                "key": "conditions",
                "repeatable": true,
                "children": [{
                    "key": "medications",
                    "repeatable": true,
                    "children": [{ "key": "startDate", "dataType": "date" }]
                }]
            }],
            "binds": [{ "path": "conditions[*].medications[*].startDate", "required": "true" }]
        });
        let diags = lint(&doc);
        assert!(
            !codes(&diags).contains(&"E300"),
            "Nested wildcard path should resolve across repeatable descendants"
        );
    }

    #[test]
    fn nested_wildcard_with_non_repeatable_inner_group_emits_e300() {
        let doc = json!({
            "items": [{
                "key": "conditions",
                "repeatable": true,
                "children": [{
                    "key": "medications",
                    "children": [{ "key": "startDate", "dataType": "date" }]
                }]
            }],
            "binds": [{ "path": "conditions[*].medications[*].startDate", "required": "true" }]
        });
        let diags = lint(&doc);
        let e300: Vec<_> = diags.iter().filter(|d| d.code == "E300").collect();
        assert_eq!(e300.len(), 1);
        assert!(e300[0].message.contains("non-repeatable"));
    }

    // ── 5. Wildcard on non-repeatable group — E300 ────────────

    #[test]
    fn wildcard_on_non_repeatable_group_emits_e300() {
        let doc = json!({
            "items": [{
                "key": "personal",
                "children": [{ "key": "name", "dataType": "string" }]
            }],
            "binds": [{ "path": "personal[*].name", "required": "true" }]
        });
        let diags = lint(&doc);
        let e300: Vec<_> = diags.iter().filter(|d| d.code == "E300").collect();
        assert_eq!(e300.len(), 1);
        assert!(e300[0].message.contains("non-repeatable"));
    }

    // ── 6. Wildcard with unknown child — E300 ─────────────────

    #[test]
    fn wildcard_with_unknown_child_emits_e300() {
        let doc = json!({
            "items": [{
                "key": "lines",
                "repeatable": true,
                "children": [{ "key": "amount", "dataType": "decimal" }]
            }],
            "binds": [{ "path": "lines[*].nonexistent", "required": "true" }]
        });
        let diags = lint(&doc);
        let e300: Vec<_> = diags.iter().filter(|d| d.code == "E300").collect();
        assert_eq!(e300.len(), 1);
        assert!(e300[0].message.contains("nonexistent"));
    }

    // ── 7. Valid shape target — no E301 ───────────────────────

    #[test]
    fn valid_shape_target_no_e301() {
        let doc = json!({
            "items": [{ "key": "name", "dataType": "string" }],
            "shapes": [{ "target": "name", "constraint": "$name != ''" }]
        });
        let diags = lint(&doc);
        assert!(
            !codes(&diags).contains(&"E301"),
            "Valid shape target should not emit E301"
        );
    }

    // ── 8. Unresolved shape target — E301 ─────────────────────

    #[test]
    fn unresolved_shape_target_emits_e301() {
        let doc = json!({
            "items": [{ "key": "name", "dataType": "string" }],
            "shapes": [{ "target": "missing_field", "constraint": "$name != ''" }]
        });
        let diags = lint(&doc);
        let e301: Vec<_> = diags.iter().filter(|d| d.code == "E301").collect();
        assert_eq!(e301.len(), 1);
        assert!(e301[0].message.contains("missing_field"));
        assert_eq!(e301[0].path, "$.shapes[0].target");
    }

    // ── 9. Shape target "#" (form root) — no E301 ────────────

    #[test]
    fn shape_target_form_root_no_e301() {
        let doc = json!({
            "items": [{ "key": "name", "dataType": "string" }],
            "shapes": [{ "target": "#", "constraint": "$name != ''" }]
        });
        let diags = lint(&doc);
        assert!(
            !codes(&diags).contains(&"E301"),
            "Form root '#' should always be valid"
        );
    }

    // ── 10. E302 optionSet not found ──────────────────────────

    #[test]
    fn e302_option_set_not_found() {
        let doc = json!({
            "items": [{ "key": "color", "dataType": "choice", "optionSet": "colors" }],
            "optionSets": {
                "sizes": { "options": [{ "value": "S" }] }
            }
        });
        let diags = lint(&doc);
        let e302: Vec<_> = diags.iter().filter(|d| d.code == "E302").collect();
        assert_eq!(e302.len(), 1);
        assert!(e302[0].message.contains("colors"));
    }

    #[test]
    fn e302_option_set_found_passes() {
        let doc = json!({
            "items": [{ "key": "color", "dataType": "choice", "optionSet": "colors" }],
            "optionSets": {
                "colors": { "options": [{ "value": "red" }] }
            }
        });
        let diags = lint(&doc);
        assert!(
            !codes(&diags).contains(&"E302"),
            "Existing optionSet should not emit E302"
        );
    }

    // ── 11. W300 incompatible dataType for optionSet ──────────

    #[test]
    fn w300_incompatible_data_type() {
        let doc = json!({
            "items": [{ "key": "f", "dataType": "boolean", "optionSet": "opts" }],
            "optionSets": { "opts": { "options": [{ "value": "x" }] } }
        });
        let diags = lint(&doc);
        let w300: Vec<_> = diags.iter().filter(|d| d.code == "W300").collect();
        assert_eq!(w300.len(), 1);
        assert!(w300[0].message.contains("boolean"));
    }

    #[test]
    fn w300_compatible_types_no_warning() {
        for dt in OPTION_SET_COMPATIBLE_TYPES {
            let doc = json!({
                "items": [{ "key": "f", "dataType": dt, "optionSet": "opts" }],
                "optionSets": { "opts": { "options": [{ "value": "x" }] } }
            });
            let diags = lint(&doc);
            let w300_count = diags.iter().filter(|d| d.code == "W300").count();
            assert_eq!(w300_count, 0, "dataType '{dt}' should not trigger W300");
        }
    }

    // ── Edge cases ────────────────────────────────────────────

    #[test]
    fn no_binds_or_shapes_produces_no_diagnostics() {
        let doc = json!({
            "items": [{ "key": "name", "dataType": "string" }]
        });
        let diags = lint(&doc);
        assert!(diags.is_empty());
    }

    #[test]
    fn empty_binds_produces_no_diagnostics() {
        let doc = json!({
            "items": [{ "key": "name" }],
            "binds": []
        });
        let diags = lint(&doc);
        assert!(diags.is_empty());
    }

    #[test]
    fn wildcard_group_only_no_remainder_resolves() {
        let doc = json!({
            "items": [{
                "key": "lines",
                "repeatable": true,
                "children": [{ "key": "amount" }]
            }],
            "binds": [{ "path": "lines[*]", "relevant": "true" }]
        });
        let diags = lint(&doc);
        // A bare wildcard with no remainder is valid if the group is repeatable
        assert!(
            !codes(&diags).contains(&"E300"),
            "Bare wildcard on repeatable group should resolve"
        );
    }

    #[test]
    fn multiple_errors_across_binds_and_shapes() {
        let doc = json!({
            "items": [{ "key": "name" }],
            "binds": [{ "path": "ghost", "required": "true" }],
            "shapes": [{ "target": "phantom", "constraint": "true" }]
        });
        let diags = lint(&doc);
        assert!(codes(&diags).contains(&"E300"));
        assert!(codes(&diags).contains(&"E301"));
    }

    #[test]
    fn nested_option_set_check() {
        let doc = json!({
            "items": [{
                "key": "group",
                "children": [{
                    "key": "nested_choice",
                    "dataType": "choice",
                    "optionSet": "missing"
                }]
            }]
        });
        let diags = lint(&doc);
        let e302: Vec<_> = diags.iter().filter(|d| d.code == "E302").collect();
        assert_eq!(e302.len(), 1, "Should find E302 in nested items");
        assert!(e302[0].message.contains("missing"));
    }

    // ── Array-format binds (schema-canonical) ──────────────────

    #[test]
    fn array_format_binds_valid_path_no_e300() {
        let doc = json!({
            "items": [{ "key": "name", "dataType": "string" }],
            "binds": [{ "path": "name", "required": "true" }]
        });
        let diags = lint(&doc);
        assert!(
            !codes(&diags).contains(&"E300"),
            "Valid array-format bind path should not emit E300"
        );
    }

    #[test]
    fn array_format_binds_unresolved_emits_e300() {
        let doc = json!({
            "items": [{ "key": "name", "dataType": "string" }],
            "binds": [{ "path": "ghost", "required": "true" }]
        });
        let diags = lint(&doc);
        let e300: Vec<_> = diags.iter().filter(|d| d.code == "E300").collect();
        assert_eq!(e300.len(), 1);
        assert!(e300[0].message.contains("ghost"));
        assert_eq!(e300[0].path, "$.binds[0].path");
    }

    #[test]
    fn array_format_binds_dotted_path() {
        let doc = json!({
            "items": [{
                "key": "address",
                "children": [{ "key": "street", "dataType": "string" }]
            }],
            "binds": [{ "path": "address.street", "required": "true" }]
        });
        let diags = lint(&doc);
        assert!(
            !codes(&diags).contains(&"E300"),
            "Valid dotted path in array-format bind should not emit E300"
        );
    }

    #[test]
    fn array_format_binds_wildcard_on_repeatable() {
        let doc = json!({
            "items": [{
                "key": "lines",
                "repeatable": true,
                "children": [{ "key": "amount", "dataType": "decimal" }]
            }],
            "binds": [{ "path": "lines[*].amount", "required": "true" }]
        });
        let diags = lint(&doc);
        assert!(
            !codes(&diags).contains(&"E300"),
            "Wildcard array-format bind on repeatable group should not emit E300"
        );
    }

    #[test]
    fn array_format_empty_binds_no_diagnostics() {
        let doc = json!({
            "items": [{ "key": "name" }],
            "binds": []
        });
        let diags = lint(&doc);
        assert!(diags.is_empty());
    }

    // ── Strict dotted path resolution ─────────────────────────

    /// Spec: core/spec.md §4.3.3 — bind paths MUST resolve to at least one Item key.
    #[test]
    fn dotted_path_with_existing_base_but_missing_child_emits_e300() {
        let doc = json!({
            "items": [{
                "key": "address",
                "children": [{ "key": "street", "dataType": "string" }]
            }],
            "binds": [{ "path": "address.nonexistent", "required": "true" }]
        });
        let diags = lint(&doc);
        let e300: Vec<_> = diags.iter().filter(|d| d.code == "E300").collect();
        assert_eq!(e300.len(), 1, "Missing dotted child should emit E300");
        assert!(e300[0].message.contains("address.nonexistent"));
    }

    /// Spec: core/spec.md §4.3.3 (line 2276) — when base key does NOT exist, E300 is emitted.
    #[test]
    fn dotted_path_unknown_base_key_emits_e300() {
        let doc = json!({
            "items": [{ "key": "name", "dataType": "string" }],
            "binds": [{ "path": "ghost.field", "required": "true" }]
        });
        let diags = lint(&doc);
        let e300: Vec<_> = diags.iter().filter(|d| d.code == "E300").collect();
        assert_eq!(e300.len(), 1, "Unknown base key should emit E300");
        assert!(e300[0].message.contains("ghost.field"));
    }

    // ── Finding 51: Shape target with wildcard path ──────────────

    /// Spec: core/spec.md §5.2, §4.3.3 (line 2285) — shape targets may use wildcard
    /// paths like `lines[*].amount` to target repeatable group children.
    #[test]
    fn shape_target_wildcard_path_on_repeatable_group() {
        let doc = json!({
            "items": [{
                "key": "lines",
                "repeatable": true,
                "children": [{ "key": "amount", "dataType": "decimal" }]
            }],
            "shapes": [{ "target": "lines[*].amount", "constraint": "$ > 0" }]
        });
        let diags = lint(&doc);
        assert!(
            !codes(&diags).contains(&"E301"),
            "Wildcard shape target on repeatable group should resolve"
        );
    }

    /// Spec: core/spec.md §5.2 — wildcard shape target on non-repeatable group emits E301.
    #[test]
    fn shape_target_wildcard_on_non_repeatable_emits_e301() {
        let doc = json!({
            "items": [{
                "key": "info",
                "children": [{ "key": "name", "dataType": "string" }]
            }],
            "shapes": [{ "target": "info[*].name", "constraint": "$ != ''" }]
        });
        let diags = lint(&doc);
        let e301: Vec<_> = diags.iter().filter(|d| d.code == "E301").collect();
        assert_eq!(e301.len(), 1);
        assert!(e301[0].message.contains("non-repeatable"));
    }

    // ── Finding 52: Shape without target field ───────────────────

    /// Spec: core/spec.md §5.2, schemas/definition.schema.json — a shape without a
    /// `target` field is skipped gracefully (no panic, no diagnostic from reference checks).
    #[test]
    fn shape_without_target_skipped_gracefully() {
        let doc = json!({
            "items": [{ "key": "name", "dataType": "string" }],
            "shapes": [
                { "constraint": "$name != ''" },
                { "target": null, "constraint": "true" }
            ]
        });
        let diags = lint(&doc);
        // Should produce no E301 — shapes without string target are skipped
        assert!(
            !codes(&diags).contains(&"E301"),
            "Shape without target field should be skipped, not produce E301"
        );
    }

    #[test]
    fn all_diagnostics_are_pass_3() {
        let doc = json!({
            "items": [{ "key": "f", "dataType": "boolean", "optionSet": "missing" }],
            "binds": [{ "path": "ghost", "required": "true" }],
            "shapes": [{ "target": "phantom", "constraint": "true" }]
        });
        let diags = lint(&doc);
        assert!(!diags.is_empty());
        for d in &diags {
            assert_eq!(
                d.pass, 3,
                "All reference diagnostics should be pass 3, got pass {} for {}",
                d.pass, d.code
            );
        }
    }

    // ── Array-format binds with wildcard on non-repeatable group ─

    /// Spec: spec.md §4.5 — wildcard binds on non-repeatable groups are invalid (E300).
    #[test]
    fn array_format_wildcard_on_non_repeatable_emits_e300() {
        let doc = json!({
            "items": [{
                "key": "personal",
                "children": [{ "key": "name", "dataType": "string" }]
            }],
            "binds": [{ "path": "personal[*].name", "required": "true" }]
        });
        let diags = lint(&doc);
        let e300: Vec<_> = diags.iter().filter(|d| d.code == "E300").collect();
        assert_eq!(
            e300.len(),
            1,
            "Wildcard on non-repeatable group in array-format should emit E300"
        );
        assert!(e300[0].message.contains("non-repeatable"));
    }

    // ── Ambiguous-key path resolution ───────────────────────────

    /// Spec: spec.md §3.2 — when a bind key is ambiguous (appears in multiple places),
    /// resolution via `by_key` is blocked and must match via `by_full_path` instead.
    #[test]
    fn ambiguous_key_bind_emits_e300_when_not_full_path() {
        let doc = json!({
            "items": [
                { "key": "name", "dataType": "string" },
                {
                    "key": "contact",
                    "children": [{ "key": "name", "dataType": "string" }]
                }
            ],
            "binds": [{ "path": "name", "required": "true" }]
        });
        let index = crate::tree::build_item_index(&doc);
        // "name" should be in ambiguous_keys
        assert!(
            index.ambiguous_keys.contains("name"),
            "Key 'name' should be ambiguous"
        );

        let diags = check_references(&doc, &index);
        // "name" matches by_full_path (top-level item has full_path "name"), so it resolves
        assert!(
            !diags.iter().any(|d| d.code == "E300"),
            "Top-level 'name' should resolve via by_full_path even though key is ambiguous"
        );
    }

    /// Spec: spec.md §3.2 — ambiguous key that does NOT match a full_path should fail
    #[test]
    fn ambiguous_key_not_in_full_path_emits_e300() {
        let doc = json!({
            "items": [
                {
                    "key": "group1",
                    "children": [{ "key": "x", "dataType": "string" }]
                },
                {
                    "key": "group2",
                    "children": [{ "key": "x", "dataType": "string" }]
                }
            ],
            "binds": [{ "path": "x", "required": "true" }]
        });
        let index = crate::tree::build_item_index(&doc);
        assert!(index.ambiguous_keys.contains("x"));

        let diags = check_references(&doc, &index);
        // "x" is ambiguous and NOT a full_path (full_paths are "group1.x" and "group2.x")
        let e300: Vec<_> = diags.iter().filter(|d| d.code == "E300").collect();
        assert_eq!(
            e300.len(),
            1,
            "Ambiguous key 'x' with no matching full_path should emit E300"
        );
    }
}

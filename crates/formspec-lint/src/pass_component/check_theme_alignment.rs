//! Component/Theme cross-artifact UI structure checks (E805, W805, W807).

use std::collections::{BTreeMap, BTreeSet};

use formspec_core::{path_utils::Path, visit_definition_items_from_document};
use serde_json::Value;

use crate::metadata;
use crate::types::LintDiagnostic;

use super::PASS;

#[derive(Debug)]
struct PageUnit {
    id: String,
    assignments: BTreeMap<String, String>,
}

#[derive(Clone, Debug, Eq, Ord, PartialEq, PartialOrd)]
struct ThemeAssignment {
    page_id: String,
    original_key: String,
}

#[derive(Clone, Copy, Debug)]
struct DefinitionItemKind {
    is_group: bool,
    repeatable: bool,
}

#[derive(Debug, Default)]
struct DefinitionPathIndex {
    kinds: BTreeMap<String, DefinitionItemKind>,
    descendant_paths: BTreeMap<String, BTreeSet<String>>,
}

pub(crate) fn check(
    component: &Value,
    theme: &Value,
    definition: Option<&Value>,
    diags: &mut Vec<LintDiagnostic>,
) {
    check_breakpoints(component, theme, diags);

    let definition_paths = DefinitionPathIndex::from_definition(definition);
    let component_pages = collect_component_page_units(component, &definition_paths);
    if component_pages.is_empty() || !has_theme_pages(theme) {
        return;
    }

    diags.push(metadata::with_metadata(LintDiagnostic::warning(
        crate::LintCode::W805,
        PASS,
        "$.tree",
        "Theme pages are shadowed because the Component tree declares direct-root Section page units",
    )));

    let mut component_assignments: BTreeMap<String, BTreeSet<String>> = BTreeMap::new();
    for page in &component_pages {
        for bind in page.assignments.keys() {
            component_assignments
                .entry(bind.clone())
                .or_default()
                .insert(page.id.clone());
        }
    }

    let mut emitted_conflicts = BTreeSet::new();
    for (key, theme_assignments) in collect_theme_page_assignments(theme, &definition_paths) {
        if let Some(component_page_ids) = component_assignments.get(&key) {
            for theme_assignment in theme_assignments {
                for component_page_id in component_page_ids {
                    if component_page_id != &theme_assignment.page_id
                        && emitted_conflicts.insert((
                            component_page_id.clone(),
                            theme_assignment.page_id.clone(),
                            theme_assignment.original_key.clone(),
                        ))
                    {
                        diags.push(metadata::with_metadata(LintDiagnostic::error(
                            crate::LintCode::E805,
                            PASS,
                            "$.tree",
                            format!(
                                "Bound field '{}' is assigned to Component page '{component_page_id}' but Theme page '{}'",
                                theme_assignment.original_key,
                                theme_assignment.page_id,
                            ),
                        )));
                    }
                }
            }
        }
    }
}

fn check_breakpoints(component: &Value, theme: &Value, diags: &mut Vec<LintDiagnostic>) {
    let Some(component_breakpoints) = component.get("breakpoints").and_then(Value::as_object)
    else {
        return;
    };
    let Some(theme_breakpoints) = theme.get("breakpoints").and_then(Value::as_object) else {
        return;
    };

    for (name, component_value) in component_breakpoints {
        let Some(theme_value) = theme_breakpoints.get(name) else {
            continue;
        };
        if component_value != theme_value {
            diags.push(metadata::with_metadata(LintDiagnostic::warning(
                crate::LintCode::W807,
                PASS,
                format!("$.breakpoints.{name}"),
                format!(
                    "Component breakpoint '{name}' has value {component_value} but Theme declares {theme_value}"
                ),
            )));
        }
    }
}

fn has_theme_pages(theme: &Value) -> bool {
    theme
        .get("pages")
        .and_then(Value::as_array)
        .is_some_and(|pages| !pages.is_empty())
}

impl DefinitionPathIndex {
    fn from_definition(definition: Option<&Value>) -> Self {
        let Some(definition) = definition else {
            return Self::default();
        };

        let mut item_paths = Vec::new();
        visit_definition_items_from_document(definition, &mut |ctx| {
            let item_type = ctx.item.get("type").and_then(Value::as_str);
            let is_group = item_type == Some("group");
            let repeatable = is_group
                && ctx
                    .item
                    .get("repeatable")
                    .and_then(Value::as_bool)
                    .unwrap_or(false);
            item_paths.push((ctx.dotted_path.clone(), is_group, repeatable));
        });

        let mut index = Self::default();
        for (path, is_group, repeatable) in &item_paths {
            index.kinds.insert(
                path.clone(),
                DefinitionItemKind {
                    is_group: *is_group,
                    repeatable: *repeatable,
                },
            );
        }

        let group_paths = item_paths
            .iter()
            .filter_map(|(path, is_group, _)| is_group.then_some(path.clone()))
            .collect::<Vec<_>>();
        for (path, is_group, _) in &item_paths {
            if *is_group {
                continue;
            }
            for group_path in &group_paths {
                if is_descendant_path(group_path, path) {
                    let active_path = index.active_path_for_definition_path(path);
                    index
                        .descendant_paths
                        .entry(group_path.clone())
                        .or_default()
                        .insert(active_path);
                }
            }
        }

        index
    }

    fn kind_for_bind(&self, bind_path: &str) -> Option<DefinitionItemKind> {
        self.kinds.get(&normalize_bind_path(bind_path)).copied()
    }

    fn assignment_paths_for_bind(&self, bind_path: &str) -> BTreeSet<String> {
        let normalized = normalize_bind_path(bind_path);
        let mut paths = BTreeSet::from([bind_path.to_string()]);
        if let Some(descendants) = self.descendant_paths.get(&normalized) {
            paths.extend(descendants.iter().cloned());
        }
        paths
    }

    fn active_path_for_definition_path(&self, path: &str) -> String {
        let mut prefix = String::new();
        let mut segments = Vec::new();
        for segment in path.split('.') {
            prefix = join_bind_path(prefix.as_str(), segment);
            if self.kinds.get(&prefix).is_some_and(|kind| kind.repeatable) {
                segments.push(format!("{segment}[0]"));
            } else {
                segments.push(segment.to_string());
            }
        }
        segments.join(".")
    }
}

fn collect_component_page_units(
    component: &Value,
    definition_paths: &DefinitionPathIndex,
) -> Vec<PageUnit> {
    let Some(tree) = component.get("tree").and_then(Value::as_object) else {
        return Vec::new();
    };

    let page_nodes = if tree.get("component").and_then(Value::as_str) == Some("Section") {
        vec![(tree, 0)]
    } else {
        tree.get("children")
            .and_then(Value::as_array)
            .map(|children| {
                children
                    .iter()
                    .enumerate()
                    .filter_map(|(index, child)| {
                        let node = child.as_object()?;
                        (node.get("component").and_then(Value::as_str) == Some("Section"))
                            .then_some((node, index))
                    })
                    .collect()
            })
            .unwrap_or_default()
    };

    page_nodes
        .into_iter()
        .map(|(node, index)| {
            let id = node
                .get("id")
                .and_then(Value::as_str)
                .filter(|value| !value.is_empty())
                .map(ToOwned::to_owned)
                .unwrap_or_else(|| format!("page-{}", index + 1));
            let mut assignments = BTreeMap::new();
            if let Some(children) = node.get("children").and_then(Value::as_array) {
                for child in children {
                    collect_binds(child, &id, "", definition_paths, &mut assignments);
                }
            }
            PageUnit { id, assignments }
        })
        .collect()
}

fn collect_binds(
    node: &Value,
    page_id: &str,
    prefix: &str,
    definition_paths: &DefinitionPathIndex,
    assignments: &mut BTreeMap<String, String>,
) {
    let Some(object) = node.as_object() else {
        return;
    };

    let component_type = object
        .get("component")
        .and_then(Value::as_str)
        .unwrap_or("");
    let full_bind_path = object
        .get("bind")
        .and_then(Value::as_str)
        .filter(|bind| !bind.is_empty())
        .map(|bind| join_bind_path(prefix, bind));

    if let Some(bind_path) = &full_bind_path {
        for assignment_path in definition_paths.assignment_paths_for_bind(bind_path) {
            insert_assignment(assignments, page_id, &assignment_path);
        }
    }

    let next_prefix = full_bind_path
        .as_deref()
        .and_then(|bind_path| {
            let kind = definition_paths.kind_for_bind(bind_path)?;
            if !kind.is_group || is_self_managed_group_component(component_type) {
                return None;
            }
            Some(if kind.repeatable {
                format!("{bind_path}[0]")
            } else {
                bind_path.to_string()
            })
        })
        .unwrap_or_else(|| prefix.to_string());

    if let Some(children) = object.get("children").and_then(Value::as_array) {
        for child in children {
            collect_binds(child, page_id, &next_prefix, definition_paths, assignments);
        }
    }
}

fn collect_theme_page_assignments(
    theme: &Value,
    definition_paths: &DefinitionPathIndex,
) -> BTreeMap<String, BTreeSet<ThemeAssignment>> {
    let mut assignments = BTreeMap::new();
    let Some(pages) = theme.get("pages").and_then(Value::as_array) else {
        return assignments;
    };
    for (index, page) in pages.iter().enumerate() {
        let Some(page_object) = page.as_object() else {
            continue;
        };
        let page_id = page_object
            .get("id")
            .and_then(Value::as_str)
            .filter(|value| !value.is_empty())
            .map(ToOwned::to_owned)
            .unwrap_or_else(|| format!("page-{}", index + 1));
        let Some(regions) = page_object.get("regions").and_then(Value::as_array) else {
            continue;
        };
        for region in regions {
            let Some(key) = region.get("key").and_then(Value::as_str) else {
                continue;
            };
            for assignment_path in definition_paths.assignment_paths_for_bind(key) {
                assignments
                    .entry(normalize_bind_path(&assignment_path))
                    .or_insert_with(BTreeSet::new)
                    .insert(ThemeAssignment {
                        page_id: page_id.clone(),
                        original_key: key.to_string(),
                    });
            }
        }
    }
    assignments
}

fn insert_assignment(assignments: &mut BTreeMap<String, String>, page_id: &str, bind_path: &str) {
    assignments
        .entry(normalize_bind_path(bind_path))
        .or_insert_with(|| page_id.to_string());
}

fn normalize_bind_path(bind_path: &str) -> String {
    Path::parse(bind_path).strip_indices()
}

fn join_bind_path(prefix: &str, bind: &str) -> String {
    if prefix.is_empty() {
        bind.to_string()
    } else {
        format!("{prefix}.{bind}")
    }
}

fn is_descendant_path(group_path: &str, child_path: &str) -> bool {
    child_path
        .strip_prefix(group_path)
        .is_some_and(|suffix| suffix.starts_with('.'))
}

fn is_self_managed_group_component(component_type: &str) -> bool {
    component_type == "DataTable"
}

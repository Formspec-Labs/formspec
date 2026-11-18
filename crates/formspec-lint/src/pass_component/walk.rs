//! Component tree walk and per-node rule dispatch.

use std::collections::{HashMap, HashSet};

use formspec_core::visit_component_subtree;
use serde_json::Value;

use crate::types::LintDiagnostic;

use super::field_lookup::{self, FieldInfo};
use super::{
    check_duplicate_bind, check_forbidden_bind, check_input_compat, check_options_source,
    check_params, check_responsive, check_textinput_variant, check_unknown,
};

pub(crate) struct WalkState<'a> {
    pub custom_names: HashSet<&'a str>,
    pub custom_defs: Option<&'a serde_json::Map<String, Value>>,
    pub field_lookup: Option<HashMap<String, FieldInfo>>,
    pub all_binds: HashSet<String>,
    pub editable_binds: HashSet<String>,
    /// Open repeat templates, outermost first: the template node's path and its group's
    /// full path. The walk is pre-order, so a scope closes once a node falls outside it.
    pub repeat_scopes: Vec<(String, String)>,
    pub diags: Vec<LintDiagnostic>,
}

impl<'a> WalkState<'a> {
    pub fn walk_node(&mut self, node: &Value, path: &str) {
        let child_seg = |parent: &str, i: usize| format!("{parent}.children[{i}]");
        visit_component_subtree(node, path, &child_seg, &mut |n, p| {
            self.apply_component_rules(n, p);
        });
    }

    /// The innermost open repeat template's group path, if any.
    pub fn repeat_group(&self) -> Option<&str> {
        self.repeat_scopes.last().map(|(_, group)| group.as_str())
    }

    fn open_repeat_scope(&mut self, path: &str, comp_type: &str, bind: &str) {
        if let Some(lookup) = self.field_lookup.as_ref()
            && let Some(group_path) =
                field_lookup::repeat_group_path(lookup, self.repeat_group(), comp_type, bind)
        {
            self.repeat_scopes
                .push((path.to_owned(), group_path.to_owned()));
        }
    }

    fn apply_component_rules(&mut self, node: &Value, path: &str) {
        while let Some((scope_path, _)) = self.repeat_scopes.last()
            && !path.starts_with(&format!("{scope_path}.children["))
        {
            self.repeat_scopes.pop();
        }

        let comp_type = match node.get("component").and_then(|v| v.as_str()) {
            Some(ct) => ct,
            None => return,
        };

        check_unknown::check(self, path, comp_type);
        check_params::check(self, node, path, comp_type);
        check_responsive::check(self, node, path, comp_type);

        let Some(bind) = node.get("bind").and_then(|v| v.as_str()) else {
            return;
        };

        check_forbidden_bind::check(self, path, comp_type);
        check_duplicate_bind::check_tree_duplicate(self, path, bind);
        check_input_compat::check(self, node, path, comp_type, bind);
        self.open_repeat_scope(path, comp_type, bind);
        check_options_source::check(self, path, comp_type, bind);
        check_textinput_variant::check(self, node, path, comp_type, bind);
        check_duplicate_bind::check_editable_uniqueness(self, path, comp_type, bind);
    }
}

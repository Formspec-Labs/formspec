//! Component tree walk and per-node rule dispatch.

use std::collections::{HashMap, HashSet};

use formspec_core::visit_component_subtree;
use serde_json::Value;

use crate::types::LintDiagnostic;

use super::field_lookup::FieldInfo;
use super::{
    check_duplicate_bind, check_input_compat, check_layout_bind, check_options_source,
    check_params, check_textinput_variant, check_unknown,
};

pub(crate) struct WalkState<'a> {
    pub custom_names: HashSet<&'a str>,
    pub custom_defs: Option<&'a serde_json::Map<String, Value>>,
    pub field_lookup: Option<HashMap<String, FieldInfo>>,
    pub all_binds: HashSet<String>,
    pub editable_binds: HashSet<String>,
    pub diags: Vec<LintDiagnostic>,
}

impl<'a> WalkState<'a> {
    pub fn walk_node(&mut self, node: &Value, path: &str) {
        let child_seg = |parent: &str, i: usize| format!("{parent}.children[{i}]");
        visit_component_subtree(node, path, &child_seg, &mut |n, p| {
            self.apply_component_rules(n, p);
        });
    }

    fn apply_component_rules(&mut self, node: &Value, path: &str) {
        let comp_type = match node.get("component").and_then(|v| v.as_str()) {
            Some(ct) => ct,
            None => return,
        };

        check_unknown::check(self, path, comp_type);
        check_params::check(self, node, path, comp_type);

        let Some(bind) = node.get("bind").and_then(|v| v.as_str()) else {
            return;
        };

        check_layout_bind::check(self, path, comp_type);
        check_duplicate_bind::check_tree_duplicate(self, path, bind);
        check_input_compat::check(self, path, comp_type, bind);
        check_options_source::check(self, path, comp_type, bind);
        check_textinput_variant::check(self, node, path, comp_type, bind);
        check_duplicate_bind::check_editable_uniqueness(self, path, comp_type, bind);
    }
}

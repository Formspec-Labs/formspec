//! Depth-first item walk with each item's FEL scope bound.
//!
//! Every recalculate pass visits items the same way: a repeat group's instance
//! children see their row (`$sibling` aliases, `@index`, `@count`, `@current`) and
//! every item sees the scoped variables visible from its path (Core §4.5). A pass
//! supplies only its per-item work as a [`Visit`].

use std::collections::HashMap;

use fel_core::{FormspecEnvironment, Value};
use serde_json::Value as JsonValue;

use super::repeats::{InstanceScope, ResponseIndex};
use super::variables::visible_variables;
use crate::fel_eval::Fel;
use crate::types::ItemInfo;

/// Read-only inputs to one tree walk.
pub(super) struct Walk<'a> {
    /// Field data types and repeat instance rows.
    pub(super) index: &'a ResponseIndex,
    /// Scope-keyed variable values when the Definition declares scoped variables.
    pub(super) scoped_vars: Option<&'a HashMap<String, Value>>,
    /// FEL evaluation seam.
    pub(super) fel: Fel<'a>,
}

/// Per-item work of one walk.
pub(super) trait Visit {
    /// What an item hands down to its children (for example inherited relevance).
    type Inherited: Copy;

    /// Processes `item` with its scope bound; returns what its children inherit.
    fn item(
        &mut self,
        walk: &Walk<'_>,
        item: &mut ItemInfo,
        env: &mut FormspecEnvironment,
        values: &mut HashMap<String, JsonValue>,
        inherited: Self::Inherited,
    ) -> Self::Inherited;
}

impl Walk<'_> {
    /// Visits `items` and their descendants in document order.
    pub(super) fn items<V: Visit>(
        &self,
        items: &mut [ItemInfo],
        env: &mut FormspecEnvironment,
        values: &mut HashMap<String, JsonValue>,
        visit: &mut V,
        inherited: V::Inherited,
    ) {
        for item in items.iter_mut() {
            self.bind_variables(env, &item.path);
            let passed_down = visit.item(self, item, env, values, inherited);
            self.children(item, env, values, visit, passed_down);
        }
    }

    /// Visits one repeat group's expanded instance children, row by row.
    fn instance_children<V: Visit>(
        &self,
        children: &mut [ItemInfo],
        env: &mut FormspecEnvironment,
        values: &mut HashMap<String, JsonValue>,
        visit: &mut V,
        inherited: V::Inherited,
    ) {
        let mut scope = InstanceScope::new(children, values, self.index);
        for item in children.iter_mut() {
            scope.enter(item, env, values, self.index);
            self.bind_variables(env, &item.path);
            let passed_down = visit.item(self, item, env, values, inherited);
            if item.calculate.is_some() {
                scope.refresh_after_calculate(item, env, values, self.index);
            }
            self.children(item, env, values, visit, passed_down);
        }
        scope.finish(env);
    }

    /// Visits `item`'s children: instance rows for a repeat group, plain items otherwise.
    fn children<V: Visit>(
        &self,
        item: &mut ItemInfo,
        env: &mut FormspecEnvironment,
        values: &mut HashMap<String, JsonValue>,
        visit: &mut V,
        inherited: V::Inherited,
    ) {
        if item.repeatable && !item.children.is_empty() {
            self.instance_children(&mut item.children, env, values, visit, inherited);
        } else {
            self.items(&mut item.children, env, values, visit, inherited);
        }
    }

    /// Binds the scoped variables visible from `path`, when the Definition has any.
    fn bind_variables(&self, env: &mut FormspecEnvironment, path: &str) {
        if let Some(scoped_vars) = self.scoped_vars {
            env.variables = visible_variables(scoped_vars, path);
        }
    }
}

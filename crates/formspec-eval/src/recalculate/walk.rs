//! Visits concrete Items in document order.

use std::collections::HashMap;

use fel_core::exact_json::Value;

use crate::fel_eval::Fel;
use crate::scope::{ScopeData, ScopeIndex};
use crate::types::ItemInfo;

pub(super) struct Walk<'a> {
    pub(super) index: &'a ScopeIndex,
    pub(super) fel: Fel<'a>,
}

pub(super) trait Visit {
    type Inherited: Copy;

    fn item(
        &mut self,
        walk: &Walk<'_>,
        item: &mut ItemInfo,
        state: &mut ScopeData,
        values: &mut HashMap<String, Value>,
        inherited: Self::Inherited,
    ) -> Self::Inherited;
}

impl Walk<'_> {
    pub(super) fn items<V: Visit>(
        &self,
        items: &mut [ItemInfo],
        state: &mut ScopeData,
        values: &mut HashMap<String, Value>,
        visit: &mut V,
        inherited: V::Inherited,
    ) {
        for item in items {
            let passed_down = visit.item(self, item, state, values, inherited);
            self.items(&mut item.children, state, values, visit, passed_down);
        }
    }
}

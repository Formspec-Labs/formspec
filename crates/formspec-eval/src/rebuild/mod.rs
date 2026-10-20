//! Phase 1: Rebuild — build the item tree from a definition JSON.

mod initial_values;
mod item_tree;
mod repeat_data;
mod repeat_expand;
mod wildcard;

#[cfg(test)]
mod tests;

pub(crate) use initial_values::seed_initial_values;
pub use item_tree::{parse_variables, rebuild_item_tree};
pub use repeat_data::expand_wildcard_path;
pub(crate) use repeat_data::{augment_nested_data, detect_repeat_count, is_repeat_group_array};
pub use repeat_expand::expand_repeat_instances;
pub(crate) use wildcard::{
    apply_wildcard_binds, instantiate_wildcard_expr, is_wildcard_bind, wildcard_base,
};
